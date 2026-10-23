// 효과음: 파일 없이 Web Audio로 짧게 만든다. 소리 끔 상태는 기기에 저장된다.
import { getMuted, putMuted } from './records.js';

let ctx = null;
let muted = getMuted();

export const isMuted = () => muted;
export function toggleMuted() {
  muted = !muted;
  putMuted(muted);
  return muted;
}

function audio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// 짧은 잡음을 걸러 "탁" 하는 카드 소리를 낸다
function tap({ freq, q, dur, gain }) {
  const a = audio();
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource();
  src.buffer = buf;
  const bp = a.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(a.destination);
  src.start();
}

function notes(freqs, step, peak) {
  const a = audio();
  freqs.forEach((f, i) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = a.currentTime + i * step;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + 0.65);
  });
}

const SOUNDS = {
  place: () => tap({ freq: 1700, q: 1.2, dur: 0.05, gain: 0.32 }),
  flip: () => tap({ freq: 2600, q: 0.8, dur: 0.05, gain: 0.16 }),
  tick: () => tap({ freq: 3200, q: 1.4, dur: 0.03, gain: 0.12 }),
  match: () => notes([659.25, 987.77], 0.08, 0.14),
  miss: () => tap({ freq: 600, q: 0.8, dur: 0.08, gain: 0.2 }),
  win: () => notes([523.25, 659.25, 783.99, 1046.5], 0.11, 0.18),
};

export function play(kind) {
  if (!muted) SOUNDS[kind]?.();
}
