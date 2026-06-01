import { Router } from "express";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Text-based MIME types: handle with Groq (faster, more reliable)
const TEXT_TYPES = new Set([
  "text/plain", "text/csv", "text/html", "text/xml",
  "application/json", "application/xml", "text/javascript",
  "application/javascript",
]);

// Image types: handle with Gemini multimodal
const IMAGE_TYPES = new Set([
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif",
  "image/heic", "image/heif",
]);

// Document types: handle with Gemini
const DOC_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

// POST /api/file/process
router.post("/file/process", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    const { prompt = "Analisis file ini dan jelaskan isinya secara detail dalam Bahasa Indonesia." } = req.body;
    const mimeType = req.file.mimetype.toLowerCase();

    // ── TEXT FILES → Groq (fast, reliable) ──────────────────────────────────
    if (TEXT_TYPES.has(mimeType) || req.file.originalname.match(/\.(txt|csv|json|xml|html|md|log|js|ts|py|java|cpp|c|h|css)$/i)) {
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        res.status(500).json({ error: "Layanan teks AI belum dikonfigurasi" });
        return;
      }

      const textContent = req.file.buffer.toString("utf8");
      const truncated = textContent.length > 60000 ? textContent.slice(0, 60000) + "\n...[dipotong karena terlalu panjang]" : textContent;
      const lineCount = textContent.split("\n").length;
      const charCount = textContent.length;

      const systemMsg = `Kamu adalah LawrenZ AI, asisten analisis file super canggih. Analisis isi file yang diberikan dengan detail dan akurat. Respond dalam Bahasa Indonesia yang jelas.`;

      const userMsg = `File: "${req.file.originalname}" (${req.file.mimetype}, ${lineCount} baris, ${charCount} karakter)

Isi file:
\`\`\`
${truncated}
\`\`\`

Instruksi: ${prompt}`;

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          max_tokens: 4096,
          temperature: 0.7,
        }),
      });

      if (!groqRes.ok) {
        const err = await groqRes.text();
        throw new Error(`Groq error ${groqRes.status}: ${err.slice(0, 200)}`);
      }

      const groqData = await groqRes.json() as any;
      const result = groqData.choices?.[0]?.message?.content || "Tidak ada respons dari AI.";
      res.json({ result, fileName: req.file.originalname });
      return;
    }

    // ── IMAGE & DOCUMENT FILES → Gemini multimodal ───────────────────────────
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      res.status(500).json({ error: "Layanan analisis gambar/dokumen belum dikonfigurasi" });
      return;
    }

    const base64Data = req.file.buffer.toString("base64");

    // Use gemini-1.5-flash — more stable and widely available
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: req.file.mimetype,
                    data: base64Data,
                  },
                },
                { text: `${prompt}\n\nJawab dalam Bahasa Indonesia yang detail dan terstruktur.` },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.7,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      // If Gemini fails for binary files, give a helpful error
      throw new Error(`Layanan analisis file tidak tersedia saat ini (${geminiRes.status}). Coba upload file teks seperti CSV, TXT, atau JSON.`);
    }

    const geminiData = await geminiRes.json() as any;
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "Tidak ada respons dari AI.";

    res.json({ result: text, fileName: req.file.originalname });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Gagal memproses file" });
  }
});

export default router;
