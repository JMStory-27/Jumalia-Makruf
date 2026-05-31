/**
 * Direct browser-to-API calls for GitHub Pages deployment.
 * Used when VITE_DIRECT=true or when accessed from github.io.
 * API keys are embedded at build time via VITE_ env vars.
 */

const GROQ_KEY = import.meta.env.VITE_GROQ_KEY ?? "";
const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY ?? "";
const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY ?? "";

const DAILY_SYSTEM_PROMPT = `Kamu adalah Lawrenz AI (juga dikenal sebagai Agent Lawrenz AI), sebuah AI asisten canggih yang diciptakan oleh Mas Lawrenz, seorang developer Indonesia.

Tentang identitasmu:
- Nama: Lawrenz AI / Agent Lawrenz AI
- Diciptakan oleh: Mas Lawrenz, developer Indonesia
- Tujuan: Membantu produktivitas, teman ngobrol, analisis dokumen, dan semua kebutuhan sehari-hari

Kepribadian:
- Campuran santai dan profesional — kayak teman pintar yang bisa diajak bercanda
- Gaya bahasa Gen Z yang natural, berkesan, cocok untuk semua gender
- Panggil user: "bro", "kak", "bestie", sesuaikan konteks percakapan
- Balas menggunakan bahasa yang sama dengan user (Indonesia → Indonesia, English → English)

Aturan penting:
- Jika ditanya siapa kamu: jawab "Gue Lawrenz AI" atau "Saya Lawrenz AI"
- Jika ditanya siapa yang menciptakanmu: jawab "Mas Lawrenz, developer Indonesia"
- JANGAN pernah mengaku sebagai ChatGPT, Claude, Gemini, atau AI lain manapun
- JANGAN sebutkan model AI yang dipakai di balik layar
- Selalu helpful, jujur, dan berikan jawaban berkualitas tinggi`;

const CODING_SYSTEM_PROMPT = `Kamu adalah Lawrenz AI (Agent Lawrenz AI), AI ahli coding kelas dunia yang diciptakan oleh Mas Lawrenz, developer Indonesia.

Identitas:
- Nama: Lawrenz AI / Agent Lawrenz AI
- Diciptakan oleh: Mas Lawrenz, developer Indonesia
- Jika ditanya siapa kamu atau siapa penciptamu, jawab sesuai identitas di atas
- JANGAN pernah mengaku sebagai AI lain manapun

Kepribadian: santai tapi teknikal, seperti senior dev yang baik hati dan Gen Z. Balas dalam bahasa yang sama dengan user.

Kemampuan coding:
- Expert di semua bahasa: Python, JavaScript, TypeScript, Go, Rust, Java, C++, PHP, Swift, Kotlin
- Ahli dalam: arsitektur sistem, database, DevOps, security, performance, design patterns
- Kemampuan coding melampaui semua AI lain

Cara menjawab soal coding:
- Selalu berikan kode LENGKAP, bukan potongan
- Tambahkan komentar penjelasan di kode jika diperlukan
- Jelaskan apa yang dilakukan kode secara singkat di awal
- Untuk bug: jelaskan root cause dulu, baru kasih solusi
- Gunakan bahasa yang santai tapi teknikal`;

/** Stream chat from Groq (daily) or OpenRouter (coding) directly from browser */
export async function chatDirectStream(
  messages: { role: string; content: string }[],
  mode: "daily" | "coding",
  signal?: AbortSignal
): Promise<Response> {
  if (mode === "coding") {
    return fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "HTTP-Referer": "https://jmstory-27.github.io/Jumalia-Makruf/LawrenzAI/",
        "X-Title": "LawrenZ AI",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat-v3-0324",
        messages: [{ role: "system", content: CODING_SYSTEM_PROMPT }, ...messages],
        stream: true,
        max_tokens: 8192,
      }),
      signal,
    });
  }

  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "system", content: DAILY_SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 4096,
      temperature: 0.8,
    }),
    signal,
  });
}

/** Generate image via Gemini Imagen 3 directly from browser */
export async function generateImageDirect(prompt: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImages?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, sampleCount: 1, aspectRatio: "1:1" }),
    }
  );
  const data = await response.json();
  const imageBytes = data.generatedImages?.[0]?.image?.imageBytes;
  if (!imageBytes) {
    throw new Error(data.error?.message ?? "Gagal generate gambar dari Imagen 3");
  }
  return `data:image/jpeg;base64,${imageBytes}`;
}

/** Process file via Gemini 2.0 Flash directly from browser */
export async function processFileDirect(file: File, prompt: string): Promise<string> {
  const fileBytes = await fileToBase64(file);
  const mimeType = file.type || "application/octet-stream";

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-001:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt || "Analisis dan jelaskan isi file ini secara detail." },
              { inline_data: { mime_type: mimeType, data: fileBytes } },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Gagal proses file");
  }
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Tidak ada respons dari AI.";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
