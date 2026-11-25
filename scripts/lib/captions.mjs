import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, rel } from './html.mjs';

export const ANIM = ['kwpop', 'kwblur', 'kwglow', 'kwstrobe', 'kwrot', 'kwtrack', 'kwshadow', 'kwsquash', 'kwdrop', 'kwshift', 'kwrise', 'kwkaraoke', 'kwline'];

const KEYFRAMES = [
  ['kwpop', '0%{opacity:0;transform:scale(.72)} 62%{opacity:1;transform:scale(1.14)} 100%{opacity:1;transform:scale(1)}'],
  ['kwblur', '0%{opacity:0;filter:blur(10px)} 100%{opacity:1;filter:blur(0)}'],
  ['kwglow', '0%{text-shadow:0 0 0 rgba(255,255,255,0)} 45%{text-shadow:0 0 26px rgba(255,255,255,.85)} 100%{text-shadow:0 2px 10px rgba(0,0,0,.7)}'],
  ['kwstrobe', '0%{opacity:0} 20%{opacity:1} 40%{opacity:.35} 60%{opacity:1} 100%{opacity:1}'],
  ['kwrot', '0%{opacity:0;transform:rotate(-14deg) scale(.8)} 100%{opacity:1;transform:rotate(0) scale(1)}'],
  ['kwtrack', '0%{opacity:0;letter-spacing:.42em} 100%{opacity:1;letter-spacing:.02em}'],
  ['kwshadow', '0%{opacity:0;text-shadow:0 18px 30px rgba(0,0,0,0)} 100%{opacity:1;text-shadow:0 6px 18px rgba(0,0,0,.85)}'],
  ['kwsquash', '0%{opacity:0;transform:scaleY(1.6) scaleX(.86)} 70%{opacity:1;transform:scaleY(.94) scaleX(1.02)} 100%{transform:scaleY(1) scaleX(1)}'],
  ['kwdrop', '0%{opacity:0;transform:translateY(-26px)} 100%{opacity:1;transform:translateY(0)}'],
  ['kwshift', '0%{filter:hue-rotate(70deg) saturate(1.7);opacity:0} 100%{filter:hue-rotate(0) saturate(1);opacity:1}'],
  ['kwrise', '0%{opacity:0;transform:translateY(18px) scale(.96)} 100%{opacity:1;transform:translateY(0) scale(1)}'],
  ['kwkaraoke', '0%{background:rgba(255,255,255,0)} 100%{background:rgba(255,255,255,.16)}'],
  ['kwline', '0%{opacity:0;text-decoration-color:rgba(255,255,255,0)} 100%{opacity:1;text-decoration-color:currentColor}']
];

function cueTime(t) {
  const ms = Math.max(0, Math.round(t * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  const p2 = (n) => String(n).padStart(2, '0');
  return p2(h) + ':' + p2(m) + ':' + p2(s) + '.' + String(r).padStart(3, '0');
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function buildVtt(plan) {
  const typo = plan.typography;
  const size = Math.round(plan.canvas.h * typo.sub_ratio);
  const line = Math.round(typo.baseline * 100);
  const colors = [];
  plan.lines.forEach((ln) => ln.kw.forEach((k) => { if (colors.indexOf(k.color) < 0) colors.push(k.color); }));
  const styleLines = [];
  styleLines.push('::cue {');
  styleLines.push('  color: #ffffff; background: transparent;');
  styleLines.push('  font-family: "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif;');
  styleLines.push('  font-size: ' + size + 'px; font-weight: 600; letter-spacing: .01em;');
  styleLines.push('  text-shadow: 0 2px 6px rgba(0,0,0,.92), 0 0 2px rgba(0,0,0,.95);');
  styleLines.push('}');
  colors.slice(0, 3).forEach((c, i) => { styleLines.push('::cue(.c' + (i + 1) + ') { color: ' + c + '; font-weight: 800; }'); });
  KEYFRAMES.forEach((k) => { styleLines.push('@keyframes ' + k[0] + ' { ' + k[1] + ' }'); });
  ANIM.forEach((a) => { styleLines.push('::cue(.' + a + ') { animation: ' + a + ' 340ms cubic-bezier(.2,.9,.25,1) both; }'); });
  for (let d = 1; d <= 6; d++) styleLines.push('::cue(.d' + d + ') { animation-delay: ' + (d * 0.09).toFixed(2) + 's; }');
  styleLines.push('::cue(:past) { opacity: .55; }');

  const out = ['WEBVTT', '', 'STYLE', ...styleLines, ''];
  let n = 0;
  plan.lines.forEach((ln, li) => {
    n += 1;
    const parts = [];
    let cursor = 0;
    const text = ln.text;
    const kws = ln.kw.slice().sort((a, b) => a.start - b.start);
    kws.forEach((k, ki) => {
      const at = Math.max(cursor, text.indexOf(k.text, cursor));
      if (at < 0) return;
      if (at > cursor) parts.push(esc(text.slice(cursor, at)));
      const ci = Math.max(0, colors.indexOf(k.color)) + 1;
      const anim = ANIM[(li * 5 + ki * 3) % ANIM.length];
      const delay = Math.min(6, ki + 1);
      parts.push('<c.c' + ci + '.' + anim + '.d' + delay + '>' + esc(k.text) + '</c>');
      cursor = at + k.text.length;
    });
    if (cursor < text.length) parts.push(esc(text.slice(cursor)));
    out.push(String(n));
    out.push(cueTime(ln.t0) + ' --> ' + cueTime(ln.t1) + ' line:' + line + '% position:50% align:center');
    out.push(parts.join(''));
    out.push('');
  });
  return out.join('\n');
}

export function writeVtt(dir, plan, name) {
  const file = path.join(dir, 'koubo', (name || 'captions') + '.vtt');
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, buildVtt(plan), 'utf8');
  return rel(dir, file);
}

export function captionSection(vttRel) {
  return '<section id="koubo-captions">\n  <track kind="captions" src="' + vttRel + '" srclang="zh" label="中文">\n</section>';
}
