// The browser resolves the real production host to a local HTTPS server, so
// the tests exercise the exact release build (same origin, same CSP, same
// host permission) without touching the network.
import { resolve } from 'node:path';

export const HOST = 'safefill-spike.vercel.app';
export const ORIGIN = 'https://' + HOST;
export const OTHER = 'https://other.test';
export const PORT = 8443;
export const DIST = resolve('dist');
export const ARGS = [
  `--host-resolver-rules=MAP ${HOST} 127.0.0.1:${PORT}, MAP other.test 127.0.0.1:${PORT}`,
  '--ignore-certificate-errors',
];
