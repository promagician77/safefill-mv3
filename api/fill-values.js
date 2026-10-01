// POST { ticket } -> { portalUrl, fields }. Called only by the extension.
import record from './_record.js';
import { readTicket, body, send, EXTENSION_ORIGIN } from './_lib.js';

const cors = { 'access-control-allow-origin': EXTENSION_ORIGIN, 'access-control-allow-headers': 'content-type', vary: 'origin' };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {}, cors);
  if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' }, cors);
  const claims = readTicket((await body(req)).ticket);
  if (!claims) return send(res, 401, { error: 'ticket-invalid-or-expired' }, cors);
  return send(res, 200, { portalUrl: claims.p, fields: record }, cors);
}
