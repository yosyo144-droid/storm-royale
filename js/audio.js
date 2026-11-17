'use strict';

/* ==========================================================================
   AUDIO — tiny synthesized sound engine (no assets)
   ========================================================================== */

let actx = null, master = null, noiseBuf = null;
let audioMuted = false;

function initAudio() {
  if (actx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.55;
  master.connect(actx.destination);
  const len = Math.floor(actx.sampleRate * 0.6);
  noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function noise(dur, cutoff, vol, q) {
  if (!actx) return;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = actx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = cutoff;
  filt.Q.value = q || 1;
  const g = actx.createGain();
  const t = actx.currentTime;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freqStart, freqEnd, dur, vol, type) {
  if (!actx) return;
  const o = actx.createOscillator();
  const g = actx.createGain();
  const t = actx.currentTime;
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freqStart, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function sfx(name, x, y, vol) {
  if (!actx || audioMuted) return;
  let v = vol == null ? 1 : vol;
  if (x != null && G.player && G.player.alive) {
    const d = dist(x, y, G.player.x, G.player.y);
    v *= Math.pow(clamp(1 - d / 1700, 0, 1), 1.4);
  }
  if (v < 0.03) return;
  switch (name) {
    case 'pistol':
      noise(0.11, 2600, 0.28 * v, 1.2);
      tone(320, 90, 0.09, 0.14 * v, 'square');
      break;
    case 'smg':
      noise(0.07, 3400, 0.18 * v, 1.5);
      tone(420, 140, 0.06, 0.1 * v, 'square');
      break;
    case 'ar':
      noise(0.15, 2200, 0.3 * v, 1);
      tone(240, 70, 0.12, 0.16 * v, 'sawtooth');
      break;
    case 'shotgun':
      noise(0.32, 1400, 0.42 * v, 0.8);
      tone(140, 45, 0.24, 0.22 * v, 'sawtooth');
      break;
    case 'sniper':
      noise(0.4, 3000, 0.36 * v, 0.9);
      tone(180, 50, 0.34, 0.2 * v, 'square');
      break;
    case 'reload':
      noise(0.05, 5000, 0.1 * v, 2);
      setTimeout(() => { if (actx) noise(0.05, 4000, 0.09 * v, 2); }, 130);
      break;
    case 'pickup':
      tone(880, 1320, 0.09, 0.1 * v, 'triangle');
      break;
    case 'heal':
      tone(440, 770, 0.22, 0.1 * v, 'sine');
      break;
    case 'kill':
      tone(520, 180, 0.2, 0.15 * v, 'triangle');
      noise(0.18, 900, 0.16 * v, 1);
      break;
    case 'hurt':
      noise(0.16, 700, 0.2 * v, 0.7);
      break;
    case 'click':
      tone(660, 660, 0.05, 0.07 * v, 'square');
      break;
    case 'win':
      tone(523, 523, 0.16, 0.14, 'triangle');
      setTimeout(() => tone(659, 659, 0.16, 0.14, 'triangle'), 150);
      setTimeout(() => tone(784, 784, 0.3, 0.16, 'triangle'), 300);
      break;
    case 'lose':
      tone(300, 120, 0.5, 0.16, 'sawtooth');
      break;
  }
}
