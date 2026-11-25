import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..', '..');
export const STYLE_PATH = path.join(SKILL_ROOT, 'templates', 'style.json');

export function loadStyle(file) {
  const at = file || STYLE_PATH;
  const style = JSON.parse(fs.readFileSync(at, 'utf8'));
  style.__path = at;
  return style;
}

export const VERDICT = ['其实', '真正', '根本', '反而', '不是', '错的', '错误', '危险', '浪费', '代价', '骗', '亏', '输', '问题', '风险', '误区', '陷阱', '关键', '核心', '真相', '残酷', '后悔', '崩塌', '失控', '删除', '淘汰', '白费', '麻木', '瓶颈'];
export const ENTITY = ['马斯克', '特斯拉', 'SpaceX', 'xAI', 'OpenAI', 'Grok', '星巴克', '博裕', '医保', 'FDA', 'Gemini', 'Claude', 'DeepMind', 'Twitter', 'IPO', 'GPT', 'AI', 'NVIDIA', '英伟达', '字节', '腾讯', '阿里'];

export function isNumber(word) { return /[0-9]/.test(word); }
export function isLatin(word) { return /[A-Za-z]/.test(word); }

export function roleOf(word) {
  if (isNumber(word)) return 'number';
  for (const w of VERDICT) if (word.includes(w)) return 'verdict';
  if (isLatin(word)) return 'entity';
  for (const w of ENTITY) if (word.indexOf(w) >= 0) return 'entity';
  return 'concept';
}

export function themeNames(style) { return Object.keys(style.themes || {}); }

export function themeByName(style, name) {
  const themes = style.themes || {};
  return themes[name] || themes.generic || themes[themeNames(style)[0]] || { label: '通用', colors: {} };
}

export function detectTheme(style, text) {
  const themes = style.themes || {};
  let best = null;
  for (const name of Object.keys(themes)) {
    if (name === 'generic') continue;
    const lexicon = themes[name].lexicon || [];
    let score = 0;
    for (const w of lexicon) {
      const n = text.split(w).length - 1;
      score += n;
    }
    if (!best || score > best.score) best = { name, score, theme: themes[name] };
  }
  if (!best || best.score < 3) {
    return { name: 'generic', label: (themes.generic || {}).label || '通用', colors: (themes.generic || {}).colors || {}, score: best ? best.score : 0, matched: false };
  }
  return { name: best.name, label: best.theme.label, colors: best.theme.colors, score: best.score, matched: true };
}

const RAMP = ['number', 'concept', 'entity', 'verdict'];

export function paletteFor(style, theme) {
  const fallback = style.themes && style.themes.generic ? style.themes.generic.colors : { number: '#F0B429', verdict: '#FF5A47', concept: '#35C7B4', entity: '#7EA6FF' };
  const colors = Object.assign({}, fallback, theme.colors || {});
  const big = (theme.colors && theme.colors.bigword) || colors.number;
  return { colors, big };
}

export function planColor(style, theme, role, used, maxColors) {
  const pal = paletteFor(style, theme);
  const limit = Math.max(1, Math.min(3, maxColors || 3));
  let order = RAMP.slice(RAMP.indexOf(role)).concat(RAMP.slice(0, RAMP.indexOf(role)));
  if (RAMP.indexOf(role) < 0) order = ['concept', 'number', 'entity', 'verdict'];
  for (const r of order) {
    const c = pal.colors[r];
    if (!c) continue;
    if (used.length < limit && used.indexOf(c) < 0) return { color: c, role: r };
  }
  return { color: used.length ? used[used.length - 1] : pal.colors.number, role };
}
