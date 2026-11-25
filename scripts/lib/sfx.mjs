import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, rel } from './html.mjs';

const RATE = 48000;

function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

function noise(seed) {
  let s = seed || 1;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return (s / 2147483648) * 2 - 1; };
}

function synth(type) {
  const dur = type === 'impact' ? 0.55 : type === 'riser' ? 0.95 : type === 'tick' ? 0.08 : 0.42;
  const n = Math.round(RATE * dur);
  const out = new Float32Array(n);
  const rnd = noise(type.length * 7 + 3);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE, x = t / dur;
    let v = 0;
    if (type === 'whoosh') {
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, x * 1.05)), 2);
      const cut = 0.06 + 0.34 * Math.sin(Math.PI * x);
      lp += (rnd() - lp) * cut;
      v = lp * env * 0.9;
    } else if (type === 'impact') {
      const env = Math.exp(-t * 9);
      const body = Math.sin(2 * Math.PI * (62 - 18 * x) * t) * env;
      const click = rnd() * Math.exp(-t * 60) * 0.5;
      const sub = Math.sin(2 * Math.PI * 33 * t) * Math.exp(-t * 6) * 0.5;
      v = (body + click + sub) * 0.9;
    } else if (type === 'riser') {
      const f = 180 * Math.pow(1400 / 180, x);
      const env = Math.pow(x, 1.6);
      v = Math.sin(2 * Math.PI * f * t) * env * 0.55 + rnd() * env * 0.08;
    } else {
      const env = Math.exp(-t * 55);
      v = Math.sin(2 * Math.PI * 2400 * t) * env * 0.5;
    }
    out[i] = v * 0.8;
  }
  return out;
}

export function buildSfx(dir, plan) {
  const types = ['whoosh', 'impact', 'riser', 'tick'];
  const dirSfx = path.join(dir, 'assets', 'sfx');
  ensureDir(dirSfx);
  const files = {};
  types.forEach((t) => {
    const file = path.join(dirSfx, 'koubo-' + t + '.wav');
    fs.writeFileSync(file, wav(synth(t)));
    files[t] = rel(dir, file);
  });
  const cues = plan.sfx.map((c) => ({ t: c.t, type: c.type, gain: c.gain || 0.3, src: files[c.type] })).filter((c) => c.src);
  return { files, cues };
}

export function sfxSections(cues, plan) {
  return cues.map((c, i) => '<section id="koubo-sfx-' + String(i + 1).padStart(2, '0') + '">\n  <audio src="' + c.src + '" at="' + c.t.toFixed(3) + '" volume="' + c.gain.toFixed(2) + '"></audio>\n</section>').join('\n');
}
