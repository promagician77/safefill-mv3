import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFiles } from '../scripts/lib/build-core.mjs';
import { ROOT } from './helpers.mjs';

test('two builds of the same source are byte-identical (files and zip)', async () => {
  const a = await buildFiles(join(ROOT, 'extension'));
  const copy = await mkdtemp(join(tmpdir(), 'sf-'));
  await cp(join(ROOT, 'extension'), copy, { recursive: true });
  const b = await buildFiles(copy);
  assert.equal(a.sums, b.sums);
  assert.ok(a.zip.equals(b.zip));
});

test('a Windows checkout (CRLF, BOM) produces the same hashes', async () => {
  const a = await buildFiles(join(ROOT, 'extension'));
  const copy = await mkdtemp(join(tmpdir(), 'sf-'));
  await cp(join(ROOT, 'extension'), copy, { recursive: true });
  const p = join(copy, 'src', 'fill-engine.js');
  await writeFile(p, '\ufeff' + (await readFile(p, 'utf8')).replace(/\n/g, '\r\n'));
  const b = await buildFiles(copy);
  assert.equal(a.sums, b.sums);
});

test('a one-byte change changes exactly one hash', async () => {
  const a = await buildFiles(join(ROOT, 'extension'));
  const copy = await mkdtemp(join(tmpdir(), 'sf-'));
  await cp(join(ROOT, 'extension'), copy, { recursive: true });
  const p = join(copy, 'popup.css');
  await writeFile(p, (await readFile(p, 'utf8')) + ' ');
  const b = await buildFiles(copy);
  const diff = a.entries.filter((e, i) => e.sha256 !== b.entries[i].sha256).map((e) => e.path);
  assert.deepEqual(diff, ['popup.css']);
});

test('files outside the allowlist stop the build', async () => {
  const copy = await mkdtemp(join(tmpdir(), 'sf-'));
  await cp(join(ROOT, 'extension'), copy, { recursive: true });
  await writeFile(join(copy, 'src', 'fill-engine.js.map'), '{}');
  await assert.rejects(buildFiles(copy), /not on the allowlist/);
});
