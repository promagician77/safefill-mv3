import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOST, PORT } from './harness.mjs';

export default async function globalSetup() {
  // Build the exact release files and the site the tests serve, so the suite
  // works however it is started (npm run e2e, npx playwright test, CI).
  execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'ignore' });
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'ignore' });
  const dir = join(tmpdir(), 'safefill-e2e');
  mkdirSync(dir, { recursive: true });
  const cert = join(dir, 'cert.pem'); const key = join(dir, 'key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', `/CN=${HOST}`,
    '-addext', `subjectAltName=DNS:${HOST},DNS:other.test`, '-keyout', key, '-out', cert], { stdio: 'ignore' });
  const server = spawn(process.execPath, ['scripts/serve.mjs', '--https', cert, key, String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((ok, fail) => {
    server.stdout.once('data', ok);
    server.once('exit', (c) => fail(new Error('server exited ' + c)));
  });
  return async () => { server.kill(); };
}
