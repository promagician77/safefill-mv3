// Assembles public/ for Vercel and local runs: the document site, the
// extension build it demos and hashes, the sample portals, and downloads.
import { cp, mkdir, rm, copyFile, access } from 'node:fs/promises';

await rm('public', { recursive: true, force: true });
await cp('site', 'public', { recursive: true });
await cp('dist', 'public/ext', { recursive: true });
await cp('release', 'public/release', { recursive: true });
await cp('fixtures/portals', 'public/portals', { recursive: true });
await copyFile('fixtures/record.json', 'public/demo-record.json');
await mkdir('public/files', { recursive: true });
for (const f of ['docs/safefill_timeline.xlsx']) {
  try { await access(f); await copyFile(f, 'public/files/' + f.split('/').pop()); } catch (_) { /* optional */ }
}
process.stdout.write('public/ ready\n');
