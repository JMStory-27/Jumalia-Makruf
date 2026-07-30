import { useState, useCallback, useRef } from "react";

const BASE = "/api";

// Convert raw PCM (audio/L16) to WAV so browsers can play it
function pcmToWav(base64Pcm: string, sampleRate = 24000, numChannels = 1, bitDepth = 16): string {
  const pcm = Uint8Array.from(atob(base64Pcm), (c) => c.charCodeAt(0));
  const dataLen = pcm.length;
  const buf = new ArrayBuffer(44 + dataLen);
  const v = new DataView(buf);
  const s = (o: number, str: string) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  s(0, "RIFF"); v.setUint32(4, 36 + dataLen, true); s(8, "WAVE");
  s(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  v.setUint16(32, numChannels * (bitDepth / 8), true); v.setUint16(34, bitDepth, true);
  s(36, "data"); v.setUint32(40, dataLen, true);
  new Uint8Array(buf, 44).set(pcm);
  const wavBlob = new Blob([buf], { type: "audio/wav" });
  return URL.createObjectURL(wavBlob);
}

export function useTTS() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setSpeakingId(null);
    setLoadingId(null);
  }, []);

  const speak = useCallback(async (text: string, msgId: string, voice = "Aoede") => {
    // Toggle off if same message
    if (speakingId === msgId || loadingId === msgId) {
      stopAudio();
      return;
    }

    // Stop previous audio
    stopAudio();
    setLoadingId(msgId);

    try {
      const response = await fetch(`${BASE}/tts/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });

      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "TTS gagal");
      }

      const data = await response.json() as { audioBase64: string; mimeType: string };

      let audioSrc: string;
      if (data.mimeType.includes("L16") || data.mimeType.includes("pcm")) {
        // Raw PCM — wrap in WAV header
        audioSrc = pcmToWav(data.audioBase64);
        objectUrlRef.current = audioSrc;
      } else {
        audioSrc = `data:${data.mimeType};base64,${data.audioBase64}`;
      }

      const audio = new Audio(audioSrc);
      audioRef.current = audio;

      audio.onended = () => {
        setSpeakingId(null);
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current);
          objectUrlRef.current = null;
        }
      };
      audio.onerror = () => stopAudio();

      setLoadingId(null);
      setSpeakingId(msgId);
      await audio.play();
    } catch {
      stopAudio();
    }
  }, [speakingId, loadingId, stopAudio]);

  return { speakingId, loadingId, speak, stopAudio };
}
