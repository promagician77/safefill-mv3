// Service worker. Holds at most one fill request (an opaque ticket, never
// field values) in memory. Chrome may stop this worker when idle; the
// request is then gone and the professional starts it again from the app.
import { BACKEND_ORIGIN, APP_ORIGINS, TICKET_TTL_MS, FILL_VALUES_PATH } from './config.js';

let pending = null; // { ticket, portalOrigin, recordLabel, expiresAt }

const TICKET_RE = /^[A-Za-z0-9._-]{16,2048}$/;

function setBadge(on) {
  chrome.action.setBadgeText({ text: on ? '1' : '' });
  if (on) chrome.action.setBadgeBackgroundColor({ color: '#0F7B5F' });
}

function httpsOrigin(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' ? u.origin : null;
  } catch (_) {
    return null;
  }
}

function currentRequest() {
  if (pending && Date.now() > pending.expiresAt) {
    pending = null;
    setBadge(false);
  }
  return pending;
}

// From the web app only (externally_connectable + explicit origin check).
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!APP_ORIGINS.includes(sender.origin)) {
    sendResponse({ ok: false, code: 'sender-not-allowed' });
    return;
  }
  const portalOrigin = msg && httpsOrigin(msg.portalUrl);
  if (!msg || msg.type !== 'safefill/ticket' || typeof msg.ticket !== 'string' || !TICKET_RE.test(msg.ticket) || !portalOrigin) {
    sendResponse({ ok: false, code: 'bad-request' });
    return;
  }
  pending = {
    ticket: msg.ticket,
    portalOrigin,
    recordLabel: String(msg.recordLabel || 'Record').slice(0, 80),
    expiresAt: Date.now() + TICKET_TTL_MS,
  };
  setBadge(true);
  sendResponse({ ok: true });
});

async function fetchRecord(ticket) {
  const res = await fetch(BACKEND_ORIGIN + FILL_VALUES_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticket }),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    redirect: 'error',
  });
  if (!res.ok) throw new Error('backend-' + res.status);
  const body = await res.json();
  const fields = Array.isArray(body.fields) ? body.fields : null;
  if (!fields || !fields.every((f) => f && typeof f.key === 'string' && typeof f.value === 'string')) {
    throw new Error('backend-shape');
  }
  return { portalOrigin: httpsOrigin(body.portalUrl), fields };
}

// Keeps only what the popup needs. Values cannot pass through here: the
// engine report has no value fields, and anything unexpected is dropped.
function cleanReport(r) {
  const s = (r && r.summary) || {};
  const n = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const items = Array.isArray(r && r.items) ? r.items : [];
  return {
    summary: { filled: n(s.filled), skipped: n(s.skipped), unchanged: n(s.unchanged), frames: n(s.frames) },
    items: items.slice(0, 200).map((i) => ({
      label: String(i.label || '').slice(0, 60),
      status: ['filled', 'skipped', 'unchanged'].includes(i.status) ? i.status : 'skipped',
      reason: String(i.reason || '').slice(0, 40),
      candidates: Array.isArray(i.candidates) ? i.candidates.slice(0, 6).map((c) => String(c).slice(0, 60)) : [],
      sharedWith: Array.isArray(i.sharedWith) ? i.sharedWith.slice(0, 6).map((c) => String(c).slice(0, 60)) : [],
    })),
  };
}

async function fillActiveTab() {
  if (pending && Date.now() > pending.expiresAt) {
    pending = null;
    setBadge(false);
    return { ok: false, code: 'request-expired' };
  }
  const req = currentRequest();
  if (!req) return { ok: false, code: 'no-request' };

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabOrigin = tab && tab.url ? httpsOrigin(tab.url) : null;
  if (!tab || !tab.id || !tabOrigin) return { ok: false, code: 'no-tab-access' };
  if (tabOrigin !== req.portalOrigin) return { ok: false, code: 'wrong-site', expected: req.portalOrigin };

  pending = null; // single use on this side too
  setBadge(false);

  let record;
  try {
    record = await fetchRecord(req.ticket);
  } catch (_) {
    return { ok: false, code: 'backend-unavailable' };
  }
  if (record.portalOrigin !== tabOrigin) return { ok: false, code: 'wrong-site', expected: record.portalOrigin || '' };

  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['src/field-rules.js', 'src/fill-engine.js'] });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (fields) => globalThis.SafeFill.run(fields),
      args: [record.fields],
    });
    return { ok: true, report: cleanReport(result && result.result) };
  } catch (_) {
    return { ok: false, code: 'page-not-fillable' };
  }
}

async function clearMarksActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !tab.id) return { ok: false };
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => { if (globalThis.SafeFill) globalThis.SafeFill.clearMarks(); },
    });
    return { ok: true };
  } catch (_) {
    return { ok: false };
  }
}

// From our own popup only.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !String(sender.url || '').startsWith(chrome.runtime.getURL('popup.html'))) return false;
  if (msg && msg.type === 'safefill/status') {
    const req = currentRequest();
    sendResponse(req ? { pending: true, recordLabel: req.recordLabel, portalOrigin: req.portalOrigin, expiresInMs: req.expiresAt - Date.now() } : { pending: false });
    return false;
  }
  if (msg && msg.type === 'safefill/fill') {
    fillActiveTab().then(sendResponse, () => sendResponse({ ok: false, code: 'internal' }));
    return true;
  }
  if (msg && msg.type === 'safefill/clear') {
    clearMarksActiveTab().then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  return false;
});
