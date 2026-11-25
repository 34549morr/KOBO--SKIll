import fs from 'node:fs';
import path from 'node:path';

export function projectDir(dir) {
  const at = path.resolve(dir || '.');
  if (fs.existsSync(path.join(at, 'film.html'))) return at;
  throw new Error('not an OpenFilm project (no film.html in ' + at + ')');
}

export function filmPath(dir) { return path.join(projectDir(dir), 'film.html'); }

export function readFilm(dir) { return fs.readFileSync(filmPath(dir), 'utf8'); }

export function writeFilm(dir, html) { fs.writeFileSync(filmPath(dir), html, 'utf8'); }

export function canvasOf(html) {
  const m = html.match(/<meta[^>]+name=["']viewport["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']viewport["']/i);
  let w = 1920, h = 1080;
  if (m) {
    const c = m[1];
    const mw = c.match(/width\s*=\s*([0-9]+)/i);
    const mh = c.match(/height\s*=\s*([0-9]+)/i);
    if (mw) w = parseInt(mw[1], 10);
    if (mh) h = parseInt(mh[1], 10);
  }
  return { w, h };
}

export function markers(id) {
  return { open: '<!-- koubo:' + id + ' -->', close: '<!-- /koubo:' + id + ' -->' };
}

function escRe(s) { return s.replace(/[.*+?^$()|[\]\\]/g, '\\$&'); }

export function replaceBlock(html, id, body, opts) {
  const m = markers(id);
  const block = m.open + '\n' + body + '\n' + m.close;
  const re = new RegExp(escRe(m.open) + '[\\s\\S]*?' + escRe(m.close));
  if (re.test(html)) html = html.replace(re, block);
  else {
    const at = html.lastIndexOf('</body>');
    if (at < 0) throw new Error('film.html has no </body>');
    html = html.slice(0, at) + block + '\n' + html.slice(at);
  }
  if (opts && opts.top) {
    // the first section is on top: put this block right after <body> so overlays sit above the footage
    html = html.replace(block, '');
    html = html.replace(/<body([^>]*)>\s*/i, '<body$1>\n' + block + '\n');
  }
  return html;
}

export function blockOf(html, id) {
  const m = markers(id);
  const re = new RegExp(escRe(m.open) + '([\\s\\S]*?)' + escRe(m.close));
  const r = html.match(re);
  return r ? r[1] : '';
}

export function attr(tag, name) {
  const re = new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i');
  const m = tag.match(re);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
}

export function clips(html) {
  const out = [];
  const re = /<(video|audio|img|iframe)\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const item = { tag: m[1].toLowerCase(), at: parseFloat(attr(tag, 'at') || '0') || 0, src: attr(tag, 'src') || '', speed: parseFloat(attr(tag, 'speed') || '1') || 1, raw: tag };
    const frag = item.src.match(/#t=([0-9.]+)(?:,([0-9.]+))?/);
    item.in = frag ? parseFloat(frag[1]) : 0;
    item.out = frag && frag[2] ? parseFloat(frag[2]) : null;
    out.push(item);
  }
  return out;
}

export function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); return p; }

export function rel(dir, p) { return path.relative(dir, p).split(path.sep).join('/'); }

export function writeText(file, text) { ensureDir(path.dirname(file)); fs.writeFileSync(file, text, 'utf8'); return file; }
