// Prints the release tag message: a subject line, a blank line, SHA256SUMS.
//   npm run build && node scripts/tag-message.mjs > /tmp/msg
//   git tag -s v0.1.0 -F /tmp/msg
import { readFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
const sums = await readFile('release/SHA256SUMS', 'utf8');
process.stdout.write(`SafeFill v${manifest.version}\n\n${sums}`);
