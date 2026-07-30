import { Switch, Route, Router as WouterRouter } from "wouter";
import Chat from "@/pages/Chat";

function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#04040e",
        color: "rgba(0,212,255,0.6)",
        fontSize: 14,
      }}
    >
      404 — Halaman tidak ditemukan
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Chat} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <Router />
    </WouterRouter>
  );
}
