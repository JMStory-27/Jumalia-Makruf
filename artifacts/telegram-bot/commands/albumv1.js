/**
 * /album - ALBUM ABADI (Eternal Wedding Album)
 * Bot collects photos/videos sent by user, then generates a permanent
 * web gallery with romantic edelweiss floral animations.
 *
 * Flow:
 *   1. User: /album
 *   2. Bot asks for album title
 *   3. User sends title text
 *   4. Bot waits for photos/videos (any number)
 *   5. User clicks "✅ Selesai" -> bot processes and returns permanent link
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const https = require('https');
const http = require('http');
const archiver = require('archiver');

const BASE_DIR = path.join(__dirname, '..');
const ALBUMS_DIR = path.join(BASE_DIR, 'web', 'albums');
const INDEX_FILE = path.join(BASE_DIR, 'data', 'albums.json');

// In-memory active sessions: chatId -> { step, title, slug, items, msgIds }
const sessions = new Map();

function ensureDirs() {
    if (!fs.existsSync(ALBUMS_DIR)) fs.mkdirSync(ALBUMS_DIR, { recursive: true });
    const dataDir = path.dirname(INDEX_FILE);
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(INDEX_FILE)) fs.writeFileSync(INDEX_FILE, '[]');
}

function loadIndex() {
    try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8')); }
    catch { return []; }
}
function saveIndex(list) {
    fs.writeFileSync(INDEX_FILE, JSON.stringify(list, null, 2));
}

function slugify(s) {
    return (s || 'album')
        .toLowerCase()
        .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'album';
}

function uniqueSlug(base) {
    let slug = base;
    let i = 1;
    while (fs.existsSync(path.join(ALBUMS_DIR, slug))) {
        i++;
        slug = `${base}-${i}`;
    }
    return slug;
}

function getPublicBaseUrl() {
    if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, '');
    if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    if (process.env.REPLIT_DOMAINS) {
        const first = process.env.REPLIT_DOMAINS.split(',')[0].trim();
        if (first) return `https://${first}`;
    }
    return '';
}

// Returns the URL the QR should encode for an album.
// If the album has been published to GitHub Pages, the QR points there
// (so it's truly permanent — survives Replit going down).
function getAlbumShareUrl(meta) {
    if (meta && meta.githubUrl) return meta.githubUrl.replace(/\/$/, '') + '/';
    const base = getPublicBaseUrl() || '';
    return `${base}/album/${meta.slug}/`;
}

async function regenerateQrPng(meta) {
    const QRCode = require('qrcode');
    const url = getAlbumShareUrl(meta);
    const buf = await QRCode.toBuffer(url, {
        errorCorrectionLevel: 'M', margin: 2, width: 600,
        color: { dark: '#3d2a35', light: '#ffffff' }
    });
    fs.writeFileSync(path.join(ALBUMS_DIR, meta.slug, 'qr.png'), buf);
    return buf;
}

// HTTP GET that follows redirects, accumulates cookies, and either streams to a
// file (when `dest` is provided) or buffers the body (when not). Preserves bytes
// EXACTLY — no transcoding, no compression — to keep media at 100% original quality.
function httpRequest(url, { dest = null, headers = {}, cookieJar = {}, maxRedirects = 8 } = {}) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const cookieHeader = Object.entries(cookieJar)
            .map(([k, v]) => `${k}=${v}`).join('; ');
        const reqHeaders = {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept': '*/*',
            ...headers,
        };
        if (cookieHeader) reqHeaders['Cookie'] = cookieHeader;

        lib.get(url, { headers: reqHeaders }, (res) => {
            // Capture cookies
            const setCookies = res.headers['set-cookie'] || [];
            for (const c of setCookies) {
                const [pair] = c.split(';');
                const idx = pair.indexOf('=');
                if (idx > 0) cookieJar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
            }
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                if (maxRedirects <= 0) return reject(new Error('Too many redirects'));
                const next = new URL(res.headers.location, url).toString();
                res.resume();
                return httpRequest(next, { dest, headers, cookieJar, maxRedirects: maxRedirects - 1 })
                    .then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            if (dest) {
                const file = fs.createWriteStream(dest);
                res.pipe(file);
                file.on('finish', () => file.close(() => resolve({
                    headers: res.headers, contentType: res.headers['content-type'] || '', cookieJar
                })));
                file.on('error', (err) => { try { fs.unlinkSync(dest); } catch {} reject(err); });
            } else {
                const chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => resolve({
                    headers: res.headers,
                    contentType: res.headers['content-type'] || '',
                    body: Buffer.concat(chunks).toString('utf8'),
                    cookieJar
                }));
                res.on('error', reject);
            }
        }).on('error', (err) => {
            if (dest) { try { fs.unlinkSync(dest); } catch {} }
            reject(err);
        });
    });
}

// Backwards-compatible simple download (Telegram CDN — bytes preserved as-is).
function downloadToFile(url, dest) {
    return httpRequest(url, { dest }).then(() => dest);
}

// ==================== GOOGLE DRIVE IMPORTER ====================

function parseDriveUrl(url) {
    try {
        const u = new URL(url);
        if (!/(?:^|\.)google\.com$/.test(u.hostname) && !/(?:^|\.)googleusercontent\.com$/.test(u.hostname)) return null;
        // Folder
        let m = u.pathname.match(/\/folders\/([a-zA-Z0-9_-]+)/);
        if (m) return { kind: 'folder', id: m[1] };
        // File: /file/d/ID/
        m = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (m) return { kind: 'file', id: m[1] };
        // ?id=ID (uc / open)
        const id = u.searchParams.get('id');
        if (id) return { kind: 'file', id };
        return null;
    } catch { return null; }
}

function extToType(name) {
    const ext = (name.match(/\.([a-zA-Z0-9]{2,5})$/) || [, ''])[1].toLowerCase();
    const photo = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tif', 'tiff'];
    const video = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', '3gp', 'mpg', 'mpeg'];
    if (photo.includes(ext)) return { type: 'photo', ext: '.' + ext };
    if (video.includes(ext)) return { type: 'video', ext: '.' + ext };
    return null; // unsupported
}

// Lists files in a public Drive folder using the "embeddedfolderview" page (no API key needed).
async function listDriveFolder(folderId) {
    const url = `https://drive.google.com/embeddedfolderview?id=${folderId}#list`;
    const { body } = await httpRequest(url);
    if (!body) return [];
    // Each entry: <a ... href="https://drive.google.com/file/d/FILE_ID/view..." ...>
    //             <div class="flip-entry-title">FILENAME</div>
    const entries = [];
    const seen = new Set();
    const re = /id="entry-([a-zA-Z0-9_-]+)"[\s\S]*?flip-entry-title">([^<]+)</g;
    let m;
    while ((m = re.exec(body))) {
        const id = m[1];
        const name = m[2].trim();
        if (seen.has(id)) continue;
        seen.add(id);
        const t = extToType(name);
        if (!t) continue;
        entries.push({ source: 'drive', driveId: id, name, type: t.type, ext: t.ext });
    }
    return entries;
}

// Fetches metadata (name) for a single Drive file id from the public viewer page.
async function getDriveFileMeta(fileId) {
    try {
        const { body } = await httpRequest(`https://drive.google.com/file/d/${fileId}/view`);
        const m = body && body.match(/<title>([^<]+) - Google Drive<\/title>/);
        if (m) return { name: m[1].trim() };
    } catch {}
    return { name: fileId };
}

// Detect and fix audio files that are not real MP3 (e.g. MP4/M4A/DASH saved with
// .mp3 extension from YouTube downloaders). Returns { changed, tmpPath }.
async function normalizeAudioToMp3(filePath) {
    const { execFileSync, spawnSync } = require('child_process');
    // Read first 16 bytes to detect container type via magic bytes
    const fd = fs.openSync(filePath, 'r');
    const head = Buffer.alloc(16);
    fs.readSync(fd, head, 0, 16, 0);
    fs.closeSync(fd);
    // Real MP3 starts with "ID3" (0x49 0x44 0x33) or MPEG sync 0xFF 0xFB/0xF3/0xF2
    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
    const isMpegSync = head[0] === 0xFF && (head[1] & 0xE0) === 0xE0;
    if (isId3 || isMpegSync) return { changed: false, tmpPath: filePath };
    // Not real MP3 — convert with ffmpeg
    const tmp = filePath + '.fix.mp3';
    const res = spawnSync('ffmpeg', [
        '-y', '-i', filePath, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', tmp
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (res.status !== 0) {
        try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
        throw new Error('ffmpeg convert failed: ' + (res.stderr ? res.stderr.toString().slice(-200) : 'unknown'));
    }
    return { changed: true, tmpPath: tmp };
}

// Scan all album audio files at startup and fix any that aren't real MP3.
// This rescues old albums that were uploaded before the normalize-on-upload fix.
function fixAllBrokenAudios() {
    const fixed = {}; // slug -> [filenames]
    try {
        if (!fs.existsSync(ALBUMS_DIR)) return fixed;
        const dirs = fs.readdirSync(ALBUMS_DIR).filter(d =>
            fs.statSync(path.join(ALBUMS_DIR, d)).isDirectory());
        for (const slug of dirs) {
            const albumDir = path.join(ALBUMS_DIR, slug);
            const audioFiles = fs.readdirSync(albumDir).filter(f =>
                /^audio(_\d+)?\.(mp3|m4a|ogg|wav|aac|flac)$/i.test(f));
            for (const f of audioFiles) {
                const full = path.join(albumDir, f);
                try {
                    const fd = fs.openSync(full, 'r');
                    const head = Buffer.alloc(16);
                    fs.readSync(fd, head, 0, 16, 0);
                    fs.closeSync(fd);
                    const isId3 = head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33;
                    const isMpegSync = head[0] === 0xFF && (head[1] & 0xE0) === 0xE0;
                    if (f.endsWith('.mp3') && !isId3 && !isMpegSync) {
                        console.log(`[ALBUM audio-fix] Rescuing ${slug}/${f} (not real MP3)...`);
                        const { spawnSync } = require('child_process');
                        const tmp = full + '.fix.mp3';
                        const res = spawnSync('ffmpeg', [
                            '-y', '-i', full, '-vn', '-c:a', 'libmp3lame', '-q:a', '4', tmp
                        ], { stdio: ['ignore', 'ignore', 'pipe'] });
                        if (res.status === 0 && fs.existsSync(tmp)) {
                            fs.renameSync(tmp, full);
                            console.log(`[ALBUM audio-fix] ✅ ${slug}/${f} converted to real MP3`);
                            (fixed[slug] = fixed[slug] || []).push(f);
                        } else {
                            try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch {}
                            console.warn(`[ALBUM audio-fix] ❌ ffmpeg failed for ${slug}/${f}`);
                        }
                    }
                } catch (e) {
                    console.warn(`[ALBUM audio-fix] ${slug}/${f}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[ALBUM audio-fix]', e.message);
    }
    return fixed;
}

// Downloads a Drive file by id with confirm-token handling for large files.
// Bytes are streamed straight to disk — no recompression — so quality stays 100%.
async function downloadDriveFile(fileId, dest) {
    const cookieJar = {};
    const base = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0&confirm=t`;
    // Try direct download
    let res;
    try {
        // Use HEAD-like check by streaming; if HTML returned, retry with confirm
        const tmp = dest + '.part';
        res = await httpRequest(base, { dest: tmp, cookieJar });
        if (/text\/html/i.test(res.contentType || '')) {
            // It served an HTML interstitial — read it, find form params, retry
            const html = fs.readFileSync(tmp, 'utf8');
            try { fs.unlinkSync(tmp); } catch {}
            const params = {};
            const re = /name="([^"]+)"\s+value="([^"]*)"/g;
            let mm;
            while ((mm = re.exec(html))) params[mm[1]] = mm[2];
            const action = (html.match(/<form[^>]+action="([^"]+)"/) || [])[1]
                || 'https://drive.usercontent.google.com/download';
            const qs = new URLSearchParams(params).toString();
            const finalUrl = action + (action.includes('?') ? '&' : '?') + qs;
            await httpRequest(finalUrl, { dest, cookieJar });
        } else {
            fs.renameSync(tmp, dest);
        }
    } catch (err) {
        // Fallback: legacy uc endpoint
        await httpRequest(`https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`, { dest, cookieJar });
    }
    return dest;
}

function formatEventDate(input) {
    try {
        const d = input instanceof Date ? input : new Date(input);
        if (isNaN(d.getTime())) return String(input || '');
        return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    } catch { return String(input || ''); }
}

// Parse Indonesian-style dates: 12/05/2025, 12-5-2025, 12 Mei 2025, 12 mei 25
function parseEventDate(text) {
    if (!text) return null;
    const t = String(text).trim();
    let m = t.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (m) {
        let [, d, mo, y] = m;
        d = parseInt(d, 10); mo = parseInt(mo, 10); y = parseInt(y, 10);
        if (y < 100) y += 2000;
        const dt = new Date(y, mo - 1, d);
        if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) return dt.getTime();
        return null;
    }
    const months = { januari:0, februari:1, maret:2, april:3, mei:4, juni:5, juli:6, agustus:7, september:8, oktober:9, november:10, desember:11,
        jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, agu:7, agt:7, sep:8, okt:9, nov:10, des:11 };
    m = t.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
    if (m) {
        let [, d, mn, y] = m;
        d = parseInt(d, 10); y = parseInt(y, 10);
        if (y < 100) y += 2000;
        const mo = months[mn.toLowerCase()];
        if (mo == null) return null;
        const dt = new Date(y, mo, d);
        if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) return dt.getTime();
    }
    return null;
}

function escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const ROMANTIC_QUOTES = [
    { t: '"Dan di antara tanda-tanda kekuasaan-Nya, Dia menciptakan untukmu pasangan dari jenismu sendiri, agar kamu cenderung dan tenteram kepadanya, dan dijadikan-Nya di antaramu rasa kasih dan sayang."', s: '— QS. Ar-Rum: 21' },
    { t: '"Ya Allah, satukanlah kami berdua dalam kebaikan, dan jadikanlah cinta kami abadi hingga ke surga-Mu."', s: '— Doa untuk pasangan' },
    { t: '"Cinta sejati bukan tentang menemukan seseorang yang sempurna, tapi tentang melihat seseorang dengan sempurna."', s: '— Sam Keen' },
    { t: '"Barakallahu laka wa baraka ‘alaika, wa jama‘a bainakuma fi khair." (Semoga Allah memberkahimu, memberkahi atasmu, dan menyatukan kalian dalam kebaikan.)', s: '— Doa pernikahan (HR. Abu Dawud)' },
    { t: '"Engkau adalah jawaban dari setiap doa yang aku panjatkan dalam diam."', s: '— Untukmu, separuh jiwaku' },
    { t: '"Pernikahan bukan tujuan, tapi awal perjalanan menuju surga-Nya bersama orang yang dicintai-Nya."', s: '' },
    { t: '"Semoga rumah tangga ini menjadi sakinah, mawaddah, wa rahmah — sampai jannah."', s: '— Doa keluarga' },
    { t: '"Aku memilihmu, akan terus memilihmu, tanpa ragu, dalam diam, dalam senyap, dalam kebahagiaan, dan dalam ribuan kehidupan."', s: '' },
];

function renderAlbumHtml(meta) {
    const title = escapeHtml(meta.title);
    const slug = meta.slug;
    const itemsJson = JSON.stringify(meta.items.map(it => ({
        f: it.file,
        t: it.type, // 'photo' | 'video'
    })));
    const quotesJson = JSON.stringify(ROMANTIC_QUOTES);
    return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1.0" />
<base href="/album/${slug}/">
<title>${title} • Album Abadi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Great+Vibes&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :root{
    --pink:#f5b8c5;
    --pink-soft:#ffe2ea;
    --pink-deep:#e895a6;
    --blue:#bcdcf0;
    --blue-soft:#e6f3fb;
    --blue-deep:#85bedb;
    --ink:#3d2a35;
    --ink-soft:#7a6571;
    --gold:#c9a96a;
  }
  html,body{background:#fdfaf7;color:var(--ink);font-family:'Inter',sans-serif;min-height:100%;overflow-x:hidden}
  a{color:inherit;text-decoration:none}
  .bg{position:fixed;inset:0;background:
      radial-gradient(1100px 800px at 85% -5%, var(--pink-soft) 0%, transparent 55%),
      radial-gradient(900px 700px at -5% 105%, var(--blue-soft) 0%, transparent 55%),
      linear-gradient(180deg,#fdfaf7 0%,#fffdfb 100%);z-index:-3}
  /* Falling petals — bunga edelweis jatuh terus seumur hidup halaman */
  .petals{position:fixed;inset:0;overflow:hidden;z-index:5;pointer-events:none}
  .petal{position:absolute;top:-40px;width:28px;height:28px;opacity:.85;animation:fall linear infinite;filter:drop-shadow(0 3px 8px rgba(232,149,166,.45));will-change:transform}
  @keyframes fall{
    0%{transform:translate3d(0,-10vh,0) rotate(0deg) scale(var(--scale,1))}
    100%{transform:translate3d(var(--dx,40px),110vh,0) rotate(720deg) scale(var(--scale,1))}
  }
  /* Header */
  header{padding:70px 24px 30px;text-align:center;position:relative}
  .ornament{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:30px;letter-spacing:1px}
  h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(40px,7vw,76px);line-height:1.05;margin:12px 0 10px;background:linear-gradient(135deg,var(--pink-deep) 0%,var(--blue-deep) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .sub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:18px;letter-spacing:.5px}
  .divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:22px auto 0;max-width:520px}
  .divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--pink) 30%,var(--blue) 70%,transparent)}
  .divider .flower{font-size:22px;color:var(--pink-deep);animation:spin 18s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  .meta{margin-top:16px;color:var(--ink-soft);font-size:14px}
  .actions{margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:12px 24px;border-radius:999px;border:1px solid #00000010;background:#fff;color:var(--ink);font-weight:500;letter-spacing:.3px;cursor:pointer;transition:all .25s;font-size:14px;box-shadow:0 4px 16px -8px rgba(232,149,166,.4)}
  .btn:hover{transform:translateY(-2px);box-shadow:0 8px 24px -8px rgba(232,149,166,.6)}
  .btn.primary{background:linear-gradient(135deg,var(--pink) 0%,var(--blue) 100%);color:#fff;border-color:transparent;box-shadow:0 6px 20px -6px rgba(232,149,166,.55)}
  .btn.primary:hover{filter:brightness(1.05)}
  /* Google-Drive-style tight grid */
  main{max-width:1300px;margin:24px auto 60px;padding:0 12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}
  @media(max-width:560px){.grid{grid-template-columns:repeat(3,1fr);gap:4px}}
  @media(max-width:380px){.grid{grid-template-columns:repeat(2,1fr)}}
  .card{position:relative;border-radius:8px;overflow:hidden;background:#f3eef0;cursor:pointer;aspect-ratio:1/1;opacity:0;transform:scale(.95);transition:opacity .5s ease,transform .5s ease,box-shadow .25s}
  .card.in{opacity:1;transform:scale(1)}
  .card:hover{box-shadow:0 10px 24px -8px rgba(133,190,219,.5);z-index:2}
  .card img,.card video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
  .card:hover img,.card:hover video{transform:scale(1.06)}
  .badge{position:absolute;top:8px;left:8px;background:rgba(255,255,255,.85);backdrop-filter:blur(6px);color:var(--ink);font-size:10px;padding:3px 8px;border-radius:999px;font-weight:500;letter-spacing:.5px;display:flex;align-items:center;gap:4px}
  .badge.video{background:linear-gradient(135deg,var(--pink),var(--blue));color:#fff}
  /* Lightbox */
  .lb{position:fixed;inset:0;background:rgba(40,28,38,.85);backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
  .lb.open{display:flex;animation:fade .3s ease}
  @keyframes fade{from{opacity:0}to{opacity:1}}
  .lb-inner{max-width:95vw;max-height:88vh;position:relative;display:flex;align-items:center;justify-content:center}
  .lb img,.lb video{max-width:95vw;max-height:88vh;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
  .lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:rgba(255,255,255,.95);color:var(--ink);border:none;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;transition:all .2s;z-index:2;box-shadow:0 6px 20px rgba(0,0,0,.3)}
  .lb-close:hover,.lb-prev:hover,.lb-next:hover,.lb-dl:hover{background:linear-gradient(135deg,var(--pink),var(--blue));color:#fff;transform:scale(1.08)}
  .lb-close{top:20px;right:20px}
  .lb-dl{top:20px;right:80px;text-decoration:none;font-size:18px}
  .lb-prev{left:20px;top:50%;transform:translateY(-50%)}
  .lb-prev:hover,.lb-next:hover{transform:translateY(-50%) scale(1.08)}
  .lb-next{right:20px;top:50%;transform:translateY(-50%)}
  .counter{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-family:'Cormorant Garamond',serif;color:#fff;font-size:14px;letter-spacing:1px;background:rgba(255,255,255,.15);padding:8px 18px;border-radius:999px;backdrop-filter:blur(6px)}
  footer{text-align:center;padding:40px 20px 60px;color:var(--ink-soft);font-family:'Cormorant Garamond',serif;font-style:italic;font-size:15px;line-height:1.7}
  footer .heart{color:var(--pink-deep);animation:beat 1.6s ease-in-out infinite;display:inline-block}
  @keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
  .toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;color:var(--ink);padding:12px 22px;border-radius:999px;font-size:13px;opacity:0;transition:opacity .3s;z-index:60;pointer-events:none;box-shadow:0 10px 30px rgba(232,149,166,.4)}
  .toast.show{opacity:1}
  /* Romantic Quote Section */
  .quote-section{max-width:780px;margin:50px auto 30px;padding:0 30px;text-align:center;position:relative}
  .quote-section::before,.quote-section::after{content:'';position:absolute;left:50%;width:160px;height:1px;background:linear-gradient(90deg,transparent,var(--pink),transparent);transform:translateX(-50%)}
  .quote-section::before{top:-20px}.quote-section::after{bottom:-20px;background:linear-gradient(90deg,transparent,var(--blue),transparent)}
  .quote-label{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:32px;margin-bottom:20px}
  .quote-box{position:relative;min-height:170px;display:flex;align-items:center;justify-content:center}
  .quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.2s ease,transform 1.2s ease;transform:translateY(10px) scale(.98)}
  .quote.active{opacity:1;transform:translateY(0) scale(1)}
  .quote .text{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(18px,2.4vw,22px);line-height:1.7;color:var(--ink);max-width:680px}
  .quote .src{margin-top:14px;font-family:'Cormorant Garamond',serif;color:var(--blue-deep);font-size:13px;letter-spacing:2px;text-transform:uppercase}
  .quote-dots{display:flex;gap:8px;justify-content:center;margin-top:20px}
  .quote-dot{width:6px;height:6px;border-radius:50%;background:#00000018;cursor:pointer;transition:all .3s}
  .quote-dot.active{background:linear-gradient(135deg,var(--pink),var(--blue));width:26px;border-radius:3px}
  /* Couple Prayer Block */
  .prayer{max-width:820px;margin:60px auto 20px;padding:46px 32px;text-align:center;border-radius:24px;background:linear-gradient(135deg,#fff 0%,var(--pink-soft) 50%,var(--blue-soft) 100%);position:relative;overflow:hidden;box-shadow:0 20px 60px -20px rgba(232,149,166,.3)}
  .prayer::before{content:'✿';position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:26px;color:var(--pink-deep);animation:spin 22s linear infinite}
  .prayer h2{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:46px;margin:18px 0 20px;font-weight:400}
  .prayer p{font-family:'Cormorant Garamond',serif;font-size:18px;line-height:1.9;color:var(--ink);font-style:italic}
  .prayer .amin{margin-top:20px;font-family:'Great Vibes',cursive;background:linear-gradient(135deg,var(--pink-deep),var(--blue-deep));-webkit-background-clip:text;background-clip:text;color:transparent;font-size:36px}
  .gallery-title{text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:20px;margin:46px 0 22px;letter-spacing:2px;display:flex;align-items:center;justify-content:center;gap:14px}
  .gallery-title::before,.gallery-title::after{content:'';width:60px;height:1px;background:linear-gradient(90deg,transparent,var(--pink),var(--blue),transparent)}
  /* === DAY COUNTER === */
  .daycount{margin:24px auto 0;max-width:560px;padding:18px 24px;border-radius:18px;background:linear-gradient(135deg,#fff 0%,var(--pink-soft) 50%,var(--blue-soft) 100%);box-shadow:0 14px 40px -18px rgba(232,149,166,.45);text-align:center;position:relative}
  .daycount .label{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:14px;letter-spacing:2px;text-transform:uppercase}
  .daycount .num{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:48px;background:linear-gradient(135deg,var(--pink-deep),var(--blue-deep));-webkit-background-clip:text;background-clip:text;color:transparent;line-height:1;margin:6px 0}
  .daycount .desc{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink);font-size:16px}
  /* === AUDIO PLAYER FLOATING BUTTON === */
  .audio-fab{position:fixed;right:18px;bottom:18px;width:58px;height:58px;border-radius:50%;background:linear-gradient(135deg,var(--pink-deep),var(--blue-deep));color:#fff;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:24px;box-shadow:0 10px 30px rgba(232,149,166,.55);z-index:55;transition:transform .25s}
  .audio-fab:hover{transform:scale(1.1)}
  .audio-fab.playing{animation:spin 6s linear infinite}
  .audio-fab.attention{animation:audioPulse 1.2s ease-in-out infinite;box-shadow:0 0 0 0 rgba(232,149,166,.7),0 10px 30px rgba(232,149,166,.55)}
  @keyframes audioPulse{0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(232,149,166,.7),0 10px 30px rgba(232,149,166,.55)}50%{transform:scale(1.12);box-shadow:0 0 0 16px rgba(232,149,166,0),0 10px 30px rgba(232,149,166,.55)}}
  .audio-hint{position:fixed;right:86px;bottom:32px;background:#fff;padding:8px 14px;border-radius:999px;font-size:12px;color:var(--ink);box-shadow:0 6px 18px rgba(232,149,166,.4);z-index:55;opacity:0;transition:opacity .4s;pointer-events:none}
  .audio-hint.show{opacity:1}
  /* === WISHES WALL === */
  .wishes{max-width:880px;margin:50px auto 30px;padding:0 24px}
  .wishes h2{text-align:center;font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:46px;margin-bottom:6px;font-weight:400}
  .wishes .sub2{text-align:center;font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);margin-bottom:24px;font-size:16px}
  .wish-form{background:#fff;border-radius:18px;padding:22px;box-shadow:0 14px 40px -18px rgba(133,190,219,.4);margin-bottom:28px;border:1px solid rgba(232,149,166,.15)}
  .wish-form input,.wish-form textarea{width:100%;border:1px solid #e8dde2;border-radius:12px;padding:12px 14px;font-family:'Inter',sans-serif;font-size:14px;color:var(--ink);background:#fdfaf7;outline:none;transition:border-color .2s;margin-bottom:10px}
  .wish-form input:focus,.wish-form textarea:focus{border-color:var(--pink-deep)}
  .wish-form textarea{min-height:90px;resize:vertical}
  .wish-form button{width:100%;border:none;border-radius:12px;padding:13px;background:linear-gradient(135deg,var(--pink) 0%,var(--blue) 100%);color:#fff;font-weight:500;font-size:14px;letter-spacing:.5px;cursor:pointer;transition:filter .2s,transform .15s}
  .wish-form button:hover{filter:brightness(1.05);transform:translateY(-1px)}
  .wish-form button:disabled{opacity:.6;cursor:wait}
  .wish-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
  .wish{background:#fff;border-radius:14px;padding:16px 18px;box-shadow:0 8px 24px -14px rgba(232,149,166,.4);border:1px solid rgba(188,220,240,.3);position:relative;animation:wishIn .5s ease}
  @keyframes wishIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .wish .name{font-family:'Cormorant Garamond',serif;font-weight:600;color:var(--pink-deep);font-size:17px;margin-bottom:4px}
  .wish .msg{font-family:'Inter',sans-serif;font-size:14px;color:var(--ink);line-height:1.55;white-space:pre-wrap;word-break:break-word}
  .wish .when{font-size:11px;color:var(--ink-soft);margin-top:8px;font-style:italic}
  .wish-empty{text-align:center;color:var(--ink-soft);font-style:italic;padding:30px;font-family:'Cormorant Garamond',serif;font-size:16px}
  /* Owner pinned wish — selalu di paling atas, beda warna & ada glow lembut */
  .wish.pinned{grid-column:1/-1;background:linear-gradient(135deg,#fff 0%,#fff5f8 50%,#f0f8ff 100%);border:1.5px solid rgba(232,136,158,.45);box-shadow:0 14px 38px -14px rgba(232,136,158,.5),0 0 0 4px rgba(255,255,255,.6) inset;animation:wishIn .5s ease,pinGlow 4s ease-in-out infinite}
  @keyframes pinGlow{0%,100%{box-shadow:0 14px 38px -14px rgba(232,136,158,.5),0 0 0 4px rgba(255,255,255,.6) inset}50%{box-shadow:0 18px 50px -14px rgba(232,136,158,.7),0 0 0 4px rgba(255,255,255,.8) inset,0 0 30px rgba(232,136,158,.25)}}
  .wish.pinned .pin-badge{display:inline-block;font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#fff;background:linear-gradient(135deg,var(--pink-deep) 0%,#a3c8e6 100%);padding:3px 10px;border-radius:20px;margin-left:8px;vertical-align:middle;box-shadow:0 4px 10px -3px rgba(232,136,158,.5)}
  .wish.pinned .name{font-size:19px;background:linear-gradient(135deg,#e8506e 0%,#a3c8e6 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
  .wish.pinned .msg{font-size:15px;line-height:1.7}
  /* === QR CODE === */
  .qr-section{max-width:520px;margin:30px auto 20px;padding:24px;border-radius:20px;background:#fff;text-align:center;box-shadow:0 14px 40px -18px rgba(232,149,166,.35);border:1px solid rgba(232,149,166,.15)}
  .qr-section h3{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:36px;font-weight:400;margin-bottom:6px}
  .qr-section p{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:14px;margin-bottom:14px}
  .qr-section img{width:200px;height:200px;border-radius:12px;border:8px solid var(--pink-soft);background:#fff}
  /* === WELCOME GATE (tap-to-open) === */
  #welcomeGate{position:fixed;inset:0;z-index:300;background:radial-gradient(ellipse at center,#fff 0%,#ffeaf0 40%,#e3eef9 100%);display:flex;align-items:center;justify-content:center;flex-direction:column;overflow:hidden;transition:opacity 1s ease,visibility 1s}
  #welcomeGate.gone{opacity:0;visibility:hidden;pointer-events:none}
  /* Floating background sparkles & hearts on the gate */
  .gate-bg-orb{position:absolute;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.95) 0%,rgba(245,184,197,.5) 60%,transparent 70%);filter:blur(4px);animation:gateOrb 10s linear infinite}
  @keyframes gateOrb{0%{transform:translateY(110vh) scale(.3);opacity:0}10%{opacity:.8}90%{opacity:.6}100%{transform:translateY(-20vh) scale(1);opacity:0}}
  .gate-sparkle{position:absolute;color:#ffd1dc;font-size:18px;animation:gateTwinkle 2.4s ease-in-out infinite;text-shadow:0 0 12px #fff}
  @keyframes gateTwinkle{0%,100%{opacity:.2;transform:scale(.6) rotate(0)}50%{opacity:1;transform:scale(1.4) rotate(180deg)}}
  .gate-card{position:relative;text-align:center;padding:30px 26px;animation:gateCardIn 1s ease forwards;z-index:5}
  @keyframes gateCardIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}
  .gate-eyebrow{font-family:'Cormorant Garamond',serif;font-style:italic;letter-spacing:5px;text-transform:uppercase;color:var(--pink-deep);font-size:11px;margin-bottom:10px;opacity:.8}
  .gate-title{font-family:'Great Vibes',cursive;font-size:62px;line-height:1;background:linear-gradient(135deg,#e8889e 0%,#a3c8e6 50%,#e8889e 100%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;margin:6px 0 8px;animation:gateShine 5s ease-in-out infinite;text-shadow:0 4px 24px rgba(232,149,166,.2)}
  @keyframes gateShine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
  .gate-and{font-family:'Great Vibes',cursive;color:#bcdcf0;font-size:34px;display:block;margin:-2px 0}
  .gate-sub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:16px;margin:14px 0 0;max-width:340px}
  .gate-divider{display:flex;align-items:center;justify-content:center;gap:10px;margin:18px 0}
  .gate-divider .ln{width:60px;height:1px;background:linear-gradient(90deg,transparent,var(--pink-deep),transparent)}
  .gate-divider .fl{color:var(--pink-deep);font-size:14px;animation:gateFlSpin 8s linear infinite}
  @keyframes gateFlSpin{to{transform:rotate(360deg)}}
  /* === Couple character (chibi proposal scene, full of life) === */
  .gate-couple{position:relative;width:300px;height:200px;margin:8px auto -4px;display:flex;align-items:flex-end;justify-content:center;gap:0;pointer-events:none}
  .gate-char{position:relative;width:140px;height:200px}
  .gate-char.boy{transform:translateX(8px)}
  .gate-char.girl{transform:translateX(-8px)}
  .gate-char svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 8px 18px rgba(232,149,166,.4))}
  /* Boy breathes + nervously holds the ring box */
  .gate-char.boy svg{animation:boyBreath 3.2s ease-in-out infinite;transform-origin:50% 90%}
  @keyframes boyBreath{0%,100%{transform:scaleY(1) translateY(0)}50%{transform:scaleY(1.025) translateY(-2px)}}
  .boy-ring-arm{transform-origin:38% 58%;animation:boyRingTremble 2.4s ease-in-out infinite}
  @keyframes boyRingTremble{0%,100%{transform:rotate(0deg) translateX(0)}25%{transform:rotate(-2deg) translateX(-1px)}50%{transform:rotate(0deg) translateX(0)}75%{transform:rotate(2deg) translateX(1px)}}
  .boy-hair{transform-origin:50% 30%;animation:hairBob 3.2s ease-in-out infinite}
  @keyframes hairBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
  /* Girl gently bounces, her hair sways, her hand reaches forward */
  .gate-char.girl svg{animation:girlBounce 2.8s ease-in-out infinite;transform-origin:50% 95%}
  @keyframes girlBounce{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-4px) rotate(-1deg)}}
  .girl-hair{transform-origin:50% 30%;animation:girlHairSway 3.4s ease-in-out infinite}
  @keyframes girlHairSway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
  .girl-arm{transform-origin:60% 60%;animation:girlReach 2.6s ease-in-out infinite}
  @keyframes girlReach{0%,100%{transform:rotate(-3deg) translateX(0)}50%{transform:rotate(8deg) translateX(-2px)}}
  .girl-crown{transform-origin:50% 100%;animation:crownGlint 2.2s ease-in-out infinite}
  @keyframes crownGlint{0%,100%{filter:drop-shadow(0 0 2px #ffd76b)}50%{filter:drop-shadow(0 0 8px #ffe896)}}
  /* Eyes blink (both characters share rhythm but offset) */
  .eye{transform-origin:center;animation:blink 4.8s steps(1,end) infinite}
  .gate-char.girl .eye{animation-delay:-2.2s}
  @keyframes blink{0%,94%,100%{transform:scaleY(1)}96%,98%{transform:scaleY(.1)}}
  /* Cheek blush pulses subtly */
  .blush{animation:blushPulse 2s ease-in-out infinite;transform-origin:center}
  @keyframes blushPulse{0%,100%{opacity:.6}50%{opacity:1}}
  /* Ring sparkle on the box */
  .ring-sparkle{transform-origin:center;animation:ringSparkle 1.6s ease-in-out infinite}
  @keyframes ringSparkle{0%,100%{opacity:.3;transform:scale(.7)}50%{opacity:1;transform:scale(1.4)}}
  /* Hearts floating up between them */
  .gate-couple .gate-mini-heart{position:absolute;top:42px;left:50%;font-size:20px;color:#e8506e;text-shadow:0 0 14px rgba(232,80,110,.9);animation:coupleHeartFloat 2.4s ease-in-out infinite;pointer-events:none}
  .gate-couple .gate-mini-heart.h2{font-size:14px;animation-delay:-.9s;left:46%}
  .gate-couple .gate-mini-heart.h3{font-size:12px;animation-delay:-1.6s;left:54%}
  @keyframes coupleHeartFloat{0%{transform:translate(-50%,10px) scale(.4);opacity:0}25%{opacity:1}80%{opacity:.7}100%{transform:translate(-50%,-50px) scale(1.2);opacity:0}}
  .gate-couple .gate-spark{position:absolute;font-size:14px;color:#ffd76b;animation:coupleSpark 2.2s ease-in-out infinite;text-shadow:0 0 8px #fff}
  @keyframes coupleSpark{0%,100%{opacity:.2;transform:scale(.6) rotate(0)}50%{opacity:1;transform:scale(1.3) rotate(180deg)}}
  /* "kyaa" reaction speech bubble on the girl that fades in/out */
  .girl-bubble{position:absolute;top:0;right:6px;background:#fff;border:2px solid #f5b8c5;border-radius:14px;padding:4px 10px;font-family:'Cormorant Garamond',serif;font-style:italic;color:#c25b73;font-size:12px;animation:bubbleShow 6s ease-in-out infinite;opacity:0;box-shadow:0 4px 10px rgba(232,149,166,.3)}
  .girl-bubble::after{content:"";position:absolute;bottom:-6px;left:18px;width:10px;height:10px;background:#fff;border-right:2px solid #f5b8c5;border-bottom:2px solid #f5b8c5;transform:rotate(45deg)}
  @keyframes bubbleShow{0%,15%{opacity:0;transform:translateY(6px) scale(.8)}25%,55%{opacity:1;transform:translateY(0) scale(1)}65%,100%{opacity:0;transform:translateY(-4px) scale(.85)}}

  /* Big animated envelope — pulsing biar greget */
  .gate-env{position:relative;width:170px;height:120px;margin:14px auto 16px;perspective:900px;animation:gateEnvBeat 1.1s ease-in-out infinite;will-change:transform,filter}
  @keyframes gateEnvBeat{
    0%,100%{transform:scale(1) translateY(0);filter:drop-shadow(0 8px 20px rgba(232,149,166,.45))}
    18%{transform:scale(1.12) translateY(-4px);filter:drop-shadow(0 14px 26px rgba(232,149,166,.75))}
    32%{transform:scale(.96) translateY(2px);filter:drop-shadow(0 4px 14px rgba(232,149,166,.35))}
    50%{transform:scale(1.10) translateY(-3px);filter:drop-shadow(0 14px 28px rgba(232,149,166,.7))}
    66%{transform:scale(.98) translateY(1px)}
  }
  /* Pulse ring around envelope (heart-beat shockwave) */
  .gate-env::before{content:"";position:absolute;inset:-14px;border-radius:18px;border:2px solid rgba(232,149,166,.55);animation:gateEnvPulseRing 1.6s ease-out infinite;pointer-events:none;z-index:-1}
  @keyframes gateEnvPulseRing{0%{transform:scale(.85);opacity:.9}100%{transform:scale(1.5);opacity:0}}
  /* Faster, more frantic beat as time runs out (added via JS) */
  .gate-env.urgent{animation-duration:.55s}
  .gate-env.urgent::before{animation-duration:.7s;border-color:rgba(232,80,110,.7)}

  /* === Explosion (kalau gak dipencet 30 detik, suratnya meledak sendiri) === */
  #welcomeGate.exploding{animation:gateShake .12s linear 6}
  @keyframes gateShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-8px,4px)}50%{transform:translate(7px,-5px)}75%{transform:translate(-5px,-3px)}}
  #welcomeGate.exploding .gate-env{animation:gateEnvExplode .8s cubic-bezier(.4,0,.6,1) forwards !important}
  @keyframes gateEnvExplode{
    0%{transform:scale(1)}
    25%{transform:scale(1.45);filter:drop-shadow(0 0 30px rgba(255,80,120,1)) brightness(1.3)}
    55%{transform:scale(1.9);filter:drop-shadow(0 0 60px rgba(255,255,255,1)) brightness(2.2);opacity:.7}
    100%{transform:scale(3.2);filter:blur(6px) brightness(2.5);opacity:0}
  }
  #welcomeGate.exploding .gate-couple{animation:coupleStartle .25s ease-out 2}
  @keyframes coupleStartle{0%,100%{transform:scale(1)}50%{transform:scale(1.18) translateY(-8px)}}
  .gate-flash{position:fixed;inset:0;background:radial-gradient(circle at center,rgba(255,255,255,1) 0%,rgba(255,209,220,.85) 30%,rgba(232,149,166,0) 70%);z-index:310;pointer-events:none;opacity:0;animation:gateFlash .8s ease-out forwards}
  @keyframes gateFlash{0%{opacity:0}20%{opacity:1}100%{opacity:0}}
  .gate-shard{position:fixed;top:50%;left:50%;font-size:30px;pointer-events:none;z-index:311;animation:gateShard 1.4s cubic-bezier(.2,.7,.3,1) forwards;text-shadow:0 0 18px #fff}
  @keyframes gateShard{0%{transform:translate(-50%,-50%) scale(.4) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--sx,0px)),calc(-50% + var(--sy,0px))) scale(1.1) rotate(var(--srot,720deg));opacity:0}}

  /* Countdown text under the button */
  .gate-countdown{margin-top:6px;font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--pink-deep);font-size:12px;letter-spacing:1px;opacity:.8;min-height:14px;transition:color .3s,transform .3s}
  .gate-countdown.urgent{color:#e8506e;animation:gateCountUrgent .55s ease-in-out infinite}
  @keyframes gateCountUrgent{0%,100%{transform:scale(1)}50%{transform:scale(1.15)}}

  .gate-env-base{position:absolute;inset:0;background:linear-gradient(135deg,#ffe2ea 0%,#fff 50%,#dceaf6 100%);border-radius:10px;box-shadow:0 18px 40px rgba(232,149,166,.4),inset 0 0 30px rgba(255,255,255,.6);overflow:hidden}
  .gate-env-base::after{content:"";position:absolute;inset:0;background:linear-gradient(45deg,transparent 49%,rgba(255,255,255,.5) 50%,transparent 51%);animation:gateEnvShine 3s linear infinite}
  @keyframes gateEnvShine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
  .gate-env-flap{position:absolute;top:0;left:0;width:170px;height:60px;background:linear-gradient(135deg,#f5b8c5 0%,#e8889e 60%,#bcdcf0 100%);transform-origin:top center;clip-path:polygon(0 0,100% 0,50% 100%);box-shadow:0 4px 12px rgba(232,149,166,.3);transition:transform 1.2s cubic-bezier(.68,-.55,.27,1.55)}
  #welcomeGate.opening .gate-env-flap{transform:rotateX(-180deg)}
  .gate-env-heart{position:absolute;top:38px;left:50%;transform:translateX(-50%) scale(0);font-size:44px;color:var(--pink-deep);text-shadow:0 0 30px rgba(232,149,166,.7);transition:transform 1s ease .4s,opacity 1s ease .4s;opacity:0;animation:gateHeartBeat 1.4s ease-in-out infinite}
  #welcomeGate.opening .gate-env-heart{transform:translate(-50%,-70px) scale(1.3);opacity:1}
  @keyframes gateHeartBeat{0%,100%{filter:drop-shadow(0 0 8px rgba(232,149,166,.5))}50%{filter:drop-shadow(0 0 25px rgba(232,149,166,1))}}
  .gate-env-glow{position:absolute;inset:-30px;background:radial-gradient(circle,rgba(255,209,220,.6) 0%,transparent 70%);opacity:0;transition:opacity .8s ease;pointer-events:none}
  #welcomeGate.opening .gate-env-glow{opacity:1}
  /* The big call-to-action button */
  .gate-btn{display:inline-flex;align-items:center;gap:10px;padding:16px 36px;border:none;border-radius:999px;background:linear-gradient(135deg,#e8889e 0%,#f5b8c5 50%,#bcdcf0 100%);background-size:200% 100%;color:#fff;font-family:'Cormorant Garamond',serif;font-weight:600;font-size:17px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;box-shadow:0 14px 40px rgba(232,149,166,.5),inset 0 0 20px rgba(255,255,255,.3);transition:transform .25s,box-shadow .25s,background-position .8s;animation:gateBtnPulse 2.4s ease-in-out infinite,gateBtnShine 4s linear infinite;margin-top:8px;position:relative;overflow:hidden}
  .gate-btn:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 20px 50px rgba(232,149,166,.7)}
  .gate-btn:active{transform:translateY(0) scale(.98)}
  @keyframes gateBtnPulse{0%,100%{box-shadow:0 14px 40px rgba(232,149,166,.5),inset 0 0 20px rgba(255,255,255,.3),0 0 0 0 rgba(232,149,166,.6)}50%{box-shadow:0 14px 40px rgba(232,149,166,.6),inset 0 0 20px rgba(255,255,255,.3),0 0 0 18px rgba(232,149,166,0)}}
  @keyframes gateBtnShine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
  .gate-btn .ic{font-size:20px;animation:gateBtnIc 2s ease-in-out infinite}
  @keyframes gateBtnIc{0%,100%{transform:rotate(-8deg) scale(1)}50%{transform:rotate(8deg) scale(1.2)}}
  .gate-hint{margin-top:14px;font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:13px;opacity:.85}
  /* Burst effects on click */
  .gate-heart-burst{position:absolute;top:50%;left:50%;font-size:32px;color:var(--pink-deep);pointer-events:none;animation:gateHeartFly 2.4s ease-out forwards;text-shadow:0 0 20px rgba(232,149,166,.8);z-index:6}
  @keyframes gateHeartFly{0%{transform:translate(-50%,-50%) scale(0);opacity:0}20%{transform:translate(calc(-50% + var(--dx,0px)*.3),calc(-50% + var(--dy,0px)*.3)) scale(1.2);opacity:1}100%{transform:translate(calc(-50% + var(--dx,0px)),calc(-50% + var(--dy,0px) - 200px)) scale(.4) rotate(var(--rot,360deg));opacity:0}}
  .gate-confetti{position:fixed;top:50%;left:50%;font-size:18px;pointer-events:none;animation:gateConfettiBurst 2.6s cubic-bezier(.2,.7,.3,1) forwards;z-index:6}
  @keyframes gateConfettiBurst{0%{transform:translate(-50%,-50%) scale(.2);opacity:1}100%{transform:translate(calc(-50% + var(--cx,0px)),calc(-50% + var(--cy,400px))) scale(1) rotate(var(--crot,720deg));opacity:0}}
  @media (max-width:520px){
    .gate-title{font-size:48px}
    .gate-and{font-size:28px}
    .gate-env{width:140px;height:100px}
    .gate-env-flap{width:140px;height:50px}
    .gate-btn{padding:14px 28px;font-size:14px;letter-spacing:1.5px}
  }
  /* === CONFETTI === */
  .confetti-piece{position:fixed;top:-20px;font-size:20px;pointer-events:none;z-index:90;animation:confettiFall linear forwards}
  @keyframes confettiFall{to{transform:translateY(110vh) rotate(720deg);opacity:0}}
</style>
</head>
<body>
  <!-- Welcome gate: user must tap to enter (also unlocks audio autoplay) -->
  <div id="welcomeGate" role="dialog" aria-label="Buka Undangan">
    <div class="gate-card">
      <div class="gate-eyebrow">~ Sebuah undangan untukmu ~</div>
      <div class="gate-title">${title}</div>
      <div class="gate-divider"><span class="ln"></span><span class="fl">✿</span><span class="ln"></span></div>

      <div class="gate-env" aria-hidden="true">
        <div class="gate-env-glow"></div>
        <div class="gate-env-base"></div>
        <div class="gate-env-flap"></div>
        <div class="gate-env-heart">❤</div>
      </div>
      <div class="gate-sub">Kami mengundangmu untuk membuka kenangan & doa pada momen istimewa ini ✿</div>
      <button class="gate-btn" id="gateBtn" type="button">
        <span class="ic">💌</span><span>Buka Undangan</span><span class="ic">✿</span>
      </button>
      <div class="gate-hint">Tekan tombol di atas untuk memulai</div>
      <div class="gate-countdown" id="gateCountdown" aria-live="polite"></div>
    </div>
  </div>

  <div class="bg"></div>
  <div class="petals" id="petals"></div>

  <header>
    <div class="ornament">~ Forever &amp; Always ~</div>
    <h1>${title}</h1>
    <div class="sub">Sebuah kenangan abadi, dirajut dalam kelopak edelweis</div>
    <div class="divider"><span class="line"></span><span class="flower">✿</span><span class="line"></span></div>
    <div class="meta">${meta.items.length} kenangan • ${escapeHtml(formatEventDate(meta.eventDate || meta.createdAt))}</div>

    <!-- Live day counter (auto-updates) -->
    <div class="daycount" id="daycount" style="display:none">
      <div class="label">Sudah</div>
      <div class="num" id="dcNum">—</div>
      <div class="desc" id="dcDesc">setelah pernikahan</div>
    </div>

    <div class="actions">
      <a class="btn primary" href="/album/${slug}/download">⬇ Unduh Semua (.zip)</a>
      <button class="btn" onclick="copyLink()">🔗 Salin Tautan</button>
      <button class="btn" onclick="document.getElementById('wishes').scrollIntoView({behavior:'smooth'})">💌 Tulis Ucapan</button>
    </div>
  </header>

  <section class="quote-section">
    <div class="quote-label">~ Doa & Kata Cinta ~</div>
    <div class="quote-box" id="quoteBox"></div>
    <div class="quote-dots" id="quoteDots"></div>
  </section>

  <main>
    <h2 class="gallery-title">Galeri Kenangan</h2>
    <div class="grid" id="grid"></div>
  </main>

  <section class="prayer">
    <h2>Doa untuk Sang Kekasih</h2>
    <p>
      Ya Rabb, Engkau yang menyatukan hati kami dalam ikatan suci ini —<br>
      jadikanlah ia separuh jiwa yang menenangkan, pelindung yang menguatkan,<br>
      dan teman seperjalanan menuju surga-Mu.<br><br>
      Limpahkanlah kami sakinah, mawaddah, wa rahmah.<br>
      Kuatkanlah kami di kala lelah, satukanlah kami di kala beda,<br>
      dan abadikanlah cinta ini hingga ke jannah-Mu.
    </p>
    <div class="amin">~ Aamiin Yaa Rabbal ‘Aalamiin ~</div>
  </section>

  <!-- Wishes Wall (Buku Tamu) -->
  <section class="wishes" id="wishes">
    <h2>Buku Ucapan & Doa</h2>
    <div class="sub2">Tinggalkan ucapan & doamu untuk pasangan ini 💕</div>
    <form class="wish-form" id="wishForm" onsubmit="return submitWish(event)">
      <input type="text" id="wName" maxlength="40" placeholder="Nama kamu (atau 'Anonim')" required>
      <textarea id="wMsg" maxlength="500" placeholder="Tulis ucapan & doa terbaikmu..." required></textarea>
      <button type="submit" id="wBtn">Kirim Ucapan ✨</button>
    </form>
    <div class="wish-list" id="wishList">
      <div class="wish-empty">Belum ada ucapan. Jadilah yang pertama 💌</div>
    </div>
  </section>

  ${(meta.audios && meta.audios.length) || meta.audio ? `
  <!-- Background music (playlist: plays in order, loops back to first) -->
  <audio id="bgAudio" preload="auto" playsinline webkit-playsinline></audio>
  <button class="audio-fab" id="audioFab" title="Pause/Play musik" aria-label="Toggle music">🎵</button>
  <div class="audio-hint" id="audioHint">🎵 Musik diputar otomatis</div>
  ` : ''}

  <!-- QR code section -->
  <section class="qr-section">
    <h3>~ Bagikan Album ~</h3>
    <p>Scan QR ini untuk membuka album dari HP</p>
    <img id="qrImg" src="qr.png" alt="QR Code Album" loading="lazy">
  </section>

  <div class="lb" id="lb">
    <button class="lb-close" onclick="closeLb()">✕</button>
    <a class="lb-dl" id="lbDl" href="#" download title="Unduh">⬇</a>
    <button class="lb-prev" onclick="navLb(-1)">‹</button>
    <button class="lb-next" onclick="navLb(1)">›</button>
    <div class="lb-inner" id="lbInner"></div>
    <div class="counter" id="counter"></div>
  </div>

  <footer>
    "Cintamu adalah doa yang tak pernah putus, dan kenangan yang tak akan pernah pudar."<br>
    Dibuat dengan <span class="heart">❤</span> untuk <em>${title}</em><br>
    <span style="font-size:12px;opacity:.7">Album Abadi · Edelweiss Edition · Forever &amp; Always</span>
  </footer>

  <div class="toast" id="toast">Tautan disalin ✓</div>

<script>
  const ITEMS = ${itemsJson};
  const SLUG = ${JSON.stringify(slug)};
  const QUOTES = ${quotesJson};
  const EVENT_DATE = ${meta.eventDate ? JSON.stringify(meta.eventDate) : 'null'};
  const PLAYLIST = ${JSON.stringify((meta.audios && meta.audios.length) ? meta.audios.map(a => a.file) : (meta.audio ? [meta.audio.file] : []))};
  const HAS_AUDIO = PLAYLIST.length > 0;

  // Romantic quote rotator
  const qBox = document.getElementById('quoteBox');
  const qDots = document.getElementById('quoteDots');
  QUOTES.forEach((q, i) => {
    const div = document.createElement('div');
    div.className = 'quote' + (i === 0 ? ' active' : '');
    div.innerHTML = '<div class="text">' + q.t + '</div>' + (q.s ? '<div class="src">' + q.s + '</div>' : '');
    qBox.appendChild(div);
    const dot = document.createElement('div');
    dot.className = 'quote-dot' + (i === 0 ? ' active' : '');
    dot.onclick = () => showQuote(i);
    qDots.appendChild(dot);
  });
  let qIdx = 0;
  function showQuote(i) {
    qBox.children[qIdx].classList.remove('active');
    qDots.children[qIdx].classList.remove('active');
    qIdx = (i + QUOTES.length) % QUOTES.length;
    qBox.children[qIdx].classList.add('active');
    qDots.children[qIdx].classList.add('active');
  }
  setInterval(() => showQuote(qIdx + 1), 6000);
  const grid = document.getElementById('grid');
  ITEMS.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openLb(i);
    if (it.t === 'video') {
      card.innerHTML = '<span class="badge video">▶ VIDEO</span><video src="files/' + encodeURIComponent(it.f) + '" muted playsinline preload="metadata"></video>';
    } else {
      card.innerHTML = '<img loading="lazy" src="files/' + encodeURIComponent(it.f) + '" alt="">';
    }
    grid.appendChild(card);
  });
  // Stagger reveal
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        setTimeout(() => e.target.classList.add('in'), 50);
        io.unobserve(e.target);
      }
    });
  }, { threshold: .08 });
  document.querySelectorAll('.card').forEach(c => io.observe(c));

  // Lightbox
  let cur = 0;
  const lb = document.getElementById('lb');
  const lbInner = document.getElementById('lbInner');
  const lbDl = document.getElementById('lbDl');
  const counter = document.getElementById('counter');
  function openLb(i){ cur = i; render(); lb.classList.add('open'); document.body.style.overflow='hidden'; }
  function closeLb(){ lb.classList.remove('open'); document.body.style.overflow=''; lbInner.innerHTML=''; }
  function navLb(d){ cur = (cur + d + ITEMS.length) % ITEMS.length; render(); }
  function render(){
    const it = ITEMS[cur];
    const url = 'files/' + encodeURIComponent(it.f);
    lbInner.innerHTML = it.t === 'video'
      ? '<video src="' + url + '" controls autoplay></video>'
      : '<img src="' + url + '" alt="">';
    lbDl.href = url; lbDl.setAttribute('download', it.f);
    counter.textContent = (cur+1) + ' / ' + ITEMS.length;
  }
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') navLb(-1);
    if (e.key === 'ArrowRight') navLb(1);
  });
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });

  function copyLink(){
    navigator.clipboard.writeText(window.location.href).then(() => {
      const t = document.getElementById('toast');
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 1800);
    });
  }

  // Petals — bunga edelweis (Leontopodium alpinum) ASLI:
  // - 7 kelopak (bract) putih panjang runcing memancar bintang
  // - tengahnya gerombolan kuning dari beberapa kuncup kecil (disk florets)
  // - tepi kelopak agak berbulu/woolly (dibuat pakai stroke putih lembut)
  const EDELWEISS = (
    '<svg viewBox="0 0 40 40">'
    + '<defs>'
    +   '<radialGradient id="el-bract" cx="50%" cy="50%" r="50%">'
    +     '<stop offset="0%" stop-color="#fff"/>'
    +     '<stop offset="70%" stop-color="#fbf6ec"/>'
    +     '<stop offset="100%" stop-color="#e8dec9"/>'
    +   '</radialGradient>'
    + '</defs>'
    // 9 wide overlapping woolly white bracts in a dense star (rapet, gak renggang)
    // Bract path is wide at base (4px each side) and tapers to a point at the tip,
    // so adjacent bracts overlap and form a solid star with no gaps in between.
    + '<g fill="url(#el-bract)" stroke="#d6c9ad" stroke-width=".4" stroke-linejoin="round">'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" />'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(40 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(80 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(120 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(160 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(200 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(240 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(280 20 20)"/>'
    +   '<path d="M20 20 Q24 14 23 6 Q20 1 17 6 Q16 14 20 20 Z" transform="rotate(320 20 20)"/>'
    + '</g>'
    // Soft woolly highlight (fuzz feel) along each bract spine
    + '<g stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity=".85" fill="none">'
    +   '<line x1="20" y1="17" x2="20" y2="4"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(40 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(80 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(120 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(160 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(200 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(240 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(280 20 20)"/>'
    +   '<line x1="20" y1="17" x2="20" y2="4" transform="rotate(320 20 20)"/>'
    + '</g>'
    // Central cluster: 7 small yellow disk florets (the real flowers of edelweiss)
    + '<g>'
    +   '<circle cx="20" cy="20" r="2.2" fill="#ffd76b" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="22.5" cy="19" r="1.6" fill="#ffcd54" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="17.5" cy="19" r="1.6" fill="#ffcd54" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="21" cy="22" r="1.5" fill="#ffd76b" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="19" cy="22" r="1.5" fill="#ffcd54" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="20" cy="17.5" r="1.4" fill="#ffd76b" stroke="#c89a3a" stroke-width=".3"/>'
    +   '<circle cx="23" cy="21.5" r="1.2" fill="#ffcd54" stroke="#c89a3a" stroke-width=".3"/>'
    + '</g>'
    // Tiny dot highlights (texture on disk florets)
    + '<g fill="#fff7d6" opacity=".8">'
    +   '<circle cx="19.6" cy="19.6" r=".4"/>'
    +   '<circle cx="22.2" cy="18.8" r=".3"/>'
    +   '<circle cx="17.8" cy="18.8" r=".3"/>'
    + '</g>'
    + '</svg>'
  );
  const petalSvgs = [
    EDELWEISS, EDELWEISS, EDELWEISS, EDELWEISS, EDELWEISS, // 5x edelweis biar dominan
    // Pink petal (aksen)
    '<svg viewBox="0 0 24 24"><path fill="#ffd1dc" d="M12 2c2 4 6 6 6 10s-3 6-6 10c-3-4-6-6-6-10s4-6 6-10z" stroke="#e895a6" stroke-width=".6"/></svg>',
    // Blue petal (aksen)
    '<svg viewBox="0 0 24 24"><path fill="#cce8f5" d="M12 3c1.5 3 4 4 4 7a4 4 0 1 1-8 0c0-3 2.5-4 4-7z" stroke="#85bedb" stroke-width=".5"/></svg>'
  ];
  const wrap = document.getElementById('petals');
  const COUNT = 36;
  function randomizePetal(p, i) {
    p.innerHTML = petalSvgs[i % petalSvgs.length];
    p.style.left = Math.random()*100 + 'vw';
    p.style.setProperty('--dx', (Math.random()*160 - 80) + 'px');
    p.style.animationDuration = (9 + Math.random()*14) + 's';
    p.style.opacity = (0.55 + Math.random()*0.4);
    // Apply a fresh scale + base rotation each cycle so it never looks repetitive
    const scale = (0.55 + Math.random()*0.95).toFixed(2);
    p.style.setProperty('--scale', scale);
  }
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElement('div');
    p.className = 'petal';
    randomizePetal(p, i);
    // Initial offset so petals don't all start in sync
    p.style.animationDelay = (-Math.random()*20) + 's';
    // Re-randomize each time the animation completes a loop — keeps it lively forever
    p.addEventListener('animationiteration', () => randomizePetal(p, i));
    wrap.appendChild(p);
  }
  // Defensive: if browser ever pauses animations (e.g. tab background), restart on visibility
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      wrap.querySelectorAll('.petal').forEach(p => {
        p.style.animation = 'none';
        // force reflow then re-apply
        // eslint-disable-next-line no-unused-expressions
        p.offsetHeight;
        p.style.animation = '';
      });
    }
  });

  // ====== WELCOME GATE (tap-to-open) ======
  // Spawn floating background sparkles & orbs on the gate while user waits
  (function decorateGate(){
    const gate = document.getElementById('welcomeGate');
    if (!gate) return;
    const sparkleChars = ['✦','✧','✿','❀','♡','✶'];
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('div');
      s.className = 'gate-sparkle';
      s.textContent = sparkleChars[i % sparkleChars.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = Math.random() * 100 + 'vh';
      s.style.animationDelay = (Math.random() * 2.4) + 's';
      s.style.fontSize = (12 + Math.random() * 18) + 'px';
      gate.appendChild(s);
    }
    for (let i = 0; i < 8; i++) {
      const o = document.createElement('div');
      o.className = 'gate-bg-orb';
      const sz = 40 + Math.random() * 100;
      o.style.width = sz + 'px';
      o.style.height = sz + 'px';
      o.style.left = (Math.random() * 100) + 'vw';
      o.style.animationDelay = (Math.random() * 10) + 's';
      o.style.animationDuration = (8 + Math.random() * 8) + 's';
      gate.appendChild(o);
    }
  })();

  // ====== AUTO-EXPLODE COUNTDOWN ======
  // Kalau dalam 30 detik tombol gak dipencet, surat meledak sendiri
  // (seolah-olah karena terlalu greget). Setelah meledak, gate dihapus
  // dan album terbuka otomatis dengan musik & efek meriah.
  (function setupCountdown(){
    const gate = document.getElementById('welcomeGate');
    const env = gate && gate.querySelector('.gate-env');
    const cd  = document.getElementById('gateCountdown');
    if (!gate || !cd) return;
    let remain = 30;
    cd.textContent = 'Suratnya meledak otomatis dalam ' + remain + 's…';
    const tick = setInterval(() => {
      if (gate.dataset.opened === '1') { clearInterval(tick); return; }
      remain--;
      if (remain <= 0) {
        clearInterval(tick);
        cd.textContent = '💥 BOOM! Suratnya meledak karena gak sabar!';
        cd.classList.add('urgent');
        if (env) env.classList.add('urgent');
        explodeInvitation();
        return;
      }
      cd.textContent = remain <= 10
        ? '💗 ' + remain + '… buruan dipencet sebelum meledak!'
        : 'Suratnya meledak otomatis dalam ' + remain + 's…';
      if (remain <= 10) {
        cd.classList.add('urgent');
        if (env) env.classList.add('urgent');
      }
    }, 1000);
  })();

  function explodeInvitation() {
    const gate = document.getElementById('welcomeGate');
    if (!gate || gate.dataset.opened === '1') return;
    // Flash overlay
    const flash = document.createElement('div');
    flash.className = 'gate-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 900);
    // Shards burst (hearts + flowers + sparkles flying everywhere)
    const shardChars = ['❤','💕','💖','✿','❀','✦','✧','♡','💗','💝','❁','💞'];
    const colors = ['#e8889e','#f5b8c5','#bcdcf0','#a3c8e6','#ffd1dc','#fff','#ffd76b'];
    for (let i = 0; i < 80; i++) {
      const s = document.createElement('div');
      s.className = 'gate-shard';
      s.textContent = shardChars[i % shardChars.length];
      s.style.color = colors[i % colors.length];
      const angle = (Math.PI * 2 * i) / 80 + Math.random() * 0.4;
      const dist = 280 + Math.random() * 380;
      s.style.setProperty('--sx', Math.cos(angle) * dist + 'px');
      s.style.setProperty('--sy', Math.sin(angle) * dist + 'px');
      s.style.setProperty('--srot', (Math.random() * 1080 - 540) + 'deg');
      s.style.fontSize = (16 + Math.random() * 26) + 'px';
      s.style.animationDelay = (Math.random() * 0.15) + 's';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 1600);
    }
    gate.classList.add('exploding');
    // After shake+explosion finishes, run the normal opening flow
    setTimeout(() => openInvitation(true), 800);
  }

  // The "Buka Undangan" click triggers: opening animation + audio start + gate fade
  function openInvitation(viaExplosion) {
    const gate = document.getElementById('welcomeGate');
    if (!gate || gate.dataset.opened === '1') return;
    gate.dataset.opened = '1';
    gate.classList.add('opening');

    // CRITICAL: start audio FIRST (synchronous within click gesture window)
    // before any heavy DOM work, so browsers don't reject the autoplay.
    if (audioPlayerApi && audioPlayerApi.startPlayback) {
      audioPlayerApi.startPlayback();
    }

    // Burst of hearts in random directions from the center
    const heartChars = ['❤','💕','💖','💗','💝','♡'];
    for (let i = 0; i < 18; i++) {
      const h = document.createElement('div');
      h.className = 'gate-heart-burst';
      h.textContent = heartChars[i % heartChars.length];
      const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
      const dist = 180 + Math.random() * 220;
      h.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      h.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      h.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      h.style.fontSize = (20 + Math.random() * 28) + 'px';
      h.style.animationDelay = (Math.random() * 0.4) + 's';
      gate.appendChild(h);
    }
    // Confetti shower across the screen
    const confChars = ['✿','❀','✦','♡','✧','❁','✾'];
    const colors = ['#e8889e','#f5b8c5','#bcdcf0','#a3c8e6','#ffd1dc','#d4a5b8'];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'gate-confetti';
      c.textContent = confChars[i % confChars.length];
      c.style.color = colors[i % colors.length];
      c.style.setProperty('--cx', (Math.random() * 800 - 400) + 'px');
      c.style.setProperty('--cy', (300 + Math.random() * 400) + 'px');
      c.style.setProperty('--crot', (Math.random() * 1080 - 540) + 'deg');
      c.style.fontSize = (14 + Math.random() * 22) + 'px';
      c.style.animationDelay = (Math.random() * 0.3) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 3200);
    }

    // Fade out the gate after the envelope opening animation completes
    setTimeout(() => {
      gate.classList.add('gone');
      // Smooth scroll to top of the album content
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1900);
    // Cleanup gate from DOM after fade
    setTimeout(() => { try { gate.remove(); } catch {} }, 3200);
  }
  document.getElementById('gateBtn').addEventListener('click', openInvitation);
  // Also open on Enter/Space key for accessibility
  window.addEventListener('keydown', (e) => {
    const gate = document.getElementById('welcomeGate');
    if (gate && !gate.dataset.opened && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openInvitation();
    }
  });

  // ====== DAY COUNTER (auto-update each day) ======
  function updateDayCounter() {
    if (!EVENT_DATE) return;
    const dc = document.getElementById('daycount');
    const num = document.getElementById('dcNum');
    const desc = document.getElementById('dcDesc');
    if (!dc) return;
    const event = new Date(EVENT_DATE);
    const today = new Date();
    const a = new Date(event.getFullYear(), event.getMonth(), event.getDate());
    const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((b - a) / (1000 * 60 * 60 * 24));
    dc.style.display = 'block';
    if (diffDays === 0) {
      num.textContent = 'Hari Ini';
      desc.textContent = 'Hari pernikahan ✿';
    } else if (diffDays > 0) {
      num.textContent = diffDays + ' hari';
      desc.textContent = 'setelah pernikahan 💍';
    } else {
      const d = Math.abs(diffDays);
      num.textContent = 'H-' + d;
      desc.textContent = 'menuju hari pernikahan ✿';
    }
  }
  updateDayCounter();
  // Re-check every hour so it flips at midnight without refresh
  setInterval(updateDayCounter, 60 * 60 * 1000);

  // ====== AUDIO PLAYLIST PLAYER (track 1 → 2 → ... → N → loop back to 1) ======
  // Audio is started by the welcome-gate click, which is a guaranteed user gesture,
  // so playback starts unmuted on every browser.
  let audioPlayerApi = null;
  if (HAS_AUDIO) {
    const audio = document.getElementById('bgAudio');
    const fab = document.getElementById('audioFab');
    const hint = document.getElementById('audioHint');
    let trackIdx = 0;
    let playing = false;
    audio.volume = 0.6;
    audio.preload = 'auto';
    const loadTrack = (i) => {
      trackIdx = ((i % PLAYLIST.length) + PLAYLIST.length) % PLAYLIST.length;
      audio.src = PLAYLIST[trackIdx];
      try { audio.load(); } catch {}
    };
    loadTrack(0);
    // When a track ends, advance to the next one. Wrap back to 0 after the last.
    audio.addEventListener('ended', () => {
      loadTrack(trackIdx + 1);
      audio.play().catch(() => {});
    });
    // If a file fails (404 / decode error), skip to next so playlist keeps going.
    let errSkips = 0;
    audio.addEventListener('error', () => {
      console.warn('[audio] load error track', trackIdx, audio.src);
      if (PLAYLIST.length > 1 && errSkips < PLAYLIST.length) {
        errSkips++;
        loadTrack(trackIdx + 1);
        audio.play().catch(() => {});
      }
    });
    audio.addEventListener('playing', () => { errSkips = 0; });
    const fadeIn = () => {
      audio.volume = 0;
      let v = 0;
      const target = 0.6;
      const step = setInterval(() => {
        v += 0.04;
        if (v >= target) { v = target; clearInterval(step); }
        audio.volume = v;
      }, 80);
    };
    const showHint = (txt, ms) => {
      if (!hint) return;
      hint.textContent = txt;
      hint.classList.add('show');
      setTimeout(() => hint.classList.remove('show'), ms || 4000);
    };
    const onPlayingSuccess = () => {
      playing = true;
      fadeIn();
      fab.classList.add('playing');
      fab.classList.remove('attention');
      fab.textContent = '🎵';
      showHint(PLAYLIST.length > 1 ? '🎵 Playlist ' + PLAYLIST.length + ' lagu (loop)' : '🎵 Musik diputar');
    };
    // Fallback: any user gesture anywhere on page will start audio if autoplay was blocked.
    const gestureStart = async () => {
      if (playing || !audio.paused) return;
      try { await audio.play(); onPlayingSuccess(); } catch {}
    };
    ['click','touchstart','pointerdown','keydown'].forEach(ev =>
      window.addEventListener(ev, gestureStart, { passive: true }));
    const startPlayback = async () => {
      // iOS Safari trick: try muted play first to unlock the audio context,
      // then unmute. This works around stricter autoplay policies on mobile.
      try {
        audio.muted = false;
        audio.volume = 0.6;
        const p = audio.play();
        if (p && p.then) {
          p.then(onPlayingSuccess).catch(async () => {
            // Try muted-unlock fallback
            try {
              audio.muted = true;
              await audio.play();
              audio.muted = false;
              onPlayingSuccess();
            } catch {
              fab.classList.add('attention');
              showHint('🔊 Tap tombol musik buat putar lagu', 8000);
            }
          });
        } else {
          onPlayingSuccess();
        }
      } catch (e) {
        fab.classList.add('attention');
        showHint('🔊 Tap tombol musik buat putar lagu', 8000);
      }
    };
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      fab.classList.remove('attention');
      if (audio.paused) {
        audio.play().then(() => { playing = true; fab.classList.add('playing'); fab.textContent = '🎵'; }).catch(() => {});
      } else {
        audio.pause();
        playing = false;
        fab.classList.remove('playing');
        fab.textContent = '🔇';
      }
    });
    // Pause music when watching a video in lightbox; resume after
    const _open = openLb, _close = closeLb;
    openLb = function(i){ if (ITEMS[i] && ITEMS[i].t === 'video' && playing) audio.pause(); _open(i); };
    closeLb = function(){ _close(); if (HAS_AUDIO && playing) audio.play().catch(()=>{}); };
    audioPlayerApi = { startPlayback };
  }

  // ====== WISHES WALL (live) ======
  const wishList = document.getElementById('wishList');
  function timeAgo(ts){
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s/60) + ' menit lalu';
    if (s < 86400) return Math.floor(s/3600) + ' jam lalu';
    return Math.floor(s/86400) + ' hari lalu';
  }
  function escHtml(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  // Owner's pinned wish (set via /setucapan in Telegram). Always renders at
  // the very top of the wall, separated from guest wishes so it can never
  // get buried by new ones.
  const OWNER_WISH = ${meta.ownerWish ? JSON.stringify({ name: meta.ownerWish.name || '', msg: meta.ownerWish.msg || '', badge: meta.ownerWish.badge || '💍 Mempelai' }) : 'null'};
  function renderOwnerWish(){
    if (!OWNER_WISH || !OWNER_WISH.msg) return '';
    return '<div class="wish pinned">'
      + '<div class="name">' + escHtml(OWNER_WISH.name || 'Mempelai')
      + '<span class="pin-badge">' + escHtml(OWNER_WISH.badge || '💍 Pinned') + '</span>'
      + '</div>'
      + '<div class="msg">' + escHtml(OWNER_WISH.msg) + '</div>'
      + '</div>';
  }
  function renderWishes(arr){
    const ownerHtml = renderOwnerWish();
    if (!arr.length) {
      wishList.innerHTML = ownerHtml + (ownerHtml ? '' : '<div class="wish-empty">Belum ada ucapan. Jadilah yang pertama 💌</div>');
      return;
    }
    wishList.innerHTML = ownerHtml + arr.slice().reverse().map(w =>
      '<div class="wish"><div class="name">' + escHtml(w.name) + '</div><div class="msg">' + escHtml(w.msg) + '</div><div class="when">' + timeAgo(w.t) + '</div></div>'
    ).join('');
  }
  // WISHES_API_BASE is rewritten by githubPublish.js when the album is
  // pushed to GitHub Pages — it gets pointed at the Replit backend so wishes
  // still read & post live. On Replit it stays empty and uses relative paths.
  const WISHES_API_BASE = "%%WISHES_API_BASE%%";
  const wUrl = (p) => (WISHES_API_BASE && !WISHES_API_BASE.startsWith('%%') ? WISHES_API_BASE.replace(/\\/$/, '') + '/' : '') + p;
  async function loadWishes(){
    try {
      const r = await fetch(wUrl('wishes.json') + '?t=' + Date.now());
      const arr = await r.json();
      renderWishes(arr);
    } catch (e) {}
  }
  async function submitWish(ev){
    ev.preventDefault();
    const btn = document.getElementById('wBtn');
    const name = document.getElementById('wName').value.trim().slice(0,40) || 'Anonim';
    const msg = document.getElementById('wMsg').value.trim().slice(0,500);
    if (!msg) return false;
    btn.disabled = true; btn.textContent = 'Mengirim...';
    try {
      const r = await fetch(wUrl('wishes'), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, msg}) });
      if (!r.ok) throw new Error('fail');
      document.getElementById('wMsg').value = '';
      await loadWishes();
      btn.textContent = 'Terkirim ✓ Terima kasih 💕';
      celebrateConfetti();
      setTimeout(() => { btn.textContent = 'Kirim Ucapan ✨'; btn.disabled = false; }, 2500);
    } catch (e) {
      btn.textContent = 'Gagal, coba lagi';
      setTimeout(() => { btn.textContent = 'Kirim Ucapan ✨'; btn.disabled = false; }, 2000);
    }
    return false;
  }
  loadWishes();
  // Refresh wishes every 20s so visitors see new ones live
  setInterval(loadWishes, 20000);

  // ====== CONFETTI EASTER EGG ======
  const CONFETTI_EMOJIS = ['❤','💕','💖','✿','🌸','🤍','💍','💐'];
  function celebrateConfetti(count = 50){
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-piece';
      c.textContent = CONFETTI_EMOJIS[Math.floor(Math.random()*CONFETTI_EMOJIS.length)];
      c.style.left = Math.random()*100 + 'vw';
      c.style.fontSize = (16 + Math.random()*22) + 'px';
      c.style.animationDuration = (3 + Math.random()*3) + 's';
      c.style.animationDelay = (Math.random()*0.6) + 's';
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 7000);
    }
  }
  // Trigger confetti when scrolled near bottom (once per session)
  let confettiFired = false;
  window.addEventListener('scroll', () => {
    if (confettiFired) return;
    if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 200) {
      confettiFired = true;
      celebrateConfetti(60);
    }
  });
  // Heart in footer triggers confetti on click
  document.addEventListener('DOMContentLoaded', () => {
    const heart = document.querySelector('footer .heart');
    if (heart) { heart.style.cursor = 'pointer'; heart.title = 'Klik aku 💕'; heart.addEventListener('click', () => celebrateConfetti(40)); }
  });
</script>
</body>
</html>`;
}

function renderIndexHtml(albums) {
    const cards = albums.map(a => {
        const cover = a.items.find(it => it.type === 'photo') || a.items[0];
        const coverUrl = cover ? `albums/${a.slug}/files/${encodeURIComponent(cover.file)}` : '';
        return `<a class="card" href="/album/${a.slug}">
            <div class="thumb">${coverUrl ? `<img src="${coverUrl}" alt="">` : ''}</div>
            <div class="info">
                <h3>${escapeHtml(a.title)}</h3>
                <p>${a.items.length} kenangan • ${escapeHtml(new Date(a.createdAt).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}))}</p>
            </div>
        </a>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Album Abadi</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=Great+Vibes&family=Inter:wght@300;400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#0f0a0e;color:#f6ecdf;min-height:100vh;background-image:radial-gradient(1000px 700px at 70% -10%,#3a1f2b 0%,transparent 60%),radial-gradient(800px 600px at 0% 110%,#1c2b2a 0%,transparent 55%)}
header{text-align:center;padding:80px 20px 40px}
.orn{font-family:'Great Vibes',cursive;color:#c9a96a;font-size:28px}
h1{font-family:'Cormorant Garamond',serif;font-size:64px;background:linear-gradient(180deg,#f8e8c6,#c9a96a);-webkit-background-clip:text;background-clip:text;color:transparent;margin:10px 0}
.sub{font-style:italic;color:#cdbfa6;font-family:'Cormorant Garamond',serif;font-size:18px}
main{max-width:1200px;margin:0 auto;padding:0 20px 80px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:20px}
.card{display:block;background:#15101a;border:1px solid #2a1f27;border-radius:16px;overflow:hidden;transition:all .3s;text-decoration:none;color:inherit}
.card:hover{border-color:#c9a96a;transform:translateY(-4px);box-shadow:0 20px 40px -20px rgba(201,169,106,.3)}
.thumb{aspect-ratio:4/3;background:#0a0709;overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover;transition:transform .5s}
.card:hover .thumb img{transform:scale(1.05)}
.info{padding:18px}
.info h3{font-family:'Cormorant Garamond',serif;font-size:24px;color:#f6ecdf}
.info p{font-size:13px;color:#9a8b76;margin-top:4px}
.empty{text-align:center;padding:60px 20px;color:#9a8b76;font-style:italic;font-family:'Cormorant Garamond',serif;font-size:20px}
</style></head><body>
<header>
<div class="orn">~ Album Abadi ~</div>
<h1>Galeri Kenangan</h1>
<div class="sub">Setiap foto adalah selembar cerita yang abadi</div>
</header>
<main>
${albums.length ? `<div class="grid">${cards}</div>` : '<div class="empty">Belum ada album ✿</div>'}
</main>
</body></html>`;
}

// ==================== TELEGRAM REGISTRATION ====================

function registerAlbumCommand(bot, checkAccess) {
    ensureDirs();

    const access = async (msg) => {
        if (typeof checkAccess === 'function') {
            try { return await checkAccess(msg, 'album'); } catch { return true; }
        }
        return true;
    };

    // /album - start a new album session
    bot.onText(/^\/album(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;

        if (sessions.has(chatId)) {
            return bot.sendMessage(chatId,
                '⚠️ Kamu masih punya sesi album yang aktif.\n\nTekan tombol *✅ Konfirmasi* di pesan kontrol, atau ketik /batalalbum untuk membatalkan.',
                { parse_mode: 'Markdown' });
        }

        sessions.set(chatId, { step: 'await_couple', title: null, couple: null, eventDate: null, audio: null, items: [], createdAt: Date.now() });

        await bot.sendMessage(chatId,
            '✿ *ALBUM ABADI* ✿\n\n' +
            'Yuk bikin album kenangan yang abadi 💍\n\n' +
            '*Langkah 1/5:* Kirim *nama pasangan*\n' +
            'Contoh: `Adit & Siti`  atau  `Adit - Siti`\n\n' +
            '_Nama ini bakal jadi judul besar di halaman albumnya._\n' +
            '_Ketik /batalalbum untuk batal._',
            { parse_mode: 'Markdown' });
    });

    // /selesai - confirm and build album
    bot.onText(/^\/selesai(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        const s = sessions.get(chatId);
        if (!s) return;
        await finalizeAlbum(bot, chatId, s);
    });

    // /batalalbum - cancel
    bot.onText(/^\/batalalbum(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        if (sessions.has(chatId)) {
            sessions.delete(chatId);
            bot.sendMessage(chatId, '❌ Sesi album dibatalkan.');
        }
    });

    // /resetalbum - delete ALL albums (with confirmation)
    const resetConfirm = new Map(); // chatId -> timestamp
    bot.onText(/^\/resetalbum(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const arg = (match && match[1] || '').trim().toLowerCase();
        const albums = loadIndex();

        if (arg !== 'yes' && arg !== 'ya' && arg !== 'confirm') {
            resetConfirm.set(chatId, Date.now());
            return bot.sendMessage(chatId,
                `⚠️ *RESET ALBUM*\n\n` +
                `Ini bakal *menghapus SEMUA* album (${albums.length} album) — termasuk foto, video, lagu, dan ucapan.\n\n` +
                `Tindakan ini *tidak bisa di-undo*.\n\n` +
                `Kalau yakin, ketik:\n\`/resetalbum yes\``,
                { parse_mode: 'Markdown' });
        }

        const ts = resetConfirm.get(chatId);
        if (!ts || Date.now() - ts > 2 * 60 * 1000) {
            resetConfirm.delete(chatId);
            return bot.sendMessage(chatId, '⏱ Konfirmasi sudah kedaluwarsa. Ketik `/resetalbum` lagi.', { parse_mode: 'Markdown' });
        }
        resetConfirm.delete(chatId);

        if (!albums.length) {
            // Still clean up any stray folders
        }

        const status = await bot.sendMessage(chatId, `🧹 Menghapus ${albums.length} album...`);
        let deleted = 0, failed = 0;
        try {
            // Delete every album folder listed in index
            for (const a of albums) {
                try {
                    const dir = path.join(ALBUMS_DIR, a.slug);
                    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
                    deleted++;
                } catch (e) { failed++; console.error('[resetalbum]', a.slug, e.message); }
            }
            // Also sweep any orphan folders in the albums dir
            if (fs.existsSync(ALBUMS_DIR)) {
                for (const name of fs.readdirSync(ALBUMS_DIR)) {
                    const full = path.join(ALBUMS_DIR, name);
                    try {
                        const st = fs.statSync(full);
                        if (st.isDirectory()) fs.rmSync(full, { recursive: true, force: true });
                    } catch {}
                }
            }
            // Reset index and rebuild empty gallery page
            saveIndex([]);
            try {
                fs.writeFileSync(path.join(ALBUMS_DIR, 'index.html'), renderIndexHtml([]));
            } catch {}
        } catch (e) {
            return bot.editMessageText(`❌ Gagal reset: \`${e.message}\``,
                { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
        }
        await bot.editMessageText(
            `✅ *Reset selesai!*\n\n` +
            `🗑 ${deleted} album dihapus${failed ? `, ${failed} gagal` : ''}.\n` +
            `📁 Daftar album sekarang kosong.\n\n` +
            `_Ketik /album untuk bikin yang baru._`,
            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
    });

    // /listalbum - show all albums
    bot.onText(/^\/listalbum(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const albums = loadIndex();
        if (!albums.length) return bot.sendMessage(chatId, 'Belum ada album. Ketik /album untuk bikin yang pertama ✿');
        const base = getPublicBaseUrl();
        const list = albums.slice().reverse().map((a, i) =>
            `${i + 1}. *${a.title}*\n   📸 ${a.items.length} kenangan\n   🔗 ${base}/album/${a.slug}`
        ).join('\n\n');
        bot.sendMessage(chatId, `✿ *DAFTAR ALBUM ABADI*\n\n${list}\n\n🌐 Galeri utama: ${base}/album`,
            { parse_mode: 'Markdown', disable_web_page_preview: true });
    });

    // /hapusalbum <slug> - delete a single album (with confirmation)
    const deleteConfirm = new Map(); // chatId -> { slug, ts }
    bot.onText(/^\/hapusalbum(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const arg = (match && match[1] || '').trim();
        const albums = loadIndex();

        if (!arg) {
            if (!albums.length) {
                return bot.sendMessage(chatId, 'Belum ada album yang bisa dihapus.');
            }
            const list = albums.slice().reverse().map((a, i) =>
                `${i + 1}. *${a.title}*\n   \`/hapusalbum ${a.slug}\``
            ).join('\n\n');
            return bot.sendMessage(chatId,
                `🗑 *HAPUS ALBUM*\n\nKetik salah satu di bawah ini buat hapus album tertentu:\n\n${list}`,
                { parse_mode: 'Markdown' });
        }

        const tokens = arg.split(/\s+/);
        const isYes = ['yes', 'ya', 'confirm'].includes((tokens[1] || '').toLowerCase());
        const slug = tokens[0];
        const album = albums.find(a => a.slug === slug);

        if (!album) {
            return bot.sendMessage(chatId,
                `❌ Album dengan slug \`${slug}\` ngga ketemu.\n\nKetik /listalbum buat liat slug yang ada, atau /hapusalbum (tanpa argumen) buat liat menu hapus.`,
                { parse_mode: 'Markdown' });
        }

        if (!isYes) {
            deleteConfirm.set(chatId, { slug, ts: Date.now() });
            return bot.sendMessage(chatId,
                `⚠️ *HAPUS ALBUM*\n\n` +
                `Album: *${album.title}*\n` +
                `Slug: \`${album.slug}\`\n` +
                `Isi: ${album.items.length} kenangan\n\n` +
                `Tindakan ini *tidak bisa di-undo*.\n\n` +
                `Kalau yakin, ketik:\n\`/hapusalbum ${album.slug} yes\``,
                { parse_mode: 'Markdown' });
        }

        const pending = deleteConfirm.get(chatId);
        if (!pending || pending.slug !== slug || Date.now() - pending.ts > 2 * 60 * 1000) {
            deleteConfirm.delete(chatId);
            return bot.sendMessage(chatId,
                `⏱ Konfirmasi sudah kedaluwarsa atau ngga cocok. Ketik \`/hapusalbum ${slug}\` lagi.`,
                { parse_mode: 'Markdown' });
        }
        deleteConfirm.delete(chatId);

        const status = await bot.sendMessage(chatId, `🗑 Menghapus album *${album.title}*...`,
            { parse_mode: 'Markdown' });
        try {
            const dir = path.join(ALBUMS_DIR, album.slug);
            if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            const remaining = albums.filter(a => a.slug !== album.slug);
            saveIndex(remaining);
            try {
                fs.writeFileSync(path.join(ALBUMS_DIR, 'index.html'), renderIndexHtml(remaining));
            } catch {}
            await bot.editMessageText(
                `✅ Album *${album.title}* berhasil dihapus.\n\n` +
                `📁 Sisa album: ${remaining.length}.`,
                { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
        } catch (e) {
            console.error('[hapusalbum]', slug, e.message);
            await bot.editMessageText(`❌ Gagal hapus: \`${e.message}\``,
                { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
        }
    });

    // ===== /publishalbum — pilih album lewat tombol, bot tanya nama linknya, baru publish =====
    const publishLocks = new Set();
    // Ephemeral side-sessions for publish/addlagu/hapuslagu flows
    // chatId -> { kind: 'publish'|'addlagu'|'hapuslagu', slug, ts, ... }
    const sideSessions = new Map();

    function ghEnv() {
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;
        return { owner, repo, token, ok: !!(owner && repo && token) };
    }

    function albumKeyboard(albums, prefix, perRow = 5) {
        // Compact grid: 5 buttons per row so the keyboard stays short even
        // when there are many albums (Telegram caps inline_keyboard at 100
        // buttons / 8 rows of width-comfortable items).
        const rows = [];
        const list = albums.slice().reverse().slice(0, 50);
        // Numbered buttons keep each cell narrow enough for 5-per-row layout.
        for (let i = 0; i < list.length; i += perRow) {
            const batch = list.slice(i, i + perRow);
            rows.push(batch.map((a, j) => ({
                text: `${i + j + 1}. ${a.title.length > 10 ? a.title.slice(0, 9) + '…' : a.title}`,
                callback_data: `${prefix}:${a.slug}`,
            })));
        }
        rows.push([{ text: '❌ Batal', callback_data: `${prefix}:__cancel` }]);
        return { inline_keyboard: rows };
    }

    async function pushAlbumUpdateToGithub({ meta, addNames = [], removePaths = [], commitMessage, onProgress }) {
        // addNames: file names within album dir (e.g. 'index.html', 'qr.png', 'audio_2.mp3')
        // removePaths: full repo paths to delete (e.g. 'album/<ghSlug>/audio_1.mp3')
        const env = ghEnv();
        if (!env.ok) throw new Error('GitHub belum di-setup.');
        const { pushAlbumDelta } = require('./githubPublish');
        const ghSlug = meta.githubSlug || meta.slug;
        const albumDir = path.join(ALBUMS_DIR, meta.slug);
        const addFiles = addNames.map(name => ({
            pathInRepo: `album/${ghSlug}/${name}`,
            localPath: path.join(albumDir, name),
            localSlug: meta.slug,
        })).filter(f => fs.existsSync(f.localPath));
        return pushAlbumDelta({
            owner: env.owner, repo: env.repo, token: env.token,
            addFiles, deletePaths: removePaths,
            commitMessage: commitMessage || `Update album: ${meta.title || meta.slug}`,
            onProgress,
        });
    }

    // Rebuild album.zip on disk (mirrors what publishAlbumToGithub does)
    async function rebuildAlbumZip(meta) {
        const albumDir = path.join(ALBUMS_DIR, meta.slug);
        const filesDir = path.join(albumDir, 'files');
        const tmpZip = path.join(albumDir, 'album.zip');
        const safeTitle = (meta.title || meta.slug).replace(/[^\w\-]+/g, '_');
        if (fs.existsSync(filesDir) && fs.readdirSync(filesDir).length > 0) {
            await new Promise((resolve, reject) => {
                const out = fs.createWriteStream(tmpZip);
                const arc = archiver('zip', { zlib: { level: 6 } });
                out.on('close', resolve); out.on('error', reject); arc.on('error', reject);
                arc.pipe(out);
                arc.directory(filesDir, safeTitle);
                arc.finalize();
            });
        }
    }

    function loadMeta(slug) {
        const p = path.join(ALBUMS_DIR, slug, 'meta.json');
        if (!fs.existsSync(p)) return null;
        try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
    }
    function saveMeta(meta) {
        fs.writeFileSync(path.join(ALBUMS_DIR, meta.slug, 'meta.json'), JSON.stringify(meta, null, 2));
    }

    bot.onText(/^\/publishalbum(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const env = ghEnv();
        if (!env.ok) {
            return bot.sendMessage(chatId,
                '⚠️ GitHub belum di-setup.\n\nButuh: GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN', { parse_mode: 'Markdown' });
        }
        const albums = loadIndex();
        if (!albums.length) return bot.sendMessage(chatId, 'Belum ada album. Bikin dulu pakai /album ✿');

        bot.sendMessage(chatId,
            '🚀 *PUBLISH ALBUM KE GITHUB*\n\nPilih album mana yang mau di-publish:',
            { parse_mode: 'Markdown', reply_markup: albumKeyboard(albums, 'pub') });
    });

    async function startPublishPrompt(chatId, slug) {
        const albums = loadIndex();
        const target = albums.find(a => a.slug === slug);
        if (!target) {
            return bot.sendMessage(chatId, '❌ Album ngga ketemu. Coba /publishalbum lagi.');
        }
        const env = ghEnv();
        const meta = loadMeta(slug) || target;
        const defaultName = meta.githubSlug || target.slug;
        const example = `https://${env.owner.toLowerCase()}.github.io/${env.repo}/album/abadi/`;
        sideSessions.set(chatId, { kind: 'publish', slug: target.slug, ts: Date.now() });
        await bot.sendMessage(chatId,
            `📛 *Mau pakai nama link apa?*\n\n` +
            `Album: *${escapeMd(target.title)}*\n\n` +
            `Ketik nama linknya (huruf/angka/strip aja). Contoh: \`abadi\`\n` +
            `Hasilnya jadi gini:\n${example}\n\n` +
            `_Atau ketik *default* buat pakai: \`${defaultName}\`_\n` +
            `_Ketik */batalpublish* buat batal._`,
            { parse_mode: 'Markdown', disable_web_page_preview: true });
    }

    async function doPublish(chatId, slug, repoSlugRaw) {
        const albums = loadIndex();
        const target = albums.find(a => a.slug === slug);
        if (!target) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
        const env = ghEnv();
        if (!env.ok) return bot.sendMessage(chatId, '⚠️ GitHub belum di-setup.');

        const repoSlug = (repoSlugRaw || target.slug).toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || target.slug;

        const lockKey = `${chatId}:${target.slug}`;
        if (publishLocks.has(lockKey)) {
            return bot.sendMessage(chatId, `⏳ Album *${escapeMd(target.title)}* lagi di-publish. Tunggu ya.`, { parse_mode: 'Markdown' });
        }
        publishLocks.add(lockKey);

        const status = await bot.sendMessage(chatId,
            `🚀 *Publishing ke GitHub*\n\n📁 Repo: \`${env.owner}/${env.repo}\`\n🏷 Album: *${escapeMd(target.title)}*\n🔗 Link: \`${repoSlug}\`\n\n_Mulai..._`,
            { parse_mode: 'Markdown' });

        let lastEdit = 0;
        const lines = [`🚀 *Publishing ke GitHub*\n\n📁 Repo: \`${env.owner}/${env.repo}\`\n🏷 *${escapeMd(target.title)}*\n🔗 \`${repoSlug}\`\n`];
        const onProgress = (m) => {
            lines.push(m);
            const now = Date.now();
            if (now - lastEdit < 1500) return;
            lastEdit = now;
            const text = lines.join('\n').slice(-3500);
            bot.editMessageText(text, { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }).catch(() => {});
        };

        try {
            // Save the planned githubSlug+githubUrl into meta BEFORE rendering,
            // so the QR + page already encode the GitHub URL.
            const meta = loadMeta(target.slug) || { ...target };
            meta.slug = target.slug;
            meta.githubSlug = repoSlug;
            meta.githubUrl = `https://${env.owner.toLowerCase()}.github.io/${env.repo}/album/${repoSlug}/`;
            saveMeta(meta);
            // Regen QR PNG (now points to GitHub URL) and HTML (no design changes)
            try { await regenerateQrPng(meta); } catch (e) { console.error('[publish qr]', e.message); }
            try { fs.writeFileSync(path.join(ALBUMS_DIR, meta.slug, 'index.html'), renderAlbumHtml(meta)); } catch {}

            const { publishAlbumToGithub } = require('./githubPublish');
            const result = await publishAlbumToGithub({
                slug: target.slug,
                repoSlug,
                owner: env.owner, repo: env.repo, token: env.token,
                albumsDir: ALBUMS_DIR,
                onProgress
            });

            const sizeStr = result.bytes < 1024 * 1024 ? `${(result.bytes / 1024).toFixed(1)} KB` :
                result.bytes < 1024 * 1024 * 1024 ? `${(result.bytes / (1024 * 1024)).toFixed(1)} MB` :
                `${(result.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;

            // Persist actual ghSlug/url in case of normalization
            meta.githubSlug = result.ghSlug;
            meta.githubUrl = result.url;
            saveMeta(meta);

            let finalMsg = `✅ *PUBLISHED!*\n\n` +
                `🏷 ${escapeMd(target.title)}\n` +
                `📁 ${result.files} file (${sizeStr})\n` +
                `📝 Commit: \`${result.commit}\`\n` +
                `${result.pagesEnabled ? '🌐 GitHub Pages: aktif' : '⚠️ Aktifkan Pages manual di Settings'}\n\n` +
                `🔗 *Link permanen (selamanya):*\n${result.url}\n\n` +
                `🔳 QRIS halaman album sekarang otomatis ngarah ke link GitHub di atas.\n\n` +
                `⏰ *PENTING:* GitHub butuh *2-5 menit* buat build pertama.\n` +
                `Kalau masih 404, tunggu sebentar lalu refresh.\n\n` +
                `📊 Build progress: https://github.com/${env.owner}/${env.repo}/actions`;

            if (result.skipped && result.skipped.length) {
                finalMsg += `\n\n⚠️ ${result.skipped.length} file dilewati (>95MB):\n` +
                    result.skipped.slice(0, 5).map(s => `• ${s.p.split('/').pop()}`).join('\n');
            }

            await bot.editMessageText(finalMsg, {
                chat_id: chatId, message_id: status.message_id,
                parse_mode: 'Markdown', disable_web_page_preview: true
            }).catch(() => bot.sendMessage(chatId, finalMsg, { parse_mode: 'Markdown', disable_web_page_preview: true }));
        } catch (e) {
            console.error('[publishalbum]', e);
            bot.sendMessage(chatId, `❌ Gagal publish:\n\`${(e.message || String(e)).slice(0, 500)}\``, { parse_mode: 'Markdown' });
        } finally {
            publishLocks.delete(lockKey);
        }
    }

    bot.onText(/^\/batalpublish(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        const s = sideSessions.get(chatId);
        if (s && s.kind === 'publish') {
            sideSessions.delete(chatId);
            return bot.sendMessage(chatId, '❌ Publish dibatalkan.');
        }
        bot.sendMessage(chatId, 'Ngga ada sesi publish yang aktif.');
    });

    // ===== /addlagu — pilih album lewat tombol, kirim lagu, bot upload + push ke GitHub =====
    bot.onText(/^\/addlagu(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const albums = loadIndex();
        if (!albums.length) return bot.sendMessage(chatId, 'Belum ada album. Bikin dulu pakai /album ✿');
        bot.sendMessage(chatId,
            '🎵 *TAMBAH LAGU KE ALBUM*\n\nPilih album mana yang mau ditambahin lagu:',
            { parse_mode: 'Markdown', reply_markup: albumKeyboard(albums, 'addl') });
    });

    bot.onText(/^\/bataladdlagu(?:@\w+)?$/i, (msg) => {
        const chatId = msg.chat.id;
        const s = sideSessions.get(chatId);
        if (s && s.kind === 'addlagu') {
            sideSessions.delete(chatId);
            return bot.sendMessage(chatId, '❌ Tambah lagu dibatalkan.');
        }
        bot.sendMessage(chatId, 'Ngga ada sesi tambah lagu yang aktif.');
    });

    // ===== /hapuslagu — pilih album, lalu pilih lagu mana yang dihapus =====
    bot.onText(/^\/hapuslagu(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const albums = loadIndex();
        if (!albums.length) return bot.sendMessage(chatId, 'Belum ada album. Bikin dulu pakai /album ✿');
        bot.sendMessage(chatId,
            '🗑 *HAPUS LAGU DARI ALBUM*\n\nPilih album mana lagunya yang mau dihapus:',
            { parse_mode: 'Markdown', reply_markup: albumKeyboard(albums, 'dell') });
    });

    function songsKeyboard(meta) {
        const audios = (meta.audios && meta.audios.length) ? meta.audios : (meta.audio ? [meta.audio] : []);
        const rows = [];
        audios.forEach((a, i) => {
            const name = (a.name || a.file || `Lagu ${i + 1}`).slice(0, 40);
            rows.push([{ text: `🎵 ${i + 1}. ${name}`, callback_data: `dels:${meta.slug}:${i}` }]);
        });
        if (audios.length > 1) {
            rows.push([{ text: `🗑 Hapus SEMUA lagu (${audios.length})`, callback_data: `dels:${meta.slug}:__all` }]);
        }
        rows.push([{ text: '❌ Batal', callback_data: `dels:${meta.slug}:__cancel` }]);
        return { inline_keyboard: rows };
    }

    // ===== Centralized callback handler for pub:/addl:/dell:/dels: =====
    bot.on('callback_query', async (q) => {
        const data = q.data || '';
        const chatId = q.message && q.message.chat && q.message.chat.id;
        if (!chatId) return;

        // /publishalbum: album selected
        if (data.startsWith('pub:')) {
            const arg = data.slice(4);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (arg === '__cancel') {
                sideSessions.delete(chatId);
                return bot.sendMessage(chatId, '❌ Publish dibatalkan.');
            }
            return startPublishPrompt(chatId, arg);
        }

        // /addlagu: album selected
        if (data.startsWith('addl:')) {
            const arg = data.slice(5);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (arg === '__cancel') {
                sideSessions.delete(chatId);
                return bot.sendMessage(chatId, '❌ Tambah lagu dibatalkan.');
            }
            const meta = loadMeta(arg);
            if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
            sideSessions.set(chatId, { kind: 'addlagu', slug: arg, ts: Date.now() });
            return bot.sendMessage(chatId,
                `🎵 *Kirim file lagunya sekarang*\n\n` +
                `Album: *${escapeMd(meta.title)}*\n\n` +
                `Format: MP3/M4A/WAV/OGG. Maks 20 MB (Telegram limit).\n` +
                `Atau paste link Google Drive (gak ada limit).\n\n` +
                `_Ketik */bataladdlagu* untuk batal._`,
                { parse_mode: 'Markdown' });
        }

        // /hapuslagu: album selected → show song list
        if (data.startsWith('dell:')) {
            const arg = data.slice(5);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (arg === '__cancel') return bot.sendMessage(chatId, '❌ Hapus lagu dibatalkan.');
            const meta = loadMeta(arg);
            if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
            const audios = (meta.audios && meta.audios.length) ? meta.audios : (meta.audio ? [meta.audio] : []);
            if (!audios.length) return bot.sendMessage(chatId, `Album *${escapeMd(meta.title)}* belum ada lagu.`, { parse_mode: 'Markdown' });
            return bot.sendMessage(chatId,
                `🗑 *Pilih lagu yang mau dihapus*\n\nAlbum: *${escapeMd(meta.title)}*`,
                { parse_mode: 'Markdown', reply_markup: songsKeyboard(meta) });
        }

        // /hapuslagu: song selected
        if (data.startsWith('dels:')) {
            const rest = data.slice(5);
            const idx = rest.lastIndexOf(':');
            const slug = rest.slice(0, idx);
            const which = rest.slice(idx + 1);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (which === '__cancel') return bot.sendMessage(chatId, '❌ Hapus dibatalkan.');
            return doDeleteSong(chatId, slug, which);
        }
    });

    async function doDeleteSong(chatId, slug, which) {
        const meta = loadMeta(slug);
        if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
        const audios = (meta.audios && meta.audios.length) ? meta.audios.slice() : (meta.audio ? [meta.audio] : []);
        if (!audios.length) return bot.sendMessage(chatId, 'Album ini belum ada lagu.');

        const albumDir = path.join(ALBUMS_DIR, slug);
        const status = await bot.sendMessage(chatId,
            `🗑 *Menghapus lagu*\n\n_Mulai..._`, { parse_mode: 'Markdown' });

        let toRemove = [];
        if (which === '__all') toRemove = audios.slice();
        else {
            const i = parseInt(which, 10);
            if (!Number.isFinite(i) || i < 0 || i >= audios.length) {
                return bot.editMessageText('❌ Pilihan ngga valid.', { chat_id: chatId, message_id: status.message_id });
            }
            toRemove = [audios[i]];
        }

        // Delete from disk + update meta
        const removedFiles = [];
        for (const a of toRemove) {
            try {
                const f = path.join(albumDir, a.file);
                if (fs.existsSync(f)) fs.unlinkSync(f);
                removedFiles.push(a.file);
            } catch (e) { console.error('[delsong]', e.message); }
        }
        const remaining = audios.filter(a => !toRemove.includes(a));
        if (remaining.length) {
            meta.audios = remaining;
            meta.audio = remaining[0];
        } else {
            delete meta.audios;
            delete meta.audio;
        }
        saveMeta(meta);

        // Re-render HTML + QR
        try { fs.writeFileSync(path.join(albumDir, 'index.html'), renderAlbumHtml(meta)); } catch (e) { console.error('[delsong html]', e.message); }
        try { await regenerateQrPng(meta); } catch (e) { console.error('[delsong qr]', e.message); }
        try { await rebuildAlbumZip(meta); } catch (e) { console.error('[delsong zip]', e.message); }

        let pushNote = '';
        if (meta.githubSlug) {
            try {
                await bot.editMessageText(
                    `🗑 *Menghapus lagu*\n\nDi Replit: ✅\nSinkron ke GitHub...`,
                    { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
                ).catch(() => {});
                const ghSlug = meta.githubSlug;
                const removePaths = removedFiles.map(f => `album/${ghSlug}/${f}`);
                const addNames = ['index.html', 'qr.png'];
                if (fs.existsSync(path.join(albumDir, 'album.zip'))) addNames.push('album.zip');
                await pushAlbumUpdateToGithub({
                    meta,
                    addNames,
                    removePaths,
                    commitMessage: `Hapus ${removedFiles.length} lagu: ${meta.title || meta.slug}`,
                });
                pushNote = `\n🌐 *GitHub:* ✅ ${removedFiles.length} file lagu dihapus, page diupdate.`;
            } catch (e) {
                console.error('[delsong push]', e);
                pushNote = `\n⚠️ Gagal sinkron ke GitHub: \`${(e.message || '').slice(0, 200)}\``;
            }
        }

        await bot.editMessageText(
            `✅ *${removedFiles.length} lagu dihapus*\n\n` +
            `🏷 Album: *${escapeMd(meta.title)}*\n` +
            `📁 Sisa lagu: *${remaining.length}*\n` +
            `💻 Replit: ✅` + pushNote,
            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown', disable_web_page_preview: true }
        ).catch(() => {});
    }

    // Ingest the audio sent during an addlagu side-session
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const ss = sideSessions.get(chatId);
        if (!ss) return;
        // If user types a command, let the dedicated handlers take over
        if (msg.text && msg.text.startsWith('/')) return;
        // Don't conflict with the album-creation flow (it has its own session map)
        if (sessions.has(chatId)) return;

        if (ss.kind === 'publish') {
            const text = (msg.text || '').trim();
            if (!text) return;
            const slug = ss.slug;
            sideSessions.delete(chatId);
            let chosen = text;
            if (/^default$/i.test(chosen)) chosen = '';
            return doPublish(chatId, slug, chosen);
        }

        if (ss.kind === 'addlagu') {
            const meta = loadMeta(ss.slug);
            if (!meta) { sideSessions.delete(chatId); return bot.sendMessage(chatId, '❌ Album ngga ketemu.'); }

            // Audio file via Telegram
            const tgAudio = msg.audio || msg.voice ||
                (msg.document && /^audio\//i.test(msg.document.mime_type || '') ? msg.document : null);

            // Drive link via text
            const driveInfo = (() => {
                if (!msg.text) return null;
                const urls = msg.text.match(/https?:\/\/[^\s)]+/g) || [];
                for (const u of urls) {
                    const d = parseDriveUrl(u);
                    if (d && d.kind === 'file') return d;
                }
                return null;
            })();

            if (!tgAudio && !driveInfo) {
                return bot.sendMessage(chatId,
                    '⚠️ Itu bukan file audio. Kirim file MP3/M4A/WAV, atau paste link Google Drive.\n_Ketik */bataladdlagu* untuk batal._',
                    { parse_mode: 'Markdown' });
            }

            sideSessions.delete(chatId);
            const status = await bot.sendMessage(chatId, '⬇ *Mengunduh lagu...*', { parse_mode: 'Markdown' });

            // Determine next audio index (avoid overwriting existing audio_N files)
            const albumDir = path.join(ALBUMS_DIR, meta.slug);
            const existing = fs.readdirSync(albumDir).map(n => {
                const m = n.match(/^audio_(\d+)\./i);
                return m ? parseInt(m[1], 10) : -1;
            });
            const nextIdx = (existing.length ? Math.max(...existing) : -1) + 1;

            try {
                let ext = '.mp3', name, mime, audioFname;
                if (tgAudio) {
                    const sizeMB = (tgAudio.file_size || 0) / 1024 / 1024;
                    if (tgAudio.file_size && sizeMB > 19.5) {
                        await bot.editMessageText(
                            `⚠️ Lagunya kebesaran (${sizeMB.toFixed(2)} MB). Telegram cuma boleh ≤20 MB.\n\nKirim versi lebih pendek atau pake link Google Drive.`,
                            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
                        return;
                    }
                    mime = tgAudio.mime_type || 'audio/mpeg';
                    ext = mime.includes('mp4') || mime.includes('m4a') ? '.m4a'
                        : mime.includes('ogg') ? '.ogg'
                        : mime.includes('wav') ? '.wav'
                        : '.mp3';
                    name = tgAudio.file_name || `lagu${ext}`;
                    audioFname = `audio_${nextIdx}${ext}`;
                    const link = await bot.getFileLink(tgAudio.file_id);
                    await downloadToFile(link, path.join(albumDir, audioFname));
                } else {
                    const m = await getDriveFileMeta(driveInfo.id);
                    name = m.name || 'lagu.mp3';
                    const lower = name.toLowerCase();
                    const isAudio = /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(lower) || /^audio\//i.test(m.mimeType || '');
                    if (!isAudio) {
                        await bot.editMessageText(
                            `⚠️ File Drive itu bukan audio (terdeteksi: \`${m.mimeType || 'tidak dikenal'}\`).`,
                            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
                        return;
                    }
                    ext = lower.endsWith('.m4a') ? '.m4a'
                        : lower.endsWith('.wav') ? '.wav'
                        : lower.endsWith('.ogg') ? '.ogg'
                        : '.mp3';
                    mime = m.mimeType || 'audio/mpeg';
                    audioFname = `audio_${nextIdx}${ext}`;
                    await downloadDriveFile(driveInfo.id, path.join(albumDir, audioFname));
                }

                const dest = path.join(albumDir, audioFname);
                const st = fs.existsSync(dest) ? fs.statSync(dest) : null;
                if (!st || st.size < 1024) {
                    try { if (st) fs.unlinkSync(dest); } catch {}
                    throw new Error('File lagu kosong setelah diunduh.');
                }

                // Normalize to real MP3 if file is actually MP4/DASH/etc with .mp3 extension.
                // Many YouTube/etc downloads come as MP4-in-MP3 which browsers refuse to play.
                try {
                    const norm = await normalizeAudioToMp3(dest);
                    if (norm.changed) {
                        audioFname = `audio_${nextIdx}.mp3`;
                        const finalDest = path.join(albumDir, audioFname);
                        if (norm.tmpPath !== finalDest) {
                            fs.renameSync(norm.tmpPath, finalDest);
                            // Remove old non-mp3 if any leftover
                            if (dest !== finalDest && fs.existsSync(dest)) { try { fs.unlinkSync(dest); } catch {} }
                        }
                        ext = '.mp3'; mime = 'audio/mpeg';
                        console.log(`[addlagu] Normalized "${name}" to real MP3`);
                    }
                } catch (normErr) {
                    console.warn('[addlagu normalize]', normErr.message);
                }

                meta.audios = (meta.audios && meta.audios.length) ? meta.audios.slice() : (meta.audio ? [meta.audio] : []);
                meta.audios.push({ file: audioFname, mime, name });
                meta.audio = meta.audios[0];
                saveMeta(meta);

                // Re-render HTML, QR, zip
                try { fs.writeFileSync(path.join(albumDir, 'index.html'), renderAlbumHtml(meta)); } catch (e) { console.error('[addlagu html]', e.message); }
                try { await regenerateQrPng(meta); } catch (e) { console.error('[addlagu qr]', e.message); }
                try { await rebuildAlbumZip(meta); } catch (e) { console.error('[addlagu zip]', e.message); }

                let pushNote = '';
                if (meta.githubSlug) {
                    try {
                        await bot.editMessageText(
                            `🎵 *${escapeMd(name)}* tersimpan ✅\nSinkron ke GitHub...`,
                            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }
                        ).catch(() => {});
                        const addNames = ['index.html', 'qr.png', audioFname];
                        if (fs.existsSync(path.join(albumDir, 'album.zip'))) addNames.push('album.zip');
                        await pushAlbumUpdateToGithub({
                            meta,
                            addNames,
                            commitMessage: `Tambah lagu "${name}" ke ${meta.title || meta.slug}`,
                        });
                        pushNote = `\n🌐 *GitHub:* ✅ lagu ditambahkan ke ${meta.githubUrl}`;
                    } catch (e) {
                        console.error('[addlagu push]', e);
                        pushNote = `\n⚠️ Gagal sinkron ke GitHub: \`${(e.message || '').slice(0, 200)}\``;
                    }
                } else {
                    pushNote = `\n_Album ini belum di-publish ke GitHub. Pakai /publishalbum kalau mau permanent._`;
                }

                await bot.editMessageText(
                    `✅ *Lagu ditambahkan*\n\n` +
                    `🏷 Album: *${escapeMd(meta.title)}*\n` +
                    `🎵 Lagu: ${escapeMd(name)}\n` +
                    `📁 Total lagu sekarang: *${meta.audios.length}*\n` +
                    `💻 Replit: ✅` + pushNote,
                    { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown', disable_web_page_preview: true }
                ).catch(() => {});
            } catch (e) {
                console.error('[addlagu]', e);
                await bot.editMessageText(`❌ Gagal: \`${(e.message || String(e)).slice(0, 300)}\``,
                    { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }).catch(() => {});
            }
        }

        // ===== /setucapan flow: collect name then message =====
        if (ss.kind === 'setucapan_name') {
            const name = (msg.text || '').trim().slice(0, 60);
            if (!name) return bot.sendMessage(chatId, '⚠️ Namanya kosong. Coba lagi atau ketik /batalucapan.');
            ss.kind = 'setucapan_msg';
            ss.name = name;
            ss.ts = Date.now();
            return bot.sendMessage(chatId,
                `✅ Nama: *${escapeMd(name)}*\n\n` +
                `Sekarang tulis isi ucapannya (maks 1000 karakter).\n\n` +
                `_Ketik /batalucapan untuk batal._`,
                { parse_mode: 'Markdown' });
        }
        if (ss.kind === 'setucapan_msg') {
            const text = (msg.text || '').trim().slice(0, 1000);
            if (!text) return bot.sendMessage(chatId, '⚠️ Ucapannya kosong. Tulis lagi atau ketik /batalucapan.');
            const meta = loadMeta(ss.slug);
            sideSessions.delete(chatId);
            if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
            meta.ownerWish = { name: ss.name, msg: text, badge: ss.badge || '💍 Mempelai' };
            saveMeta(meta);
            try { fs.writeFileSync(path.join(ALBUMS_DIR, meta.slug, 'index.html'), renderAlbumHtml(meta)); } catch (e) { console.error('[setucapan html]', e.message); }
            let pushNote = '';
            if (meta.githubSlug && ghEnv().ok) {
                try {
                    await pushAlbumUpdateToGithub({
                        meta, addNames: ['index.html'],
                        commitMessage: `feat(album/${meta.githubSlug}): set owner wish`,
                    });
                    pushNote = `\n🌐 GitHub: ✅ (refresh halaman 1-2 menit)`;
                } catch (e) {
                    console.error('[setucapan gh]', e.message);
                    pushNote = `\n⚠️ Gagal sync GitHub: \`${e.message.slice(0, 100)}\``;
                }
            }
            return bot.sendMessage(chatId,
                `✅ *Ucapan owner disimpan!*\n\n` +
                `🏷 Album: *${escapeMd(meta.title)}*\n` +
                `👤 Nama: *${escapeMd(ss.name)}*\n` +
                `💬 Pesan: _${escapeMd(text.slice(0, 100))}${text.length > 100 ? '…' : ''}_\n\n` +
                `Ucapan ini bakal selalu nongol di paling atas wishes wall, ngga ketimbun ucapan tamu lain.\n\n` +
                `💻 Replit: ✅` + pushNote,
                { parse_mode: 'Markdown', disable_web_page_preview: true });
        }
    });

    // ===== /setucapan — owner pinned wish =====
    bot.onText(/^\/setucapan(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const albums = loadIndex();
        if (!albums.length) return bot.sendMessage(chatId, 'Belum ada album. Bikin dulu pakai /buatalbum.');
        return bot.sendMessage(chatId,
            `📌 *PASANG UCAPAN OWNER*\n\nUcapan kamu bakal selalu nongol di paling atas wishes wall album.\n\nPilih album:`,
            { parse_mode: 'Markdown', reply_markup: albumKeyboard(albums, 'setu') });
    });

    bot.onText(/^\/batalucapan(?:@\w+)?$/i, (msg) => {
        const chatId = msg.chat.id;
        const s = sideSessions.get(chatId);
        if (s && (s.kind === 'setucapan_name' || s.kind === 'setucapan_msg')) {
            sideSessions.delete(chatId);
            return bot.sendMessage(chatId, '❌ Set ucapan dibatalkan.');
        }
        return bot.sendMessage(chatId, 'Ngga ada proses set ucapan yang aktif.');
    });

    bot.onText(/^\/hapusucapan(?:@\w+)?(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const albums = loadIndex().filter(a => {
            const m = loadMeta(a.slug);
            return m && m.ownerWish && m.ownerWish.msg;
        });
        if (!albums.length) return bot.sendMessage(chatId, 'Ngga ada album yang punya ucapan owner. Pakai /setucapan dulu.');
        return bot.sendMessage(chatId,
            `🗑 *HAPUS UCAPAN OWNER*\n\nPilih album yang ucapan owner-nya mau dihapus:`,
            { parse_mode: 'Markdown', reply_markup: albumKeyboard(albums, 'delu') });
    });

    bot.on('callback_query', async (q) => {
        const data = q.data || '';
        const chatId = q.message && q.message.chat && q.message.chat.id;
        if (!chatId) return;

        // /setucapan: album selected
        if (data.startsWith('setu:')) {
            const arg = data.slice(5);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (arg === '__cancel') {
                sideSessions.delete(chatId);
                return bot.sendMessage(chatId, '❌ Set ucapan dibatalkan.');
            }
            const meta = loadMeta(arg);
            if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
            sideSessions.set(chatId, { kind: 'setucapan_name', slug: arg, ts: Date.now() });
            const current = meta.ownerWish && meta.ownerWish.msg
                ? `\n\n_Ucapan saat ini:_\n👤 ${escapeMd(meta.ownerWish.name || '-')}\n💬 _${escapeMd((meta.ownerWish.msg || '').slice(0, 80))}${(meta.ownerWish.msg || '').length > 80 ? '…' : ''}_\n\n_(Ngirim baru bakal nimpa yang lama)_`
                : '';
            return bot.sendMessage(chatId,
                `📌 *SET UCAPAN OWNER*\n\nAlbum: *${escapeMd(meta.title)}*${current}\n\n` +
                `Ketik nama yang mau dipajang.\nContoh: \`Makruf — suamimu 🤍\`\n\n` +
                `_Ketik /batalucapan untuk batal._`,
                { parse_mode: 'Markdown' });
        }

        // /hapusucapan: album selected
        if (data.startsWith('delu:')) {
            const arg = data.slice(5);
            try { await bot.answerCallbackQuery(q.id); } catch {}
            try { await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: q.message.message_id }); } catch {}
            if (arg === '__cancel') return bot.sendMessage(chatId, '❌ Hapus ucapan dibatalkan.');
            const meta = loadMeta(arg);
            if (!meta) return bot.sendMessage(chatId, '❌ Album ngga ketemu.');
            delete meta.ownerWish;
            saveMeta(meta);
            try { fs.writeFileSync(path.join(ALBUMS_DIR, meta.slug, 'index.html'), renderAlbumHtml(meta)); } catch (e) { console.error('[hapusucapan html]', e.message); }
            let pushNote = '';
            if (meta.githubSlug && ghEnv().ok) {
                try {
                    await pushAlbumUpdateToGithub({
                        meta, addNames: ['index.html'],
                        commitMessage: `feat(album/${meta.githubSlug}): remove owner wish`,
                    });
                    pushNote = `\n🌐 GitHub: ✅`;
                } catch (e) {
                    console.error('[hapusucapan gh]', e.message);
                    pushNote = `\n⚠️ Gagal sync GitHub: \`${e.message.slice(0, 100)}\``;
                }
            }
            return bot.sendMessage(chatId,
                `🗑 *Ucapan owner dihapus*\n\n🏷 Album: *${escapeMd(meta.title)}*\n💻 Replit: ✅` + pushNote,
                { parse_mode: 'Markdown' });
        }
    });

    // /unpublishalbum <slug> - delete album from GitHub
    bot.onText(/^\/unpublishalbum(?:@\w+)?(?:\s+(.+))?$/i, async (msg, match) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;
        if (!owner || !repo || !token) {
            return bot.sendMessage(chatId, '⚠️ GitHub belum di-setup.');
        }

        const arg = (match && match[1] || '').trim();
        const { unpublishAlbumFromGithub, listPublishedAlbums } = require('./githubPublish');

        if (!arg) {
            try {
                const slugs = await listPublishedAlbums({ owner, repo, token });
                if (!slugs.length) return bot.sendMessage(chatId, 'Belum ada album yang di-publish ke GitHub.');
                const list = slugs.map((s, i) => `${i + 1}. \`${s}\``).join('\n');
                return bot.sendMessage(chatId,
                    `*HAPUS ALBUM DARI GITHUB*\n\nKetik: \`/unpublishalbum <slug>\`\n\nAlbum di GitHub:\n${list}`,
                    { parse_mode: 'Markdown' });
            } catch (e) {
                return bot.sendMessage(chatId, `❌ Gagal cek GitHub: ${e.message}`);
            }
        }

        const status = await bot.sendMessage(chatId,
            `🗑 *Menghapus dari GitHub*\n\n📁 Repo: \`${owner}/${repo}\`\n🏷 Slug: \`${arg}\`\n\n_Mulai..._`,
            { parse_mode: 'Markdown' });

        let lastEdit = 0;
        const lines = [`🗑 *Menghapus dari GitHub*\n\n📁 Repo: \`${owner}/${repo}\`\n🏷 Slug: \`${arg}\`\n`];
        const onProgress = (m) => {
            lines.push(m);
            const now = Date.now();
            if (now - lastEdit < 1500) return;
            lastEdit = now;
            bot.editMessageText(lines.join('\n').slice(-3500),
                { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' }).catch(() => {});
        };

        try {
            const result = await unpublishAlbumFromGithub({
                slug: arg, owner, repo, token, onProgress
            });
            await bot.editMessageText(
                `✅ *DIHAPUS DARI GITHUB*\n\n🏷 Slug: \`${arg}\`\n📁 ${result.files} file dihapus\n📝 Commit: \`${result.commit}\`\n\n_Album sudah hilang dari link GitHub Pages._\n_Album di Replit tetap ada — kalau mau dihapus juga, beda command._`,
                { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown', disable_web_page_preview: true }
            ).catch(() => {});
        } catch (e) {
            console.error('[unpublishalbum]', e);
            bot.sendMessage(chatId, `❌ Gagal hapus:\n\`${(e.message || String(e)).slice(0, 500)}\``, { parse_mode: 'Markdown' });
        }
    });

    // /listpublished - list albums on GitHub
    bot.onText(/^\/listpublished(?:@\w+)?$/i, async (msg) => {
        const chatId = msg.chat.id;
        if (!await access(msg)) return;
        const owner = process.env.GITHUB_OWNER;
        const repo = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;
        if (!owner || !repo || !token) return bot.sendMessage(chatId, '⚠️ GitHub belum di-setup.');
        try {
            const { listPublishedAlbums } = require('./githubPublish');
            const slugs = await listPublishedAlbums({ owner, repo, token });
            if (!slugs.length) return bot.sendMessage(chatId, 'Belum ada album di GitHub. Pakai /publishalbum dulu.');
            const list = slugs.map((s, i) =>
                `${i + 1}. \`${s}\`\n   🔗 https://${owner.toLowerCase()}.github.io/${repo}/album/${s}/`
            ).join('\n\n');
            bot.sendMessage(chatId,
                `🌐 *ALBUM DI GITHUB PAGES*\n\nRepo: \`${owner}/${repo}\`\n\n${list}`,
                { parse_mode: 'Markdown', disable_web_page_preview: true });
        } catch (e) {
            bot.sendMessage(chatId, `❌ Error: ${e.message}`);
        }
    });

    // Capture text title + photos/videos during a session
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const s = sessions.get(chatId);
        if (!s) return;
        // Skip commands - they have their own handlers
        if (msg.text && msg.text.startsWith('/')) return;

        if (s.step === 'await_couple') {
            if (!msg.text) return;
            let raw = msg.text.trim().slice(0, 80);
            if (raw.length < 3) {
                return bot.sendMessage(chatId, 'Nama pasangan kependekan. Contoh: `Adit & Siti` 🙏', { parse_mode: 'Markdown' });
            }
            // Normalize separators (-, –, &, "dan", "and") to " & "
            const couple = raw
                .replace(/\s*[-–—]\s*/g, ' & ')
                .replace(/\s+(dan|and)\s+/gi, ' & ')
                .replace(/\s*&\s*/g, ' & ')
                .replace(/\s+/g, ' ')
                .trim();
            if (!/&/.test(couple)) {
                return bot.sendMessage(chatId,
                    '⚠️ Format kurang tepat. Pisahkan dua nama pakai `&` atau `-`.\nContoh: `Adit & Siti`',
                    { parse_mode: 'Markdown' });
            }
            s.couple = couple;
            s.title = couple;
            s.step = 'await_date';
            s.slug = uniqueSlug(slugify('nikah-' + couple));
            return bot.sendMessage(chatId,
                `✓ Pasangan: *${couple}* 💍\n\n` +
                '*Langkah 2/5:* Kirim *tanggal pernikahan* (hari/bulan/tahun)\n' +
                'Contoh: `13/04/2026`  atau  `13 April 2026`\n\n' +
                '_Tanggal ini dipakai buat counter "Sudah X hari setelah pernikahan" yang update otomatis tiap hari._\n\n' +
                '_Ketik /batalalbum untuk batal._',
                { parse_mode: 'Markdown' });
        }

        if (s.step === 'await_date') {
            if (!msg.text) return;
            const ts = parseEventDate(msg.text);
            if (!ts) {
                return bot.sendMessage(chatId,
                    '⚠️ Format tanggal belum dikenali.\nContoh yang benar: `12/05/2026`, `12-5-2026`, atau `12 Mei 2026`',
                    { parse_mode: 'Markdown' });
            }
            s.eventDate = ts;
            s.step = 'collecting';
            await bot.sendMessage(chatId,
                `✓ Tanggal: *${formatEventDate(ts)}*\n\n` +
                '*Langkah 3/5:* Kirim semua foto & video kamu sekarang 📸🎥\n' +
                'Tiga cara, semua disimpan tanpa kompresi (kualitas 100% asli):\n\n' +
                '*1.* Kirim foto/video biasa di Telegram.\n' +
                '*2.* Untuk *kualitas mentah 100%*, kirim sebagai *File / Document*.\n' +
                '*3.* *Tempel link Google Drive* (folder/file, set "Anyone with the link"). Bot baca otomatis.\n\n' +
                '_Setelah selesai foto, tekan tombol "Lanjut ke Musik 🎵" di pesan kontrol._',
                { parse_mode: 'Markdown' });
            await sendOrUpdateControlPanel(bot, chatId, s);
            return;
        }

        if (s.step === 'await_audio') {
            // 1) Accept Telegram audio/voice/document audio file
            const audio = msg.audio || msg.voice ||
                (msg.document && /^audio\//i.test(msg.document.mime_type || '') ? msg.document : null);
            if (audio) {
                const sizeMB = (audio.file_size || 0) / 1024 / 1024;
                // Telegram Bot API hard-limits getFile to 20 MB. Reject upfront so
                // we don't silently fail when downloading later.
                const TG_AUDIO_LIMIT_MB = 19.5;
                if (audio.file_size && sizeMB > TG_AUDIO_LIMIT_MB) {
                    return bot.sendMessage(chatId,
                        `⚠️ *Lagunya kebesaran: ${sizeMB.toFixed(2)} MB*\n\n` +
                        `Telegram cuma ngebolehin bot download file maksimal *20 MB*. Lagu ini di atas limit, jadi ga bisa diunduh ke server.\n\n` +
                        `*Solusi:*\n` +
                        `1. Kirim versi *lebih pendek* (potong jadi 3-5 menit, biasanya <8 MB).\n` +
                        `2. Atau upload lagunya ke *Google Drive* (set "Anyone with the link"), lalu *paste link Drive*-nya di sini — bot bakal download langsung dari Drive (gak ada limit 20 MB).\n` +
                        `3. Atau pencet *⏭ Lewati Musik* kalau gak mau pake lagu.`,
                        {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [
                                    [{ text: '⏭ Lewati Musik (tanpa lagu)', callback_data: 'alb:skip_audio' }],
                                    [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
                                ],
                            },
                        });
                }
                const mime = audio.mime_type || 'audio/mpeg';
                const ext = mime.includes('mp4') || mime.includes('m4a') ? '.m4a'
                    : mime.includes('ogg') ? '.ogg'
                    : mime.includes('wav') ? '.wav'
                    : '.mp3';
                s.audios = s.audios || [];
                s.audios.push({
                    source: 'telegram',
                    fileId: audio.file_id,
                    mime, ext,
                    name: audio.file_name || `lagu${ext}`,
                    sizeMB: sizeMB || null,
                });
                const total = s.audios.length;
                const list = s.audios.map((a, i) => `${i + 1}. ${escapeMd(a.name)}${a.sizeMB ? ` _(${a.sizeMB.toFixed(1)} MB)_` : ''}`).join('\n');
                await bot.sendMessage(chatId,
                    `🎵 *Lagu ${total} ditambahkan!* (${sizeMB.toFixed(2)} MB)\n\n` +
                    `🎶 *Daftar Putar (${total} lagu):*\n${list}\n\n` +
                    `Lagu-lagu ini bakal *diputar berurutan & loop* (lagu 1 → 2 → ... → terakhir → balik ke 1) tiap orang buka albumnya.\n\n` +
                    `_Bisa kirim lagu lagi, atau pencet tombol di bawah:_`,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [
                                [{ text: '✅ Konfirmasi & Buat Album', callback_data: 'alb:confirm' }],
                                [{ text: '➕ Tambah Lagu Lagi', callback_data: 'alb:add_more_audio' }],
                                [{ text: '🔁 Reset Daftar Lagu', callback_data: 'alb:change_audio' }],
                                [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
                            ],
                        },
                    });
                await sendOrUpdateControlPanel(bot, chatId, s);
                return;
            }

            // 2) Accept Google Drive link as audio source (no 20 MB limit)
            if (msg.text) {
                const urls = msg.text.match(/https?:\/\/[^\s)]+/g) || [];
                const drive = urls.map(parseDriveUrl).find(d => d && d.kind === 'file');
                if (drive) {
                    const wait = await bot.sendMessage(chatId, '🔍 Membaca file lagu dari Google Drive...');
                    try {
                        const m = await getDriveFileMeta(drive.id);
                        const name = m.name || 'lagu.mp3';
                        const lower = name.toLowerCase();
                        const isAudio = /\.(mp3|m4a|wav|ogg|aac|flac)$/i.test(lower) ||
                            /^audio\//i.test(m.mimeType || '');
                        if (!isAudio) {
                            await bot.editMessageText(
                                `⚠️ File Drive itu bukan audio (terdeteksi: \`${m.mimeType || 'tidak dikenal'}\`).\n\nKirim file MP3/M4A/WAV.`,
                                { chat_id: chatId, message_id: wait.message_id, parse_mode: 'Markdown' });
                            return;
                        }
                        const ext = lower.endsWith('.m4a') ? '.m4a'
                            : lower.endsWith('.wav') ? '.wav'
                            : lower.endsWith('.ogg') ? '.ogg'
                            : '.mp3';
                        const sizeMB = m.size ? (Number(m.size) / 1024 / 1024) : null;
                        s.audios = s.audios || [];
                        s.audios.push({
                            source: 'drive',
                            driveId: drive.id,
                            mime: m.mimeType || 'audio/mpeg',
                            ext,
                            name,
                            sizeMB,
                        });
                        const total = s.audios.length;
                        const list = s.audios.map((a, i) => `${i + 1}. ${escapeMd(a.name)}${a.sizeMB ? ` _(${a.sizeMB.toFixed(1)} MB)_` : ''}`).join('\n');
                        await bot.editMessageText(
                            `🎵 *Lagu ${total} ditambahkan dari Google Drive!*${sizeMB ? ` (${sizeMB.toFixed(2)} MB)` : ''}\n\n` +
                            `🎶 *Daftar Putar (${total} lagu):*\n${list}\n\n` +
                            `Lagu-lagu ini bakal *diputar berurutan & loop* tiap orang buka albumnya.\n\n` +
                            `_Bisa kirim lagu lagi, atau pencet tombol di bawah:_`,
                            {
                                chat_id: chatId, message_id: wait.message_id, parse_mode: 'Markdown',
                                reply_markup: {
                                    inline_keyboard: [
                                        [{ text: '✅ Konfirmasi & Buat Album', callback_data: 'alb:confirm' }],
                                        [{ text: '➕ Tambah Lagu Lagi', callback_data: 'alb:add_more_audio' }],
                                        [{ text: '🔁 Reset Daftar Lagu', callback_data: 'alb:change_audio' }],
                                        [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
                                    ],
                                },
                            });
                        await sendOrUpdateControlPanel(bot, chatId, s);
                    } catch (e) {
                        console.error('[ALBUM Drive audio]', e.message);
                        try {
                            await bot.editMessageText(
                                `❌ Gagal baca file Drive: \`${(e.message || '').slice(0, 200)}\`\n\nPastikan link-nya di-set "Anyone with the link".`,
                                { chat_id: chatId, message_id: wait.message_id, parse_mode: 'Markdown' });
                        } catch {}
                    }
                    return;
                }
            }
            // If they send something else, ignore quietly
            return;
        }

        if (s.step === 'collecting') {
            let added = 0;
            if (msg.photo && msg.photo.length) {
                const best = msg.photo[msg.photo.length - 1];
                s.items.push({ source: 'telegram', type: 'photo', fileId: best.file_id, mime: 'image/jpeg' });
                added++;
            } else if (msg.video) {
                s.items.push({ source: 'telegram', type: 'video', fileId: msg.video.file_id, mime: msg.video.mime_type || 'video/mp4' });
                added++;
            } else if (msg.document && /^image\//.test(msg.document.mime_type || '')) {
                s.items.push({ source: 'telegram', type: 'photo', fileId: msg.document.file_id, mime: msg.document.mime_type, name: msg.document.file_name });
                added++;
            } else if (msg.document && /^video\//.test(msg.document.mime_type || '')) {
                s.items.push({ source: 'telegram', type: 'video', fileId: msg.document.file_id, mime: msg.document.mime_type, name: msg.document.file_name });
                added++;
            } else if (msg.animation) {
                s.items.push({ source: 'telegram', type: 'video', fileId: msg.animation.file_id, mime: msg.animation.mime_type || 'video/mp4' });
                added++;
            } else if (msg.text) {
                // Detect Google Drive links inside the text
                const urls = msg.text.match(/https?:\/\/[^\s)]+/g) || [];
                const driveUrls = urls.map(parseDriveUrl).filter(Boolean);
                if (driveUrls.length) {
                    const wait = await bot.sendMessage(chatId,
                        `🔍 Mendeteksi ${driveUrls.length} link Google Drive... membaca isinya...`);
                    let imported = 0, failed = 0;
                    for (const d of driveUrls) {
                        try {
                            if (d.kind === 'folder') {
                                const list = await listDriveFolder(d.id);
                                if (!list.length) { failed++; continue; }
                                for (const it of list) s.items.push(it);
                                imported += list.length;
                            } else {
                                const meta = await getDriveFileMeta(d.id);
                                const t = extToType(meta.name) || { type: 'photo', ext: '.jpg' };
                                s.items.push({ source: 'drive', driveId: d.id, name: meta.name, type: t.type, ext: t.ext });
                                imported++;
                            }
                        } catch (e) {
                            console.error('[ALBUM Drive]', e.message);
                            failed++;
                        }
                    }
                    added = imported;
                    try {
                        await bot.editMessageText(
                            `${imported ? '✅' : '❌'} Drive: ${imported} file ditambahkan${failed ? `, ${failed} link gagal (pastikan diset "Anyone with the link")` : ''}.\n` +
                            `📦 Total tertampung: *${s.items.length}* item.`,
                            { chat_id: chatId, message_id: wait.message_id, parse_mode: 'Markdown' });
                    } catch {}
                    if (added) await sendOrUpdateControlPanel(bot, chatId, s);
                    return;
                }
            }

            if (added) {
                await sendOrUpdateControlPanel(bot, chatId, s);
            }
        }
    });

    // Inline button handlers (confirm / cancel)
    bot.on('callback_query', async (q) => {
        const data = q.data || '';
        if (!data.startsWith('alb:')) return;
        const chatId = q.message && q.message.chat && q.message.chat.id;
        if (!chatId) return;
        const s = sessions.get(chatId);
        if (!s) {
            try { await bot.answerCallbackQuery(q.id, { text: 'Sesi sudah berakhir.' }); } catch {}
            return;
        }

        if (data === 'alb:next_audio') {
            if (s.step !== 'collecting') {
                try { await bot.answerCallbackQuery(q.id, { text: 'Belum bisa lanjut.' }); } catch {}
                return;
            }
            if (!s.items.length) {
                try { await bot.answerCallbackQuery(q.id, { text: 'Belum ada foto/video!', show_alert: true }); } catch {}
                return;
            }
            try { await bot.answerCallbackQuery(q.id, { text: '🎵 Lanjut pilih musik' }); } catch {}
            s.step = 'await_audio';
            await bot.sendMessage(chatId,
                '🎵 *Langkah 4/5:* Kirim *lagu* (MP3/M4A/WAV) buat backsound albumnya\n\n' +
                'Cara: tekan ikon klip 📎 → File / Audio → pilih lagu kamu.\n\n' +
                'Lagu bakal *autoplay* & *loop* tanpa henti tiap orang buka albumnya 💕\n\n' +
                '_Atau tekan tombol di bawah kalau gak mau pake musik:_',
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⏭ Lewati Musik (tanpa lagu)', callback_data: 'alb:skip_audio' }],
                            [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
                        ],
                    },
                });
            await sendOrUpdateControlPanel(bot, chatId, s);
            return;
        }

        if (data === 'alb:skip_audio') {
            if (s.step !== 'await_audio') {
                try { await bot.answerCallbackQuery(q.id, { text: 'Sudah lewat tahap musik.' }); } catch {}
                return;
            }
            try { await bot.answerCallbackQuery(q.id, { text: 'Tanpa musik' }); } catch {}
            s.audios = [];
            s.step = 'ready_confirm';
            await sendOrUpdateControlPanel(bot, chatId, s);
            return;
        }

        if (data === 'alb:change_audio') {
            try { await bot.answerCallbackQuery(q.id, { text: 'Daftar lagu di-reset' }); } catch {}
            s.audios = [];
            s.step = 'await_audio';
            await bot.sendMessage(chatId,
                '🔁 OK, daftar lagu di-reset. Kirim file lagu lagi (bisa lebih dari 1, dikirim satu-satu).',
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '⏭ Lewati Musik (tanpa lagu)', callback_data: 'alb:skip_audio' }],
                            [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
                        ],
                    },
                });
            await sendOrUpdateControlPanel(bot, chatId, s);
            return;
        }

        if (data === 'alb:add_more_audio') {
            try { await bot.answerCallbackQuery(q.id, { text: 'Kirim file lagu berikutnya' }); } catch {}
            await bot.sendMessage(chatId,
                `➕ Oke, kirim *file lagu berikutnya* sekarang (MP3/M4A/WAV) atau *paste link Google Drive*. Bisa kirim sebanyak-banyaknya.`,
                { parse_mode: 'Markdown' });
            return;
        }

        if (data === 'alb:confirm') {
            if (s.step !== 'collecting' && s.step !== 'await_audio' && s.step !== 'ready_confirm') {
                try { await bot.answerCallbackQuery(q.id, { text: 'Belum bisa konfirmasi.' }); } catch {}
                return;
            }
            if (!s.items.length) {
                try { await bot.answerCallbackQuery(q.id, { text: 'Belum ada foto/video!', show_alert: true }); } catch {}
                return;
            }
            try { await bot.answerCallbackQuery(q.id, { text: '✨ Membangun album...' }); } catch {}
            // Disable buttons on the control panel
            if (s.controlMsgId) {
                try {
                    await bot.editMessageReplyMarkup({ inline_keyboard: [] },
                        { chat_id: chatId, message_id: s.controlMsgId });
                } catch {}
            }
            await finalizeAlbum(bot, chatId, s);
            return;
        }

        if (data === 'alb:cancel') {
            try { await bot.answerCallbackQuery(q.id, { text: 'Sesi dibatalkan.' }); } catch {}
            sessions.delete(chatId);
            if (s.controlMsgId) {
                try {
                    await bot.editMessageText('❌ Sesi album dibatalkan.',
                        { chat_id: chatId, message_id: s.controlMsgId });
                } catch {}
            } else {
                bot.sendMessage(chatId, '❌ Sesi album dibatalkan.');
            }
        }
    });
}

// Renders the control-panel message text shown during the "collecting" step.
function renderControlPanel(s) {
    const photos = s.items.filter(i => i.type === 'photo').length;
    const videos = s.items.filter(i => i.type === 'video').length;
    const total = s.items.length;
    const bar = (() => {
        const bars = ['▱','▱','▱','▱','▱','▱','▱','▱','▱','▱'];
        const filled = Math.min(10, Math.floor(total / 5));
        for (let i = 0; i < filled; i++) bars[i] = '▰';
        return bars.join('');
    })();
    const audios = s.audios || (s.audio ? [s.audio] : []);
    const audioLine = (s.step === 'await_audio' || s.step === 'ready_confirm')
        ? (audios.length
            ? `🎵 Musik: *${audios.length} lagu* (playlist + loop)`
            : (s.step === 'ready_confirm' ? `🎵 Musik: _(dilewati)_` : `🎵 Musik: _menunggu kamu kirim lagu..._`))
        : '';
    let footer;
    if (s.step === 'collecting') {
        footer = total
            ? '_Sudah cukup foto? Pencet *Lanjut ke Musik* di bawah._'
            : '_Kirim foto/video atau link Drive dulu._';
    } else if (s.step === 'await_audio') {
        footer = audios.length
            ? '_Lagu siap! Bisa tambah lagi, atau pencet *Konfirmasi*._'
            : '_Kirim file lagu (boleh banyak), atau pencet *Lewati* kalau tanpa musik._';
    } else {
        footer = '_Semua siap. Pencet *Konfirmasi* untuk membangun album._';
    }
    return (
        '🎛 *PANEL ALBUM* 🎛\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        `✿ Judul: *${escapeMd(s.title)}*\n` +
        `📅 Tanggal: *${formatEventDate(s.eventDate)}*\n` +
        '━━━━━━━━━━━━━━━━━━\n' +
        `📦 Total: *${total}* item   ${bar}\n` +
        `📸 Foto: ${photos}    🎥 Video: ${videos}\n` +
        (audioLine ? audioLine + '\n' : '') +
        '━━━━━━━━━━━━━━━━━━\n' +
        footer
    );
}

function escapeMd(s) {
    return String(s || '').replace(/([_*`\[\]])/g, '\\$1');
}

function controlPanelKeyboard(s) {
    if (s && s.step === 'collecting') {
        return {
            inline_keyboard: [
                [{ text: '🎵 Lanjut ke Musik', callback_data: 'alb:next_audio' }],
                [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
            ],
        };
    }
    if (s && s.step === 'await_audio') {
        const rows = [];
        const audios = s.audios || (s.audio ? [s.audio] : []);
        if (audios.length) {
            rows.push([{ text: `✅ Konfirmasi & Buat Album (${audios.length} lagu)`, callback_data: 'alb:confirm' }]);
            rows.push([{ text: '➕ Tambah Lagu Lagi', callback_data: 'alb:add_more_audio' }]);
            rows.push([{ text: '🔁 Reset Daftar Lagu', callback_data: 'alb:change_audio' }]);
        }
        rows.push([{ text: '⏭ Lewati Musik', callback_data: 'alb:skip_audio' }]);
        rows.push([{ text: '❌ Batalkan', callback_data: 'alb:cancel' }]);
        return { inline_keyboard: rows };
    }
    return {
        inline_keyboard: [
            [{ text: '✅ Yes, Konfirmasi & Buat Album', callback_data: 'alb:confirm' }],
            [{ text: '❌ Batalkan', callback_data: 'alb:cancel' }],
        ],
    };
}

async function sendOrUpdateControlPanel(bot, chatId, s) {
    const text = renderControlPanel(s);
    const opts = { parse_mode: 'Markdown', reply_markup: controlPanelKeyboard(s) };
    // Throttle edits so we don't spam Telegram
    const now = Date.now();
    if (s.controlMsgId) {
        if (s.controlLastEdit && now - s.controlLastEdit < 700) {
            // schedule a trailing update
            if (s.controlPending) return;
            s.controlPending = true;
            setTimeout(async () => {
                s.controlPending = false;
                try {
                    await bot.editMessageText(renderControlPanel(s), {
                        chat_id: chatId, message_id: s.controlMsgId,
                        parse_mode: 'Markdown', reply_markup: controlPanelKeyboard(s)
                    });
                    s.controlLastEdit = Date.now();
                } catch {}
            }, 750);
            return;
        }
        try {
            await bot.editMessageText(text, {
                chat_id: chatId, message_id: s.controlMsgId,
                parse_mode: 'Markdown', reply_markup: controlPanelKeyboard(s)
            });
            s.controlLastEdit = now;
        } catch {
            // If edit fails (e.g. message too old), send a fresh one
            try {
                const m = await bot.sendMessage(chatId, text, opts);
                s.controlMsgId = m.message_id;
                s.controlLastEdit = Date.now();
            } catch {}
        }
    } else {
        try {
            const m = await bot.sendMessage(chatId, text, opts);
            s.controlMsgId = m.message_id;
            s.controlLastEdit = Date.now();
        } catch {}
    }
}

async function finalizeAlbum(bot, chatId, s) {
    if (!s || (s.step !== 'collecting' && s.step !== 'await_audio' && s.step !== 'ready_confirm')) {
        return bot.sendMessage(chatId, 'Belum ada sesi yang bisa diselesaikan.');
    }
    if (!s.items.length) {
        return bot.sendMessage(chatId, 'Belum ada foto/video yang dikirim. Kirim dulu ya, atau /batalalbum.');
    }
    s.step = 'building';

    const total = s.items.length;
    const SPINNERS = ['◐','◓','◑','◒'];
    const renderProgress = (done, phase) => {
        const pct = Math.round((done / total) * 100);
        const blocks = 16;
        const filled = Math.round((done / total) * blocks);
        const bar = '█'.repeat(filled) + '░'.repeat(blocks - filled);
        const sp = SPINNERS[Math.floor(Date.now() / 250) % SPINNERS.length];
        return (
            `${sp} *MEMBANGUN ALBUM ABADI* ${sp}\n` +
            '━━━━━━━━━━━━━━━━━━\n' +
            `✿ *${s.title}*\n` +
            `📅 ${formatEventDate(s.eventDate)}\n` +
            '━━━━━━━━━━━━━━━━━━\n' +
            `${phase}\n\n` +
            `\`${bar}\`  *${pct}%*\n` +
            `📦 ${done}/${total} item`
        );
    };

    const status = await bot.sendMessage(chatId,
        renderProgress(0, '⏳ _Mempersiapkan..._'),
        { parse_mode: 'Markdown' });

    s.step = 'processing';

    const albumDir = path.join(ALBUMS_DIR, s.slug);
    const filesDir = path.join(albumDir, 'files');
    fs.mkdirSync(filesDir, { recursive: true });

    const meta = {
        slug: s.slug,
        title: s.title,
        createdAt: s.createdAt,
        eventDate: s.eventDate || s.createdAt,
        ownerChatId: chatId,
        items: []
    };

    // Background spinner: keeps the message lively even while a single file downloads
    let stopSpinner = false;
    let currentDone = 0;
    let currentPhase = '⬇ _Mengunduh media..._';
    const tick = async () => {
        while (!stopSpinner) {
            await new Promise(r => setTimeout(r, 1700));
            if (stopSpinner) break;
            try {
                await bot.editMessageText(renderProgress(currentDone, currentPhase),
                    { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
            } catch {}
        }
    };
    const spinPromise = tick();

    let failed = 0;
    for (let i = 0; i < s.items.length; i++) {
        const it = s.items[i];
        currentPhase = `⬇ _Mengunduh ${i + 1}/${total} (${it.type === 'video' ? '🎥 video' : '📸 foto'})..._`;
        try {
            let ext, fname, dest;
            if (it.source === 'drive') {
                ext = it.ext || (extToType(it.name || '') || { ext: '.bin' }).ext;
                fname = `${String(i + 1).padStart(4, '0')}${ext}`;
                dest = path.join(filesDir, fname);
                await downloadDriveFile(it.driveId, dest);
            } else {
                const link = await bot.getFileLink(it.fileId);
                ext = guessExt(link, it.mime, it.type);
                fname = `${String(i + 1).padStart(4, '0')}${ext}`;
                dest = path.join(filesDir, fname);
                await downloadToFile(link, dest);
            }
            meta.items.push({ file: fname, type: it.type });
        } catch (err) {
            failed++;
            console.error(`[ALBUM] Download error (${it.source}):`, err.message);
        }
        currentDone = i + 1;
    }

    // Download audio playlist if provided (Telegram or Google Drive)
    const audioList = s.audios && s.audios.length
        ? s.audios
        : (s.audio ? [s.audio] : []);
    if (audioList.length) {
        meta.audios = [];
        for (let ai = 0; ai < audioList.length; ai++) {
            const a = audioList[ai];
            currentPhase = `🎵 _Mengunduh lagu ${ai + 1}/${audioList.length}..._`;
            try {
                await bot.editMessageText(renderProgress(currentDone, currentPhase),
                    { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
            } catch {}
            const audioFname = `audio_${ai}${a.ext || '.mp3'}`;
            const audioDest = path.join(albumDir, audioFname);
            try {
                if (a.source === 'drive' && a.driveId) {
                    await downloadDriveFile(a.driveId, audioDest);
                } else {
                    const link = await bot.getFileLink(a.fileId);
                    await downloadToFile(link, audioDest);
                }
                const st = fs.existsSync(audioDest) ? fs.statSync(audioDest) : null;
                if (st && st.size > 1024) {
                    // Normalize to real MP3 if container is actually MP4/M4A/etc
                    // disguised as .mp3 — browsers (especially on GitHub Pages)
                    // refuse to play those, breaking the playlist.
                    try {
                        const norm = await normalizeAudioToMp3(audioDest);
                        if (norm.changed) {
                            const fixedFname = `audio_${ai}.mp3`;
                            const fixedDest = path.join(albumDir, fixedFname);
                            if (norm.tmpPath !== fixedDest) {
                                fs.renameSync(norm.tmpPath, fixedDest);
                                if (audioDest !== fixedDest && fs.existsSync(audioDest)) {
                                    try { fs.unlinkSync(audioDest); } catch {}
                                }
                            }
                            audioFname = fixedFname;
                            a.mime = 'audio/mpeg';
                            console.log(`[buatalbum] Normalized "${a.name}" to real MP3`);
                        }
                    } catch (normErr) {
                        console.warn('[buatalbum normalize]', normErr.message);
                    }
                    meta.audios.push({ file: audioFname, mime: a.mime, name: a.name });
                } else {
                    throw new Error('File lagu kosong setelah diunduh.');
                }
            } catch (err) {
                console.error('[ALBUM] Audio download error:', a.name, err.message);
                try {
                    await bot.sendMessage(chatId,
                        `⚠️ *Gagal nyimpen lagu ${ai + 1} (${escapeMd(a.name)}).*\n\n` +
                        `Penyebab: \`${(err.message || String(err)).slice(0, 200)}\`\n\n` +
                        (a.source === 'drive'
                            ? `Pastiin link Drive-nya di-set "Anyone with the link".`
                            : (a.sizeMB && a.sizeMB > 19.5
                                ? `Ukurannya ${a.sizeMB.toFixed(1)} MB — di atas limit Telegram (20 MB). Upload ke Google Drive lalu kirim link-nya.`
                                : `Coba kirim ulang, atau upload ke Google Drive.`)) +
                        `\n\n_Lagu lain tetap dipakai._`,
                        { parse_mode: 'Markdown' });
                } catch {}
                try { if (fs.existsSync(audioDest)) fs.unlinkSync(audioDest); } catch {}
            }
        }
        // Backward-compat: keep meta.audio pointing to first track
        if (meta.audios.length) {
            meta.audio = meta.audios[0];
        } else {
            delete meta.audios;
        }
    }

    currentPhase = '🎨 _Merancang halaman album..._';
    try {
        await bot.editMessageText(renderProgress(currentDone, currentPhase),
            { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown' });
    } catch {}
    stopSpinner = true;
    await spinPromise.catch(() => {});

    if (!meta.items.length) {
        sessions.delete(chatId);
        return bot.sendMessage(chatId, '❌ Gagal mengunduh semua media. Coba lagi.');
    }

    // Initialize wishes file (empty array) for guestbook
    const wishesFile = path.join(albumDir, 'wishes.json');
    if (!fs.existsSync(wishesFile)) fs.writeFileSync(wishesFile, '[]');

    // Pre-generate static QR PNG so it also works on GitHub Pages
    try { await regenerateQrPng(meta); } catch (e) { console.error('[ALBUM qr.png]', e.message); }

    // Write album HTML
    fs.writeFileSync(path.join(albumDir, 'index.html'), renderAlbumHtml(meta));
    fs.writeFileSync(path.join(albumDir, 'meta.json'), JSON.stringify(meta, null, 2));

    // Update master index + main index page
    const all = loadIndex();
    all.push({ slug: meta.slug, title: meta.title, createdAt: meta.createdAt, eventDate: meta.eventDate, items: meta.items });
    saveIndex(all);
    fs.writeFileSync(path.join(ALBUMS_DIR, 'index.html'), renderIndexHtml(all));

    sessions.delete(chatId);

    const base = getPublicBaseUrl();
    const link = `${base}/album/${s.slug}`;
    const dlLink = `${base}/album/${s.slug}/download`;

    await bot.editMessageText(
        `✅ *Album Abadi siap!*\n\n` +
        `✿ *${s.title}*\n📸 ${meta.items.length} kenangan\n\n` +
        `🔗 *Tautan permanen:*\n${link}\n\n` +
        `⬇ *Unduh semua (.zip):*\n${dlLink}\n\n` +
        (failed ? `⚠️ ${failed} item gagal diunduh (link Drive private atau file rusak).\n\n` : '') +
        `_Bagikan tautan ini ke siapa saja. Tautan tidak akan kadaluarsa selama bot ini hidup._\n\n` +
        `💡 *Tips abadi:* Klik tombol "Unduh Semua" sekarang dan simpan zip-nya di Google Drive / hard disk pribadi sebagai backup selamanya.`,
        { chat_id: chatId, message_id: status.message_id, parse_mode: 'Markdown', disable_web_page_preview: true }
    ).catch(() => {
        bot.sendMessage(chatId,
            `✅ Album siap!\n\n${link}\n\nUnduh semua: ${dlLink}`,
            { disable_web_page_preview: true });
    });
}

function guessExt(url, mime, type) {
    const m = String(url).match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (m) return '.' + m[1].toLowerCase();
    if (mime) {
        const map = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'video/mp4': '.mp4', 'video/quicktime': '.mov' };
        if (map[mime]) return map[mime];
    }
    return type === 'video' ? '.mp4' : '.jpg';
}

// ==================== EXPRESS ROUTES ====================

// Re-render all existing album HTML files so design/template upgrades apply
// to albums that were created with previous versions. Also pushes the
// regenerated index.html to GitHub Pages for any album that was previously
// published, so the falling-edelweiss + couple-character + pulsing-envelope
// upgrades land on the live site too.
function regenerateAllAlbums(fixedAudios = {}) {
    try {
        if (!fs.existsSync(ALBUMS_DIR)) return;
        const list = loadIndex();
        const published = [];
        for (const a of list) {
            const dir = path.join(ALBUMS_DIR, a.slug);
            const metaPath = path.join(dir, 'meta.json');
            if (!fs.existsSync(metaPath)) continue;
            try {
                const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                fs.writeFileSync(path.join(dir, 'index.html'), renderAlbumHtml(meta));
                if (meta.githubSlug) published.push({ slug: a.slug, githubSlug: meta.githubSlug, dir });
            } catch (e) {
                console.error(`[ALBUM regen] ${a.slug}:`, e.message);
            }
        }
        fs.writeFileSync(path.join(ALBUMS_DIR, 'index.html'), renderIndexHtml(list));
        if (list.length) console.log(`[ALBUM] Regenerated ${list.length} album page(s) with latest design`);

        // Push regenerated HTML to GitHub for already-published albums (fire & forget)
        const owner = process.env.GITHUB_OWNER;
        const repo  = process.env.GITHUB_REPO;
        const token = process.env.GITHUB_TOKEN;
        if (published.length && owner && repo && token) {
            (async () => {
                try {
                    const { pushAlbumDelta } = require('./githubPublish');
                    for (const p of published) {
                        try {
                            // pushAlbumDelta auto-rewrites index.html for GitHub Pages
                            // (base href + download link) so audio paths resolve.
                            const addFiles = [{
                                pathInRepo: `album/${p.githubSlug}/index.html`,
                                localPath: path.join(p.dir, 'index.html'),
                                localSlug: p.slug
                            }];
                            // Always re-push current audio files for this album so
                            // GitHub stays in sync with local (covers cases where the
                            // original publish uploaded a non-MP3 file disguised as .mp3
                            // that has since been normalized locally by ffmpeg).
                            let audios = [];
                            try {
                                audios = fs.readdirSync(p.dir).filter(f =>
                                    /^audio(_\d+)?\.(mp3|m4a|ogg|wav|aac|flac)$/i.test(f));
                            } catch {}
                            for (const af of audios) {
                                addFiles.push({
                                    pathInRepo: `album/${p.githubSlug}/${af}`,
                                    localPath: path.join(p.dir, af)
                                });
                            }
                            const wasFixed = (fixedAudios[p.slug] || []).length > 0;
                            const msg = wasFixed
                                ? `fix(album/${p.githubSlug}): re-encode broken audio + refresh`
                                : `chore(album/${p.githubSlug}): refresh template + audio sync`;
                            await pushAlbumDelta({ owner, repo, token, addFiles, commitMessage: msg });
                            console.log(`[ALBUM] Pushed refresh to GitHub: ${p.githubSlug}${audios.length ? ` (+${audios.length} audio)` : ''}`);
                        } catch (e) {
                            console.error(`[ALBUM gh-refresh ${p.githubSlug}]`, e.message);
                        }
                    }
                } catch (e) {
                    console.error('[ALBUM gh-refresh]', e.message);
                }
            })();
        }
    } catch (e) {
        console.error('[ALBUM regen]', e.message);
    }
}

function registerAlbumRoutes(app) {
    ensureDirs();
    const fixedAudios = fixAllBrokenAudios();
    regenerateAllAlbums(fixedAudios);

    // Index of all albums
    app.get('/album', (req, res) => {
        const all = loadIndex();
        res.set('Cache-Control', 'no-cache');
        res.type('html').send(renderIndexHtml(all));
    });

    // Download all as zip
    app.get('/album/:slug/download', (req, res) => {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const albumDir = path.join(ALBUMS_DIR, slug);
        const filesDir = path.join(albumDir, 'files');
        if (!fs.existsSync(filesDir)) return res.status(404).send('Album tidak ditemukan');
        const metaPath = path.join(albumDir, 'meta.json');
        let title = slug;
        try { title = JSON.parse(fs.readFileSync(metaPath, 'utf8')).title || slug; } catch {}
        const safe = title.replace(/[^\w\-]+/g, '_');
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="${safe}.zip"`);
        const archive = archiver('zip', { zlib: { level: 6 } });
        archive.on('error', (err) => { console.error('[ALBUM zip]', err); try { res.end(); } catch {} });
        archive.pipe(res);
        archive.directory(filesDir, safe);
        // Include background music if present
        try {
            const m = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            if (m && m.audio && m.audio.file) {
                const audioFile = path.join(albumDir, m.audio.file);
                if (fs.existsSync(audioFile)) archive.file(audioFile, { name: `${safe}/${m.audio.file}` });
            }
        } catch {}
        archive.finalize();
    });

    // Album viewer
    // Album viewer. Express by default treats `/album/x` and `/album/x/` as the
    // same route, so we redirect to trailing slash only when the request path
    // really has no trailing slash — otherwise we'd loop forever.
    app.get('/album/:slug', (req, res, next) => {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        if (!slug) return next();
        // If the actual URL path doesn't end with '/', send a redirect.
        const reqPath = req.path; // does not include querystring
        if (!reqPath.endsWith('/')) {
            const qIdx = req.originalUrl.indexOf('?');
            const qs = qIdx >= 0 ? req.originalUrl.slice(qIdx) : '';
            return res.redirect(301, `/album/${slug}/${qs}`);
        }
        // Trailing slash present → serve the album HTML directly.
        const file = path.join(ALBUMS_DIR, slug, 'index.html');
        if (!fs.existsSync(file)) return res.status(404).send('Album tidak ditemukan');
        res.set('Cache-Control', 'no-cache');
        res.sendFile(file);
    });

    // Static file serving for media inside an album
    app.get('/album/:slug/files/:fname', (req, res) => {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const fname = req.params.fname.replace(/[^\w\-.]/g, '');
        const file = path.join(ALBUMS_DIR, slug, 'files', fname);
        if (!fs.existsSync(file)) return res.status(404).send('Not found');
        res.sendFile(file);
    });

    // Audio file (background music) — match audio.ext (legacy) and audio_N.ext (playlist)
    app.get('/album/:slug/:fname', (req, res, next) => {
        const fname = String(req.params.fname || '');
        if (!/^audio(_\d+)?\.(mp3|m4a|ogg|wav|aac|flac)$/i.test(fname)) return next();
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const safe = fname.replace(/[^\w\-.]/g, '');
        const file = path.join(ALBUMS_DIR, slug, safe);
        if (!fs.existsSync(file)) return res.status(404).send('Not found');
        res.set('Accept-Ranges', 'bytes');
        res.sendFile(file);
    });

    // QR code PNG generated on demand. If the album has been published to
    // GitHub Pages, the QR encodes the GitHub URL (truly permanent).
    app.get('/album/:slug/qr.png', async (req, res) => {
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const albumDir = path.join(ALBUMS_DIR, slug);
        if (!fs.existsSync(albumDir)) return res.status(404).send('Not found');
        try {
            let meta = { slug };
            try { meta = JSON.parse(fs.readFileSync(path.join(albumDir, 'meta.json'), 'utf8')); } catch {}
            const QRCode = require('qrcode');
            let url = getAlbumShareUrl(meta);
            if (!url || url === '/') {
                const base = `${req.protocol}://${req.get('host')}`;
                url = `${base}/album/${slug}/`;
            }
            const buf = await QRCode.toBuffer(url, {
                errorCorrectionLevel: 'M', margin: 2, width: 600,
                color: { dark: '#3d2a35', light: '#ffffff' }
            });
            res.set('Content-Type', 'image/png');
            // Short cache so QR refreshes quickly after a publish
            res.set('Cache-Control', 'public, max-age=60');
            res.send(buf);
        } catch (e) {
            console.error('[ALBUM qr]', e.message);
            res.status(500).send('QR error');
        }
    });

    // CORS for wishes endpoints so the page hosted on GitHub Pages can still
    // read & post wishes against this Replit backend (cross-origin).
    const allowWishCors = (req, res) => {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Max-Age', '86400');
    };
    app.options('/album/:slug/wishes', (req, res) => { allowWishCors(req, res); res.status(204).end(); });
    app.options('/album/:slug/wishes.json', (req, res) => { allowWishCors(req, res); res.status(204).end(); });

    // ===== Permanent wishes storage =====
    // Canonical store lives OUTSIDE the album dir so re-publish/re-create
    // never wipes guest wishes. The file inside the album dir is just a
    // mirror used by static GitHub Pages (which still proxies reads to here).
    const WISHES_DIR = path.join(__dirname, '..', 'data', 'wishes');
    try { fs.mkdirSync(WISHES_DIR, { recursive: true }); } catch {}

    const canonicalWishesFile = (slug) => path.join(WISHES_DIR, `${slug}.json`);
    const albumWishesFile = (slug) => path.join(ALBUMS_DIR, slug, 'wishes.json');

    function readJsonArr(file) {
        try { const a = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(a) ? a : []; } catch { return []; }
    }
    function dedupeWishes(arr) {
        const seen = new Set();
        const out = [];
        for (const w of arr) {
            if (!w || typeof w !== 'object' || !w.msg) continue;
            const key = `${w.name||''}|${w.msg}|${w.t||0}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ name: String(w.name||'Anonim'), msg: String(w.msg), t: Number(w.t)||Date.now() });
        }
        out.sort((a,b) => (a.t||0) - (b.t||0));
        return out;
    }
    function loadAllWishes(slug) {
        // Merge canonical + album-mirror, dedup, return.
        return dedupeWishes([...readJsonArr(canonicalWishesFile(slug)), ...readJsonArr(albumWishesFile(slug))]);
    }
    function saveAllWishes(slug, arr) {
        const data = JSON.stringify(arr);
        try { fs.writeFileSync(canonicalWishesFile(slug), data); } catch (e) { console.error('[wishes canonical]', e.message); throw e; }
        try { fs.mkdirSync(path.join(ALBUMS_DIR, slug), { recursive: true }); fs.writeFileSync(albumWishesFile(slug), data); } catch (e) { console.error('[wishes mirror]', e.message); }
    }

    // One-time startup migration: ensure every album's wishes are merged into
    // the canonical store. Idempotent — re-running it is safe.
    try {
        if (fs.existsSync(ALBUMS_DIR)) {
            for (const slug of fs.readdirSync(ALBUMS_DIR)) {
                const dir = path.join(ALBUMS_DIR, slug);
                if (!fs.statSync(dir).isDirectory()) continue;
                const merged = loadAllWishes(slug);
                if (merged.length) saveAllWishes(slug, merged);
            }
            console.log('[ALBUM wishes] permanent store ready at', WISHES_DIR);
        }
    } catch (e) { console.error('[ALBUM wishes migrate]', e.message); }

    // Wishes JSON (read) — always serve merged canonical+mirror.
    app.get('/album/:slug/wishes.json', (req, res) => {
        allowWishCors(req, res);
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        res.set('Cache-Control', 'no-cache');
        res.json(loadAllWishes(slug));
    });

    // Submit a new wish (POST). Simple in-memory rate limit per IP.
    const wishHits = new Map();
    app.post('/album/:slug/wishes', (req, res) => {
        allowWishCors(req, res);
        const slug = req.params.slug.replace(/[^a-z0-9-]/gi, '');
        const albumDir = path.join(ALBUMS_DIR, slug);
        if (!fs.existsSync(albumDir)) return res.status(404).json({ error: 'not_found' });

        const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
        const now = Date.now();
        const last = wishHits.get(ip) || 0;
        if (now - last < 5000) return res.status(429).json({ error: 'too_fast' });
        wishHits.set(ip, now);

        const body = req.body || {};
        const name = String(body.name || 'Anonim').trim().slice(0, 40) || 'Anonim';
        const msg = String(body.msg || '').trim().slice(0, 500);
        if (!msg) return res.status(400).json({ error: 'empty' });

        const arr = loadAllWishes(slug);
        // Cap at 1000 wishes per album (drop oldest)
        if (arr.length >= 1000) arr.shift();
        arr.push({ name, msg, t: now });
        try { saveAllWishes(slug, arr); }
        catch (e) { return res.status(500).json({ error: 'write_failed' }); }
        res.json({ ok: true, count: arr.length });
    });
}

module.exports = registerAlbumCommand;
module.exports.registerAlbumRoutes = registerAlbumRoutes;
