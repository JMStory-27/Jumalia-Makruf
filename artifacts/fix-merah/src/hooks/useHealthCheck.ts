import { useState, useEffect } from "react";

export type HealthStatus = "ok" | "error" | "checking";

export interface Health {
  smtp: HealthStatus;
  imap: HealthStatus;
  db: HealthStatus;
  ts: number;
}

const INITIAL: Health = { smtp: "checking", imap: "checking", db: "checking", ts: 0 };

export function useHealthCheck(intervalMs = 15_000) {
  const [health, setHealth] = useState<Health>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    let failCount = 0;

    async function ping() {
      try {
        const res = await fetch("/api/fixmerah/health", {
          signal: AbortSignal.timeout(9000),
          cache: "no-store",
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as Health;
          failCount = 0;
          setHealth(data);
        } else if (!cancelled) {
          failCount++;
          setHealth({ smtp: "error", imap: "error", db: "error", ts: Date.now() });
        }
      } catch {
        if (!cancelled) {
          failCount++;
          setHealth({ smtp: "error", imap: "error", db: "error", ts: Date.now() });
        }
      }
    }

    void ping();

    // Interval adaptif: makin sering jika ada error, normal jika ok
    let id: ReturnType<typeof setInterval>;
    function schedule() {
      const interval = failCount > 0 ? Math.min(5000, intervalMs) : intervalMs;
      id = setInterval(() => {
        void ping();
        clearInterval(id);
        if (!cancelled) schedule();
      }, interval);
    }
    schedule();

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [intervalMs]);

  return health;
}
