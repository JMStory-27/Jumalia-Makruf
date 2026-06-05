import { Router } from "express";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { EventEmitter } from "events";
import type { Request, Response } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "..", "..", "data", "fixmerah");
const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
const HISTORY_FILE = path.join(DATA_DIR, "history.json");

const TEMPLATE_SUBJECTS: Record<number, string> = {
  1: "Official Account Appeal — Login Unavailable Issue | {nomor}",
  2: "URGENT: Technical Account Block — Full Diagnostic Evidence | {nomor}",
  3: "Permohonan Tulus — Akun WhatsApp Saya Satu-satunya Penghubung dengan Keluarga | {nomor}",
  4: "FORMAL NOTICE: Account Suspension Without Cause — Consumer Rights Violation | {nomor}",
  5: "FINAL ESCALATION — IMMEDIATE ACTION REQUIRED — {nomor} | Wrongful Account Block",
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T = unknown>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const logEmitter = new EventEmitter();
logEmitter.setMaxListeners(100);

function emitLog(type: string, message: string) {
  logEmitter.emit("log", { type, message, timestamp: new Date().toISOString() });
}

const router = Router();

router.get("/accounts", (_req, res) => {
  const accounts = (readJson<any[]>(ACCOUNTS_FILE, [])).map(
    ({ appPassword: _pw, ...rest }: any) => rest
  );
  res.json(accounts);
});

router.post("/accounts", async (req: Request, res: Response) => {
  const { email, appPassword, label } = req.body as {
    email: string;
    appPassword: string;
    label?: string;
  };

  if (!email || !appPassword) {
    return void res.status(400).json({ error: "email dan appPassword wajib diisi" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: email, pass: appPassword.replace(/\s+/g, "") },
      tls: { rejectUnauthorized: false },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
    });
    await transporter.verify();
  } catch (e: any) {
    return void res.status(400).json({ error: `Verifikasi SMTP gagal: ${e.message}` });
  }

  const accounts = readJson<any[]>(ACCOUNTS_FILE, []);
  if (accounts.find((a: any) => a.email === email)) {
    return void res.status(409).json({ error: "Email sudah terdaftar" });
  }

  const now = new Date().toISOString();
  const account = {
    id: crypto.randomUUID(),
    email,
    appPassword: appPassword.replace(/\s+/g, ""),
    label: label || email.split("@")[0],
    createdAt: now,
    lastVerified: now,
  };
  accounts.push(account);
  writeJson(ACCOUNTS_FILE, accounts);

  const { appPassword: _pw, ...safe } = account;
  res.json(safe);
});

router.delete("/accounts/:id", (req, res) => {
  const accounts = readJson<any[]>(ACCOUNTS_FILE, []).filter(
    (a: any) => a.id !== req.params.id
  );
  writeJson(ACCOUNTS_FILE, accounts);
  res.json({ ok: true });
});

router.post("/send", async (req: Request, res: Response) => {
  const {
    targetNumber,
    templateId,
    accountIds,
    templateSubject,
    templateHtml,
    templateName,
  } = req.body as {
    targetNumber: string;
    templateId: number;
    accountIds: string[];
    templateSubject?: string;
    templateHtml?: string;
    templateName?: string;
  };

  if (!targetNumber || !templateId || !Array.isArray(accountIds) || accountIds.length === 0) {
    return void res.status(400).json({ error: "Data tidak lengkap" });
  }

  const allAccounts = readJson<any[]>(ACCOUNTS_FILE, []);
  const selected = allAccounts.filter((a: any) => accountIds.includes(a.id));
  if (!selected.length) {
    return void res.status(400).json({ error: "Akun tidak ditemukan" });
  }

  const cleanNumber = targetNumber.replace(/\D/g, "");
  const today = new Date().toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const subjectTemplate =
    templateSubject ||
    TEMPLATE_SUBJECTS[templateId] ||
    `WhatsApp Account Appeal | +${cleanNumber}`;

  const subject = subjectTemplate
    .replace(/\{nomor\}/g, `+${cleanNumber}`)
    .replace(/\{tanggal\}/g, today);

  const results: Array<{ email: string; success: boolean; error?: string }> = [];

  for (const account of selected) {
    try {
      emitLog("INFO", `📡 Memverifikasi SMTP: ${account.email}...`);

      const transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { user: account.email, pass: account.appPassword },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 20000,
        greetingTimeout: 15000,
      });

      emitLog("INFO", `📨 Step 3: Gmail`);
      emitLog("INFO", `📤 Step 4: Kirim`);

      const mailOptions: nodemailer.SendMailOptions = {
        from: `"WA Appeal" <${account.email}>`,
        to: "support@support.whatsapp.com",
        subject,
      };

      if (templateHtml) {
        mailOptions.html = templateHtml
          .replace(/\{nomor\}/g, `+${cleanNumber}`)
          .replace(/\{tanggal\}/g, today);
        mailOptions.text = `WhatsApp Account Appeal\n\nPhone: +${cleanNumber}\nTemplate: ${templateName || templateId}\n\nSent via Fix Merah v2.0`;
      } else {
        mailOptions.text =
          `Dear WhatsApp Support Team,\n\nI am writing to formally request the restoration of my WhatsApp account associated with the phone number: +${cleanNumber}.\n\nMy account has been restricted and I believe this was done in error. I have always complied with WhatsApp's Terms of Service and Community Guidelines, and I have never engaged in any activity that violates your policies.\n\nI kindly request you to review my case and restore access to my account at your earliest convenience.\n\nThank you for your time and understanding.\n\nSincerely,\nAccount Owner (+${cleanNumber})`;
      }

      await transporter.sendMail(mailOptions);
      emitLog("SUCCESS", `✅ Terkirim dari ${account.email}`);
      results.push({ email: account.email, success: true });
    } catch (e: any) {
      const errMsg = (e.message ?? "Unknown error").slice(0, 300);
      emitLog("FAIL", `❌ Gagal: ${errMsg}`);
      results.push({ email: account.email, success: false, error: errMsg });
    }
  }

  const history = readJson<any[]>(HISTORY_FILE, []);
  history.unshift({
    id: crypto.randomUUID(),
    targetNumber: `+${cleanNumber}`,
    templateId,
    templateName: templateName || `Template #${templateId}`,
    gmailAccounts: selected.map((a: any) => a.email),
    sentAt: new Date().toISOString(),
    status: results.every((r) => r.success)
      ? "sent"
      : results.some((r) => r.success)
      ? "partial"
      : "failed",
    results,
    replies: [],
  });
  writeJson(HISTORY_FILE, history.slice(0, 500));

  const successCount = results.filter((r) => r.success).length;
  emitLog("SYS", `📊 Selesai: ${successCount}/${results.length} berhasil`);

  res.json({ results, success: successCount > 0 });
});

router.get("/history", (_req, res) => {
  res.json(readJson<any[]>(HISTORY_FILE, []).slice(0, 50));
});

router.get("/stats", (_req, res) => {
  const history = readJson<any[]>(HISTORY_FILE, []);
  const accounts = readJson<any[]>(ACCOUNTS_FILE, []);
  const totalSent = history.length;
  const success = history.filter((h: any) => h.status === "sent").length;
  const totalReplied = history.reduce(
    (acc: number, h: any) => acc + (h.replies?.length ?? 0),
    0
  );
  res.json({
    totalSent,
    totalReplied,
    successRate: totalSent > 0 ? Math.round((success / totalSent) * 100) : 0,
    avgReplyTime: 0,
    accounts: accounts.length,
    success,
    failed: totalSent - success,
  });
});

router.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  res.write(":ok\n\n");

  const onLog = (log: unknown) => {
    res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
  };

  const heartbeat = setInterval(() => {
    res.write(":heartbeat\n\n");
  }, 15000);

  logEmitter.on("log", onLog);

  req.on("close", () => {
    logEmitter.off("log", onLog);
    clearInterval(heartbeat);
  });
});

export default router;
