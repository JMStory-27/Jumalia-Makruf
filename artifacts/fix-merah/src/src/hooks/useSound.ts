import { useCallback, useRef } from "react";

type OscType = OscillatorType;

function beep(freq: number, dur: number, type: OscType = "square", vol = 0.15) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.type = type;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
  } catch {}
}

function sweep(f0: number, f1: number, dur: number, type: OscType = "sine", vol = 0.12) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(f0, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(f1, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
  } catch {}
}

export function useSound() {
  const enabledRef = useRef(true);

  /* ── Kirim banding — cinematic launch sequence ── */
  const playSend = useCallback(() => {
    if (!enabledRef.current) return;
    // low rumble
    sweep(80, 180, 0.3, "sawtooth", 0.12);
    // rising tone
    setTimeout(() => sweep(400, 900, 0.4, "square", 0.1), 100);
    setTimeout(() => sweep(900, 1600, 0.3, "square", 0.08), 400);
    // launch pew
    setTimeout(() => sweep(1600, 2400, 0.18, "sine", 0.12), 650);
    setTimeout(() => beep(2600, 0.08, "sine", 0.1), 820);
    // digital confirm beeps
    setTimeout(() => beep(880, 0.07, "square", 0.08), 950);
    setTimeout(() => beep(1100, 0.07, "square", 0.07), 1020);
    setTimeout(() => beep(1320, 0.1, "square", 0.06), 1090);
  }, []);

  /* ── Sukses — triumphant fanfare ── */
  const playSuccess = useCallback(() => {
    if (!enabledRef.current) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => beep(n, 0.18, "sine", 0.1), i * 100));
    setTimeout(() => beep(1318, 0.3, "sine", 0.12), 450);
    setTimeout(() => beep(1568, 0.4, "sine", 0.1), 600);
  }, []);

  /* ── Error — alarm descending ── */
  const playError = useCallback(() => {
    if (!enabledRef.current) return;
    sweep(800, 200, 0.25, "sawtooth", 0.18);
    setTimeout(() => sweep(700, 150, 0.25, "sawtooth", 0.14), 280);
    setTimeout(() => beep(120, 0.4, "sawtooth", 0.1), 580);
  }, []);

  /* ── Notifikasi reply masuk — alien ping ── */
  const playNotification = useCallback(() => {
    if (!enabledRef.current) return;
    sweep(300, 1800, 0.15, "sine", 0.12);
    setTimeout(() => sweep(1800, 1200, 0.08, "sine", 0.1), 160);
    setTimeout(() => beep(1400, 0.06, "sine", 0.09), 260);
    setTimeout(() => beep(1600, 0.06, "sine", 0.08), 330);
    setTimeout(() => beep(1900, 0.12, "sine", 0.1), 400);
    // chord
    setTimeout(() => { beep(1047, 0.25, "sine", 0.07); beep(1318, 0.25, "sine", 0.06); beep(1568, 0.25, "sine", 0.05); }, 560);
  }, []);

  /* ── Keypress ── */
  const playKeypress = useCallback(() => {
    if (!enabledRef.current) return;
    beep(600 + Math.random() * 600, 0.035, "square", 0.035);
  }, []);

  /* ── Step change ── */
  const playStep = useCallback(() => {
    if (!enabledRef.current) return;
    beep(660, 0.06, "sine", 0.07);
    setTimeout(() => beep(880, 0.08, "sine", 0.06), 80);
  }, []);

  /* ── Hover click ── */
  const playClick = useCallback(() => {
    if (!enabledRef.current) return;
    beep(1200, 0.04, "square", 0.05);
  }, []);

  const toggle = useCallback(() => {
    enabledRef.current = !enabledRef.current;
    return enabledRef.current;
  }, []);

  return { playSuccess, playError, playNotification, playSend, playKeypress, playStep, playClick, toggle };
}
