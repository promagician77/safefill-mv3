// npm run build -> dist/ (unpacked extension), release/SHA256SUMS, release/safefill-<version>.zip
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFiles } from './lib/build-core.mjs';
import { sha256 } from './lib/hashlist.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = process.argv[2] ? resolve(process.argv[2]) : root;

const { files, manifest, sums, zip } = await buildFiles(join(root, 'extension'));
const dist = join(outRoot, 'dist');
const release = join(outRoot, 'release');
await rm(dist, { recursive: true, force: true });
await rm(release, { recursive: true, force: true });
for (const f of files) {
  const target = join(dist, f.path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, f.data);
}
await mkdir(release, { recursive: true });
const zipName = `safefill-${manifest.version}.zip`;
await writeFile(join(release, 'SHA256SUMS'), sums);
await writeFile(join(release, zipName), zip);
process.stdout.write(`built ${files.length} files, version ${manifest.version}\n`);
process.stdout.write(`release/${zipName} sha256 ${sha256(zip)}\n`);
