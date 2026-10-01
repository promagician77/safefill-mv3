import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFiles } from '../scripts/lib/build-core.mjs';
import { checkPolicy } from '../scripts/check-policy.mjs';
import { ROOT } from './helpers.mjs';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

async function distCopy() {
  const { files } = await buildFiles(join(ROOT, 'extension'));
  const dir = await mkdtemp(join(tmpdir(), 'sf-dist-'));
  for (const f of files) { await mkdir(dirname(join(dir, f.path)), { recursive: true }); await writeFile(join(dir, f.path), f.data); }
  return dir;
}
async function inject(dir, file, code) { const p = join(dir, file); await writeFile(p, (await readFile(p, 'utf8')) + '\n' + code + '\n'); }

test('the shipped build passes the policy gate', async () => {
  assert.deepEqual(await checkPolicy(await distCopy()), []);
});

const violations = [
  ['src/fill-engine.js', 'localStorage.setItem("k", "v");', /stores data/],
  ['src/background.js', 'indexedDB.open("x");', /stores data/],
  ['src/fill-engine.js', 'console.log(record);', /logs or sends data out/],
  ['src/popup.js', 'navigator.sendBeacon("/t", "x");', /logs or sends data out/],
  ['src/fill-engine.js', 'document.forms[0].requestSubmit();', /submit/],
  ['src/fill-engine.js', 'el.click();', /submit/],
  ['src/fill-engine.js', 'eval("1");', /code built from strings/],
  ['src/fill-engine.js', 'fetch("/x");', /network call outside/],
];
for (const [file, code, why] of violations) {
  test(`policy gate rejects: ${code}`, async () => {
    const dir = await distCopy();
    await inject(dir, file, code);
    const problems = await checkPolicy(dir);
    assert.ok(problems.some((p) => why.test(p)), problems.join('\n'));
  });
}

test('policy gate rejects an added permission or a widened network lock', async () => {
  const dir = await distCopy();
  const m = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  m.permissions.push('storage');
  m.content_security_policy.extension_pages = m.content_security_policy.extension_pages.replace(/connect-src .*/, 'connect-src *');
  await writeFile(join(dir, 'manifest.json'), JSON.stringify(m));
  const problems = (await checkPolicy(dir)).join('\n');
  assert.match(problems, /permissions must be exactly/);
  assert.match(problems, /connect-src/);
});
