// Live-seurannan äänimerkit Web Audio API:lla (ei äänitiedostoja).
// Selaimet sallivat äänen vasta käyttäjän toiminnon jälkeen: enableSound() kutsutaan napin painalluksesta.

export type SoundKind = 'goal' | 'mygoal' | 'penalty' | 'other' | 'end';

const KEY = 'hg-live-sound';
let ctx: AudioContext | null = null;

export const soundPref = () => localStorage.getItem(KEY) !== '0';
export function setSoundPref(on: boolean) {
  localStorage.setItem(KEY, on ? '1' : '0');
  if (on) enableSound();
}

export function enableSound() {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* ei ääntä */ }
}

export const soundReady = () => !!ctx && ctx.state === 'running';

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (slideTo) o.frequency.linearRampToValueAtTime(slideTo, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(vol, start + 0.03);
  g.gain.setValueAtTime(vol, start + dur - 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(start);
  o.stop(start + dur + 0.02);
}

/** Maalitorvi (kaksi sointia), tuomarin pilli, lyhyt merkkiääni tai loppusummeri. */
export function playSound(kind: SoundKind) {
  if (!ctx || !soundPref()) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const t = ctx.currentTime + 0.02;
  switch (kind) {
    case 'mygoal':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.11, 0.18, 'triangle', 0.25));
      tone(196, t + 0.5, 1.1, 'sawtooth', 0.18); tone(247, t + 0.5, 1.1, 'sawtooth', 0.12);
      break;
    case 'goal':
      tone(196, t, 0.9, 'sawtooth', 0.18); tone(247, t, 0.9, 'sawtooth', 0.12);
      tone(196, t + 1.0, 0.9, 'sawtooth', 0.18); tone(247, t + 1.0, 0.9, 'sawtooth', 0.12);
      break;
    case 'penalty':
      tone(2800, t, 0.18, 'sine', 0.15, 3100); tone(2800, t + 0.24, 0.45, 'sine', 0.15, 2600);
      break;
    case 'end':
      tone(330, t, 1.4, 'square', 0.12);
      break;
    default:
      tone(880, t, 0.12, 'sine', 0.15); tone(1175, t + 0.14, 0.16, 'sine', 0.15);
  }
  if (kind === 'goal' || kind === 'mygoal') navigator.vibrate?.([200, 100, 200]);
}
