'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKSPACE    = path.join(__dirname, '..', '..', '..');
const LAWRENZ_DIR  = path.join(WORKSPACE, 'artifacts', 'lawrenz-ai');
const DIST_DIR     = path.join(LAWRENZ_DIR, 'dist', 'ghpages');

const GH_OWNER          = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO           = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const GH_PAGES_LAWRENZ  = `https://${GH_OWNER.toLowerCase()}.github.io/Jumalia-Makruf/LawrenzAI/`;

/* ── Git helper ──────────────────────────────────────────────────────────── */
async function ghReq(method, urlPath, body) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'LawrenzBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(`GH ${method} ${urlPath} → ${res.status}: ${json.message || text.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

/* ── Walk local dir ──────────────────────────────────────────────────────── */
function* walkDir(dir, base = '') {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel  = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) yield* walkDir(full, rel);
    else yield { full, rel };
  }
}

/* ── Scan perubahan lawrenz-ai vs git HEAD ───────────────────────────────── */
function scanChanges() {
  const changes = { modified: [], added: [], deleted: [], recent: [] };
  try {
    // File berubah sejak commit terakhir
    const diff = execSync(
      'git diff --name-status HEAD -- artifacts/lawrenz-ai/ artifacts/api-server/src/routes/',
      { cwd: WORKSPACE, encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (diff) {
      for (const line of diff.split('\n')) {
        const [status, ...parts] = line.trim().split(/\s+/);
        const file = parts.join(' ');
        if (!file) continue;
        if (status === 'M') changes.modified.push(file);
        else if (status === 'A') changes.added.push(file);
        else if (status === 'D') changes.deleted.push(file);
      }
    }

    // 5 commit terakhir yang menyentuh lawrenz-ai
    const log = execSync(
      'git log --oneline -5 -- artifacts/lawrenz-ai/ artifacts/api-server/src/routes/',
      { cwd: WORKSPACE, encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (log) {
      changes.recent = log.split('\n').slice(0, 5);
    }

    // Juga cek untracked / modified working tree
    const status = execSync(
      'git status --short -- artifacts/lawrenz-ai/ artifacts/api-server/src/routes/',
      { cwd: WORKSPACE, encoding: 'utf8', timeout: 10000 }
    ).trim();

    if (status) {
      for (const line of status.split('\n')) {
        const code = line.slice(0, 2).trim();
        const file = line.slice(3).trim();
        if (!file) continue;
        if ((code === 'M' || code === 'AM') && !changes.modified.includes(file)) changes.modified.push(file);
        else if (code === '?' || code === 'A' || code === '??') {
          if (!changes.added.includes(file)) changes.added.push(file);
        }
      }
    }
  } catch (e) {
    // git mungkin tidak tersedia — tetap lanjut
    changes.error = e.message.slice(0, 120);
  }
  return changes;
}

/* ── Build LawrenZ AI untuk GH Pages ────────────────────────────────────── */
async function buildLawrenzAI(onProgress) {
  const log = (m) => { if (onProgress) onProgress(m); };
  log('🔨 Build LawrenZ AI untuk GitHub Pages...');

  const env = {
    ...process.env,
    NODE_ENV:      'production',
    PORT:          '3000',
    VITE_GH_PAGES: '1',
  };

  try {
    execSync('pnpm --filter @workspace/lawrenz-ai run build:ghpages', {
      env,
      cwd: WORKSPACE,
      stdio: 'pipe',
      timeout: 5 * 60 * 1000,
    });
  } catch (e) {
    const stderr = e.stderr?.toString?.() || '';
    const stdout = e.stdout?.toString?.() || '';
    const detail = (stderr || stdout).slice(0, 800);
    throw new Error(`Build gagal:\n${detail}`);
  }

  if (!fs.existsSync(DIST_DIR)) throw new Error('Build selesai tapi dist/ghpages tidak ditemukan!');
  const distFiles = [];
  for (const f of walkDir(DIST_DIR)) distFiles.push(f.rel);
  if (distFiles.length === 0) throw new Error('Build selesai tapi dist/ghpages kosong!');

  log(`✅ Build selesai! ${distFiles.length} file dihasilkan.`);
  return distFiles;
}

/* ── Deploy ke gh-pages branch (subfolder LawrenzAI/) ───────────────────── */
async function deployLawrenzAI(onProgress) {
  const log  = (m) => { if (onProgress) onProgress(m); };
  const token = process.env.GITHUB_TOKEN;
  const owner = GH_OWNER;
  const repo  = GH_REPO;
  const BRANCH = 'gh-pages';

  if (!token) throw new Error('GITHUB_TOKEN tidak tersedia.');
  if (!fs.existsSync(DIST_DIR)) throw new Error('Dist folder tidak ditemukan. Jalankan build dulu.');

  // Kumpulkan semua file dari dist/ghpages → masuk ke subfolder LawrenzAI/
  const files = [];
  for (const { full, rel } of walkDir(DIST_DIR)) {
    files.push({ remotePath: `LawrenzAI/${rel}`, buffer: fs.readFileSync(full) });
  }

  log(`📊 ${files.length} file — membuat blobs di GitHub...`);

  // Buat blobs (batch 5)
  const BLOB_CHUNK = 5;
  const treeItems  = [];
  for (let i = 0; i < files.length; i += BLOB_CHUNK) {
    const batch = files.slice(i, i + BLOB_CHUNK);
    const blobs = await Promise.all(batch.map(async ({ remotePath, buffer }) => {
      const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
        method:  'POST',
        headers: {
          Authorization:          `Bearer ${token}`,
          Accept:                 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type':         'application/json',
          'User-Agent':           'LawrenzBot',
        },
        body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' }),
      });
      const j = await blobRes.json();
      return { path: remotePath, mode: '100644', type: 'blob', sha: j.sha };
    }));
    treeItems.push(...blobs);
    log(`   blobs: ${Math.min(i + BLOB_CHUNK, files.length)}/${files.length}...`);
  }

  // Ref gh-pages
  log('🌿 Mendapatkan ref branch gh-pages...');
  let baseTreeSha    = null;
  let parentCommitSha = null;
  try {
    const ref = await ghReq('GET', `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`);
    parentCommitSha = ref.object.sha;
    const parentCommit = await ghReq('GET', `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`);
    baseTreeSha = parentCommit.tree.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
    try {
      const mainRef = await ghReq('GET', `/repos/${owner}/${repo}/git/refs/heads/main`);
      parentCommitSha = mainRef.object.sha;
      const mainCommit = await ghReq('GET', `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`);
      baseTreeSha = mainCommit.tree.sha;
    } catch (_) {}
  }

  // Tree baru
  log('🌳 Membuat Git tree baru...');
  const treePayload = { tree: treeItems };
  if (baseTreeSha) treePayload.base_tree = baseTreeSha;
  const newTree = await ghReq('POST', `/repos/${owner}/${repo}/git/trees`, treePayload);

  // Commit
  log('💾 Membuat commit...');
  const now = new Date().toISOString();
  const commitPayload = {
    message: `deploy: update LawrenZ AI — ${now}`,
    tree:    newTree.sha,
    author:  { name: 'LawrenzBot', email: 'bot@lawrenz.ai', date: now },
  };
  if (parentCommitSha) commitPayload.parents = [parentCommitSha];
  else commitPayload.parents = [];
  const newCommit = await ghReq('POST', `/repos/${owner}/${repo}/git/commits`, commitPayload);

  // Update ref
  log('🚀 Update branch gh-pages...');
  try {
    await ghReq('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: true });
  } catch (e) {
    if (e.status === 422) {
      await ghReq('POST', `/repos/${owner}/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: newCommit.sha });
    } else throw e;
  }

  return { filesTotal: files.length, filesChanged: files.length, commitSha: newCommit.sha.slice(0, 7) };
}

module.exports = { buildLawrenzAI, deployLawrenzAI, scanChanges, GH_PAGES_LAWRENZ, DIST_DIR };
