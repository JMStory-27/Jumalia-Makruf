const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const GH_API = 'https://api.github.com';

async function gh(token, method, urlPath, body) {
    const r = await fetch(GH_API + urlPath, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
            'User-Agent': 'AlbumAbadiBot'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!r.ok) {
        const err = new Error(`GH ${method} ${urlPath} -> ${r.status}: ${json.message || text.slice(0, 200)}`);
        err.status = r.status;
        err.data = json;
        throw err;
    }
    return json;
}

async function getMainRef(token, owner, repo) {
    try {
        return await gh(token, 'GET', `/repos/${owner}/${repo}/git/refs/heads/main`);
    } catch (e) {
        if (e.status === 404 || e.status === 409) return null;
        throw e;
    }
}

async function initEmptyRepo(token, owner, repo) {
    const readme = '# Album Abadi 🌸\n\nGaleri kenangan abadi.\n\nLihat album: [klik di sini](./album/)\n';
    await gh(token, 'PUT', `/repos/${owner}/${repo}/contents/README.md`, {
        message: 'Initialize repository',
        content: Buffer.from(readme, 'utf8').toString('base64'),
        branch: 'main'
    });
}

async function createBlob(token, owner, repo, buffer) {
    const data = await gh(token, 'POST', `/repos/${owner}/${repo}/git/blobs`, {
        content: buffer.toString('base64'),
        encoding: 'base64'
    });
    return data.sha;
}

function* walk(dir, base = '') {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        const rel = base ? `${base}/${name}` : name;
        const stat = fs.statSync(full);
        if (stat.isDirectory()) yield* walk(full, rel);
        else yield { full, rel, size: stat.size };
    }
}

async function buildZip(srcDir, destZip, rootName) {
    await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(destZip);
        const arc = archiver('zip', { zlib: { level: 6 } });
        out.on('close', resolve);
        out.on('error', reject);
        arc.on('error', reject);
        arc.pipe(out);
        arc.directory(srcDir, rootName);
        arc.finalize();
    });
}

function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Build the absolute Replit URL for an album's wishes endpoints. Used by the
// GitHub-published page so wishes (read & post) still go to this Replit
// backend instead of trying to hit static files on github.io.
function buildWishesApiBase(slug) {
    let base = process.env.PUBLIC_BASE_URL;
    if (!base && process.env.REPLIT_DEV_DOMAIN) base = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    if (!base && process.env.REPLIT_DOMAINS) {
        const first = process.env.REPLIT_DOMAINS.split(',')[0].trim();
        if (first) base = `https://${first}`;
    }
    if (!base) return '';
    return `${base.replace(/\/$/, '')}/album/${slug}`;
}

// Apply the GitHub-Pages-flavored rewrites to an album index.html. Keeping
// this in one helper means /publishalbum, /addlagu, /delsong, and the
// startup auto-refresh all stay consistent.
function rewriteHtmlForGithub(html, slug) {
    html = html.replace(/<base href="[^"]*">/, '<base href="./">');
    html = html.replace(/href="(?:\/album\/[^/]+\/download|download)"/g, 'href="album.zip"');
    const wishesApi = buildWishesApiBase(slug);
    if (wishesApi) {
        html = html.replaceAll('%%WISHES_API_BASE%%', wishesApi);
    }
    return html;
}

async function publishAlbumToGithub({ slug, repoSlug, owner, repo, token, albumsDir, onProgress }) {
    const log = (m) => { if (onProgress) onProgress(m); };
    const albumDir = path.join(albumsDir, slug);
    if (!fs.existsSync(albumDir)) throw new Error(`Album "${slug}" tidak ditemukan`);
    const ghSlug = (repoSlug || slug).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || slug;

    let meta = { title: slug };
    try { meta = JSON.parse(fs.readFileSync(path.join(albumDir, 'meta.json'), 'utf8')); } catch {}

    let html = fs.readFileSync(path.join(albumDir, 'index.html'), 'utf8');
    html = rewriteHtmlForGithub(html, slug);

    log('📦 Membuat file zip...');
    const tmpZip = path.join(albumDir, 'album.zip');
    const safeTitle = (meta.title || slug).replace(/[^\w\-]+/g, '_');
    const filesDir = path.join(albumDir, 'files');
    if (fs.existsSync(filesDir) && fs.readdirSync(filesDir).length > 0) {
        await buildZip(filesDir, tmpZip, safeTitle);
    }

    const uploads = [];
    const repoBase = `album/${ghSlug}`;
    uploads.push({ pathInRepo: `${repoBase}/index.html`, buffer: Buffer.from(html, 'utf8') });
    // Include QR PNG so GitHub Pages page shows the share QR
    const qrPath = path.join(albumDir, 'qr.png');
    if (fs.existsSync(qrPath)) {
        uploads.push({ pathInRepo: `${repoBase}/qr.png`, buffer: fs.readFileSync(qrPath) });
    }
    // Include audio playlist files (sit at album root, e.g. audio_0.mp3)
    for (const name of fs.readdirSync(albumDir)) {
        if (/^audio(_\d+)?\.(mp3|m4a|ogg|wav|aac|flac)$/i.test(name)) {
            uploads.push({ pathInRepo: `${repoBase}/${name}`, buffer: fs.readFileSync(path.join(albumDir, name)) });
        }
    }
    if (fs.existsSync(tmpZip)) {
        uploads.push({ pathInRepo: `${repoBase}/album.zip`, buffer: fs.readFileSync(tmpZip) });
    }
    if (fs.existsSync(filesDir)) {
        for (const f of walk(filesDir)) {
            uploads.push({ pathInRepo: `${repoBase}/files/${f.rel}`, buffer: fs.readFileSync(f.full) });
        }
    }

    const TOO_BIG = 95 * 1024 * 1024;
    const skipped = [];
    const filtered = uploads.filter(u => {
        if (u.buffer.length > TOO_BIG) { skipped.push({ p: u.pathInRepo, size: u.buffer.length }); return false; }
        return true;
    });

    const totalBytes = filtered.reduce((a, u) => a + u.buffer.length, 0);
    log(`📊 ${filtered.length} file (${fmtBytes(totalBytes)})${skipped.length ? `, ${skipped.length} dilewati (>95MB)` : ''}`);

    log('🔍 Mengecek repo...');
    let currentRef = await getMainRef(token, owner, repo);
    if (!currentRef) {
        log('🆕 Repo masih kosong, inisialisasi dulu...');
        await initEmptyRepo(token, owner, repo);
        // Wait briefly for branch to propagate, then re-fetch
        await new Promise(r => setTimeout(r, 1500));
        currentRef = await getMainRef(token, owner, repo);
        if (!currentRef) throw new Error('Gagal inisialisasi repo. Coba lagi sebentar.');
    }
    const parentCommitSha = currentRef.object.sha;
    const parentCommit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`);
    const baseTreeSha = parentCommit.tree.sha;

    log(`📤 Mengupload ${filtered.length} file...`);
    const treeEntries = [];
    const CHUNK = 4;
    for (let i = 0; i < filtered.length; i += CHUNK) {
        const batch = filtered.slice(i, i + CHUNK);
        const shas = await Promise.all(batch.map(u => createBlob(token, owner, repo, u.buffer)));
        batch.forEach((u, j) => {
            treeEntries.push({ path: u.pathInRepo, mode: '100644', type: 'blob', sha: shas[j] });
        });
        if ((i / CHUNK) % 5 === 0 || i + CHUNK >= filtered.length) {
            log(`   ${Math.min(i + CHUNK, filtered.length)}/${filtered.length}`);
        }
    }

    log('🌳 Membuat struktur...');
    const tree = await gh(token, 'POST', `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeEntries
    });

    log('📝 Commit perubahan...');
    const commit = await gh(token, 'POST', `/repos/${owner}/${repo}/git/commits`, {
        message: `Publish album: ${meta.title || slug}`,
        tree: tree.sha,
        parents: [parentCommitSha]
    });

    log('🚀 Push ke main...');
    await gh(token, 'PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: commit.sha, force: false });

    let pagesEnabled = false;
    try {
        await gh(token, 'POST', `/repos/${owner}/${repo}/pages`, {
            source: { branch: 'main', path: '/' },
            build_type: 'legacy'
        });
        pagesEnabled = true;
    } catch (e) {
        if (e.status === 409 || /already/i.test(e.message)) {
            pagesEnabled = true;
        }
    }

    const ghUrl = `https://${owner.toLowerCase()}.github.io/${repo}/album/${ghSlug}/`;
    return {
        url: ghUrl,
        ghSlug,
        commit: commit.sha.slice(0, 7),
        files: filtered.length,
        bytes: totalBytes,
        skipped,
        pagesEnabled
    };
}

/**
 * Surgical update: add/replace specific files and/or delete specific paths
 * inside an already-published album on GitHub. Reads "addFiles" from local
 * paths if `localPath` provided, otherwise uses provided buffer directly.
 *   addFiles: [{ pathInRepo, localPath } | { pathInRepo, buffer }]
 *   deletePaths: ['album/<slug>/audio_2.mp3', ...]
 */
async function pushAlbumDelta({ owner, repo, token, addFiles = [], deletePaths = [], commitMessage = 'Update album', onProgress }) {
    const log = (m) => { if (onProgress) onProgress(m); };
    if (!addFiles.length && !deletePaths.length) return null;

    log('🔍 Mengecek repo...');
    const ref = await getMainRef(token, owner, repo);
    if (!ref) throw new Error('Repo masih kosong. Publish dulu pakai /publishalbum.');
    const parentSha = ref.object.sha;
    const parentCommit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    const baseTreeSha = parentCommit.tree.sha;

    const treeEntries = [];
    if (deletePaths.length) {
        log(`🗑 Menyiapkan hapus ${deletePaths.length} file...`);
        for (const p of deletePaths) {
            treeEntries.push({ path: p, mode: '100644', type: 'blob', sha: null });
        }
    }
    if (addFiles.length) {
        log(`📤 Mengupload ${addFiles.length} file...`);
        const CHUNK = 4;
        for (let i = 0; i < addFiles.length; i += CHUNK) {
            const batch = addFiles.slice(i, i + CHUNK);
            const shas = await Promise.all(batch.map(u => {
                let buf = u.buffer || fs.readFileSync(u.localPath);
                // Auto-rewrite album index.html for GitHub Pages flat layout so
                // music/audio paths resolve and wishes hit the Replit backend.
                const m = u.pathInRepo.match(/^album\/([^/]+)\/index\.html$/i);
                if (m) {
                    buf = Buffer.from(rewriteHtmlForGithub(buf.toString('utf8'), u.localSlug || m[1]), 'utf8');
                }
                return createBlob(token, owner, repo, buf);
            }));
            batch.forEach((u, j) => {
                treeEntries.push({ path: u.pathInRepo, mode: '100644', type: 'blob', sha: shas[j] });
            });
            log(`   ${Math.min(i + CHUNK, addFiles.length)}/${addFiles.length}`);
        }
    }

    log('🌳 Membuat struktur...');
    const tree = await gh(token, 'POST', `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeEntries
    });

    log('📝 Commit perubahan...');
    const commit = await gh(token, 'POST', `/repos/${owner}/${repo}/git/commits`, {
        message: commitMessage,
        tree: tree.sha,
        parents: [parentSha]
    });

    log('🚀 Push ke main...');
    await gh(token, 'PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: commit.sha, force: false });

    return { commit: commit.sha.slice(0, 7), added: addFiles.length, deleted: deletePaths.length };
}

// List all blob paths under a given album/<slug>/ prefix on the main branch.
async function listAlbumPathsOnGithub({ owner, repo, token, ghSlug }) {
    const ref = await getMainRef(token, owner, repo);
    if (!ref) return [];
    const commit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
    const tree = await gh(token, 'GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    const prefix = `album/${ghSlug}/`;
    return tree.tree.filter(t => t.type === 'blob' && t.path.startsWith(prefix)).map(t => t.path);
}

async function unpublishAlbumFromGithub({ slug, owner, repo, token, onProgress }) {
    const log = (m) => { if (onProgress) onProgress(m); };

    log('🔍 Mengecek repo...');
    const ref = await getMainRef(token, owner, repo);
    if (!ref) throw new Error('Repo masih kosong, tidak ada album untuk dihapus.');

    const parentSha = ref.object.sha;
    const parentCommit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    const baseTreeSha = parentCommit.tree.sha;

    log('📂 Mencari file album...');
    const fullTree = await gh(token, 'GET', `/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`);
    const prefix = `album/${slug}/`;
    const toDelete = fullTree.tree.filter(t => t.type === 'blob' && t.path.startsWith(prefix));
    if (!toDelete.length) throw new Error(`Album "${slug}" tidak ada di GitHub.`);

    log(`🗑 Menghapus ${toDelete.length} file...`);
    const deleteEntries = toDelete.map(t => ({
        path: t.path, mode: t.mode, type: 'blob', sha: null
    }));

    const newTree = await gh(token, 'POST', `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: deleteEntries
    });

    const newCommit = await gh(token, 'POST', `/repos/${owner}/${repo}/git/commits`, {
        message: `Unpublish album: ${slug}`,
        tree: newTree.sha,
        parents: [parentSha]
    });

    log('🚀 Push perubahan...');
    await gh(token, 'PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: newCommit.sha, force: false });

    return { commit: newCommit.sha.slice(0, 7), files: toDelete.length };
}

async function listPublishedAlbums({ owner, repo, token }) {
    const ref = await getMainRef(token, owner, repo);
    if (!ref) return [];
    const commit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
    const tree = await gh(token, 'GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    const slugs = new Set();
    for (const t of tree.tree) {
        const m = t.path.match(/^album\/([^/]+)\//);
        if (m) slugs.add(m[1]);
    }
    return Array.from(slugs);
}

// ===== Generic web publishing (used by /buatweb) =====
async function listPublishedWebs({ owner, repo, token }) {
    const ref = await getMainRef(token, owner, repo);
    if (!ref) return [];
    const commit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
    const tree = await gh(token, 'GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    const slugs = new Set();
    for (const t of tree.tree) {
        const m = t.path.match(/^web\/([^/]+)\//);
        if (m) slugs.add(m[1]);
    }
    return Array.from(slugs);
}

async function unpublishWebFromGithub({ slug, owner, repo, token }) {
    const ref = await getMainRef(token, owner, repo);
    if (!ref) throw new Error('Repo masih kosong.');
    const parentSha = ref.object.sha;
    const parentCommit = await gh(token, 'GET', `/repos/${owner}/${repo}/git/commits/${parentSha}`);
    const baseTreeSha = parentCommit.tree.sha;
    const fullTree = await gh(token, 'GET', `/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`);
    const prefix = `web/${slug}/`;
    const toDelete = fullTree.tree.filter(t => t.type === 'blob' && t.path.startsWith(prefix));
    if (!toDelete.length) throw new Error(`Web "${slug}" ngga ada di GitHub.`);
    const newTree = await gh(token, 'POST', `/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: toDelete.map(t => ({ path: t.path, mode: t.mode, type: 'blob', sha: null })),
    });
    const newCommit = await gh(token, 'POST', `/repos/${owner}/${repo}/git/commits`, {
        message: `Unpublish web: ${slug}`,
        tree: newTree.sha,
        parents: [parentSha],
    });
    await gh(token, 'PATCH', `/repos/${owner}/${repo}/git/refs/heads/main`, { sha: newCommit.sha, force: false });
    return { commit: newCommit.sha.slice(0, 7), files: toDelete.length };
}

module.exports = {
    publishAlbumToGithub,
    unpublishAlbumFromGithub,
    listPublishedAlbums,
    listPublishedWebs,
    unpublishWebFromGithub,
    pushAlbumDelta,
    listAlbumPathsOnGithub,
};
