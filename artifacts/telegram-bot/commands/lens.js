'use strict';

const OpenAI = require('openai');

const pendingLens = new Map();

async function downloadToBase64(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download foto gagal: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString('base64');
}

// Ambil foto ukuran terbesar — akurasi OCR lebih penting dari kecepatan
function pickBestPhoto(photos) {
    if (!photos || photos.length === 0) return null;
    // Telegram sort dari kecil ke besar, ambil yang terbesar
    return photos[photos.length - 1];
}

// ─── Filter teks UI otomatis ──────────────────────────────────────────────────
// Hapus baris yang mengandung kata/frasa UI app/Telegram yang bukan isi teks asli
const UI_PATTERNS = [
    /scroll\s+to\s+latest/i,
    /gulir\s+ke\s+(terbaru|pesan\s+terbaru)/i,
    /↓\s*scroll/i,
    /⬇\s*scroll/i,
    /^\s*↓\s*$/,
    /^\s*⬇\s*$/,
    /^scroll\s+to/i,
    /worked\s+for\s+\d+\s+(minute|second|hour)/i,
    /you.?re\s+out\s+of\s+credits/i,
    /upgrade\s+to\s+(core|pro|plus)/i,
    /make,?\s+test,?\s+iterate/i,
    /^\s*\+\s*plan\s*::/i,
    /economy\s*[v∧]/i,
];

function filterUIText(text) {
    if (!text) return text;
    const lines = text.split('\n');
    const filtered = lines.filter(line => {
        const trimmed = line.trim();
        if (!trimmed) return true; // keep empty lines for formatting
        return !UI_PATTERNS.some(p => p.test(trimmed));
    });
    // Hapus trailing/leading empty lines berlebih
    return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT =
    'You are a highly accurate OCR engine. Your task:\n\n' +

    'STEP 1 — Check for user markings:\n' +
    'Look for any visual annotations DRAWN by the user on the image:\n' +
    '- Red/colored rectangles, boxes, or squares drawn on top of content\n' +
    '- Red/colored circles or ovals enclosing text\n' +
    '- Highlighted regions, arrows pointing to text, hand-drawn underlines\n\n' +

    'STEP 2 — Extract text:\n' +
    '  IF markings found → extract ONLY text INSIDE the marked/enclosed area. Ignore everything outside.\n' +
    '  IF no markings → extract ALL readable text from the entire image.\n\n' +

    'STEP 3 — Skip these UI elements (do NOT include them in output):\n' +
    '- "Scroll to latest", "↓ Scroll to latest", "Gulir ke terbaru" — these are navigation buttons\n' +
    '- Timestamp-only lines at the edge of the image (like "07:00 ✓✓")\n' +
    '- App status bar icons (battery, signal, WiFi symbols)\n' +
    '- Any floating overlay buttons that are part of the app UI (not user content)\n\n' +

    'STEP 4 — Output:\n' +
    'Return the extracted text EXACTLY as written (same words, punctuation, line breaks, emojis).\n' +
    'Do NOT add labels, commentary, or explanations.\n' +
    'If no readable text: reply exactly → [Tidak ada teks terdeteksi]';

const USER_INSTRUCTION =
    'Extract all text from this image. If there is a red box, circle, or marking drawn by the user, ' +
    'extract ONLY the text inside that marking.';

const PROVIDER_TIMEOUT_MS = 25_000;

function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error(`${label} timeout setelah ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─── Provider: Gemini (Google) ────────────────────────────────────────────────
async function ocrGemini(base64, mimeType) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY tidak diset');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const body = {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
            role: 'user',
            parts: [
                { text: USER_INSTRUCTION },
                { inlineData: { mimeType, data: base64 } },
            ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 4096 },
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 150)}`);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (!text) throw new Error('Gemini: respons kosong');
    return { provider: 'Gemini', text };
}

// ─── Provider: Groq (Llama 4 Scout — vision) ──────────────────────────────────
async function ocrGroq(base64, mimeType) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY tidak diset');

    const client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
    const response = await client.chat.completions.create({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                    { type: 'text', text: USER_INSTRUCTION },
                ],
            },
        ],
        max_tokens: 4096,
        temperature: 0,
    });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('Groq: respons kosong');
    return { provider: 'Groq', text };
}

// ─── Provider: OpenRouter (Gemini Flash via OpenRouter) ───────────────────────
async function ocrOpenRouter(base64, mimeType) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY tidak diset');

    const client = new OpenAI({ apiKey, baseURL: 'https://openrouter.ai/api/v1' });
    const response = await client.chat.completions.create({
        model: 'google/gemini-2.0-flash-001',
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
                    { type: 'text', text: USER_INSTRUCTION },
                ],
            },
        ],
        max_tokens: 4096,
        temperature: 0,
    });
    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error('OpenRouter: respons kosong');
    return { provider: 'OpenRouter', text };
}

// ─── Race semua provider yang tersedia, ambil yang PALING CEPAT balas ─────────
// Ketimbang panggil satu provider dan menyerah kalau gagal/lambat, semua provider
// yang punya API key di-panggil BERSAMAAN. Yang pertama sukses langsung dipakai —
// provider lain diabaikan begitu ada pemenang (fire-and-forget, tidak diblokir).
async function runOCRRace(base64, mimeType) {
    const providers = [
        { name: 'Gemini', fn: ocrGemini },
        { name: 'Groq', fn: ocrGroq },
        { name: 'OpenRouter', fn: ocrOpenRouter },
    ].filter(p => {
        // Skip provider yang secret-nya memang tidak diset — jangan buang waktu nunggu error-nya.
        if (p.name === 'Gemini') return !!process.env.GEMINI_API_KEY;
        if (p.name === 'Groq') return !!process.env.GROQ_API_KEY;
        if (p.name === 'OpenRouter') return !!process.env.OPENROUTER_API_KEY;
        return false;
    });

    if (providers.length === 0) {
        throw new Error('Tidak ada API key AI yang tersedia (GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY)');
    }

    const attempts = providers.map(p =>
        withTimeout(p.fn(base64, mimeType), PROVIDER_TIMEOUT_MS, p.name)
            .catch(err => {
                console.warn(`[LENS] ${p.name} gagal:`, err.message);
                throw err; // biar Promise.any tahu ini gagal, provider lain masih bisa menang
            })
    );

    try {
        return await Promise.any(attempts);
    } catch (aggErr) {
        const details = (aggErr.errors || []).map(e => e.message).join(' | ');
        throw new Error(`Semua provider AI gagal: ${details || aggErr.message}`);
    }
}

async function extractTextFromPhoto(bot, msg) {
    const chatId = msg.chat.id;
    const photos = msg.photo;
    if (!photos || photos.length === 0) return;

    let statusMsg;
    try {
        statusMsg = await bot.sendMessage(chatId,
            '🔍 Membaca teks...',
            { reply_to_message_id: msg.message_id }
        );

        // Pakai foto ukuran terbesar untuk akurasi OCR maksimal
        const bestPhoto = pickBestPhoto(photos);
        const fileInfo  = await bot.getFile(bestPhoto.file_id);
        const fileUrl   = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
        const mimeType  = fileInfo.file_path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

        const base64 = await downloadToBase64(fileUrl);

        // Race Gemini / Groq / OpenRouter — provider tercepat yang menang dipakai.
        const { provider, text: raw } = await runOCRRace(base64, mimeType);

        // Filter otomatis teks UI (Scroll to latest, dll.)
        const extracted = filterUIText(raw);

        await bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

        if (!extracted || extracted === '[Tidak ada teks terdeteksi]') {
            await bot.sendMessage(chatId,
                'Tidak ada teks terdeteksi di gambar ini.',
                { reply_to_message_id: msg.message_id }
            );
            return;
        }

        const header   = `📋 Teks dari gambar (${provider}):\n━━━━━━━━━━━━━━━━━━━\n`;
        const maxChunk = 4000;

        if (extracted.length <= maxChunk) {
            await bot.sendMessage(chatId,
                header + extracted,
                { reply_to_message_id: msg.message_id }
            );
        } else {
            // Kirim header dulu, lalu per chunk
            await bot.sendMessage(chatId, header, { reply_to_message_id: msg.message_id });
            for (let i = 0; i < extracted.length; i += maxChunk) {
                await bot.sendMessage(chatId, extracted.slice(i, i + maxChunk));
            }
        }

    } catch (err) {
        console.error('[LENS] Error:', err.message);
        const errMsg = '❌ Gagal: ' + err.message.slice(0, 300);
        if (statusMsg) {
            await bot.editMessageText(errMsg,
                { chat_id: chatId, message_id: statusMsg.message_id }
            ).catch(() => bot.sendMessage(chatId, errMsg).catch(() => {}));
        } else {
            await bot.sendMessage(chatId, errMsg).catch(() => {});
        }
    } finally {
        pendingLens.delete(chatId);
    }
}

function registerLens(bot) {
    bot.onText(/^\/lens(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;

        if (msg.photo) {
            await extractTextFromPhoto(bot, msg);
            return;
        }

        pendingLens.set(chatId, true);
        await bot.sendMessage(chatId,
            '🔍 Google Lens Mode\n\nKirim foto yang ingin kamu ekstrak teksnya.\n\n' +
            '💡 Tip:\n' +
            '• Foto biasa → semua teks diekstrak\n' +
            '• Tandai/lingkari area dengan warna → hanya area itu yang disalin\n' +
            '• Teks UI seperti "Scroll to latest" difilter otomatis'
        );
    });

    bot.on('photo', async (msg) => {
        const chatId  = msg.chat.id;
        const caption = (msg.caption || '').trim();

        if (/^\/lens/i.test(caption) || pendingLens.has(chatId)) {
            await extractTextFromPhoto(bot, msg);
        }
    });

    console.log('✅ Lens command registered - /lens (race: Gemini/Groq/OpenRouter)');
}

module.exports = registerLens;
