import { Router, Route, Switch } from "wouter";
import { Toaster } from "sonner";
import Watermark from "@/components/Watermark";
import ParticlesBackground from "@/components/ParticlesBackground";
import AmbientOrbs from "@/components/AmbientOrbs";
import HomePage from "@/pages/HomePage";
import CategoryPage from "@/pages/CategoryPage";
import DetailPage from "@/pages/DetailPage";
import WatchPage from "@/pages/WatchPage";
import SearchPage from "@/pages/SearchPage";
import WatchlistPage from "@/pages/WatchlistPage";

const BASE = (import.meta.env.BASE_URL ?? "/lawrenz-verse/").replace(/\/$/, "");

export default function App() {
  return (
    <Router base={BASE}>
      <div className="noise relative min-h-screen" style={{ background: "var(--bg)" }}>
        <AmbientOrbs />
        <ParticlesBackground />
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/category/:type" component={CategoryPage} />
          <Route path="/detail/:type/:id" component={DetailPage} />
          <Route path="/watch/:type/:id" component={WatchPage} />
          <Route path="/search" component={SearchPage} />
          <Route path="/watchlist" component={WatchlistPage} />
          <Route>
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
              <p className="text-6xl">🌸</p>
              <p style={{ color: "var(--muted)", fontFamily: "'Space Grotesk',sans-serif", fontSize: 16 }}>Halaman tidak ditemukan</p>
            </div>
          </Route>
        </Switch>
        <Watermark />
        <Toaster position="top-center" theme="dark" richColors />
      </div>
    </Router>
  );
}
