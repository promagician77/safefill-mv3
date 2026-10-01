// Checks a package against the signed hash list.
//
//   Store package, hash list from the matching signed tag (scheduled job):
//     node scripts/verify-webstore.mjs --item <extension id> --from-git
//   Store package (or a downloaded .crx) against a given list:
//     node scripts/verify-webstore.mjs --item <id> --expected release/SHA256SUMS
//     node scripts/verify-webstore.mjs --crx file.crx --expected release/SHA256SUMS
//   Our own release zip, strictly, before upload:
//     node scripts/verify-webstore.mjs --zip release/safefill-0.1.0.zip --expected signed-sums --strict
//
// The store adds a few things to every package. They are listed explicitly
// below and printed in the report; anything else that differs fails.
//   _metadata/      content-verification data the store generates
//   manifest.json   may gain store-managed keys (update_url). It must be
//                   identical to ours once exactly those keys are removed.
// Confirm this list on the first staging upload; it is deliberately short.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { zipFromCrx } from './lib/crx.mjs';
import { readZip } from './lib/zip.mjs';
import { normalizeText } from './lib/build-core.mjs';
import { parse, compare, describe, sha256 } from './lib/hashlist.mjs';

export const STORE_ADDED_PREFIXES = ['_metadata/'];
export const STORE_MANIFEST_KEYS = ['update_url', 'key'];

function canonicalManifest(buf) {
  const obj = JSON.parse(buf.toString('utf8'));
  for (const k of STORE_MANIFEST_KEYS) delete obj[k];
  const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v;
  return JSON.stringify(sortKeys(obj));
}

export function verifyPackage({ crx, zip, expectedSums, ourManifest, strict = false }) {
  const files = readZip(zip || zipFromCrx(crx));
  const notes = [];
  const actual = new Map();
  for (const [path, data] of files) {
    if (!strict && STORE_ADDED_PREFIXES.some((p) => path.startsWith(p))) { notes.push(`store-added, ignored by rule: ${path}`); continue; }
    actual.set(path, sha256(data));
  }
  const expected = parse(expectedSums);
  if (!strict && actual.has('manifest.json') && expected.get('manifest.json') !== actual.get('manifest.json') && ourManifest) {
    if (canonicalManifest(files.get('manifest.json')) === canonicalManifest(ourManifest)) {
      notes.push(`manifest.json matches after removing store-managed keys (${STORE_MANIFEST_KEYS.join(', ')})`);
      actual.set('manifest.json', expected.get('manifest.json'));
    }
  }
  const result = compare(expected, actual);
  const version = files.has('manifest.json') ? JSON.parse(files.get('manifest.json').toString('utf8')).version : null;
  return { ok: result.ok, notes, report: describe(result), checked: actual.size, version };
}

async function download(id) {
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx3'
    + `&x=id%3D${encodeURIComponent(id)}%26installsource%3Dondemand%26uc`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed with HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  const has = (n) => process.argv.includes(n);
  const input = arg('--zip') ? { zip: await readFile(arg('--zip')) }
    : { crx: arg('--crx') ? await readFile(arg('--crx')) : await download(arg('--item')) };
  let expectedSums; let ourManifest;
  if (has('--from-git')) {
    // Use the signed tag that matches the version the store is serving now,
    // so a version still in review does not raise a false alarm.
    const served = JSON.parse(readZip(zipFromCrx(input.crx)).get('manifest.json').toString('utf8')).version;
    const tag = `v${served}`;
    expectedSums = execFileSync('git', ['for-each-ref', `refs/tags/${tag}`, '--format=%(contents:body)'], { encoding: 'utf8' });
    if (!expectedSums.trim()) { process.stdout.write(`The store serves ${served}, but there is no signed tag ${tag}. Treat as an incident.\n`); process.exit(1); }
    ourManifest = normalizeText(execFileSync('git', ['show', `${tag}:extension/manifest.json`]));
    process.stdout.write(`store serves ${served}; checking against signed tag ${tag}\n`);
  } else {
    expectedSums = await readFile(arg('--expected') || 'release/SHA256SUMS', 'utf8');
    ourManifest = has('--strict') ? null : await readFile(arg('--manifest') || 'dist/manifest.json');
  }
  const res = verifyPackage({ ...input, expectedSums, ourManifest, strict: has('--strict') });
  for (const n of res.notes) process.stdout.write(`note: ${n}\n`);
  process.stdout.write(res.ok ? `Package matches the signed hash list (${res.checked} files).\n` : `Package DOES NOT match the signed hash list:\n${res.report}\n`);
  process.exit(res.ok ? 0 : 1);
}
