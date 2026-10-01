(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v);
    }
    for (const k of kids) n.append(k);
    return n;
  };

  // ------------------------------------------------------------ tabs
  // Hash is the tab key (#demo); panels are #p-demo, so the browser has no
  // element to jump to and the title and tabs stay in view.
  const tabs = $$('[role="tab"]');
  const key = (t) => t.getAttribute('aria-controls').slice(2);
  function show(id, focus) {
    for (const t of tabs) {
      const on = key(t) === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#p-' + key(t)).hidden = !on;
      if (on && focus) t.focus();
    }
    if (location.hash.slice(1) !== id) history.pushState(null, '', '#' + id);
    if (id === 'release') startTamper();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => { show(key(t)); window.scrollTo(0, 0); });
    t.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) show(key(tabs[(i + d + tabs.length) % tabs.length]), true);
    });
  });
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const fromHash = () => {
    const id = location.hash.slice(1);
    show(tabs.some((t) => key(t) === id) ? id : 'overview');
    window.scrollTo(0, 0); // keep the title and tabs in view, not the panel's anchor
  };
  window.addEventListener('hashchange', fromHash);
  fromHash();

  // ------------------------------------------------------------ fill demo
  const REASONS = {
    filled: 'Filled', 'reformatted-by-page': 'Filled; the page reformatted it', 'already-correct': 'Already had this value',
    'no-match': 'No field matched', ambiguous: 'More than one field could take it', 'shared-field': 'Its only field also fits another value',
    'read-only': 'Field is read-only', disabled: 'Field is disabled', 'already-filled': 'Field already has something in it',
    'would-truncate': 'Longer than the field allows', 'rejected-by-field': 'Field would not accept it', 'rejected-by-page': 'Page cleared it',
    'no-matching-option': 'No option matches', 'ambiguous-option': 'More than one option matches',
    'date-format-unknown': 'Field does not state its date format', 'bad-value': 'Value from the backend is malformed',
    'empty-value': 'No value in the record', 'unknown-key': 'No rule for this value', 'duplicate-key': 'Sent twice',
  };
  const frame = $('#portal-frame');
  let record = [];
  let current = 'portal-a';

  fetch('demo-record.json').then((r) => r.json()).then((rec) => {
    record = rec;
    $('#record-rows').replaceChildren(...rec.map((r) => el('tr', {}, el('td', { text: r.key }), el('td', { text: r.value }))));
  });

  function load(name) {
    current = name;
    $$('#portal-choices .choice').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.portal === name)));
    $('#frame-addr').textContent = '/portals/' + name + '.html';
    frame.src = 'portals/' + name + '.html';
    $('#ledger').replaceChildren(el('li', { class: 'empty', text: 'No run yet.' }));
    $('#ledger-summary').textContent = 'Press Fill from record to run it.';
  }
  $$('#portal-choices .choice').forEach((b) => b.addEventListener('click', () => load(b.dataset.portal)));
  $('#reset-portal').addEventListener('click', () => load(current));

  function inject(doc, src) {
    return new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      doc.head.append(s);
    });
  }

  $('#run-fill').addEventListener('click', async () => {
    const win = frame.contentWindow; const doc = frame.contentDocument;
    if (!win || !doc || !record.length) return;
    if (!win.SafeFill) {
      await inject(doc, '/ext/src/field-rules.js');
      await inject(doc, '/ext/src/fill-engine.js');
    }
    renderLedger(win.SafeFill.run(record));
  });

  function renderLedger(report) {
    const s = report.summary;
    $('#ledger-summary').textContent = s.filled + ' filled, ' + s.skipped + ' skipped' + (s.unchanged ? ', ' + s.unchanged + ' unchanged' : '') + (s.frames ? '. Embedded frames not scanned: ' + s.frames + '.' : '.');
    $('#ledger').replaceChildren(...report.items.map((i) => {
      const n = i.candidates.length;
      const status = i.status === 'filled' ? 'Filled' : i.status === 'unchanged' ? 'Unchanged' : 'Skipped';
      let why = i.status === 'filled' ? 'Into: ' + (i.candidates[0] || 'the one matching field') + (i.reason === 'reformatted-by-page' ? ' (page reformatted it)' : '') : REASONS[i.reason] || i.reason;
      if (i.reason === 'ambiguous') why += ': ' + i.candidates.join(', ');
      if (i.reason === 'shared-field' && i.sharedWith) why += ' (' + i.sharedWith.join(', ') + ')';
      const tone = i.status === 'filled' ? 'c1' : (n > 1 || i.reason === 'shared-field') ? 'cmany' : n === 0 ? 'c0' : 'cskip';
      const count = el('div', { class: 'count ' + tone }, String(n), el('small', { text: n === 1 ? 'field' : 'fields' }));
      return el('li', {}, el('div', { class: 'what' }, el('span', { class: 'pill ' + i.status, text: status }), i.label), count, el('div', { class: 'why', text: why }));
    }));
  }

  // ------------------------------------------------------------ tamper test
  let tamper = null;
  const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
  const short = (h) => (h ? h.slice(0, 10) + '…' + h.slice(-6) : '');

  async function startTamper() {
    if (tamper) return;
    tamper = { expected: new Map(), original: new Map(), files: new Map() };
    const text = await (await fetch('release/SHA256SUMS', { cache: 'no-store' })).text();
    for (const line of text.split('\n').filter(Boolean)) {
      const [h, p] = line.split(/ {2}/);
      tamper.expected.set(p, h);
    }
    await Promise.all([...tamper.expected.keys()].map(async (p) => {
      const bytes = new Uint8Array(await (await fetch('ext/' + p, { cache: 'no-store' })).arrayBuffer());
      tamper.original.set(p, bytes);
    }));
    resetTamper();
  }

  function resetTamper() {
    tamper.files = new Map([...tamper.original].map(([p, b]) => [p, b.slice()]));
    renderTamper();
  }

  async function renderTamper() {
    const actual = new Map();
    for (const [p, b] of tamper.files) actual.set(p, hex(await crypto.subtle.digest('SHA-256', b)));
    const paths = [...new Set([...tamper.expected.keys(), ...actual.keys()])].sort();
    let bad = 0;
    $('#tm-rows').replaceChildren(...paths.map((p) => {
      const e = tamper.expected.get(p); const a = actual.get(p);
      const result = !e ? 'unexpected file' : !a ? 'missing' : e === a ? 'match' : 'changed';
      if (result !== 'match') bad++;
      return el('tr', { class: result === 'match' ? '' : 'bad' },
        el('td', { class: 'hash', text: p }),
        el('td', { class: 'hash', text: e ? short(e) : 'not listed', title: e || '' }),
        el('td', { class: 'hash', text: a ? short(a) : 'absent', title: a || '' }),
        el('td', {}, el('span', { class: 'pill ' + (result === 'match' ? 'pass' : 'stop'), text: result })));
    }));
    const v = $('#tm-verdict');
    v.className = 'verdict ' + (bad ? 'stop' : 'pass');
    v.replaceChildren(bad ? 'Release stopped' : 'Release continues', el('small', { text: bad ? bad + ' file' + (bad > 1 ? 's differ' : ' differs') + ' from the signed hash list. CI exits before anything is uploaded.' : 'All ' + paths.length + ' files reproduce the signed hash list exactly.' }));
  }

  $('#tm-byte').addEventListener('click', () => {
    if (!tamper) return;
    const b = tamper.files.get('src/fill-engine.js');
    if (b) { b[b.length - 2] ^= 1; renderTamper(); }
  });
  $('#tm-add').addEventListener('click', () => { if (tamper) { tamper.files.set('src/debug.js', new TextEncoder().encode('// added later\n')); renderTamper(); } });
  $('#tm-remove').addEventListener('click', () => { if (tamper) { tamper.files.delete('popup.css'); renderTamper(); } });
  $('#tm-reset').addEventListener('click', () => { if (tamper) resetTamper(); });

  // ------------------------------------------------------------ plan
  const PHASE = {
    'Release engineering': '#C9D5F0', 'CI and trust': '#D9CFEA', Extension: '#CDE8DE', 'Safety layer': '#A9D8C5',
    Testing: '#F2DFC6', Docs: '#E3E6EC', Communication: '#F5D0CC', Buffer: '#E6E8EC',
  };
  const start = new Date('2026-10-05T12:00:00');
  const days = 28;
  const dayIndex = (iso) => Math.round((new Date(iso + 'T12:00:00') - start) / 86400000);
  const fmt = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  fetch('plan.json').then((r) => r.json()).then((plan) => {
    const g = el('div', { class: 'g-grid' });
    g.append(el('div', { class: 'g-head', style: 'text-align:left;padding-left:12px', text: 'Step' }));
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const we = d.getDay() === 0 || d.getDay() === 6;
      g.append(el('div', { class: 'g-head' + (we ? ' we' : '') }, el('b', { text: String(d.getDate()) }), d.toLocaleDateString('en-US', { weekday: 'narrow' })));
    }
    const rows = [...plan.steps, plan.buffer];
    rows.forEach((s, r) => {
      const row = r + 2;
      g.append(el('div', { class: 'g-label', style: `grid-row:${row}` }, el('span', { class: 'mono', text: s.id }), s.title));
      for (let i = 0; i < days; i++) {
        const d = new Date(start.getTime() + i * 86400000);
        const we = d.getDay() === 0 || d.getDay() === 6;
        g.append(el('div', { class: 'g-cell' + (we ? ' we' : ''), style: `grid-row:${row};grid-column:${i + 2}` }));
      }
      const a = dayIndex(s.start) + 2; const b = dayIndex(s.end) + 3;
      g.append(el('div', { class: 'g-bar', style: `grid-row:${row};grid-column:${a}/${b};background:${PHASE[s.phase]}`, text: s.hours ? s.hours + ' h' : 'included' }));
    });
    const markRow = rows.length + 2;
    g.append(el('div', { class: 'g-label', style: `grid-row:${markRow}` }, 'Milestones'));
    g.append(el('div', { class: 'g-mark', style: `grid-row:${markRow};grid-column:${dayIndex('2026-10-15') + 2}/span 3;text-align:left`, text: 'Working build' }));
    g.append(el('div', { class: 'g-mark', style: `grid-row:${markRow};grid-column:${dayIndex('2026-11-01') - 1}/span 3;text-align:right`, text: 'Deadline' }));
    $('#gantt').replaceChildren(g);
    $('#legend').replaceChildren(...Object.entries(PHASE).map(([k, c]) => el('span', {}, el('i', { style: 'background:' + c }), k)));

    const total = plan.steps.reduce((n, s) => n + s.hours, 0);
    $('#plan-rows').replaceChildren(
      ...rows.map((s) => el('tr', {},
        el('td', {}, el('b', { text: s.id + ' ' }), s.title),
        el('td', { class: 'small', text: s.what }),
        el('td', { class: 'small', text: s.done }),
        el('td', { class: 'small', text: s.start === s.end ? fmt(s.start) : fmt(s.start) + ' to ' + fmt(s.end) }),
        el('td', { text: s.hours ? String(s.hours) : 'incl.' }))),
      el('tr', {}, el('td', {}, el('b', { text: 'Total' })), el('td'), el('td'), el('td'), el('td', {}, el('b', { text: total + ' h' }))));
    $('#action-rows').replaceChildren(...plan.actions.map((a) => el('tr', {}, el('td', { text: fmt(a.date) }), el('td', { text: a.action }), el('td', { class: 'small', text: a.why }), el('td', { class: 'small', text: a.time }))));
    $('#assumption-rows').replaceChildren(...plan.assumptions.map((a) => el('tr', {}, el('td', { text: a.assumption }), el('td', { class: 'small', text: a.otherwise }), el('td', {}, el('b', { text: a.impact })))));
  });
})();
