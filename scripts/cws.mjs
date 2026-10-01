// Minimal Chrome Web Store API v2 client (chromewebstore.googleapis.com).
// Auth is a short-lived access token from GitHub OIDC -> Google Workload
// Identity Federation -> service account. There is no stored key anywhere.
//   CWS_TOKEN=... CWS_PUBLISHER_ID=... CWS_ITEM_ID=... node scripts/cws.mjs upload release/safefill-0.1.0.zip
//   ... node scripts/cws.mjs publish
//   ... node scripts/cws.mjs status
// Response field names follow the v2 reference; confirm them on the first
// staging upload. The token is never printed.
import { readFile } from 'node:fs/promises';

const API = 'https://chromewebstore.googleapis.com';
const { CWS_TOKEN, CWS_PUBLISHER_ID, CWS_ITEM_ID } = process.env;
const [cmd, file] = process.argv.slice(2);
if (!CWS_TOKEN || !CWS_PUBLISHER_ID || !CWS_ITEM_ID) { process.stdout.write('CWS_TOKEN, CWS_PUBLISHER_ID and CWS_ITEM_ID are required\n'); process.exit(2); }
const name = `publishers/${encodeURIComponent(CWS_PUBLISHER_ID)}/items/${encodeURIComponent(CWS_ITEM_ID)}`;
const auth = { authorization: `Bearer ${CWS_TOKEN}` };

async function call(method, url, body, type) {
  const res = await fetch(url, { method, headers: { ...auth, ...(type ? { 'content-type': type } : {}) }, body });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (_) { json = { raw: text.slice(0, 500) }; }
  if (!res.ok) { process.stdout.write(`${method} ${url.replace(API, '')} failed: HTTP ${res.status}\n${JSON.stringify(json, null, 2)}\n`); process.exit(1); }
  return json;
}
const status = () => call('GET', `${API}/v2/${name}:fetchStatus`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (cmd === 'upload') {
  const zip = await readFile(file);
  let r = await call('POST', `${API}/upload/v2/${name}:upload`, zip, 'application/zip');
  process.stdout.write(`upload: ${JSON.stringify(r)}\n`);
  for (let i = 0; i < 20 && /IN_PROGRESS/i.test(r.uploadState || ''); i++) {
    await sleep(15000);
    const s = await status();
    r = { uploadState: s.lastAsyncUploadState || 'UNKNOWN' };
    process.stdout.write(`upload state: ${r.uploadState}\n`);
  }
  if (/FAIL/i.test(r.uploadState || '')) process.exit(1);
} else if (cmd === 'publish') {
  const r = await call('POST', `${API}/v2/${name}:publish`, '{}', 'application/json');
  process.stdout.write(`publish: ${JSON.stringify(r)}\n`);
} else if (cmd === 'status') {
  process.stdout.write(JSON.stringify(await status(), null, 2) + '\n');
} else {
  process.stdout.write('usage: node scripts/cws.mjs upload <zip> | publish | status\n');
  process.exit(2);
}
