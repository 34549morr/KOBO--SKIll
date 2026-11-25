import fs from 'node:fs';
import { roleOf, detectTheme, paletteFor, planColor } from './style.mjs';

const STRONG = ['其实', '真正', '本质', '关键', '唯一', '根本', '真相', '答案', '说白了', '记住', '反而', '恰恰'];
const GUARD = ['的了着过和与及或在就也都而但却才又把被给从对是为上下中里后前', '一个', '这个', '那个', '什么', '怎么', '可以', '就是', '不是', '没有', '因为', '所以', '但是', '如果', '已经'];
const PUNCT_END = /[。！？!?；;]/;
const PUNCT_SOFT = /[，,、：:]/;

export function readScript(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
}

export function splitSentences(text) {
  const out = [];
  let buf = '';
  for (const ch of text.replace(/\s+/g, ' ')) {
    buf += ch;
    if (PUNCT_END.test(ch)) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

function tokensOf(s, words) {
  const sorted = words.slice().filter((w) => w && w.length >= 2).sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  while (i < s.length) {
    let hit = null;
    for (const w of sorted) if (s.startsWith(w, i)) { hit = w; break; }
    if (hit) { out.push(hit); i += hit.length; continue; }
    const ch = s[i];
    if (out.length && /[，。！？、；：,.!?;:]/.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
    i += 1;
  }
  return out;
}

export function splitLines(sentence, maxChars, dict) {
  const s = sentence.trim();
  if (!s) return [];
  const toks = tokensOf(s, dict);
  const lines = [];
  let cur = '';
  const len = (x) => [...x].length;
  for (const t of toks) {
    if (len(t) > maxChars) {
      if (cur) { lines.push(cur); cur = ''; }
      const chars = [...t];
      for (let i = 0; i < chars.length; i += maxChars) lines.push(chars.slice(i, i + maxChars).join(''));
      continue;
    }
    if (cur && len(cur) + len(t) > maxChars) { lines.push(cur); cur = t; }
    else cur += t;
  }
  if (cur) lines.push(cur);
  if (lines.length > 1 && len(lines[lines.length - 1]) <= 2) {
    const tail = lines.pop();
    lines[lines.length - 1] += tail;
  }
  const badStart = '的了着过和与及在来去个把就都也而但却才又很最更这那';
  for (let i = 1; i < lines.length; i++) {
    while (lines[i] && badStart.indexOf(lines[i][0]) >= 0 && len(lines[i - 1]) < maxChars + 2) {
      lines[i - 1] += lines[i][0];
      lines[i] = lines[i].slice(1);
    }
    if (!lines[i]) { lines.splice(i, 1); i -= 1; }
  }
  return lines;
}

export function keywordsIn(line, dict) {
  const found = [];
  const used = [];
  const sorted = dict.slice().sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    if (!w) continue;
    let from = 0;
    for (;;) {
      const at = line.indexOf(w, from);
      if (at < 0) break;
      const end = at + w.length;
      if (!used.some((u) => at < u[1] && end > u[0])) { found.push({ text: w, start: at, end }); used.push([at, end]); }
      from = at + 1;
    }
  }
  const re = /[0-9][0-9.,]*\s*(?:万亿|亿|万|千|百)?\s*(?:美元|元|倍|%|个|家|年|月|天|秒|分钟)?/g;
  let m;
  while ((m = re.exec(line))) {
    const t = m[0].trim();
    if (!t) continue;
    const at = m.index;
    const end = at + m[0].length;
    if (used.some((u) => at < u[1] && end > u[0])) continue;
    if (t.length < 2) continue;
    found.push({ text: t, start: at, end });
    used.push([at, end]);
  }
  found.sort((a, b) => a.start - b.start);
  return found.map((k) => Object.assign({ role: roleOf(k.text) }, k));
}

export function buildLines(text, style, opts) {
  const maxChars = (opts && opts.maxChars) || (style.typography && style.typography.max_chars) || 12;
  const dict = opts && opts.dict ? opts.dict : (style.default_lexicon || []);
  const sentences = splitSentences(text);
  const lines = [];
  sentences.forEach((sentence, si) => {
    const parts = splitLines(sentence, maxChars, dict);
    parts.forEach((part, pi) => {
      lines.push({ s: si, p: pi, text: part, last: pi === parts.length - 1, sentence });
    });
  });
  return { sentences, lines };
}

export function lineLevel(line, kws) {
  const hasStrong = STRONG.some((w) => line.text.indexOf(w) >= 0);
  const hasNumber = kws.some((k) => k.role === 'number');
  const hasVerdict = kws.some((k) => k.role === 'verdict');
  if (kws.length && (hasStrong || (hasNumber && hasVerdict))) return 3;
  if (hasNumber || kws.length >= 2) return 2;
  if (kws.length) return 2;
  if (line.s === 0 && line.p === 0) return 2;
  return 1;
}

export function timeLines(lines, style, profile, total) {
  const prof = (style.profiles && style.profiles[profile]) || (style.profiles && style.profiles.finance) || { cps: 7 };
  const weights = lines.map((ln) => Math.max(1, [...ln.text].length) + (PUNCT_END.test(ln.text.slice(-1)) ? 2.2 : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  lines.forEach((ln, i) => {
    ln.i = i;
    const d = total * weights[i] / sum;
    ln.t0 = Math.round(t * 1000) / 1000;
    t += d;
    ln.t1 = Math.round(t * 1000) / 1000;
    ln.dur = Math.round(d * 1000) / 1000;
    ln.cps = Math.round(([...ln.text].length / Math.max(0.3, d)) * 10) / 10;
  });
  return { lines, cps: Math.round((lines.reduce((a, ln) => a + [...ln.text].length, 0) / Math.max(0.1, total)) * 10) / 10 };
}

function scoreOf(ln) {
  let s = ln.kw.length;
  for (const w of STRONG) if (ln.text.indexOf(w) >= 0) s += 2;
  if (ln.kw.some((k) => k.role === 'number')) s += 2;
  if (ln.kw.some((k) => k.role === 'verdict')) s += 1;
  return s;
}

export function pickEvents(lines, style, gapSeconds) {
  const gap = gapSeconds || (style.typography && style.typography.poster_every_s) || 8;
  const maxGap = Math.max(12, gap + 4);
  const total = lines.length ? lines[lines.length - 1].t1 : 0;
  const used = new Set();
  const out = [];
  let last = -1e9;
  lines.forEach((ln, i) => {
    if (ln.level < 3) return;
    if (ln.t0 - last < gap) return;
    used.add(i);
    out.push({ line: i, t: ln.t0 });
    last = ln.t0;
  });
  out.sort((a, b) => a.t - b.t);
  const edges = [0].concat(out.map((e) => e.t + gap), [total]);
  for (let g = 0; g + 1 < edges.length; g++) {
    let t = edges[g];
    const b = edges[g + 1];
    while (b - t > maxGap) {
      const hi = Math.min(b, t + maxGap);
      const cands = [];
      lines.forEach((ln, i) => { if (!used.has(i) && ln.t0 >= t && ln.t0 < hi && ln.kw.length) cands.push(i); });
      if (!cands.length) break;
      cands.sort((x, y) => scoreOf(lines[y]) - scoreOf(lines[x]));
      used.add(cands[0]);
      out.push({ line: cands[0], t: lines[cands[0]].t0 });
      t = lines[cands[0]].t0 + gap;
    }
  }
  if (!out.length) {
    let best = 0;
    lines.forEach((ln, i) => { if (scoreOf(ln) > scoreOf(lines[best])) best = i; });
    out.push({ line: best, t: lines[best].t0 });
  }
  return out.sort((a, b) => a.t - b.t);
}

export function buildPlan(args) {
  const { text, style, profile, theme, voiceDur, canvas, title, badge, watermark } = args;
  const th = theme && theme !== 'auto' ? { name: theme, label: (style.themes[theme] || {}).label || theme, colors: (style.themes[theme] || {}).colors || {}, lexicon: (style.themes[theme] || {}).lexicon || [] } : detectTheme(style, text);
  const themeLex = (style.themes[th.name] || {}).lexicon || [];
  const allWords = [];
  (style.default_lexicon || []).concat(themeLex).forEach((w) => { if (w && allWords.indexOf(w) < 0) allWords.push(w); });
  const pal = paletteFor(style, th);
  const typo = style.typography || {};
  const splitGuard = (typo.split_guard || []).concat(allWords);
  const { sentences, lines } = buildLines(text, style, { maxChars: typo.max_chars, dict: splitGuard });
  const dict = allWords;
  const W = canvas && canvas.w ? canvas.w : 1080;
  const H = canvas && canvas.h ? canvas.h : 1920;
  const cps = ((style.profiles && style.profiles[profile]) || {}).cps || 7;
  const estimated = lines.reduce((a, ln) => a + [...ln.text].length / cps + (PUNCT_END.test(ln.text.slice(-1)) ? 0.18 : 0.03), 0);
  const total = Math.round((voiceDur || estimated) * 1000) / 1000;

  lines.forEach((ln) => {
    const kws = keywordsIn(ln.text, dict);
    const used = [];
    kws.forEach((k) => {
      const pick = planColor(style, th, k.role, used, typo.max_colors || 3);
      k.color = pick.color;
      k.roleOut = pick.role;
      used.push(pick.color);
    });
    ln.kw = kws;
    ln.level = lineLevel(ln, kws);
  });
  const timed = timeLines(lines, style, profile, total);

  const events = pickEvents(lines, style, typo.poster_every_s).map((e, i) => {
    const ln = lines[e.line];
    const kws = ln.kw || [];
    const pooled = kws.slice();
    const nxt = lines[e.line + 1];
    if (nxt && !/[。！？；]$/.test(ln.text) && [...nxt.text.replace(/[。！？]/g, '')].length <= 6) {
      pooled.length = 0;
      (nxt.kw || []).forEach((k) => pooled.push(k));
      kws.forEach((k) => pooled.push(k));
    }
    const ranked = pooled.slice().sort((a, b) => b.text.length - a.text.length);
    const merged = nxt && !/[。！？；]$/.test(ln.text) && [...nxt.text.replace(/[。！？]/g, '')].length <= 6;
    const nxtText = merged ? nxt.text.replace(/[。！？]/g, '') : '';
    const main = merged && nxtText.length >= 3 && nxtText.length <= 6 ? { text: nxtText, role: (ranked[0] || {}).role } : ranked[0];
    const tags = kws.filter((k) => !main || k.text !== main.text).map((k) => k.text).slice(0, 4);
    return {
      i,
      t: Math.round(e.t * 1000) / 1000,
      line: e.line,
      level: 3,
      main: main ? main.text.slice(0, 8) : ln.text.replace(/[。！？，、；：]/g, '').slice(0, 8),
      sub: ln.text.replace(/[。！？]/g, '').replace(/[的了和与及把就都也而但却才又很最更这那]$/, ''),
      kicker: '// ' + String(i + 1).padStart(2, '0'),
      tags,
      template: i % 2 === 0 ? 'stack' : 'corner',
      dur: 2.2
    };
  });
  const gapAfter = total * 0.9;
  events.forEach((ev, i) => {
    const next = i + 1 < events.length ? events[i + 1].t : gapAfter;
    ev.dur = Math.max(1.4, Math.min(2.6, next - ev.t));
  });

  const sfx = [];
  events.forEach((ev) => {
    sfx.push({ t: Math.max(0, Math.round((ev.t - 0.32) * 1000) / 1000), type: 'whoosh', gain: 0.28 });
    sfx.push({ t: Math.round(ev.t * 1000) / 1000, type: 'impact', gain: 0.34 });
  });
  const lastEv = events[events.length - 1];
  if (lastEv) sfx.push({ t: Math.max(0, Math.round((lastEv.t - 0.9) * 1000) / 1000), type: 'riser', gain: 0.22 });
  lines.forEach((ln, i) => {
    if (i % 3 !== 0) return;
    if (sfx.some((s) => Math.abs(s.t - ln.t0) < 0.35)) return;
    sfx.push({ t: Math.round(ln.t0 * 1000) / 1000, type: 'tick', gain: 0.12 });
  });

  const sentencesOut = sentences.map((s, i) => {
    const own = lines.filter((ln) => ln.s === i);
    return { i, text: s, t0: own.length ? own[0].t0 : 0, t1: own.length ? own[own.length - 1].t1 : 0 };
  });

  return {
    version: '0.4.0',
    generator: 'koubo-editor (OpenFilm)',
    title: title || '',
    badge: badge || '',
    watermark: watermark || '',
    theme: { name: th.name, label: th.label, colors: pal.colors, bigword: pal.big, matched: !!th.matched },
    profile,
    canvas: { w: W, h: H },
    voice: args.voice || '',
    duration: total,
    cps: timed.cps,
    sentences: sentencesOut,
    lines: lines.map((ln) => ({
      i: ln.i, s: ln.s, p: ln.p, text: ln.text, t0: ln.t0, t1: ln.t1, dur: ln.dur, cps: ln.cps,
      level: ln.level, kw: ln.kw.map((k) => ({ text: k.text, role: k.role, color: k.color, start: k.start, end: k.end }))
    })),
    events,
    sfx: sfx.sort((a, b) => a.t - b.t),
    typography: {
      sub_ratio: (style.layout && style.layout.sub_ratio) || 0.028,
      baseline: (style.layout && style.layout.sub_baseline) || 0.735,
      max_colors: typo.max_colors || 3,
      poster_every_s: typo.poster_every_s || 8
    }
  };
}
