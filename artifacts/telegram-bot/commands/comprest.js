'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const TMP_DIR = path.join(__dirname, '..', 'data', 'comprest_tmp');
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

const MAX_DOWNLOAD_MB = 20;
const MAX_SEND_MB     = 49;

// Active sessions: chatId → { videos: [], msgId, locked }
const sessions = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtSize(bytes) {
    if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    return (bytes / 1024).toFixed(1) + ' KB';
}

function fmtDur(secs) {
    const m = Math.floor(secs / 60), s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function cleanTmp(files) {
    for (const f of files) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
}

function runFfmpeg(args, timeout = 180000) {
    return new Promise((resolve, reject) => {
        execFile(FFMPEG, args, { timeout }, (err, stdout, stderr) => {
            if (err) reject(new Error(stderr?.slice(-600) || err.message));
            else resolve({ stdout, stderr });
        });
    });
}

async function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(destPath);
        proto.get(url, (res) => {
            if (res.statusCode !== 200) {
                file.destroy();
                reject(new Error('HTTP ' + res.statusCode));
                return;
            }
            res.pipe(file);
            file.on('finish', () => file.close(resolve));
            file.on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
        }).on('error', (e) => { fs.unlink(destPath, () => {}); reject(e); });
    });
}

async function getVideoInfo(filePath) {
    return new Promise((resolve) => {
        execFile(FFMPEG, ['-i', filePath, '-f', 'null', '-'], { timeout: 15000 }, (err, stdout, stderr) => {
            const out = stderr || '';
            const durMatch = out.match(/Duration:\s*([\d:]+\.?\d*)/);
            const vidMatch = out.match(/Video:[^\n]*/);
            const durStr = durMatch?.[1] || '?';
            let secs = 0;
            if (durMatch?.[1]) {
                const parts = durMatch[1].split(':').map(Number);
                secs = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
            }
            const res = vidMatch?.[0].match(/(\d{2,5}x\d{2,5})/)?.[1] || '?';
            const hasAudio = out.includes('Audio:');
            resolve({ durStr, secs, res, hasAudio });
        });
    });
}

// ─── Compress single video ────────────────────────────────────────────────────
async function compressVideo(inputPath, outputPath) {
    const info = await getVideoInfo(inputPath);
    const audioArgs = info.hasAudio
        ? ['-c:a', 'aac', '-b:a', '96k']
        : ['-an'];

    await runFfmpeg([
        '-i', inputPath,
        '-c:v', 'libx264',
        '-crf', '28',
        '-preset', 'fast',
        '-vf', 'scale=if(gt(iw\\,1280)\\,1280\\,iw):if(gt(ih\\,720)\\,720\\,ih):force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
        ...audioArgs,
        '-movflags', '+faststart',
        '-y', outputPath,
    ], 240000);
}

// ─── Merge / concat videos ───────────────────────────────────────────────────
async function mergeVideos(inputPaths, outputPath) {
    if (inputPaths.length === 1) {
        fs.copyFileSync(inputPaths[0], outputPath);
        return;
    }

    const normFiles = [];
    const normalized = [];

    for (let i = 0; i < inputPaths.length; i++) {
        const info = await getVideoInfo(inputPaths[i]);
        const normPath = path.join(TMP_DIR, `norm_${Date.now()}_${i}.mp4`);
        normFiles.push(normPath);

        let args;
        if (info.hasAudio) {
            args = [
                '-i', inputPaths[i],
                '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
                '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-c:a', 'aac', '-b:a', '96k',
                '-r', '30', '-ar', '44100',
                '-y', normPath,
            ];
        } else {
            args = [
                '-f', 'lavfi', '-i', 'aevalsrc=0',
                '-i', inputPaths[i],
                '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
                '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
                '-c:a', 'aac', '-b:a', '96k',
                '-r', '30', '-ar', '44100',
                '-map', '0:a', '-map', '1:v',
                '-shortest',
                '-y', normPath,
            ];
        }

        await runFfmpeg(args, 240000);
        normalized.push(normPath);
    }

    const listPath = path.join(TMP_DIR, `list_${Date.now()}.txt`);
    fs.writeFileSync(listPath, normalized.map(f => `file '${f}'`).join('\n'));
    normFiles.push(listPath);

    await runFfmpeg([
        '-f', 'concat', '-safe', '0',
        '-i', listPath,
        '-c:v', 'libx264', '-crf', '28', '-preset', 'fast',
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        '-y', outputPath,
    ], 360000);

    cleanTmp(normFiles);
}

// ── Build confirm keyboard ────────────────────────────────────────────────────
function confirmKeyboard(count) {
    return {
        inline_keyboard: [[
            { text: `✅ Konfirmasi & Kompresi (${count} video)`, callback_data: 'comprest_confirm' },
        ], [
            { text: '❌ Batal', callback_data: 'comprest_cancel' },
        ]],
    };
}

// ── Status text shown while collecting videos ─────────────────────────────────
function statusText(count) {
    if (count === 0) {
        return (
            `📹 *COMPREST — Siap Terima Video!*\n\n` +
            `Kirim video-videomu sekarang (maks 10, maks ${MAX_DOWNLOAD_MB} MB per video).\n\n` +
            `Setelah selesai kirim, tekan tombol ✅ *Konfirmasi* di bawah untuk mulai kompresi.`
        );
    }
    const lines = Array.from({ length: count }, (_, i) => `   ${i + 1}. ✅ Video ${i + 1} diterima`).join('\n');
    return (
        `📹 *COMPREST — ${count} video diterima*\n\n` +
        `${lines}\n\n` +
        `Masih ingin kirim lebih? Kirim sekarang.\n` +
        `Kalau sudah, tekan ✅ *Konfirmasi* untuk mulai kompresi.`
    );
}

// ── Main process session ──────────────────────────────────────────────────────
async function processSession(bot, chatId, session, BOT_TOKEN) {
    const { videos, msgId } = session;
    sessions.delete(chatId);

    const tmpFiles = [];
    try {
        await bot.editMessageText(
            `📥 *${videos.length} video dikonfirmasi!* Sedang memproses...\n\n` +
            `⬇️ Mengunduh video... (0/${videos.length})`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }
        ).catch(() => {});

        const downloadedPaths = [];
        let totalOrigSize = 0;
        const videoInfos = [];

        for (let i = 0; i < videos.length; i++) {
            const vid = videos[i];

            if (vid.fileSize && vid.fileSize > MAX_DOWNLOAD_MB * 1024 * 1024) {
                throw new Error(
                    `Video ${i + 1} terlalu besar (${fmtSize(vid.fileSize)}).\n` +
                    `Bot hanya bisa download video hingga ${MAX_DOWNLOAD_MB} MB.`
                );
            }

            let fileInfo;
            try {
                fileInfo = await bot.getFile(vid.fileId);
            } catch (e) {
                throw new Error(`Gagal ambil file video ${i + 1}: ${e.message}`);
            }

            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${fileInfo.file_path}`;
            const ext = path.extname(fileInfo.file_path) || '.mp4';
            const dlPath = path.join(TMP_DIR, `dl_${chatId}_${Date.now()}_${i}${ext}`);
            tmpFiles.push(dlPath);

            await bot.editMessageText(
                `📥 *${videos.length} video dikonfirmasi!*\n\n` +
                `⬇️ Mengunduh video ${i + 1}/${videos.length}...`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            ).catch(() => {});

            await downloadFile(fileUrl, dlPath);
            const origSize = fs.statSync(dlPath).size;
            totalOrigSize += origSize;

            const info = await getVideoInfo(dlPath);
            videoInfos.push({ origSize, ...info });
            downloadedPaths.push(dlPath);
        }

        await bot.editMessageText(
            `✅ Unduhan selesai!\n\n🔧 Mengompresi ${videos.length} video...`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
        ).catch(() => {});

        const compressedPaths = [];
        for (let i = 0; i < downloadedPaths.length; i++) {
            await bot.editMessageText(
                `🔧 Mengompresi video ${i + 1}/${downloadedPaths.length}...\n` +
                `(${fmtSize(videoInfos[i].origSize)} · ${videoInfos[i].res} · ${fmtDur(videoInfos[i].secs)})`,
                { chat_id: chatId, message_id: msgId }
            ).catch(() => {});

            const compPath = path.join(TMP_DIR, `comp_${chatId}_${Date.now()}_${i}.mp4`);
            tmpFiles.push(compPath);
            await compressVideo(downloadedPaths[i], compPath);
            compressedPaths.push(compPath);
        }

        const mergedPath = path.join(TMP_DIR, `merged_${chatId}_${Date.now()}.mp4`);
        tmpFiles.push(mergedPath);

        if (videos.length > 1) {
            await bot.editMessageText(
                `✅ Kompresi selesai!\n\n🔗 Menggabungkan ${videos.length} video menjadi 1...`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            ).catch(() => {});
        }

        await mergeVideos(compressedPaths, mergedPath);

        const finalSize = fs.statSync(mergedPath).size;

        if (finalSize > MAX_SEND_MB * 1024 * 1024) {
            throw new Error(
                `Hasil kompresi masih terlalu besar (${fmtSize(finalSize)}).\n` +
                `Telegram hanya menerima video hingga ${MAX_SEND_MB} MB.\n` +
                `Coba kurangi jumlah video atau kirim video yang lebih pendek.`
            );
        }

        const savedBytes = totalOrigSize - finalSize;
        const savedPct = totalOrigSize > 0 ? ((savedBytes / totalOrigSize) * 100).toFixed(1) : '0';
        const finalInfo = await getVideoInfo(mergedPath);

        let detail = '';
        if (videos.length > 1) {
            detail = videoInfos.map((v, i) =>
                `   Video ${i + 1}: ${fmtSize(v.origSize)} · ${v.res} · ${fmtDur(v.secs)}`
            ).join('\n') + '\n\n';
        }

        const caption =
            `🎬 *Video${videos.length > 1 ? ` (${videos.length} digabung)` : ''} — Selesai!*\n\n` +
            (videos.length > 1 ? `📹 *Detail per video:*\n${detail}` : '') +
            `📊 *Ukuran Asli:* ${fmtSize(totalOrigSize)}\n` +
            `✨ *Ukuran Akhir:* ${fmtSize(finalSize)}\n` +
            `📉 *Hemat:* ${fmtSize(Math.abs(savedBytes))} *(${savedPct}% lebih kecil)*\n` +
            `🎞️ *Resolusi:* ${finalInfo.res}\n` +
            `⏱️ *Durasi Total:* ${fmtDur(finalInfo.secs)}\n\n` +
            `_Kualitas dipertahankan — hanya bitrate & resolusi disesuaikan_`;

        await bot.editMessageText(
            `✅ Semua selesai! Mengirim video (${fmtSize(finalSize)})...`,
            { chat_id: chatId, message_id: msgId }
        ).catch(() => {});

        await bot.sendVideo(chatId, fs.createReadStream(mergedPath), {
            caption,
            parse_mode: 'Markdown',
            supports_streaming: true,
        });

        await bot.deleteMessage(chatId, msgId).catch(() => {});

    } catch (err) {
        console.error('[comprest]', err.message);
        await bot.editMessageText(
            `❌ *Gagal memproses video*\n\n${err.message?.slice(0, 300) || 'Error tidak diketahui'}\n\nCoba lagi dengan /comprest`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [] } }
        ).catch(() => {});
    } finally {
        cleanTmp(tmpFiles);
    }
}

// ── Register command ──────────────────────────────────────────────────────────
function registerComprest(bot) {
    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

    // /comprest — start a new collection session
    bot.onText(/^\/comprest(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;

        // Cancel any existing session
        if (sessions.has(chatId)) {
            sessions.delete(chatId);
        }

        const statusMsg = await bot.sendMessage(
            chatId,
            statusText(0),
            { parse_mode: 'Markdown', reply_markup: confirmKeyboard(0) }
        );

        sessions.set(chatId, {
            videos: [],
            msgId: statusMsg.message_id,
            locked: false,
        });
    });

    // Listen for video messages during an active session
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const sess = sessions.get(chatId);
        if (!sess || sess.locked) return;

        let fileId = null;
        let fileName = null;
        let fileSize = null;

        if (msg.video) {
            fileId = msg.video.file_id;
            fileName = msg.video.file_name || `video_${sess.videos.length + 1}.mp4`;
            fileSize = msg.video.file_size;
        } else if (msg.video_note) {
            fileId = msg.video_note.file_id;
            fileName = `videonote_${sess.videos.length + 1}.mp4`;
            fileSize = msg.video_note.file_size;
        } else if (msg.document && msg.document.mime_type?.startsWith('video/')) {
            fileId = msg.document.file_id;
            fileName = msg.document.file_name || `video_${sess.videos.length + 1}.mp4`;
            fileSize = msg.document.file_size;
        } else {
            return;
        }

        if (sess.videos.length >= 10) {
            bot.sendMessage(chatId, '⚠️ Maksimal 10 video per sesi. Tekan ✅ Konfirmasi untuk mulai kompresi.').catch(() => {});
            return;
        }

        if (fileSize && fileSize > MAX_DOWNLOAD_MB * 1024 * 1024) {
            bot.sendMessage(chatId,
                `⚠️ Video ${sess.videos.length + 1} terlalu besar (${fmtSize(fileSize)}).\n` +
                `Maks ${MAX_DOWNLOAD_MB} MB per video. Video ini dilewati.`
            ).catch(() => {});
            return;
        }

        sess.videos.push({ fileId, fileName, fileSize });
        const count = sess.videos.length;

        bot.editMessageText(
            statusText(count),
            {
                chat_id: chatId,
                message_id: sess.msgId,
                parse_mode: 'Markdown',
                reply_markup: confirmKeyboard(count),
            }
        ).catch(() => {});
    });

    // Handle inline button callbacks
    bot.on('callback_query', async (query) => {
        const chatId = query.message?.chat?.id;
        const data = query.data;

        if (!chatId || (data !== 'comprest_confirm' && data !== 'comprest_cancel')) return;

        await bot.answerCallbackQuery(query.id).catch(() => {});

        if (data === 'comprest_cancel') {
            sessions.delete(chatId);
            await bot.editMessageText(
                '❌ Sesi kompresi dibatalkan. Ketik /comprest untuk memulai lagi.',
                { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }
            ).catch(() => {});
            return;
        }

        // Confirm
        const sess = sessions.get(chatId);
        if (!sess) {
            await bot.editMessageText(
                '⚠️ Tidak ada sesi aktif. Ketik /comprest untuk memulai.',
                { chat_id: chatId, message_id: query.message.message_id, reply_markup: { inline_keyboard: [] } }
            ).catch(() => {});
            return;
        }

        if (sess.videos.length === 0) {
            await bot.answerCallbackQuery(query.id, {
                text: '⚠️ Belum ada video yang dikirim! Kirim dulu videonya.',
                show_alert: true,
            }).catch(() => {});
            return;
        }

        // Lock session so new videos are ignored during processing
        sess.locked = true;

        processSession(bot, chatId, sess, BOT_TOKEN);
    });
}

module.exports = registerComprest;
