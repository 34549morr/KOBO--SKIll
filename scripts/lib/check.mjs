import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFilm, canvasOf, clips } from './html.mjs';

export function parseVtt(file) {
  const text = fs.readFileSync(file, 'utf8');
  const body = text.split(/\n\n+/);
  const cues = [];
  for (const block of body) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const idx = lines.findIndex((l) => l.indexOf('-->') > 0);
    if (idx < 0) continue;
    const m = lines[idx].match(/(\d+):(\d+):(\d+)\.(\d+)\s*-->\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (!m) continue;
    const toS = (h, mm, s, ms) => (+h) * 3600 + (+mm) * 60 + (+s) + (+ms) / 1000;
    const textLine = lines.slice(idx + 1).join(' ');
    const colors = (textLine.match(/<c\.[^>]*>/g) || []).map((c) => (c.match(/\.c(\d)/) || [])[1]).filter(Boolean);
    cues.push({ start: toS(m[1], m[2], m[3], m[4]), end: toS(m[5], m[6], m[7], m[8]), text: textLine.replace(/<[^>]+>/g, ''), colors: colors.length });
  }
  return cues;
}

function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const err = (r.stderr || '') + (r.stdout || '');
  const hits = err.match(/I:\s*(-?[0-9.]+)\s*LUFS/g) || [];
  if (!hits.length) return null;
  const last = hits[hits.length - 1].match(/-?[0-9.]+/);
  return last ? parseFloat(last[0]) : null;
}

export function check(dir, plan) {
  const html = readFilm(dir);
  const canvas = canvasOf(html);
  const cl = clips(html);
  const vtt = path.join(dir, 'koubo', 'captions.vtt');
  const cues = fs.existsSync(vtt) ? parseVtt(vtt) : [];
  const total = plan ? plan.duration : Math.max(0, ...cl.map((c) => c.at + 2));
  const covered = cues.reduce((a, c) => a + Math.max(0, Math.min(c.end, total) - c.start), 0);
  const longLines = cues.filter((c) => [...c.text].length > (plan ? 16 : 20));
  const maxColors = cues.reduce((a, c) => Math.max(a, c.colors), 0);
  const posters = (html.match(/id="koubo-poster-/g) || []).length;
  const sfx = (html.match(/id="koubo-sfx-/g) || []).length;
  const emptySections = (html.match(/<section[^>]*>\s*<\/section>/g) || []).length;
  const warnings = [];
  if (!cues.length) warnings.push('no captions: run koubo captions');
  if (posters === 0) warnings.push('no poster frames: run koubo pages');
  if (sfx === 0) warnings.push('no sfx: run koubo sfx');
  if (maxColors > 3) warnings.push('caption line uses ' + maxColors + ' colors (max 3)');
  if (longLines.length) warnings.push(longLines.length + ' caption cue(s) longer than 16 chars');
  if (emptySections) warnings.push(emptySections + ' empty section(s)');
  const audio = plan && plan.voice && fs.existsSync(path.join(dir, plan.voice)) ? loudness(path.join(dir, plan.voice)) : null;
  if (audio !== null && (audio < -22 || audio > -10)) warnings.push('voice loudness ' + audio + ' LUFS (target -16..-14)');
  const report = {
    project: dir,
    canvas,
    clips: cl.length,
    captions: { cues: cues.length, coverage: Math.round((covered / Math.max(0.01, total)) * 1000) / 1000, maxColors, longest: cues.reduce((a, c) => Math.max(a, [...c.text].length), 0) },
    posters,
    posterGap: plan && plan.events && plan.events.length > 1 ? Math.round(Math.max(...plan.events.slice(1).map((e, i) => e.t - plan.events[i].t)) * 10) / 10 : null,
    sfx,
    duration: total,
    voiceLufs: audio,
    captionAnim: 'color only (Chromium ignores @keyframes on ::cue)',
    warnings
  };
  return report;
}
