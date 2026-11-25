import fs from 'node:fs';
import path from 'node:path';
import { ensureDir, rel } from './html.mjs';

function pageShell(o) {
  const W = o.w, H = o.h;
  const sizes = { kicker: Math.round(H * 0.019), main: Math.round(H * (o.template === 'corner' ? 0.075 : 0.070)), sub: Math.round(H * 0.023), tag: Math.round(H * 0.020) };
  const tags = o.template === 'corner' ? o.tags.slice(0, 4) : [];
  const dur = o.dur || 2.2;
  const spots = {
    4: [[0.17, 0.285], [0.83, 0.285], [0.17, 0.585], [0.83, 0.585]],
    3: [[0.17, 0.285], [0.83, 0.285], [0.50, 0.615]],
    2: [[0.17, 0.285], [0.83, 0.285]],
    1: [[0.50, 0.655]]
  };
  const tagHtml = tags.map((t, i) => {
    const sp = (spots[tags.length] || spots[1])[i] || [0.5, 0.285];
    return '<div class="tag" data-anim data-d="' + (0.30 + i * 0.07).toFixed(2) + '" style="left:' + (sp[0] * 100).toFixed(1) + '%;top:' + (sp[1] * 100).toFixed(1) + '%">' +
      '<i></i><b>' + esc(t) + '</b></div>';
  }).join('\n    ');
  const css = [
    'html,body{margin:0;padding:0;background:transparent;overflow:hidden}',
    'body{width:' + W + 'px;height:' + H + 'px;font-family:"Microsoft YaHei","Noto Sans SC",sans-serif;color:#fff}',
    '.stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}',
    '.col{position:absolute;left:0;right:0;text-align:center}',
    '.kicker{top:' + (0.250 * H).toFixed(0) + 'px;font-size:' + sizes.kicker + 'px;letter-spacing:.42em;color:rgba(255,255,255,.78);font-weight:500}',
    '.hair{height:2px;background:linear-gradient(90deg,rgba(200,164,106,0),rgba(200,164,106,.85),rgba(200,164,106,0));width:' + (W * 0.5).toFixed(0) + 'px;left:' + (W * 0.25).toFixed(0) + 'px;top:' + (0.300 * H).toFixed(0) + 'px;position:absolute}',
    '.main{top:' + (0.330 * H).toFixed(0) + 'px;font-size:' + sizes.main + 'px;font-weight:800;letter-spacing:.02em;line-height:1.12;color:' + o.color + ';text-shadow:0 6px 26px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.9)}',
    '.corner .main{top:' + (0.375 * H).toFixed(0) + 'px}',
    '.sub{top:' + (0.470 * H).toFixed(0) + 'px;font-size:' + sizes.sub + 'px;font-weight:500;color:rgba(255,255,255,.86);letter-spacing:.06em;padding:0 ' + (W * 0.12).toFixed(0) + 'px}',
    '.hair2{top:' + (0.510 * H).toFixed(0) + 'px;width:' + (W * 0.34).toFixed(0) + 'px;left:' + (W * 0.33).toFixed(0) + 'px;opacity:.65}',
    '.tag{position:absolute;transform:translate(-50%,-50%);font-size:' + sizes.tag + 'px;color:' + o.tagColor + ';white-space:nowrap}',
    '.tag i{display:block;width:52px;height:2px;background:' + o.tagColor + ';margin:0 auto 10px;opacity:.85}',
    '.tag b{font-weight:600;letter-spacing:.16em}',
    '.flash{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.55),rgba(255,255,255,0) 62%);opacity:0;pointer-events:none}',
    '.grain{position:absolute;inset:0;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.05),rgba(0,0,0,.18) 78%);pointer-events:none}'
  ].join('\n');
  const js = [
    '(function(){',
    '  var items = [].slice.call(document.querySelectorAll("[data-anim]"));',
    '  var DUR = ' + dur.toFixed(2) + ';',
    '  var flash = document.querySelector(".flash");',
    '  function ease(p){ return 1 - Math.pow(1 - p, 3); }',
    '  function frame(t){',
    '    items.forEach(function(el){',
    '      var d = parseFloat(el.getAttribute("data-d") || "0");',
    '      var p = Math.max(0, Math.min(1, (t - d) / 0.34));',
    '      var e = ease(p);',
    '      var fade = t > DUR - 0.28 ? Math.max(0, (DUR - t) / 0.28) : 1;',
    '      el.style.opacity = (p * fade).toFixed(3);',
    '      el.style.transform = (el.className.indexOf("tag") >= 0 ? "translate(-50%,-50%) " : "") + "translateY(" + ((1 - e) * 22).toFixed(2) + "px) scale(" + (0.94 + 0.06 * e).toFixed(3) + ")";',
    '    });',
    '    if (flash) flash.style.opacity = (t < 0.18 && t < DUR ? (1 - t / 0.18) * 0.40 : 0).toFixed(3);',
    '  }',
    '  window.film = { frame: frame, ready: true };',
    '  frame(0);',
    '})();'
  ].join('\n');
  return '<!doctype html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n<title>' + esc(o.main) + '</title>\n<style>\n' + css + '\n</style>\n</head>\n<body class="' + o.template + '">\n  <div class="grain"></div>\n  <div class="col kicker" data-anim data-d="0.00">' + esc(o.kicker) + '</div>\n  <div class="hair" data-anim data-d="0.06"></div>\n  <div class="col main" data-anim data-d="0.10">' + esc(o.main) + '</div>\n  <div class="col sub" data-anim data-d="0.22">' + esc(o.sub) + '</div>\n  <div class="hair hair2" data-anim data-d="0.26"></div>\n    ' + tagHtml + '\n  <div class="flash"></div>\n<script>\n' + js + '\n</script>\n</body>\n</html>\n';
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export function buildPages(dir, plan) {
  const W = plan.canvas.w, H = plan.canvas.h;
  const big = plan.theme.bigword || '#F2C14E';
  const tagColor = (plan.theme.colors && (plan.theme.colors.entity || plan.theme.colors.concept)) || '#7EA6FF';
  const out = [];
  plan.events.forEach((ev, i) => {
    const name = 'koubo-poster-' + String(i + 1).padStart(2, '0');
    const html = pageShell({ w: W, h: H, template: ev.template || (i % 2 ? 'corner' : 'stack'), kicker: ev.kicker, main: ev.main, sub: ev.sub, tags: ev.tags || [], color: big, tagColor, dur: ev.dur });
    const file = path.join(dir, 'pages', name + '.html');
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, html, 'utf8');
    out.push({ name, src: rel(dir, file), at: ev.t, dur: ev.dur, event: i });
  });
  return out;
}

export function pageSections(pages, plan) {
  const W = plan.canvas.w, H = plan.canvas.h;
  return pages.map((p) => '<section id="' + p.name + '">\n  <iframe src="' + p.src + '" at="' + p.at.toFixed(3) + '" size="' + W + ',' + H + '" style="left:0;top:0;width:' + W + 'px;height:' + H + 'px"></iframe>\n</section>').join('\n');
}
