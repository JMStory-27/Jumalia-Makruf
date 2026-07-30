import { useState, useEffect, useRef } from "react";

export interface LiveStats {
  clock: string;
  date: string;
  ping: number;
  pingStatus: "excellent" | "good" | "slow";
  uptime: string;
  uptimeSeconds: number;
  tokenCount: number;
  messageCount: number;
  coreLoad: number[];
  networkBars: number;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatClock(): string {
  const now = new Date();
  return now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function formatDate(): string {
  const now = new Date();
  return now.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

function fakePing(): number {
  const base = 18;
  const jitter = Math.floor(Math.sin(Date.now() / 3000) * 12 + Math.random() * 8);
  return Math.max(8, base + jitter);
}

export function useLiveStats(messageCount: number, tokenCount: number): LiveStats {
  const startRef = useRef(Date.now());
  const [clock, setClock] = useState(formatClock);
  const [date, setDate] = useState(formatDate);
  const [ping, setPing] = useState(fakePing);
  const [uptime, setUptime] = useState("0s");
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [coreLoad, setCoreLoad] = useState([0.72, 0.45, 0.88, 0.33]);
  const [networkBars, setNetworkBars] = useState(4);

  useEffect(() => {
    const timer = setInterval(() => {
      setClock(formatClock());
      setDate(formatDate());

      const secs = Math.floor((Date.now() - startRef.current) / 1000);
      setUptimeSeconds(secs);
      setUptime(formatUptime(secs));

      setPing(fakePing());

      setCoreLoad((prev) =>
        prev.map((c) => {
          const delta = (Math.random() - 0.48) * 0.12;
          return Math.max(0.15, Math.min(0.98, c + delta));
        })
      );

      setNetworkBars(Math.random() > 0.08 ? 4 : Math.random() > 0.5 ? 3 : 2);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const pingStatus =
    ping < 25 ? "excellent" : ping < 50 ? "good" : "slow";

  return { clock, date, ping, pingStatus, uptime, uptimeSeconds, tokenCount, messageCount, coreLoad, networkBars };
}
