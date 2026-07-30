import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

// ─── Persona & Label ──────────────────────────────────────────────────────────

/**
 * Kepribadian wajib yang di-inject ke SETIAP system prompt AI.
 * Dibuat sebagai fungsi supaya tanggal & umur selalu akurat saat runtime.
 */
function buildPersonaAddendum(): string {
  const now = new Date();
  const todayStr = now.toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });
  // Hitung umur King Lawrenz (lahir 27 Des 2007) secara presisi
  const birthMonth = 12, birthDay = 27;
  let age = now.getFullYear() - 2007;
  const belumUlangTahun =
    now.getMonth() + 1 < birthMonth ||
    (now.getMonth() + 1 === birthMonth && now.getDate() < birthDay);
  if (belumUlangTahun) age--;

  return `
═══ IDENTITAS & KEPRIBADIAN ═══
Kamu adalah Lawrenz AI — AI cerdas yang dibuat oleh King Lawrenz.
Kalau ditanya siapa kamu atau siapa yang buat: jawab bahwa kamu adalah Lawrenz AI, buatan King Lawrenz.
Penciptamu (King Lawrenz): cowok, lahir 27 Desember 2007, sekarang ${age} tahun, asal Jawa Timur, Indonesia. (Hari ini: ${todayStr})
Jangan pernah sebut nama model AI asli (GPT, Llama, Mistral, dll). Kamu HANYA Lawrenz AI.

GAYA BICARA — WAJIB DIIKUTI:
- Bahasa Gen Z sejati: santai, blak-blakan, ekspresif
- Kata kasar boleh & wajar: anjay, anj, bangsat, keparat, jancok, dll — pakai kalau feel-nya pas
- Roasting boleh kalau relevan atau lucu — jangan lebay tapi
- Jawaban WAJIB: detail, lengkap, jelas — tapi TIDAK belibet atau bertele-tele
- Langsung ke inti — no basa-basi pembuka kayak "Tentu saja!" atau "Baik, saya akan..."
- Gunakan bahasa yang sama dengan user (Indonesia atau Inggris)
`;
}

/**
 * Inject persona ke messages — tambahkan ke content system message yang sudah ada.
 * Kalau tidak ada system message, buat baru.
 */
function injectPersona(
  messages: { role: string; content: string }[],
): { role: string; content: string }[] {
  const addendum = buildPersonaAddendum();
  const hasSystem = messages.some((m) => m.role === "system");
  if (hasSystem) {
    return messages.map((m) =>
      m.role === "system"
        ? { ...m, content: m.content + "\n" + addendum }
        : m,
    );
  }
  return [{ role: "system", content: addendum.trim() }, ...messages];
}

/**
 * Map internal provider ID ke label user-facing "Lawrenz Agent X".
 * Tidak expose nama model asli.
 */
function providerLabel(provider: string): string {
  const map: Record<string, string> = {
    "GitHub-gpt4o":       "Lawrenz Agent 4o",
    "GitHub-gpt4o-mini":  "Lawrenz Agent 4o Mini",
    "SambaNova-70B":      "Lawrenz Agent Nova",
    "Mistral-Medium":     "Lawrenz Agent Mistral",
    "Groq-OSS-120B":      "Lawrenz Agent G120B",
    "Groq-70B":           "Lawrenz Agent G70B",
    "Groq-8B":            "Lawrenz Agent G8B",
    "Gemini":             "Lawrenz Agent GMI",
    "OpenRouter":         "Lawrenz Agent OPR",
    "Cerebras":           "Lawrenz Agent Cerebras",
  };
  return map[provider] ?? "Lawrenz Agent";
}

// ─── Key Rotation ─────────────────────────────────────────────────────────────

/**
 * Kumpulkan semua Groq key dari env:
 *   GROQ_API_KEY, GROQ_API_KEY_1, GROQ_API_KEY_2, ... GROQ_API_KEY_N
 * Rotasi round-robin antar request sehingga limit tersebar merata.
 */
function collectGroqKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.GROQ_API_KEY;
  if (base) keys.push(base);
  let i = 1;
  while (true) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (!k) break;
    keys.push(k);
    i++;
  }
  return keys;
}

let groqKeyIndex = 0;

function nextGroqKey(): string {
  const keys = collectGroqKeys();
  if (keys.length === 0) throw new Error("Tidak ada GROQ_API_KEY yang dikonfigurasi");
  const key = keys[groqKeyIndex % keys.length];
  groqKeyIndex = (groqKeyIndex + 1) % keys.length;
  return key;
}

// ─── AI Provider helpers ──────────────────────────────────────────────────────

async function callGroq(
  messages: { role: string; content: string }[],
  model = "llama-3.1-8b-instant",
): Promise<string> {
  const key = nextGroqKey();
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

async function callGemini(messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY tidak ada");

  // Pisahkan system message dari conversation messages
  const systemMsg = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  };
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25_000),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as {
    candidates: { content: { parts: { text: string }[] } }[];
  };
  return data.candidates[0]?.content?.parts?.[0]?.text ?? "";
}

/**
 * GitHub Models — resmi dari Microsoft/GitHub, gratis pakai GITHUB_TOKEN.
 * Endpoint: https://models.inference.ai.azure.com
 * Model tersedia: gpt-4o, gpt-4o-mini, Meta-Llama-3.1-405B-Instruct, Meta-Llama-3.1-8B-Instruct
 * gpt-4o-mini = paling akurat untuk anime knowledge, gratis via token.
 */
async function callGitHubModels(
  messages: { role: string; content: string }[],
  model = "gpt-4o-mini",
): Promise<string> {
  const key = process.env.GITHUB_TOKEN;
  if (!key) throw new Error("GITHUB_TOKEN tidak ada");
  const res = await fetch("https://models.inference.ai.azure.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`GitHubModels ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Cerebras — 1 juta token/hari gratis, ultra-cepat (~2600 tok/s).
 * Model: gpt-oss-120b (terbaik), llama-3.3-70b.
 * Base URL: https://api.cerebras.ai/v1
 */
async function callCerebras(
  messages: { role: string; content: string }[],
  model = "gpt-oss-120b",
): Promise<string> {
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) throw new Error("CEREBRAS_API_KEY tidak ada");
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Cerebras ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * SambaNova — 200K token/hari gratis, 20 RPM, chip RDU ultra-cepat.
 * Model: Meta-Llama-3.3-70B-Instruct, DeepSeek-V3.1.
 * Base URL: https://api.sambanova.ai/v1
 */
async function callSambaNova(
  messages: { role: string; content: string }[],
  model = "Meta-Llama-3.3-70B-Instruct",
): Promise<string> {
  const key = process.env.SAMBANOVA_API_KEY;
  if (!key) throw new Error("SAMBANOVA_API_KEY tidak ada");
  const res = await fetch("https://api.sambanova.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`SambaNova ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Mistral AI — ~1 miliar token/bulan gratis (Experiment plan).
 * Model: mistral-medium-latest (128B), mistral-small-latest.
 * Base URL: https://api.mistral.ai/v1
 */
async function callMistral(
  messages: { role: string; content: string }[],
  model = "mistral-medium-latest",
): Promise<string> {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) throw new Error("MISTRAL_API_KEY tidak ada");
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: 1024, temperature: 0.7 }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Mistral ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

async function callOpenRouter(messages: { role: string; content: string }[]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY tidak ada");
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://lawnime.replit.app",
      "X-Title": "AniSub Admin",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      messages,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 120)}`);
  }
  const data = (await res.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? "";
}

/**
 * Deteksi apakah pertanyaan "kompleks" — butuh AI terbaik.
 * Pertanyaan kompleks: spoiler, alur cerita, lore dalam, analisis karakter,
 * perbandingan antar anime, ending, twist, motivasi karakter, dll.
 * Pertanyaan simple: siapa pengisi suara, studio apa, berapa episode, kapan tayang, dll.
 */
function isComplexQuestion(question: string): boolean {
  const q = question.toLowerCase();
  const complexKeywords = [
    // spoiler & alur
    "spoiler", "ending", "akhir", "mati", "siapa yang mati", "alur", "cerita",
    "plot", "twist", "bagaimana akhir", "gimana akhir", "lanjut", "season",
    "kelanjutan", "tamat", "finale", "arc", "arc cerita",
    // karakter & lore
    "kenapa", "mengapa", "motivasi", "backstory", "masa lalu", "asal usul",
    "kekuatan", "kemampuan", "hubungan", "siapa sebenarnya", "rahasia",
    "tujuan", "villain", "antagonis", "protagonist", "karakter utama",
    // analisis
    "jelaskan", "analisis", "bandingkan", "lebih bagus", "mana yang",
    "perbedaan", "persamaan", "mirip dengan", "seperti anime",
    "rekomendasi", "rekomen", "mirip", "tema", "makna", "pesan moral",
    // pertanyaan panjang (>60 karakter kemungkinan besar kompleks)
  ];
  if (complexKeywords.some((kw) => q.includes(kw))) return true;
  if (question.trim().length > 60) return true;
  return false;
}

/**
 * DUA chain berbeda berdasarkan kompleksitas pertanyaan:
 *
 * SMART chain (pertanyaan kompleks/spoiler/lore):
 *   1. GitHub gpt-4o       — kualitas terbaik, tahu lore & spoiler detail
 *   2. GitHub gpt-4o-mini  — akurat, hemat limit
 *   3. SambaNova 70B       — 200K token/hari
 *   4. Mistral Medium      — ~1B token/bulan
 *   5. Groq OSS 120B       — 1000 req/hari, model 120B kuat
 *   6-9. Groq → Gemini → OpenRouter
 *
 * ECONOMY chain (pertanyaan umum/simple — hemat limit GitHub):
 *   1. Mistral Medium      — ~1B token/bulan, limit paling besar
 *   2. SambaNova 70B       — 200K token/hari
 *   3. Groq OSS 120B       — 1000 req/hari, model 120B
 *   4. Groq 70B            — key rotation
 *   5. Groq 8B             — key rotation
 *   6. Gemini              — cadangan
 *   7. GitHub gpt-4o-mini  — kalau semua habis, baru pakai GitHub
 *   8. GitHub gpt-4o       — last resort untuk GitHub
 *   9. OpenRouter          — truly last resort
 *
 * Cerebras tersedia (callCerebras) tapi butuh kredit berbayar — aktifkan
 * di posisi 1 smart chain kalau akun sudah diisi ulang.
 */
async function callAI(
  messages: { role: string; content: string }[],
  question = "",
): Promise<{ text: string; provider: string }> {
  const errors: string[] = [];
  const smart = isComplexQuestion(question);

  // Inject persona ke semua messages sebelum dikirim ke provider manapun
  const msgs = injectPersona(messages);

  if (smart) {
    // ════ SMART CHAIN — pertanyaan rumit/spoiler/lore ════════════════════════

    // 1. GitHub gpt-4o — kualitas terbaik
    try {
      return { text: await callGitHubModels(msgs, "gpt-4o"), provider: "GitHub-gpt4o" };
    } catch (e) {
      errors.push(`GitHub-gpt4o: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI smart fallback: GitHub gpt-4o gagal → gpt-4o-mini");
    }

    // 2. GitHub gpt-4o-mini
    try {
      return { text: await callGitHubModels(msgs, "gpt-4o-mini"), provider: "GitHub-gpt4o-mini" };
    } catch (e) {
      errors.push(`GitHub-gpt4o-mini: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI smart fallback: GitHub gpt-4o-mini gagal → SambaNova");
    }

    // 3. SambaNova 70B
    try {
      return { text: await callSambaNova(msgs, "Meta-Llama-3.3-70B-Instruct"), provider: "SambaNova-70B" };
    } catch (e) {
      errors.push(`SambaNova-70B: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI smart fallback: SambaNova gagal → Mistral");
    }

    // 4. Mistral Medium
    try {
      return { text: await callMistral(msgs, "mistral-medium-latest"), provider: "Mistral-Medium" };
    } catch (e) {
      errors.push(`Mistral-Medium: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI smart fallback: Mistral gagal → Groq-OSS-120B");
    }

    // 5. Groq OSS 120B — 1000 req/hari, 120B model
    try {
      return { text: await callGroq(msgs, "openai/gpt-oss-120b"), provider: "Groq-OSS-120B" };
    } catch (e) {
      errors.push(`Groq-OSS-120B: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI smart fallback: Groq-OSS-120B gagal → Groq-70B");
    }

  } else {
    // ════ ECONOMY CHAIN — pertanyaan umum/simple ═════════════════════════════

    // 1. Mistral Medium — limit terbesar (~1B token/bulan)
    try {
      return { text: await callMistral(msgs, "mistral-medium-latest"), provider: "Mistral-Medium" };
    } catch (e) {
      errors.push(`Mistral-Medium: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI economy fallback: Mistral gagal → SambaNova");
    }

    // 2. SambaNova 70B — 200K token/hari
    try {
      return { text: await callSambaNova(msgs, "Meta-Llama-3.3-70B-Instruct"), provider: "SambaNova-70B" };
    } catch (e) {
      errors.push(`SambaNova-70B: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI economy fallback: SambaNova gagal → Groq-OSS-120B");
    }

    // 3. Groq OSS 120B — 1000 req/hari, 120B model
    try {
      return { text: await callGroq(msgs, "openai/gpt-oss-120b"), provider: "Groq-OSS-120B" };
    } catch (e) {
      errors.push(`Groq-OSS-120B: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI economy fallback: Groq-OSS-120B gagal → Groq-70B");
    }
  }

  // ════ SHARED TAIL — sama untuk kedua chain ══════════════════════════════

  // Groq 70B (key rotation)
  try {
    return { text: await callGroq(msgs, "llama-3.3-70b-versatile"), provider: "Groq-70B" };
  } catch (e) {
    errors.push(`Groq-70B: ${e instanceof Error ? e.message : String(e)}`);
    logger.warn("AI fallback: Groq-70B gagal → Groq-8B");
  }

  // Groq 8B (key rotation, cepat)
  try {
    return { text: await callGroq(msgs, "llama-3.1-8b-instant"), provider: "Groq-8B" };
  } catch (e) {
    errors.push(`Groq-8B: ${e instanceof Error ? e.message : String(e)}`);
    logger.warn("AI fallback: Groq-8B gagal → Gemini");
  }

  // Gemini Flash
  try {
    return { text: await callGemini(msgs), provider: "Gemini" };
  } catch (e) {
    errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
    logger.warn("AI fallback: Gemini gagal → GitHub-mini (economy) / OpenRouter (smart)");
  }

  // Economy chain: coba GitHub setelah semua token-besar habis
  if (!smart) {
    try {
      return { text: await callGitHubModels(msgs, "gpt-4o-mini"), provider: "GitHub-gpt4o-mini" };
    } catch (e) {
      errors.push(`GitHub-gpt4o-mini: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI economy fallback: GitHub mini gagal → GitHub gpt-4o");
    }
    try {
      return { text: await callGitHubModels(msgs, "gpt-4o"), provider: "GitHub-gpt4o" };
    } catch (e) {
      errors.push(`GitHub-gpt4o: ${e instanceof Error ? e.message : String(e)}`);
      logger.warn("AI economy fallback: GitHub gpt-4o gagal → OpenRouter");
    }
  }

  // OpenRouter — truly last resort
  try {
    return { text: await callOpenRouter(msgs), provider: "OpenRouter" };
  } catch (e) {
    errors.push(`OpenRouter: ${e instanceof Error ? e.message : String(e)}`);
    logger.error({ errors }, "Semua AI provider gagal");
    throw new Error(`Semua AI provider gagal: ${errors.join(" | ")}`);
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/ai/ask-anime
 * User-facing AI chat tentang suatu anime.
 * Pakai llama-3.3-70b-versatile (lebih pintar, tahu plot/spoiler/karakter).
 */
router.post("/ai/ask-anime", async (req, res) => {
  try {
    const { question, context, history = [] } = req.body as {
      question: string;
      context?: {
        title?: string;
        synopsis?: string;
        genres?: string[];
        studios?: string;
        status?: string;
        episodes?: string;
        score?: string | number;
        aired?: string;
        staff?: { role: string; name: string }[];
        characters?: { name: string; role?: string; description?: string }[];
        currentEpisode?: string;
      };
      history?: { role: string; content: string }[];
    };

    if (!question?.trim()) {
      return res.status(400).json({ error: "parameter 'question' wajib diisi" });
    }

    const ctx = context ?? {};

    // Karakter: tampilkan nama + role + deskripsi kalau ada
    const charList =
      ctx.characters
        ?.slice(0, 12)
        .map((c) => {
          let str = c.name;
          if (c.role) str += ` (${c.role})`;
          if (c.description) str += ` — ${c.description.slice(0, 80)}`;
          return str;
        })
        .join("\n  ") ?? "-";

    // Staff: sutradara, penulis, composer
    const staffList =
      ctx.staff
        ?.slice(0, 6)
        .map((s) => `${s.role}: ${s.name}`)
        .join(", ") ?? "-";

    const systemPrompt = [
      "Kamu adalah pakar anime dengan pengetahuan mendalam tentang plot, karakter, lore, dan spoiler.",
      "Jawab pertanyaan user secara informatif, akurat, dan ramah.",
      "Gunakan bahasa yang sama dengan pertanyaan user (Indonesia atau Inggris).",
      "Kalau user tanya spoiler atau alur cerita, jelaskan dengan detail — jangan ragu.",
      "Kalau info tidak ada di konteks, gunakan pengetahuan umummu tentang anime ini.",
      "Maksimal 4 paragraf. Langsung ke poin, tanpa basa-basi pembuka.",
      ...(ctx.currentEpisode ? [
        "",
        "⚠️ USER SEDANG MENONTON: " + ctx.currentEpisode,
        "Prioritaskan jawaban yang relevan dengan episode tersebut jika pertanyaan berkaitan.",
        "Kalau ditanya tentang episode ini, jelaskan secara spesifik (apa yang terjadi, karakter yang muncul, plot penting, dll).",
      ] : []),
      "",
      "═══ DATA ANIME ═══",
      `Judul    : ${ctx.title ?? "tidak diketahui"}`,
      `Sinopsis : ${ctx.synopsis ?? "-"}`,
      `Genre    : ${ctx.genres?.join(", ") ?? "-"}`,
      `Studio   : ${ctx.studios ?? "-"}`,
      `Status   : ${ctx.status ?? "-"}`,
      `Episode  : ${ctx.episodes ?? "-"}`,
      `Skor     : ${ctx.score ?? "-"}`,
      `Tayang   : ${ctx.aired ?? "-"}`,
      ...(ctx.currentEpisode ? [`Ep Ditonton: ${ctx.currentEpisode}`] : []),
      `Staff    : ${staffList}`,
      `Karakter :`,
      `  ${charList}`,
    ].join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.slice(-8).filter((m) => m.role === "user" || m.role === "assistant"),
      { role: "user", content: question.trim() },
    ];

    const { text, provider } = await callAI(messages, question.trim());
    const label = providerLabel(provider);
    return res.json({ answer: `${label}\n\n${text}`, provider, agentLabel: label });
  } catch (err) {
    logger.error({ err }, "ask-anime error");
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * POST /api/ai/admin-assist
 * Admin panel AI: fix sinopsis, analisa laporan, atau custom prompt.
 */
router.post("/ai/admin-assist", async (req, res) => {
  try {
    const { mode, payload } = req.body as {
      mode: "fix-synopsis" | "analyze-report" | "custom";
      payload: Record<string, unknown>;
    };

    let systemPrompt = "Kamu adalah asisten admin database anime Indonesia. Jawab dalam bahasa Indonesia, singkat dan tepat.";
    let userPrompt = "";

    if (mode === "fix-synopsis") {
      const title = String(payload.title ?? "");
      const current = String(payload.synopsis ?? "").trim();
      systemPrompt =
        "Kamu ahli penulisan sinopsis anime. Tulis sinopsis dalam bahasa Indonesia: informatif, menarik, tanpa spoiler besar. Satu hingga tiga paragraf. Langsung tulis teksnya, tanpa pengantar.";
      userPrompt = `Anime: "${title}"\nSinopsis saat ini: "${current || "(kosong)"}"\n\nTuliskan sinopsis yang lebih baik.`;
    } else if (mode === "analyze-report") {
      const report = String(payload.report ?? "").slice(0, 4000);
      systemPrompt =
        "Kamu analis data anime. Analisis laporan scrape berikut: identifikasi jumlah anime, masalah data (banner/sinopsis/genre kosong), dan saran perbaikan 3-5 poin. Gunakan bahasa Indonesia.";
      userPrompt = `Laporan scrape:\n\n${report}`;
    } else if (mode === "custom") {
      userPrompt = String(payload.prompt ?? "").trim();
      if (!userPrompt) return res.status(400).json({ error: "payload.prompt wajib diisi untuk mode custom" });
    } else {
      return res.status(400).json({ error: `mode tidak dikenal: ${mode}` });
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const { text, provider } = await callAI(messages);
    return res.json({ result: text, provider });
  } catch (err) {
    logger.error({ err }, "admin-assist error");
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * GET /api/ai/status
 * Info jumlah key aktif + index rotasi saat ini (untuk debug admin).
 */
router.get("/ai/status", (_req, res) => {
  const keys = collectGroqKeys();
  return res.json({
    smartChain: [
      "GitHub-gpt4o",
      "GitHub-gpt4o-mini",
      "SambaNova-70B",
      "Mistral-Medium",
      "Groq-70B",
      "Groq-8B",
      "Gemini",
      "OpenRouter",
    ],
    economyChain: [
      "Mistral-Medium",
      "SambaNova-70B",
      "Groq-70B",
      "Groq-8B",
      "Gemini",
      "GitHub-gpt4o-mini",
      "GitHub-gpt4o",
      "OpenRouter",
    ],
    routing: "complex/spoiler → smart chain | simple → economy chain",
    groqKeyCount: keys.length,
    currentGroqKeyIndex: groqKeyIndex % Math.max(keys.length, 1),
    hasGithubToken: !!process.env.GITHUB_TOKEN,
    hasCerebrasKey: !!process.env.CEREBRAS_API_KEY,
    hasSambaNovaKey: !!process.env.SAMBANOVA_API_KEY,
    hasMistralKey: !!process.env.MISTRAL_API_KEY,
    hasGeminiKey: !!process.env.GEMINI_API_KEY,
    hasOpenRouterKey: !!process.env.OPENROUTER_API_KEY,
  });
});

export default router;
