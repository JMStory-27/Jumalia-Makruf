import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Hapus sisa splash dari SW lama ────────────────────────────────────────────
const splash = document.getElementById("pre-splash");
if (splash) splash.remove();

// ── Bersihkan SW & cache versi lama (hanya di production, bukan dev) ─────────
const CURRENT_CACHE = "lawnime-v7";
const isDev = import.meta.env.DEV;

if (!isDev && "serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      const active = reg.active?.scriptURL ?? "";
      if (active && !active.includes("sw.js")) return; // bukan SW kita
      caches.keys().then(keys => {
        const hasOldCache = keys.some(k => k.startsWith("lawnime-") && k !== CURRENT_CACHE);
        if (hasOldCache) {
          reg.unregister().then(ok => {
            if (ok) {
              Promise.all(
                keys.filter(k => k !== CURRENT_CACHE).map(k => caches.delete(k))
              ).then(() => {
                window.location.reload();
              });
            }
          });
        }
      });
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
