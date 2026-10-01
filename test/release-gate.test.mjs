// End to end: a real git repo, a real SSH-signed tag carrying the hash list,
// and the same verify-tag script the release workflow runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFiles } from '../scripts/lib/build-core.mjs';
import { verifyTag } from '../scripts/verify-tag.mjs';
import { ROOT } from './helpers.mjs';

const haveSshKeygen = (() => { try { execFileSync('ssh-keygen', ['-?'], { stdio: 'ignore' }); return true; } catch (e) { return e.status !== undefined && e.code !== 'ENOENT'; } })();

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'sf-rel-'));
  const repo = join(dir, 'repo');
  await cp(join(ROOT, 'extension'), join(repo, 'extension'), { recursive: true });
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', encoding: 'utf8' });
  execFileSync('git', ['init', '-q', repo]);
  git('config', 'user.email', 'release@example.com'); git('config', 'user.name', 'Release');
  git('add', '.'); git('commit', '-qm', 'release');
  const key = (name) => { execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', name, '-f', join(dir, name)]); return join(dir, name); };
  const releaseKey = key('release'); const strangerKey = key('stranger');
  const allowed = join(dir, 'allowed_signers');
  await writeFile(allowed, `release@example.com ${(await readFile(releaseKey + '.pub', 'utf8')).trim()}\n`);
  const sums = (await buildFiles(join(repo, 'extension'))).sums;
  const tag = (name, message, signingKey) => {
    const msgFile = join(dir, name + '.msg');
    return writeFile(msgFile, message).then(() => {
      const args = signingKey ? ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${signingKey}.pub`, 'tag', '-s', name, '-F', msgFile] : ['tag', '-a', name, '-F', msgFile];
      git(...args);
    });
  };
  return { repo, git, allowed, sums, tag, releaseKey, strangerKey };
}

test('signed tag + exact rebuild -> release proceeds', { skip: !haveSshKeygen }, async () => {
  const s = await setup();
  await s.tag('v0.1.0', `SafeFill v0.1.0\n\n${s.sums}`, s.releaseKey);
  const r = await verifyTag({ repo: s.repo, tag: 'v0.1.0', allowedSigners: s.allowed });
  assert.equal(r.ok, true, r.message);
});

test('tag signed by an unknown key -> stopped', { skip: !haveSshKeygen }, async () => {
  const s = await setup();
  await s.tag('v0.1.0', `SafeFill v0.1.0\n\n${s.sums}`, s.strangerKey);
  const r = await verifyTag({ repo: s.repo, tag: 'v0.1.0', allowedSigners: s.allowed });
  assert.equal(r.ok, false); assert.match(r.message, /not signed by an allowed release key/);
});

test('unsigned tag -> stopped', { skip: !haveSshKeygen }, async () => {
  const s = await setup();
  await s.tag('v0.1.0', `SafeFill v0.1.0\n\n${s.sums}`, null);
  const r = await verifyTag({ repo: s.repo, tag: 'v0.1.0', allowedSigners: s.allowed });
  assert.equal(r.ok, false);
});

test('code changed after the hash list was made -> stopped, with the file named', { skip: !haveSshKeygen }, async () => {
  const s = await setup();
  const p = join(s.repo, 'extension', 'src', 'fill-engine.js');
  await writeFile(p, (await readFile(p, 'utf8')) + '\n// late change\n');
  s.git('commit', '-qam', 'late change');
  await s.tag('v0.1.0', `SafeFill v0.1.0\n\n${s.sums}`, s.releaseKey);
  const r = await verifyTag({ repo: s.repo, tag: 'v0.1.0', allowedSigners: s.allowed });
  assert.equal(r.ok, false); assert.match(r.message, /changed\s+src\/fill-engine\.js/);
});

test('tag name must match the manifest version', { skip: !haveSshKeygen }, async () => {
  const s = await setup();
  await s.tag('v9.9.9', `SafeFill v9.9.9\n\n${s.sums}`, s.releaseKey);
  const r = await verifyTag({ repo: s.repo, tag: 'v9.9.9', allowedSigners: s.allowed });
  assert.equal(r.ok, false); assert.match(r.message, /does not match manifest version/);
});
