// SHA256SUMS: one line per file, "<64 hex>  <path>", sorted by path, LF.
// Same format as `sha256sum`, so anyone can check a release by hand.
import { createHash } from 'node:crypto';

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function format(entries) {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sorted.map((e) => `${e.sha256}  ${e.path}\n`).join('');
}

export function parse(text) {
  const map = new Map();
  const lines = String(text).split('\n').filter((l) => l.trim() !== '');
  for (const [i, line] of lines.entries()) {
    const m = /^([0-9a-f]{64}) {2}([^\s].*)$/.exec(line);
    if (!m) throw new Error(`hash list line ${i + 1} is malformed`);
    if (m[2].includes('..') || m[2].startsWith('/')) throw new Error(`hash list line ${i + 1} has an unsafe path`);
    if (map.has(m[2])) throw new Error(`hash list lists ${m[2]} twice`);
    map.set(m[2], m[1]);
  }
  if (map.size === 0) throw new Error('hash list is empty');
  return map;
}

// expected/actual: Map(path -> hash). Every difference is reported.
export function compare(expected, actual) {
  const missing = [...expected.keys()].filter((p) => !actual.has(p)).sort();
  const extra = [...actual.keys()].filter((p) => !expected.has(p)).sort();
  const changed = [...expected.keys()]
    .filter((p) => actual.has(p) && actual.get(p) !== expected.get(p))
    .sort()
    .map((p) => ({ path: p, expected: expected.get(p), actual: actual.get(p) }));
  return { ok: missing.length === 0 && extra.length === 0 && changed.length === 0, missing, extra, changed };
}

export function describe(result) {
  if (result.ok) return 'all files match';
  const out = [];
  for (const p of result.missing) out.push(`missing   ${p}`);
  for (const p of result.extra) out.push(`unexpected ${p}`);
  for (const c of result.changed) out.push(`changed   ${c.path}\n          expected ${c.expected}\n          got      ${c.actual}`);
  return out.join('\n');
}
