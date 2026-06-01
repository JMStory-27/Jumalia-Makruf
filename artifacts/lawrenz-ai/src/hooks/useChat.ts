import { useState, useRef, useCallback } from "react";
import { pollinationsChat, pollinationsImageUrl } from "@/lib/pollinationsAI";

export type ChatMode = "daily" | "coding";
export type DailySubMode = "chat" | "image" | "file";

// When deployed on GitHub Pages, use Pollinations.ai directly (no backend needed)
const IS_GH_PAGES = import.meta.env.VITE_GH_PAGES === "1";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: "text" | "image" | "file" | "file-loading";
  imageUrl?: string;
  fileName?: string;
  timestamp: Date;
  model?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  mode: ChatMode;
  messages: Message[];
  createdAt: Date;
}

const BASE = "/api";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function useChat() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<ChatMode>("daily");
  const [subMode, setSubMode] = useState<DailySubMode>("chat");
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
                  ? msg.content.slice(0, 40) || s.title
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
                    ? { ...m, content, ...(type ? { type } : {}) }
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
    async (content: string, sessionId: string, chatMode: ChatMode) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;

      const userMsg: Message = {
        id: genId(),
        role: "user",
        content,
        type: "text",
        timestamp: new Date(),
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
        const prevMessages = [
          ...session.messages,
          userMsg,
        ].map((m) => ({ role: m.role, content: m.content }));

        let fullText = "";

        if (IS_GH_PAGES) {
          // GitHub Pages mode: call Pollinations.ai directly from browser
          await pollinationsChat(
            prevMessages,
            chatMode,
            (chunk) => {
              fullText += chunk;
              updateLastAiMessage(sessionId, fullText);
            },
            controller.signal
          );
        } else {
          // Replit mode: use the Express backend
          const endpoint =
            chatMode === "daily" ? `${BASE}/chat/daily` : `${BASE}/chat/coding`;

          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: prevMessages }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Error ${response.status}`);
          }

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
        updateLastAiMessage(sessionId, fullText);
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
          // GitHub Pages mode: use Pollinations.ai directly (no API key needed)
          imageUrl = pollinationsImageUrl(prompt);
          // Small delay so the loading state shows
          await new Promise((r) => setTimeout(r, 800));
        } else {
          const response = await fetch(`${BASE}/image/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
          });
          const data = await response.json() as { imageUrl?: string; error?: string };
          if (!response.ok || data.error) {
            throw new Error(data.error || "Gagal generate gambar");
          }
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
          // GitHub Pages: file reading — extract text and use Pollinations for analysis
          const text = await file.text().catch(() => null);
          const fileContext = text
            ? `Isi file "${file.name}":\n\n${text.slice(0, 8000)}`
            : `File "${file.name}" (${file.type}, ${Math.round(file.size / 1024)} KB) — tidak bisa dibaca sebagai teks.`;
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

          const data = await response.json() as { result?: string; error?: string };

          if (!response.ok || data.error) {
            throw new Error(data.error || "Gagal proses file");
          }

          setSessions((prev) =>
            prev.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    messages: s.messages.map((m, i) =>
                      i === s.messages.length - 1 && m.role === "assistant"
                        ? { ...m, content: data.result || "Tidak ada respons dari AI.", type: "text" as Message["type"] }
                        : m
                    ),
                  }
                : s
            )
          );
        }
      } catch (err: any) {
        // Must pass type:"text" to exit the "file-loading" state
        updateLastAiMessage(sessionId, `⚠️ Gagal proses file: ${err.message}`, "text");
      } finally {
        setIsLoading(false);
      }
    },
    [addMessage, updateLastAiMessage]
  );

  const sendMessage = useCallback(
    async (
      content: string,
      opts?: { file?: File; imagePrompt?: string }
    ) => {
      if (isLoading) return;

      let sessionId = activeSessionId;
      if (!sessionId) {
        sessionId = createSession(mode);
      }

      if (opts?.imagePrompt) {
        await generateImage(opts.imagePrompt, sessionId);
      } else if (opts?.file) {
        await processFile(opts.file, content, sessionId);
      } else {
        await sendChat(content, sessionId, mode);
      }
    },
    [
      isLoading,
      activeSessionId,
      createSession,
      mode,
      generateImage,
      processFile,
      sendChat,
    ]
  );

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
    setSubMode("chat");
  }, []);

  return {
    sessions,
    activeSession,
    messages,
    isLoading,
    mode,
    subMode,
    setSubMode,
    switchMode,
    sendMessage,
    newChat,
    switchSession,
    stopGeneration,
  };
}
