// POST { recordId, portalPath } -> { ticket }. Called by the web app.
import { issueTicket, body, send, origin } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' });
  const { recordId, portalPath } = await body(req);
  if (recordId !== 'R-1042' || !/^\/portals\/portal-[abc]\.html$/.test(String(portalPath))) return send(res, 400, { error: 'bad-request' });
  const portalUrl = origin(req) + portalPath;
  return send(res, 200, { ticket: issueTicket({ r: recordId, p: portalUrl }), portalUrl, recordLabel: 'Dana Whitfield, RN (R-1042)' });
}
