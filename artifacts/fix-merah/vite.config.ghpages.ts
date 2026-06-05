import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// GitHub Pages build config — base path: /Jumalia-Makruf/FixMerah/
// API is served by Replit deployed instance (always-on)
// Override via VITE_API_BASE_URL env var when deploying to a custom backend
const REPLIT_DOMAIN =
  process.env.VITE_API_BASE_URL ||
  (() => {
    const domains = process.env.REPLIT_DOMAINS ?? "";
    const dev = process.env.REPLIT_DEV_DOMAIN ?? "";
    const domain = (domains.split(",")[0] ?? dev).trim();
    return domain
      ? `https://${domain}/api/fixmerah`
      : "https://4bf0916f-a624-4bfa-85af-3126726867aa-00-13lttpbjhtmu0.pike.replit.dev/api/fixmerah";
  })();

export default defineConfig({
  base: "/Jumalia-Makruf/FixMerah/",
  define: {
    "import.meta.env.VITE_GH_PAGES": JSON.stringify("1"),
    "import.meta.env.VITE_API_BASE": JSON.stringify(REPLIT_DOMAIN),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/ghpages"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          ui: ["framer-motion", "lucide-react"],
        },
      },
    },
  },
});
