import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SKILL_ROOT = path.resolve(HERE, '..', '..');
export const DSH_STYLE = process.env.KOUBO_DSH || 'C:/Users/34549/.dsh/skills/koubo-editor/templates/style.json';

function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function sync(opts) {
  const local = path.join(SKILL_ROOT, 'templates', 'style.json');
  const record = path.join(SKILL_ROOT, 'sync.json');
  if (!fs.existsSync(DSH_STYLE)) return { ok: false, error: 'source missing: ' + DSH_STYLE };
  const src = sha(DSH_STYLE);
  const cur = fs.existsSync(local) ? sha(local) : '';
  const drift = src !== cur;
  if (opts && opts.check) return { ok: !drift, drift, source: DSH_STYLE, sourceHash: src, localHash: cur };
  if (drift) {
    fs.copyFileSync(DSH_STYLE, local);
    const style = JSON.parse(fs.readFileSync(local, 'utf8'));
    const rec = { source: DSH_STYLE, sourceHash: src, syncedAt: new Date().toISOString(), version: style.version || '' };
    fs.writeFileSync(record, JSON.stringify(rec, null, 2) + '\n', 'utf8');
    return { ok: true, drift: true, source: DSH_STYLE, sourceHash: src, version: rec.version };
  }
  return { ok: true, drift: false, source: DSH_STYLE, sourceHash: src };
}
