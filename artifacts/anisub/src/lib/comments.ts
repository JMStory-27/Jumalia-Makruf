const DB_URL = (import.meta.env.VITE_FIREBASE_DATABASE_URL as string) || "";

export interface Comment {
  id: string;
  name: string;
  text: string;
  ts: number;
}

export async function fetchComments(animeId: string): Promise<Comment[]> {
  if (!DB_URL) return [];
  try {
    const safe = encodeURIComponent(animeId.replace(/\./g, "_"));
    const res = await fetch(`${DB_URL}/lawnime-comments/${safe}.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || typeof data !== "object") return [];
    return Object.entries(data)
      .map(([id, v]: [string, unknown]) => ({ id, ...(v as Omit<Comment, "id">) }))
      .sort((a, b) => b.ts - a.ts);
  } catch {
    return [];
  }
}

export async function postComment(
  animeId: string,
  name: string,
  text: string
): Promise<boolean> {
  if (!DB_URL) return false;
  try {
    const safe = encodeURIComponent(animeId.replace(/\./g, "_"));
    const res = await fetch(`${DB_URL}/lawnime-comments/${safe}.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim().slice(0, 40), text: text.trim().slice(0, 500), ts: Date.now() }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function hasFirebase(): boolean {
  return !!DB_URL;
}
