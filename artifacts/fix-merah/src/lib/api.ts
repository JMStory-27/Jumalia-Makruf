const BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/fixmerah";

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function waitForApi(
  onStatus?: (msg: string) => void,
  maxAttempts = 12,
  intervalMs = 3000
): Promise<boolean> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await fetch("/api/healthz", { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {}
    if (i < maxAttempts) {
      onStatus?.(`⏳ API server belum ready, mencoba lagi... (${i}/${maxAttempts})`);
      await sleep(intervalMs);
    }
  }
  return false;
}

export async function addGmailAccount(data: { email: string; appPassword: string; label?: string }) {
  const res = await fetch(`${BASE}/accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
  return res.json();
}

export async function listGmailAccounts() {
  const res = await fetch(`${BASE}/accounts`);
  if (!res.ok) throw new Error("Failed to fetch accounts");
  return res.json();
}

export async function deleteGmailAccount(id: string) {
  const res = await fetch(`${BASE}/accounts/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete");
  return res.json();
}

export async function sendAppeal(data: {
  targetNumber: string;
  templateId: number;
  accountIds: string[];
  templateSubject?: string;
  templateHtml?: string;
  templateName?: string;
}) {
  const res = await fetch(`${BASE}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Failed to send");
  return res.json();
}

export async function getHistory() {
  const res = await fetch(`${BASE}/history`);
  if (!res.ok) throw new Error("Failed to fetch history");
  return res.json();
}

export async function getStats() {
  const res = await fetch(`${BASE}/stats`);
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export async function pollNow(accountId?: string) {
  const res = await fetch(`${BASE}/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(accountId ? { accountId } : {}),
  });
  if (!res.ok) throw new Error("Failed to trigger poll");
  return res.json();
}

export function createSSE(
  onLog: (log: { type: string; message: string; timestamp: string }) => void,
  onReply: (reply: unknown) => void
): () => void {
  let es: EventSource | null = null;
  let destroyed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let lastHeartbeat = Date.now();

  function connect() {
    if (destroyed) return;
    es = new EventSource(`${BASE}/stream`);

    es.addEventListener("log", (e) => {
      lastHeartbeat = Date.now();
      try { onLog(JSON.parse((e as MessageEvent).data)); } catch {}
    });

    es.addEventListener("reply", (e) => {
      lastHeartbeat = Date.now();
      try { onReply(JSON.parse((e as MessageEvent).data)); } catch {}
    });

    es.onopen = () => {
      retryCount = 0;
      lastHeartbeat = Date.now();
    };

    es.onerror = () => {
      es?.close();
      es = null;
      if (!destroyed) {
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s, max 60s
        const delay = Math.min(2000 * Math.pow(2, Math.min(retryCount, 5)), 60000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      }
    };
  }

  connect();

  // Watchdog: jika SSE diam > 2 menit, paksa reconnect
  const watchdog = setInterval(() => {
    if (destroyed) return;
    if (Date.now() - lastHeartbeat > 2 * 60_000) {
      lastHeartbeat = Date.now();
      es?.close();
      es = null;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = setTimeout(connect, 1000);
    }
  }, 30_000);

  // Keepalive: ping API setiap 30 detik agar server tidak sleep
  const keepalive = setInterval(async () => {
    if (destroyed) return;
    try { await fetch("/api/healthz", { signal: AbortSignal.timeout(5000), cache: "no-store" }); } catch {}
  }, 30_000);

  return () => {
    destroyed = true;
    if (retryTimer) clearTimeout(retryTimer);
    clearInterval(watchdog);
    clearInterval(keepalive);
    es?.close();
  };
}
