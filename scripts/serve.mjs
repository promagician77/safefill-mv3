// Local server for public/ and the demo API.
//   node scripts/serve.mjs                       http://localhost:3000
//   node scripts/serve.mjs --https cert key 8443 for browser tests that map
//                                                the production host here
import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import ticket from '../api/fill-ticket.js';
import values from '../api/fill-values.js';

const ROOT = resolve('public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.zip': 'application/zip', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '': 'text/plain; charset=utf-8' };

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/fill-ticket') return ticket(req, res);
  if (url.pathname === '/api/fill-values') return values(req, res);
  let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  try { if ((await stat(p)).isDirectory()) p = join(p, 'index.html'); } catch (_) { /* 404 below */ }
  try {
    const data = await readFile(p);
    res.setHeader('content-type', TYPES[extname(p)] || 'application/octet-stream');
    res.end(data);
  } catch (_) { res.statusCode = 404; res.end('not found'); }
}

const args = process.argv.slice(2);
if (args[0] === '--https') {
  const [cert, key, port] = args.slice(1);
  https({ cert: await readFile(cert), key: await readFile(key) }, handle).listen(Number(port || 8443), () => process.stdout.write(`https on ${port || 8443}\n`));
} else {
  const port = Number(process.env.PORT || 3000);
  http(handle).listen(port, () => process.stdout.write(`http://localhost:${port}\n`));
}
