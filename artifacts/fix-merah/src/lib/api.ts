const BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api/fixmerah";

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

export function createSSE(
  onLog: (log: { type: string; message: string; timestamp: string }) => void,
  onReply: (reply: unknown) => void
): () => void {
  const es = new EventSource(`${BASE}/stream`);

  es.addEventListener("log", (e) => {
    try {
      onLog(JSON.parse((e as MessageEvent).data));
    } catch {}
  });

  es.addEventListener("reply", (e) => {
    try {
      onReply(JSON.parse((e as MessageEvent).data));
    } catch {}
  });

  es.onerror = () => {
    setTimeout(() => es.close(), 3000);
  };

  return () => es.close();
}
