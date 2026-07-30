import { useState, useRef, useCallback } from "react";
import { pollinationsChat, pollinationsImageUrl } from "@/lib/pollinationsAI";

export type ChatMode = "daily" | "coding";

const IS_GH_PAGES = import.meta.env.VITE_GH_PAGES === "1";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "file" | "file-loading" | "user-image";
  imageUrl?: string;
  fileName?: string;
  timestamp: Date;
  model?: string;
  // Vision: user-sent image
  userImageBase64?: string;
  userImageMimeType?: string;
  // AI file download
  fileDownloads?: { name: string; content: string }[];
}

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  messages: Message[];
  createdAt: Date;
  // File learning context — persists in session
  fileContext?: string;
  fileContextName?: string;
}

const BASE = "/api";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function detectIntent(text: string): "image" | "img2img" | "chat" {
  const t = text.toLowerCase();
  const img2imgPatterns = [
    /buat(kan)?\s+(gambar|foto)\s+(seperti|mirip|kayak|sama)\s+(ini|yang|contoh)/,
    /jadikan\s+(seperti|mirip|kayak)/,
    /ubah\s+(gambar|foto|style|gaya)/,
    /sama\s+(kayak|seperti)\s+(ini|gambar)/,
    /like\s+this\s+(image|photo|picture)/,
    /img2img/,
    /image.to.image/,
    /reference\s+image/,
  ];
  if (img2imgPatterns.some((p) => p.test(t))) return "img2img";

  const imagePatterns = [
    /buatkan?\s+(gambar|foto|ilustrasi|poster|wallpaper|logo|artwork|banner|thumbnail|meme|komik)/,
    /bikin\s+(gambar|foto|ilustrasi|poster|wallpaper|logo|artwork|banner)/,
    /generate\s+(gambar|foto|image|photo|picture|illustration|poster|artwork)/,
    /gambarkan\s+/,
    /ilustrasikan\s+/,
    /visualisasikan\s+/,
    /create\s+(a\s+)?(image|photo|picture|illustration|poster|artwork|logo|wallpaper)/,
    /make\s+(a\s+|me\s+a\s+)?(image|photo|picture|illustration|poster)/,
    /draw\s+(a\s+|me\s+a?\s*)?/,
    /tampilkan\s+gambar/,
    /tunjukkan\s+gambar/,
    /hasilkan\s+gambar/,
    /design\s+(a\s+)?(logo|poster|banner|cover)/,
  ];
  return imagePatterns.some((p) => p.test(t)) ? "image" : "chat";
}

// Parse [FILE:name.ext]content[/FILE] markers from AI response
function parseFileDownloads(text: string): { name: string; content: string }[] {
  const downloads: { name: string; content: string }[] = [];
  const regex = /\[FILE:([^\]]+)\]([\s\S]*?)\[\/FILE\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    downloads.push({ name: match[1].trim(), content: match[2] });
  }
  return downloads;
}

// Strip [FILE:...]...[/FILE] from displayed text
function stripFileMarkers(text: string): string {
  return text.replace(/\[FILE:[^\]]+\][\s\S]*?\[\/FILE\]/g, "").trim();
}

export function useChat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ChatMode>("daily");
  const abortRef = useRef<AbortController | null>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const messages = activeSession?.messages ?? [];

  const createSession = useCallback((chatMode: ChatMode) => {
    const id = genId();
    const session: ChatSession = {
      id,
      title: "Chat baru",
      mode: chatMode,
      messages: [],
      createdAt: new Date(),
    };
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(id);
    return id;
  }, []);

  const addMessage = useCallback((sessionId: string, msg: Message) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              title:
                s.messages.length === 0 && msg.role === "user"
                  ? (msg.content || msg.fileName || "Chat").slice(0, 40)
                  : s.title,
              messages: [...s.messages, msg],
            }
          : s
      )
    );
  }, []);

  const updateLastAiMessage = useCallback(
    (sessionId: string, content: string, type?: Message["type"]) => {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: s.messages.map((m, i) =>
                  i === s.messages.length - 1 && m.role === "assistant"
                    ? {
                        ...m,
                        content,
                        ...(type ? { type } : {}),
                        fileDownloads: parseFileDownloads(content),
                      }
                    : m
                ),
              }
            : s
        )
      );
    },
    []
  );

  const sendChat = useCallback(
    async (
      content: string,
      sessionId: string,
      chatMode: ChatMode,
      useSearch = false,
      opts?: { imageBase64?: string; imageMimeType?: string }
    ) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const userMsg: Message = {
        id: genId(),
        role: "user",
        content,
        type: opts?.imageBase64 ? "user-image" : "text",
        timestamp: new Date(),
        userImageBase64: opts?.imageBase64,
        userImageMimeType: opts?.imageMimeType,
      };
      addMessage(sessionId, userMsg);

      const aiMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "",
        type: "text",
        timestamp: new Date(),
      };
      addMessage(sessionId, aiMsg);

      setIsLoading(true);
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const prevMessages = [...session.messages, userMsg].map((m) => ({
          role: m.role,
          content: m.content,
          imageBase64: m.userImageBase64,
          imageMimeType: m.userImageMimeType,
        }));

        let fullText = "";

        if (IS_GH_PAGES) {
          await pollinationsChat(
            prevMessages.map((m) => ({ role: m.role, content: m.content })),
            chatMode,
            (chunk) => {
              fullText += chunk;
              updateLastAiMessage(sessionId, fullText);
            },
            controller.signal
          );
        } else {
          const endpoint = useSearch
            ? `${BASE}/chat/search`
            : chatMode === "daily"
              ? `${BASE}/chat/daily`
              : `${BASE}/chat/coding`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: prevMessages,
              fileContext: session.fileContext,
              useSearch,
            }),
            signal: controller.signal,
          });

          if (!response.ok) throw new Error(`Error ${response.status}`);

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === "[DONE]") continue;
                if (data.startsWith("[ERROR]")) {
                  fullText += `\n\n⚠️ ${data.slice(8)}`;
                  continue;
                }
                try {
                  const parsed = JSON.parse(data);
                  const delta = parsed.choices?.[0]?.delta?.content;
                  if (delta) {
                    fullText += delta;
                    updateLastAiMessage(sessionId, fullText);
                  }
                } catch {}
              }
            }
          }
        }

        if (!fullText) fullText = "⚠️ Tidak ada respons. Coba lagi ya!";
        const displayText = stripFileMarkers(fullText);
        const downloads = parseFileDownloads(fullText);

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 && m.role === "assistant"
                      ? { ...m, content: displayText, fileDownloads: downloads }
                      : m
                  ),
                }
              : s
          )
        );
      } catch (err: any) {
        if (err.name !== "AbortError") {
          updateLastAiMessage(sessionId, "⚠️ Lawrenz AI sedang sibuk, coba lagi sebentar ya!");
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [sessions, addMessage, updateLastAiMessage]
  );

  // ── Img2Img: reference image + instruction → new generated image ─────────
  const generateImg2Img = useCallback(
    async (imageFile: File, instruction: string, sessionId: string) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const userMsg: Message = {
        id: genId(),
        role: "user",
        content: `🖼️ Img2Img: ${instruction}`,
        type: "user-image",
        timestamp: new Date(),
        userImageBase64: base64,
        userImageMimeType: imageFile.type || "image/jpeg",
        fileName: imageFile.name,
      };
      addMessage(sessionId, userMsg);

      const aiMsg: Message = {
        id: genId(),
        role: "assistant",
        content: `Menganalisis referensi "${imageFile.name}" lalu generate gambar baru...`,
        type: "image",
        timestamp: new Date(),
      };
      addMessage(sessionId, aiMsg);

      setIsLoading(true);
      try {
        const response = await fetch(`${BASE}/image/img2img`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64: base64,
            imageMimeType: imageFile.type || "image/jpeg",
            instruction,
          }),
        });
        const data = (await response.json()) as {
          imageUrl?: string;
          enhancedPrompt?: string;
          error?: string;
        };
        if (!response.ok || data.error) throw new Error(data.error || "Gagal img2img");

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 && m.role === "assistant"
                      ? {
                          ...m,
                          content: `Gambar baru berhasil di-generate berdasarkan referensi kamu! 🎨\n\nPrompt: "${data.enhancedPrompt?.slice(0, 100)}..."`,
                          imageUrl: data.imageUrl!,
                        }
                      : m
                  ),
                }
              : s
          )
        );
      } catch (err: any) {
        updateLastAiMessage(sessionId, `⚠️ Gagal img2img: ${err.message}`, "text");
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, updateLastAiMessage]
  );

  const generateImage = useCallback(
    async (prompt: string, sessionId: string) => {
      const userMsg: Message = {
        id: genId(),
        role: "user",
        content: `🎨 Generate gambar: ${prompt}`,
        type: "text",
        timestamp: new Date(),
      };
      addMessage(sessionId, userMsg);

      const aiMsg: Message = {
        id: genId(),
        role: "assistant",
        content: prompt,
        type: "image",
        timestamp: new Date(),
      };
      addMessage(sessionId, aiMsg);

      setIsLoading(true);

      try {
        let imageUrl: string;

        if (IS_GH_PAGES) {
          imageUrl = pollinationsImageUrl(prompt);
          await new Promise((r) => setTimeout(r, 800));
        } else {
          const response = await fetch(`${BASE}/image/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = (await response.json()) as { imageUrl?: string; error?: string };
          if (!response.ok || data.error) throw new Error(data.error || "Gagal generate gambar");
          imageUrl = data.imageUrl!;
        }

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 && m.role === "assistant"
                      ? {
                          ...m,
                          content: `Gambar berhasil di-generate! Prompt: "${prompt}"`,
                          imageUrl,
                        }
                      : m
                  ),
                }
              : s
          )
        );
      } catch (err: any) {
        updateLastAiMessage(sessionId, `⚠️ Gagal generate gambar: ${err.message}`);
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, updateLastAiMessage]
  );

  // ── File learning — ingest file into session context ─────────────────────
  const learnFile = useCallback(
    async (file: File, sessionId: string) => {
      const userMsg: Message = {
        id: genId(),
        role: "user",
        content: `📚 Pelajari file: **${file.name}**\n\nSaya ingin kamu membaca dan menghafal isi file ini. Setelah itu saya bisa tanya apa saja tentang isinya.`,
        type: "file",
        fileName: file.name,
        timestamp: new Date(),
      };
      addMessage(sessionId, userMsg);

      const loadingMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "",
        type: "file-loading",
        fileName: file.name,
        timestamp: new Date(),
      };
      addMessage(sessionId, loadingMsg);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${BASE}/file/ingest`, { method: "POST", body: formData });
        const data = (await response.json()) as {
          content?: string;
          fileName?: string;
          type?: string;
          lineCount?: number;
          error?: string;
        };
        if (!response.ok || data.error) throw new Error(data.error || "Gagal ingest file");

        const fileContent = data.content || "";
        const lineInfo = data.lineCount ? ` (${data.lineCount} baris)` : "";

        // Store in session
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? { ...s, fileContext: fileContent, fileContextName: file.name }
              : s
          )
        );

        const confirmText = `✅ File **${file.name}**${lineInfo} berhasil saya pelajari dan hafal!\n\nSekarang kamu bisa tanya apa saja tentang isinya — aku udah baca semuanya. Mau tanya apa?`;

        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m, i) =>
                    i === s.messages.length - 1 && m.role === "assistant"
                      ? { ...m, content: confirmText, type: "text" as Message["type"] }
                      : m
                  ),
                }
              : s
          )
        );
      } catch (err: any) {
        updateLastAiMessage(sessionId, `⚠️ Gagal pelajari file: ${err.message}`, "text");
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, updateLastAiMessage]
  );

  const processFile = useCallback(
    async (file: File, prompt: string, sessionId: string) => {
      const userMsg: Message = {
        id: genId(),
        role: "user",
        content: `📄 File: **${file.name}**\n\n${prompt}`,
        type: "file",
        fileName: file.name,
        timestamp: new Date(),
      };
      addMessage(sessionId, userMsg);

      const aiMsg: Message = {
        id: genId(),
        role: "assistant",
        content: "",
        type: "file-loading",
        fileName: file.name,
        timestamp: new Date(),
      };
      addMessage(sessionId, aiMsg);

      setIsLoading(true);

      try {
        if (IS_GH_PAGES) {
          const text = await file.text().catch(() => null);
          const fileContext = text
            ? `Isi file "${file.name}":\n\n${text.slice(0, 8000)}`
            : `File "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB)`;
          const userPrompt = prompt || "Analisis dan jelaskan isi file ini secara detail.";

          let result = "";
          await pollinationsChat(
            [{ role: "user", content: `${fileContext}\n\n---\n\n${userPrompt}` }],
            "daily",
            (chunk) => {
              result += chunk;
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === sessionId
                    ? {
                        ...s,
                        messages: s.messages.map((m, i) =>
                          i === s.messages.length - 1 && m.role === "assistant"
                            ? { ...m, content: result, type: "text" as Message["type"] }
                            : m
                        ),
                      }
                    : s
                )
              );
            }
          );
        } else {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("prompt", prompt || "Analisis dan jelaskan isi file ini secara detail.");

          const response = await fetch(`${BASE}/file/process`, {
            method: "POST",
            body: formData,
          });

          const data = (await response.json()) as { result?: string; error?: string };
          if (!response.ok || data.error) throw new Error(data.error || "Gagal proses file");

          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.map((m, i) =>
                      i === s.messages.length - 1 && m.role === "assistant"
                        ? {
                            ...m,
                            content: data.result || "Tidak ada respons dari AI.",
                            type: "text" as Message["type"],
                          }
                        : m
                    ),
                  }
                : s
            )
          );
        }
      } catch (err: any) {
        updateLastAiMessage(sessionId, `⚠️ Gagal proses file: ${err.message}`, "text");
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, updateLastAiMessage]
  );

  // ── Vision: send image in daily/coding chat ───────────────────────────────
  const sendVision = useCallback(
    async (file: File, text: string, sessionId: string, chatMode: ChatMode) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await sendChat(
        text || "Analisis gambar ini dan jelaskan isinya secara detail.",
        sessionId,
        chatMode,
        false,
        { imageBase64: base64, imageMimeType: file.type || "image/jpeg" }
      );
    },
    [sendChat]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      opts?: {
        file?: File;
        imagePrompt?: string;
        useSearch?: boolean;
        visionImage?: File;
        img2imgFile?: File;
        learnMode?: boolean;
      }
    ) => {
      if (isLoading) return;

      let sessionId = activeSessionId;
      if (!sessionId) sessionId = createSession(mode);

      if (opts?.imagePrompt) {
        await generateImage(opts.imagePrompt, sessionId);
      } else if (opts?.img2imgFile) {
        await generateImg2Img(opts.img2imgFile, content, sessionId);
      } else if (opts?.visionImage) {
        await sendVision(opts.visionImage, content, sessionId, mode);
      } else if (opts?.file && opts?.learnMode) {
        await learnFile(opts.file, sessionId);
      } else if (opts?.file) {
        await processFile(opts.file, content, sessionId);
      } else {
        await sendChat(content, sessionId, mode, opts?.useSearch);
      }
    },
    [isLoading, activeSessionId, createSession, mode, generateImage, generateImg2Img, sendVision, learnFile, processFile, sendChat]
  );

  const clearFileContext = useCallback((sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId ? { ...s, fileContext: undefined, fileContextName: undefined } : s
      )
    );
  }, []);

  const newChat = useCallback(() => {
    const id = createSession(mode);
    setActiveSessionId(id);
  }, [createSession, mode]);

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const switchMode = useCallback((newMode: ChatMode) => {
    setMode(newMode);
  }, []);

  return {
    sessions,
    activeSession,
    messages,
    isLoading,
    mode,
    switchMode,
    sendMessage,
    newChat,
    switchSession,
    stopGeneration,
    clearFileContext,
  };
}
