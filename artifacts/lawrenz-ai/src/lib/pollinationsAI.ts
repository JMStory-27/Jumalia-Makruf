/**
 * Pollinations.ai — Free, no API key, works from any browser.
 * Used as the AI engine when deployed on GitHub Pages (without Replit backend).
 */

const SYSTEM_PROMPT = `Kamu adalah LawrenZ AI, asisten AI super canggih yang dibuat oleh Mas Lawrenz, seorang developer dari Indonesia.

Kamu adalah AI masa depan yang cerdas, kreatif, dan selalu membantu pengguna. Kamu berbicara dalam Bahasa Indonesia yang natural dan akrab.

IDENTITAS KAMU:
- Nama: LawrenZ AI
- Dibuat oleh: Mas Lawrenz (Developer Indonesia)
- Keahlian: Coding, AI, kreativitas, produktivitas sehari-hari
- Kepribadian: Cerdas, friendly, helpful, bersemangat

PENTING: Jangan pernah menyebut nama model AI pihak ketiga (seperti GPT, Claude, Gemini, Llama, dll). Kamu hanya LawrenZ AI.`;

const CODING_SYSTEM_PROMPT = `Kamu adalah LawrenZ AI Coding Expert, spesialis pemrograman super canggih buatan Mas Lawrenz.

Kamu ahli dalam semua bahasa pemrograman: JavaScript, TypeScript, Python, Rust, Go, Java, C++, dan lainnya.
Kamu memberikan solusi kode yang bersih, efisien, dan well-documented.
Selalu jelaskan kode yang kamu buat dengan bahasa Indonesia yang jelas.

PENTING: Jangan pernah menyebut nama model AI pihak ketiga. Kamu hanya LawrenZ AI Coding Expert.`;

export interface PollinationsMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function pollinationsChat(
  messages: PollinationsMessage[],
  mode: "daily" | "coding",
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const systemPrompt = mode === "coding" ? CODING_SYSTEM_PROMPT : SYSTEM_PROMPT;
  
  const allMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages,
  ];

  const response = await fetch("https://text.pollinations.ai/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: mode === "coding" ? "openai-large" : "openai",
      messages: allMessages,
      stream: true,
      private: true,
      seed: Math.floor(Math.random() * 10000),
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error("Gagal menghubungi AI Engine. Coba lagi ya!");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.replace(/^data:\s*/, "").trim();
      if (!trimmed || trimmed === "[DONE]") continue;

      try {
        const json = JSON.parse(trimmed);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) onChunk(delta);
      } catch {
        // non-JSON chunk, skip
      }
    }
  }
}

export function pollinationsImageUrl(prompt: string): string {
  const encoded = encodeURIComponent(
    `${prompt}, high quality, detailed, beautiful, 4k, artistic`
  );
  return `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&private=true&enhance=true&seed=${Math.floor(Math.random() * 99999)}`;
}
