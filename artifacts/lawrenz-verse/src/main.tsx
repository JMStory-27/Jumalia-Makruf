import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App";

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  },
});

const el = document.getElementById("root");
if (!el) throw new Error("Root element not found");
createRoot(el).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
