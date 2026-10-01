// Release gate. Stops the release unless:
//   1. the tag is annotated and signed by a key in ALLOWED_SIGNERS_FILE
//      (that file comes from the protected release environment, never from
//      the tagged tree, so a commit cannot add its own key);
//   2. the tag name matches manifest.json's version;
//   3. a clean rebuild of the tagged commit reproduces every hash in the tag
//      message, file for file: nothing missing, nothing extra, nothing changed.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildFiles } from './lib/build-core.mjs';
import { parse, compare, describe } from './lib/hashlist.mjs';

export async function verifyTag({ repo, tag, allowedSigners }) {
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const fail = (msg) => ({ ok: false, message: msg });

  let type;
  try { type = git('cat-file', '-t', `refs/tags/${tag}`).trim(); } catch (_) { return fail(`tag ${tag} not found`); }
  if (type !== 'tag') return fail(`tag ${tag} is not annotated, so it cannot carry a signature or hash list`);

  if (!allowedSigners) return fail('ALLOWED_SIGNERS_FILE is not set');
  try {
    execFileSync('git', ['-C', repo, '-c', 'gpg.format=ssh', '-c', `gpg.ssh.allowedSignersFile=${allowedSigners}`, 'tag', '-v', tag], { stdio: 'pipe' });
  } catch (_) {
    return fail(`tag ${tag} is not signed by an allowed release key`);
  }

  const body = git('for-each-ref', `refs/tags/${tag}`, '--format=%(contents:body)');
  let expected;
  try { expected = parse(body); } catch (e) { return fail(`tag message is not a valid hash list: ${e.message}`); }

  const manifest = JSON.parse(await readFile(join(repo, 'extension', 'manifest.json'), 'utf8'));
  if (tag !== `v${manifest.version}`) return fail(`tag ${tag} does not match manifest version ${manifest.version}`);

  const built = await buildFiles(join(repo, 'extension'));
  const actual = new Map(built.entries.map((e) => [e.path, e.sha256]));
  const result = compare(expected, actual);
  return result.ok
    ? { ok: true, message: `tag ${tag}: signature good, ${actual.size} files reproduced exactly`, build: built }
    : { ok: false, message: `tag ${tag}: rebuild does not match the signed hash list\n${describe(result)}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME;
  const res = await verifyTag({ repo: resolve('.'), tag, allowedSigners: process.env.ALLOWED_SIGNERS_FILE });
  process.stdout.write(res.message + '\n');
  if (!res.ok) { process.stdout.write('RELEASE STOPPED\n'); process.exit(1); }
}
