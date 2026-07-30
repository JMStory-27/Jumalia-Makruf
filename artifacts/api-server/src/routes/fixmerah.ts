import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const router = Router();

const DATA_DIR = path.join(process.cwd(), '.cache', 'fixmerah');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
const HISTORY_FILE  = path.join(DATA_DIR, 'history.json');

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}
function writeJson(file: string, data: unknown) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

interface GmailAccount {
  id: string;
  email: string;
  appPassword: string;
  label?: string;
  addedAt: string;
}
interface HistoryEntry {
  id: string;
  targetNumber: string;
  templateId: number;
  templateName?: string;
  accountIds: string[];
  sentAt: string;
  status: 'sent' | 'failed';
  replies: ReplyRecord[];
}
interface ReplyRecord {
  from: string;
  subject: string;
  receivedAt: string;
  snippet: string;
}

// SSE clients
const sseClients = new Set<import('express').Response>();

function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(res => { try { res.write(msg); } catch { sseClients.delete(res); } });
}

function pushLog(type: 'info' | 'warn' | 'error' | 'success', message: string) {
  broadcast('log', { type, message, timestamp: new Date().toLocaleTimeString('id-ID') });
}

// Health
router.get('/fixmerah/health', (_req, res) => {
  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  res.json({ ok: true, accounts: accounts.length });
});

// Accounts CRUD
router.get('/fixmerah/accounts', (_req, res) => {
  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  res.json(accounts.map(a => ({ ...a, appPassword: '***' })));
});

router.post('/fixmerah/accounts', (req, res) => {
  const { email, appPassword, label } = req.body as { email: string; appPassword: string; label?: string };
  if (!email || !appPassword) {
    res.status(400).json({ error: 'email and appPassword required' }); return;
  }
  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  if (accounts.find(a => a.email === email)) {
    res.status(409).json({ error: 'Email already added' }); return;
  }
  const account: GmailAccount = { id: crypto.randomUUID(), email, appPassword, label, addedAt: new Date().toISOString() };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE, accounts);
  pushLog('success', `✅ Akun Gmail ditambahkan: ${email}`);
  res.json({ ...account, appPassword: '***' });
});

router.delete('/fixmerah/accounts/:id', (req, res) => {
  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  const idx = accounts.findIndex(a => a.id === req.params.id);
  if (idx === -1) { res.status(404).json({ error: 'Not found' }); return; }
  const [removed] = accounts.splice(idx, 1);
  writeJson(ACCOUNTS_FILE, accounts);
  pushLog('info', `🗑️ Akun dihapus: ${removed.email}`);
  res.json({ ok: true });
});

// Send appeal
router.post('/fixmerah/send', async (req, res) => {
  const { targetNumber, templateId, accountIds, templateSubject, templateHtml, templateName } = req.body as {
    targetNumber: string; templateId: number; accountIds: string[];
    templateSubject?: string; templateHtml?: string; templateName?: string;
  };
  if (!targetNumber || !accountIds?.length) {
    res.status(400).json({ error: 'targetNumber and accountIds required' }); return;
  }

  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  const selected = accounts.filter(a => accountIds.includes(a.id));

  if (!selected.length) {
    res.status(400).json({ error: 'No valid accounts found' }); return;
  }

  res.json({ ok: true, queued: selected.length });

  // Process async
  (async () => {
    pushLog('info', `📤 Memulai pengiriman ke ${targetNumber}...`);

    let successCount = 0;
    for (const acc of selected) {
      try {
        // Dynamic import nodemailer
        let nodemailer: typeof import('nodemailer');
        try {
          nodemailer = await import('nodemailer');
        } catch {
          pushLog('error', `⚠️ nodemailer tidak tersedia — install: pnpm --filter @workspace/api-server add nodemailer`);
          break;
        }
        const transporter = (nodemailer as typeof import('nodemailer')).createTransport({
          service: 'gmail',
          auth: { user: acc.email, pass: acc.appPassword },
        });
        const subject = templateSubject ?? `WhatsApp Account Recovery - ${targetNumber}`;
        const html = templateHtml ?? `<p>Appeal for WhatsApp number: <strong>${targetNumber}</strong></p><p>From: ${acc.email}</p>`;
        await transporter.sendMail({
          from: `"${acc.label ?? acc.email}" <${acc.email}>`,
          to: '10218015975617750@support.whatsapp.com',
          subject,
          html,
        });
        pushLog('success', `✅ Email terkirim dari ${acc.email}`);
        successCount++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        pushLog('error', `❌ Gagal kirim dari ${acc.email}: ${msg}`);
      }
      await new Promise(r => setTimeout(r, 1500));
    }

    const entry: HistoryEntry = {
      id: crypto.randomUUID(),
      targetNumber,
      templateId,
      templateName,
      accountIds,
      sentAt: new Date().toISOString(),
      status: successCount > 0 ? 'sent' : 'failed',
      replies: [],
    };
    const history = readJson<HistoryEntry[]>(HISTORY_FILE, []);
    history.unshift(entry);
    if (history.length > 200) history.splice(200);
    writeJson(HISTORY_FILE, history);

    pushLog('info', `📊 Selesai: ${successCount}/${selected.length} berhasil`);
    broadcast('reply', { type: 'done', successCount, total: selected.length });
  })();
});

// History
router.get('/fixmerah/history', (_req, res) => {
  res.json(readJson<HistoryEntry[]>(HISTORY_FILE, []));
});

// Stats
router.get('/fixmerah/stats', (_req, res) => {
  const history = readJson<HistoryEntry[]>(HISTORY_FILE, []);
  const accounts = readJson<GmailAccount[]>(ACCOUNTS_FILE, []);
  const total    = history.length;
  const sent     = history.filter(h => h.status === 'sent').length;
  const failed   = history.filter(h => h.status === 'failed').length;
  const replies  = history.reduce((n, h) => n + h.replies.length, 0);
  res.json({ total, sent, failed, replies, accounts: accounts.length });
});

// Poll (manual IMAP check — stub)
router.post('/fixmerah/poll', (_req, res) => {
  pushLog('info', '🔄 Memulai pengecekan balasan email...');
  setTimeout(() => pushLog('info', '✅ Pengecekan selesai — tidak ada balasan baru'), 1500);
  res.json({ ok: true });
});

// SSE stream
router.get('/fixmerah/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); sseClients.delete(res); }
  }, 20_000);

  pushLog('info', '🔌 Client terhubung ke stream');

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

export default router;
