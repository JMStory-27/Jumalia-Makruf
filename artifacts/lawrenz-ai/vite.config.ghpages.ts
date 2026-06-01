import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// GitHub Pages build config
// Base path: /Jumalia-Makruf/LawrenzAI/
// AI: Pollinations.ai (no API key, works from browser)
export default defineConfig({
  base: "/Jumalia-Makruf/LawrenzAI/",
  define: {
    "import.meta.env.VITE_GH_PAGES": JSON.stringify("1"),
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
          markdown: ["react-markdown"],
          syntax: ["react-syntax-highlighter"],
        },
      },
    },
  },
});
