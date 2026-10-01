// Deterministic build: extension/ -> files -> SHA256SUMS + zip.
// No bundler, no transpiler, no dependencies. Text files are normalized to LF
// with no BOM, so a Windows checkout produces the same bytes as Linux.
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, relative, sep } from 'node:path';
import { sha256, format } from './hashlist.mjs';
import { writeZip } from './zip.mjs';

export const TEXT_EXT = new Set(['.js', '.json', '.html', '.css']);
export const BINARY_EXT = new Set(['.png']);

async function walk(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) throw new Error(`hidden file not allowed in extension: ${join(dir, ent.name)}`);
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await walk(full)));
    else if (ent.isFile()) out.push(full);
    else throw new Error(`unsupported file type: ${full}`);
  }
  return out;
}

export function normalizeText(buf) {
  let s = buf.toString('utf8');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return Buffer.from(s.replace(/\r\n?/g, '\n'), 'utf8');
}

export async function buildFiles(srcDir) {
  const files = [];
  for (const full of await walk(srcDir)) {
    const path = relative(srcDir, full).split(sep).join('/');
    const ext = extname(path).toLowerCase();
    const raw = await readFile(full);
    if (TEXT_EXT.has(ext)) files.push({ path, data: normalizeText(raw) });
    else if (BINARY_EXT.has(ext)) files.push({ path, data: raw });
    else throw new Error(`file type not on the allowlist: ${path}`);
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifestFile = files.find((f) => f.path === 'manifest.json');
  if (!manifestFile) throw new Error('manifest.json missing');
  const manifest = JSON.parse(manifestFile.data.toString('utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error('manifest version must be x.y.z');
  const entries = files.map((f) => ({ path: f.path, sha256: sha256(f.data) }));
  return { files, manifest, sums: format(entries), entries, zip: writeZip(files) };
}
