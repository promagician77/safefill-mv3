import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildFiles } from '../scripts/lib/build-core.mjs';
import { writeZip, readZip } from '../scripts/lib/zip.mjs';
import { makeCrx, zipFromCrx } from '../scripts/lib/crx.mjs';
import { verifyPackage } from '../scripts/verify-webstore.mjs';
import { ROOT } from './helpers.mjs';

const built = await buildFiles(join(ROOT, 'extension'));
const ourManifest = built.files.find((f) => f.path === 'manifest.json').data;

// What the store serves: deflated, with _metadata/ and update_url added.
function storePackage(mutate = (files) => files) {
  let files = built.files.map((f) => ({ path: f.path, data: f.data }));
  const m = JSON.parse(ourManifest.toString());
  m.update_url = 'https://clients2.google.com/service/update2/crx';
  files = files.map((f) => (f.path === 'manifest.json' ? { path: f.path, data: Buffer.from(JSON.stringify(m, null, 2)) } : f));
  files.push({ path: '_metadata/verified_contents.json', data: Buffer.from('[]') });
  return makeCrx(writeZip(mutate(files), { compress: true }));
}

test('zip reader round-trips stored and deflated archives', () => {
  for (const compress of [false, true]) {
    const files = readZip(writeZip(built.files, { compress }));
    for (const f of built.files) assert.ok(files.get(f.path).equals(f.data));
  }
});

test('CRX3 header is skipped and non-CRX input rejected', () => {
  const zip = writeZip(built.files);
  assert.ok(zipFromCrx(makeCrx(zip)).equals(zip));
  assert.throws(() => zipFromCrx(Buffer.from('PK....not-a-crx')), /not a CRX/);
});

test('published package with only store-added files passes, and says so', () => {
  const r = verifyPackage({ crx: storePackage(), expectedSums: built.sums, ourManifest });
  assert.equal(r.ok, true, r.report);
  assert.ok(r.notes.some((n) => n.includes('_metadata/verified_contents.json')));
  assert.ok(r.notes.some((n) => n.includes('manifest.json matches after removing store-managed keys')));
});

test('a changed file in the published package fails', () => {
  const crx = storePackage((files) => files.map((f) => (f.path === 'src/fill-engine.js' ? { path: f.path, data: Buffer.concat([f.data, Buffer.from('\n')]) } : f)));
  const r = verifyPackage({ crx, expectedSums: built.sums, ourManifest });
  assert.equal(r.ok, false);
  assert.match(r.report, /changed\s+src\/fill-engine\.js/);
});

test('an extra file outside the store allowlist fails', () => {
  const crx = storePackage((files) => [...files, { path: 'src/extra.js', data: Buffer.from('1') }]);
  assert.equal(verifyPackage({ crx, expectedSums: built.sums, ourManifest }).ok, false);
});

test('a manifest change beyond store-managed keys fails', () => {
  const crx = storePackage((files) => files.map((f) => {
    if (f.path !== 'manifest.json') return f;
    const m = JSON.parse(f.data.toString()); m.permissions.push('storage');
    return { path: f.path, data: Buffer.from(JSON.stringify(m)) };
  }));
  assert.equal(verifyPackage({ crx, expectedSums: built.sums, ourManifest }).ok, false);
});

test('strict mode: our own release zip must match exactly, store additions not allowed', () => {
  const ours = writeZip(built.files);
  assert.equal(verifyPackage({ zip: ours, expectedSums: built.sums, strict: true }).ok, true);
  const withMeta = writeZip([...built.files, { path: '_metadata/verified_contents.json', data: Buffer.from('[]') }]);
  assert.equal(verifyPackage({ zip: withMeta, expectedSums: built.sums, strict: true }).ok, false);
});
