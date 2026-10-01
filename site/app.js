(() => {
  'use strict';
  const EXT_ID = 'ceddfmgeflhgefimjcplioklpfhiphao';
  const status = document.getElementById('status');
  const say = (cls, text) => { status.className = cls; status.textContent = text; };

  function sendToExtension(msg) {
    return new Promise((resolve) => {
      if (!(window.chrome && chrome.runtime && chrome.runtime.sendMessage)) return resolve({ ok: false, code: 'not-installed' });
      chrome.runtime.sendMessage(EXT_ID, msg, (res) => resolve(chrome.runtime.lastError ? { ok: false, code: 'not-installed' } : res || { ok: false }));
    });
  }

  for (const b of document.querySelectorAll('[data-portal]')) {
    b.addEventListener('click', async () => {
      const tab = window.open('about:blank', '_blank');
      say('', '');
      const r = await fetch('/api/fill-ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recordId: 'R-1042', portalPath: b.dataset.portal }) });
      if (!r.ok) { if (tab) tab.close(); return say('err', 'Could not create a fill ticket.'); }
      const t = await r.json();
      const ack = await sendToExtension({ type: 'safefill/ticket', ticket: t.ticket, portalUrl: t.portalUrl, recordLabel: t.recordLabel });
      if (!ack || !ack.ok) {
        if (tab) tab.close();
        return say('err', ack && ack.code === 'not-installed'
          ? 'The SafeFill extension is not installed in this browser. Load the unzipped build from chrome://extensions (Developer mode, Load unpacked), then try again.'
          : 'The extension refused the request (' + ((ack && ack.code) || 'unknown') + ').');
      }
      if (tab) { tab.opener = null; tab.location = t.portalUrl; } else { window.open(t.portalUrl, '_blank', 'noopener'); }
      say('ok', 'Request sent. On the portal tab, click the SafeFill icon, then Fill this page. The request expires in 2 minutes.');
    });
  }
})();
