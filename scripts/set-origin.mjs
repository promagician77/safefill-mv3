// Points the extension at a different backend/app origin, in the committed
// source (so the change is reviewed, built and hashed like any other).
//   node scripts/set-origin.mjs https://your-project.vercel.app
import { readFile, writeFile } from 'node:fs/promises';
const next = new URL(process.argv[2] || '').origin;
if (!next.startsWith('https://')) throw new Error('origin must be https');
const cfgPath = 'extension/src/config.js';
const cfg = await readFile(cfgPath, 'utf8');
const prev = /BACKEND_ORIGIN = '([^']+)'/.exec(cfg)[1];
const prevHost = new URL(prev).host; const nextHost = new URL(next).host;
for (const p of [cfgPath, 'extension/manifest.json', 'e2e/harness.mjs']) {
  const t = await readFile(p, 'utf8');
  await writeFile(p, t.split(prev).join(next).split(prevHost).join(nextHost));
}
process.stdout.write(`origin ${prev} -> ${next}\n`);
