// Demo backend helpers. Stands in for the real API the AWS contractor builds:
// tickets are short-lived and HMAC-signed; the real service also makes them
// single-use and binds them to tenant, record and portal.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const EXTENSION_ORIGIN = 'chrome-extension://ceddfmgeflhgefimjcplioklpfhiphao';
const SECRET = process.env.DEMO_TICKET_SECRET || 'demo-only-not-a-secret';
export const TTL_MS = 120000;

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (payload) => createHmac('sha256', SECRET).update(payload).digest('base64url');

export function issueTicket(claims) {
  const payload = b64(JSON.stringify({ ...claims, exp: Date.now() + TTL_MS }));
  return payload + '.' + sign(payload);
}

export function readTicket(ticket) {
  if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(ticket)) return null;
  const [payload, sig] = ticket.split('.');
  const want = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return claims.exp > Date.now() ? claims : null;
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch (_) { return {}; }
}

export function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

export function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + req.headers.host;
}
