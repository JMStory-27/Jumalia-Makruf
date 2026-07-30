const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

export interface AnimeAIContext {
  title: string;
  synopsis?: string;
  genres?: string[];
  studios?: string;
  status?: string;
  episodes?: string;
  score?: string | number;
  aired?: string;
  staff?: { role: string; name: string }[];
  characters?: { name: string; role?: string }[];
  /** Episode yang sedang ditonton user (khusus halaman watch) */
  currentEpisode?: string;
}

export interface AIChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askAboutAnime(
  question: string,
  context: AnimeAIContext,
  history: AIChatMessage[] = [],
): Promise<{ answer: string; provider: string }> {
  const res = await fetch(`${BASE_URL}/ai/ask-anime`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, context, history }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `AI HTTP ${res.status}`);
  return body;
}

export type AdminAssistMode = "fix-synopsis" | "analyze-report" | "custom";

export async function adminAIAssist(
  mode: AdminAssistMode,
  payload: Record<string, unknown>,
): Promise<{ result: string; provider: string }> {
  const res = await fetch(`${BASE_URL}/ai/admin-assist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, payload }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `AI HTTP ${res.status}`);
  return body;
}
