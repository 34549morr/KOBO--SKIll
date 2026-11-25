#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadStyle, detectTheme, themeNames, themeByName, STYLE_PATH } from './lib/style.mjs';
import { readScript, buildPlan } from './lib/plan.mjs';
import { projectDir, readFilm, writeFilm, canvasOf, replaceBlock, rel, ensureDir } from './lib/html.mjs';
import { writeVtt, captionSection } from './lib/captions.mjs';
import { buildPages, pageSections } from './lib/pages.mjs';
import { buildSfx, sfxSections } from './lib/sfx.mjs';
import { check } from './lib/check.mjs';
import { sync, DSH_STYLE } from './lib/sync.mjs';

const HELP = [
  'koubo — koubo-editor for OpenFilm',
  '',
  'usage: openfilm koubo <command> [options]',
  '',
  '  init       create koubo/ and a film.html if the project has none',
  '  voice      add or replace the narration track (--voice FILE)',
  '  plan       script.txt -> koubo/plan.json (lines, keywords, levels, timing, theme)',
  '  captions   plan.json -> koubo/captions.vtt + a caption track in film.html',
  '  pages      plan.json -> pages/koubo-poster-NN.html + poster clips in film.html',
  '  sfx        plan.json -> assets/sfx/*.wav + audio clips in film.html',
  '  check      caption coverage, poster frames, sfx, loudness; exit 1 on warnings',
  '  sync       copy the DSH style.json here (single source of truth); --check for drift',
  '  themes     list theme palettes',
  '',
  'options: --project DIR --script FILE --voice FILE --profile finance|emotion|slow',
  '         --theme auto|' + themeNames(loadStyleSafe()).join('|'),
  '         --title T --badge B --watermark W --out FILE --max-chars N',
  '',
  'the rules behind the numbers: references/rules.md'
].join('\n');

function loadStyleSafe() {
  try { return loadStyle(); } catch (e) { return { themes: {}, profiles: {} }; }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function probeDuration(file) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error('voice not found: ' + abs);
  if (/\.wav$/i.test(abs)) {
    try {
      const buf = fs.readFileSync(abs);
      if (buf.toString('ascii', 0, 4) === 'RIFF') {
        const rate = buf.readUInt32LE(24), bits = buf.readUInt16LE(34), ch = buf.readUInt16LE(22);
        const bytes = buf.length - 44;
        const d = bytes / (rate * ch * (bits / 8));
        if (d > 0.1) return Math.round(d * 1000) / 1000;
      }
    } catch (e) { /* fall through to ffprobe */ }
  }
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', abs], { encoding: 'utf8' });
  const d = parseFloat((r.stdout || '').trim());
  if (!isFinite(d) || d <= 0) throw new Error('cannot read duration of ' + abs + ' (need ffprobe for non-wav)');
  return Math.round(d * 1000) / 1000;
}

function planPath(dir, opts) { return opts.out ? path.resolve(opts.out) : path.join(dir, 'koubo', 'plan.json'); }

function loadPlan(dir, opts) {
  const file = planPath(dir, opts);
  if (!fs.existsSync(file)) throw new Error('no plan at ' + file + ' — run koubo plan first');
  return { file, plan: JSON.parse(fs.readFileSync(file, 'utf8')) };
}

function cmdInit(dir, opts) {
  ensureDir(path.join(dir, 'koubo'));
  ensureDir(path.join(dir, 'pages'));
  ensureDir(path.join(dir, 'assets'));
  const film = path.join(dir, 'film.html');
  if (fs.existsSync(film) && !opts.force) return { ok: true, created: false, film };
  const w = parseInt(opts.width || '1080', 10), h = parseInt(opts.height || '1920', 10);
  const html = [
    '<!doctype html>',
    '<html lang="zh">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=' + w + ', height=' + h + '">',
    '<title>' + (opts.title || 'koubo project') + '</title>',
    '<style>',
    'html,body{margin:0;padding:0;background:#0A0C10;overflow:hidden}',
    'body{width:' + w + 'px;height:' + h + 'px}',
    'section{position:absolute;inset:0}',
    'video,img,iframe{position:absolute;object-fit:cover}',
    '</style>',
    '</head>',
    '<body>',
    '<!-- one section is one track; the first section is on top -->',
    '</body>',
    '</html>',
    ''
  ].join('\n');
  fs.writeFileSync(film, html, 'utf8');
  return { ok: true, created: true, film };
}

function cmdPlan(dir, opts) {
  const script = opts.script || opts._[0];
  if (!script) throw new Error('plan needs a script file: koubo plan script.txt');
  const style = loadStyle(opts.style);
  const text = readScript(script);
  let canvas = { w: 1080, h: 1920 };
  try { canvas = canvasOf(readFilm(dir)); } catch (e) { /* not a project yet */ }
  const voice = opts.voice ? path.resolve(opts.voice) : '';
  const voiceDur = voice ? probeDuration(voice) : null;
  const plan = buildPlan({
    text, style, canvas,
    profile: opts.profile || 'finance',
    theme: opts.theme || 'auto',
    voiceDur,
    voice: voice ? rel(dir, voice) : '',
    title: opts.title || '', badge: opts.badge || '', watermark: opts.watermark || ''
  });
  if (opts['max-chars']) plan.typography.max_chars = parseInt(opts['max-chars'], 10);
  const file = planPath(dir, opts);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(plan, null, 2) + '\n', 'utf8');
  return {
    ok: true, plan: file, lines: plan.lines.length, duration: plan.duration, cps: plan.cps,
    theme: plan.theme.name, level3: plan.events.length, voice: plan.voice || null
  };
}

function cmdVoice(dir, opts) {
  const src = opts.voice || opts._[0];
  if (!src || src === true) throw new Error('voice needs a file: koubo voice --voice voice.wav');
  const abs = path.resolve(src);
  if (!fs.existsSync(abs)) throw new Error('voice not found: ' + abs);
  let relPath = rel(dir, abs);
  if (relPath.startsWith('..')) {
    const ext = path.extname(abs) || '.wav';
    const dest = path.join(dir, 'assets', 'voice' + ext);
    ensureDir(path.dirname(dest));
    fs.copyFileSync(abs, dest);
    relPath = rel(dir, dest);
  }
  let html = readFilm(dir);
  html = replaceBlock(html, 'voice', '<section id="voice">\n  <audio src="' + relPath + '" at="0"></audio>\n</section>');
  writeFilm(dir, html);
  return { ok: true, voice: relPath };
}

function cmdCaptions(dir, opts) {
  const { plan } = loadPlan(dir, opts);
  const vtt = writeVtt(dir, plan, opts.name || 'captions');
  let html = readFilm(dir);
  html = replaceBlock(html, 'captions', captionSection(vtt));
  writeFilm(dir, html);
  return { ok: true, vtt, cues: plan.lines.length, track: 'koubo-captions' };
}

function cmdPages(dir, opts) {
  const { plan } = loadPlan(dir, opts);
  const pages = buildPages(dir, plan);
  let html = readFilm(dir);
  html = replaceBlock(html, 'posters', pageSections(pages, plan), { top: true });
  writeFilm(dir, html);
  return { ok: true, pages: pages.map((p) => p.src), at: pages.map((p) => p.at), count: pages.length };
}

function cmdSfx(dir, opts) {
  const { plan } = loadPlan(dir, opts);
  const built = buildSfx(dir, plan);
  let html = readFilm(dir);
  html = replaceBlock(html, 'sfx', sfxSections(built.cues, plan));
  writeFilm(dir, html);
  return { ok: true, files: built.files, cues: built.cues.length };
}

function cmdCheck(dir, opts) {
  const { plan } = loadPlan(dir, opts);
  const r = check(dir, plan);
  return r;
}

function cmdThemes(dir, opts) {
  const style = loadStyle(opts.style);
  return themeNames(style).map((n) => ({ name: n, label: (style.themes[n] || {}).label, colors: (style.themes[n] || {}).colors }));
}

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const opts = parseArgs(argv.slice(1));
  const needsProject = ['plan', 'captions', 'pages', 'sfx', 'voice', 'check'].indexOf(cmd) >= 0;
  const dir = needsProject ? projectDir(opts.project || '.') : path.resolve(opts.project || '.');
  if (!cmd || cmd === 'help' || cmd === '--help') { console.log(HELP); return; }
  let out;
  const initDir = cmd === 'init' ? path.resolve(opts.project || '.') : dir;
  if (cmd === 'init') out = cmdInit(initDir, opts);
  else if (cmd === 'plan') out = cmdPlan(dir, opts);
  else if (cmd === 'captions') out = cmdCaptions(dir, opts);
  else if (cmd === 'voice') out = cmdVoice(dir, opts);
  else if (cmd === 'pages') out = cmdPages(dir, opts);
  else if (cmd === 'sfx') out = cmdSfx(dir, opts);
  else if (cmd === 'check') out = cmdCheck(dir, opts);
  else if (cmd === 'themes') out = cmdThemes(dir, opts);
  else if (cmd === 'sync') out = sync({ check: !!opts.check });
  else throw new Error('unknown command: ' + cmd + ' (try: koubo help)');
  console.log(JSON.stringify(out, null, 2));
  if (cmd === 'check' && out && out.warnings && out.warnings.length) process.exitCode = 1;
  if (cmd === 'sync' && out && out.ok === false) process.exitCode = 1;
}

try { main(); } catch (e) { console.error('koubo: ' + e.message); process.exitCode = 2; }
