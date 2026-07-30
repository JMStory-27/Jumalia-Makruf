import { useState, useCallback, useRef } from "react";

const BASE = "/api";

export function useSTT(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const startRecording = useCallback(async () => {
    if (recording) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Pick best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;

        if (chunksRef.current.length === 0) return;

        const blob = new Blob(chunksRef.current, { type: mimeType });

        // Minimum size check (avoid sending empty recordings)
        if (blob.size < 1000) return;

        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", blob, "recording.webm");

          const response = await fetch(`${BASE}/stt/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (response.ok) {
            const data = (await response.json()) as { text: string };
            if (data.text?.trim()) onTranscript(data.text.trim());
          }
        } catch {
          // silent fail — user can just type instead
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start(250); // collect chunks every 250ms
      setRecording(true);
    } catch {
      alert("Tidak bisa akses mikrofon. Pastikan izin sudah diberikan di browser.");
    }
  }, [recording, stopRecording, onTranscript]);

  const toggle = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  return { recording, transcribing, toggle };
}
