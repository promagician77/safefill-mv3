// SafeFill engine.
//
// Injected on demand into the active tab, after field-rules.js, only when the
// professional presses "Fill this page". It runs once and returns a report.
//
// Guarantees, each covered by tests:
//   1. Exactly one match or skip. A value is written only when exactly one
//      visible, editable field is a plausible home for it AND that field is
//      not a plausible home for any other value (one value <-> one field).
//   2. Never overwrites. A field that already holds something is left alone.
//   3. Never truncates or reshapes silently. maxlength, pattern, input type,
//      select options and date formats are checked before writing.
//   4. Never submits. No form submission, no synthetic clicks or key presses.
//   5. Keeps nothing. Values arrive as an argument and are not referenced after
//      run() returns. The report carries statuses and reasons, never values.
(() => {
  'use strict';

  const VERSION = '0.1.0';

  // ---------------------------------------------------------------- tokens
  const STOP_WORDS = new Set(['required', 'optional', 'please', 'enter', 'your', 'the', 'a', 'an', 'of']);

  function tokens(text) {
    if (text === null || text === undefined) return [];
    return String(text)
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Za-z])(\d)/g, '$1 $2')
      .replace(/(\d)([A-Za-z])/g, '$1 $2')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t && !STOP_WORDS.has(t));
  }

  function normalized(text) {
    return tokens(text).join(' ');
  }

  // Field kinds that can take a free-text value. Everything else (password,
  // checkbox, radio, file, hidden, multi-select...) is never a candidate.
  const FILLABLE_KINDS = new Set(['text', 'textarea', 'select', 'date']);

  function isCandidate(field, rule) {
    if (rule.autocomplete && field.autocomplete) {
      for (const token of field.autocomplete) {
        if (rule.autocomplete.includes(token)) return true;
      }
    }
    for (const signal of field.signals) {
      const have = new Set(tokens(signal));
      if (have.size === 0) continue;
      for (const phrase of rule.phrases) {
        const need = tokens(phrase);
        if (need.length > 0 && need.every((t) => have.has(t))) return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------- value checks
  function checkPattern(pattern, value) {
    if (!pattern) return true;
    let re = null;
    try { re = new RegExp('^(?:' + pattern + ')$', 'v'); } catch (_) {
      try { re = new RegExp('^(?:' + pattern + ')$', 'u'); } catch (__) { re = null; }
    }
    return re === null ? true : re.test(value);
  }

  function dateFor(field, iso) {
    if (field.kind === 'date') return { ok: true, value: iso };
    const hint = normalized(field.placeholder) || normalized(field.title);
    const [y, m, d] = iso.split('-');
    if (hint === 'mm dd yyyy') return { ok: true, value: m + '/' + d + '/' + y };
    if (hint === 'dd mm yyyy') return { ok: true, value: d + '/' + m + '/' + y };
    if (hint === 'yyyy mm dd') return { ok: true, value: iso };
    return { ok: false, reason: 'date-format-unknown' };
  }

  function valueFor(field, value, rule) {
    let out = value;
    if (field.kind === 'select') {
      const want = normalized(value);
      const hits = field.options.filter((o) => normalized(o.value) === want || normalized(o.text) === want);
      const distinct = new Set(hits.map((o) => o.value));
      if (distinct.size === 0) return { ok: false, reason: 'no-matching-option' };
      if (distinct.size > 1) return { ok: false, reason: 'ambiguous-option' };
      return { ok: true, value: hits[0].value };
    }
    if (rule.kind === 'date') {
      const d = dateFor(field, value);
      if (!d.ok) return d;
      out = d.value;
    }
    if (field.inputType === 'date' && rule.kind !== 'date') return { ok: false, reason: 'rejected-by-field' };
    if (field.inputType === 'email' && !/^[^\s@]+@[^\s@]+$/.test(out)) return { ok: false, reason: 'rejected-by-field' };
    if (field.inputType === 'number' && !Number.isFinite(Number(out))) return { ok: false, reason: 'rejected-by-field' };
    if (field.maxLength > 0 && out.length > field.maxLength) return { ok: false, reason: 'would-truncate' };
    if (!checkPattern(field.pattern, out)) return { ok: false, reason: 'rejected-by-field' };
    return { ok: true, value: out };
  }

  // ---------------------------------------------------------------- plan
  // Pure function: field descriptors + record + rules -> decisions.
  // A decision may carry `write` (the value to write). run() uses it and the
  // report built from decisions never includes it.
  function plan(fields, record, rules) {
    const items = Array.isArray(record) ? record : [];
    const usable = fields.filter((f) => f.visible && FILLABLE_KINDS.has(f.kind));

    const seen = new Set();
    const keys = [];
    for (const item of items) {
      const key = item && typeof item.key === 'string' ? item.key : '';
      if (key && !seen.has(key) && Object.prototype.hasOwnProperty.call(rules, key)) {
        seen.add(key);
        keys.push(key);
      }
    }

    // Candidate sets, and how many values each field could plausibly take.
    const candidates = new Map();
    const claims = new Map();
    for (const key of keys) {
      const ids = usable.filter((f) => isCandidate(f, rules[key])).map((f) => f.id);
      candidates.set(key, ids);
      for (const id of ids) claims.set(id, (claims.get(id) || 0) + 1);
    }

    const byId = new Map(fields.map((f) => [f.id, f]));
    const counted = new Set();
    const decisions = [];

    for (const item of items) {
      const key = item && typeof item.key === 'string' ? item.key : '';
      const rule = Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : null;
      const base = { key, label: rule ? rule.label : key || 'Unknown', candidates: [], status: 'skipped' };

      if (!rule) { decisions.push({ ...base, reason: 'unknown-key' }); continue; }
      if (counted.has(key)) { decisions.push({ ...base, reason: 'duplicate-key' }); continue; }
      counted.add(key);

      const value = typeof item.value === 'string' ? item.value : '';
      if (value === '') { decisions.push({ ...base, reason: 'empty-value' }); continue; }
      if (rule.format && !new RegExp(rule.format).test(value)) { decisions.push({ ...base, reason: 'bad-value' }); continue; }

      const ids = candidates.get(key) || [];
      const cand = ids.map((id) => byId.get(id));
      const withCands = { ...base, candidates: cand.map((f) => f.displayLabel) };

      if (ids.length === 0) { decisions.push({ ...withCands, reason: 'no-match' }); continue; }
      if (ids.length > 1) { decisions.push({ ...withCands, reason: 'ambiguous', markIds: ids }); continue; }

      const field = cand[0];
      if (claims.get(field.id) > 1) {
        const others = keys.filter((k) => k !== key && (candidates.get(k) || []).includes(field.id)).map((k) => rules[k].label);
        decisions.push({ ...withCands, reason: 'shared-field', sharedWith: others, markIds: ids });
        continue;
      }
      if (field.disabled) { decisions.push({ ...withCands, reason: 'disabled' }); continue; }
      if (field.readOnly) { decisions.push({ ...withCands, reason: 'read-only' }); continue; }

      const v = valueFor(field, value, rule);
      if (!v.ok) { decisions.push({ ...withCands, reason: v.reason }); continue; }

      if (!field.untouched) {
        if (field.value === v.value) { decisions.push({ ...withCands, status: 'unchanged', reason: 'already-correct', targetId: field.id }); continue; }
        decisions.push({ ...withCands, reason: 'already-filled' });
        continue;
      }
      decisions.push({ ...withCands, status: 'filled', reason: 'filled', targetId: field.id, write: v.value });
    }
    return decisions;
  }

  // Report = decisions minus anything that could carry a value.
  function report(decisions, extra) {
    const out = decisions.map((d) => ({
      key: d.key,
      label: d.label,
      status: d.status,
      reason: d.reason,
      candidates: d.candidates.slice(0, 6),
      ...(d.sharedWith ? { sharedWith: d.sharedWith } : {}),
    }));
    const count = (s) => out.filter((d) => d.status === s).length;
    return {
      engine: VERSION,
      summary: { filled: count('filled'), skipped: count('skipped'), unchanged: count('unchanged'), frames: extra.frames },
      items: out,
    };
  }

  // ------------------------------------------------------ DOM adapter
  function textOf(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    for (const el of clone.querySelectorAll('input,select,textarea,button,option')) el.remove();
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function kindOf(el) {
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return { kind: 'textarea', inputType: 'textarea' };
    if (tag === 'SELECT') return { kind: el.multiple ? 'unsupported' : 'select', inputType: 'select' };
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    if (['text', 'email', 'tel', 'number', 'search', 'url'].includes(type)) return { kind: 'text', inputType: type };
    if (type === 'date') return { kind: 'date', inputType: 'date' };
    return { kind: 'unsupported', inputType: type };
  }

  function visible(el) {
    if (el.getClientRects().length === 0) return false;
    const style = el.ownerDocument.defaultView.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  }

  function untouchedSelect(el) {
    let defaultIndex = 0;
    for (let i = 0; i < el.options.length; i++) {
      if (el.options[i].defaultSelected) { defaultIndex = i; break; }
    }
    return el.selectedIndex === defaultIndex;
  }

  function collect(doc) {
    const elements = [];
    let frames = 0;
    const visit = (root) => {
      for (const el of root.children) {
        if (el.tagName === 'IFRAME' || el.tagName === 'FRAME') frames++;
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') elements.push(el);
        if (el.shadowRoot) visit(el.shadowRoot);
        visit(el);
      }
    };
    visit(doc);

    const fields = elements.map((el, id) => {
      const { kind, inputType } = kindOf(el);
      const root = el.getRootNode();
      const labels = el.labels ? Array.from(el.labels).map(textOf).filter(Boolean) : [];
      const labelledBy = (el.getAttribute('aria-labelledby') || '')
        .split(/\s+/).filter(Boolean)
        .map((ref) => textOf((root.getElementById && root.getElementById(ref)) || null))
        .filter(Boolean);
      const ariaLabel = el.getAttribute('aria-label') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const title = el.getAttribute('title') || '';
      const name = el.getAttribute('name') || '';
      const idAttr = el.getAttribute('id') || '';
      const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter(Boolean);
      const displayLabel = (labels[0] || labelledBy[0] || ariaLabel || placeholder || name || idAttr || 'Unlabeled field').slice(0, 60);
      const isSelect = el.tagName === 'SELECT';
      return {
        id,
        kind,
        inputType,
        visible: inputType !== 'hidden' && visible(el),
        disabled: el.disabled === true,
        readOnly: el.readOnly === true,
        maxLength: typeof el.maxLength === 'number' ? el.maxLength : -1,
        pattern: el.getAttribute('pattern') || '',
        placeholder,
        title,
        autocomplete,
        signals: [...labels, ...labelledBy, ariaLabel, placeholder, title, name, idAttr].filter(Boolean),
        displayLabel,
        value: isSelect ? el.value : el.value || '',
        untouched: isSelect ? untouchedSelect(el) : (el.value || '') === '',
        options: isSelect ? Array.from(el.options).map((o) => ({ value: o.value, text: o.text })) : [],
      };
    });
    return { fields, elements, frames };
  }

  // ------------------------------------------------------------- writer
  const marked = new WeakMap();
  const markedList = [];

  function mark(el, style) {
    if (!marked.has(el)) {
      marked.set(el, { outline: el.style.outline, outlineOffset: el.style.outlineOffset });
      markedList.push(new WeakRef(el));
    }
    el.style.outline = style;
    el.style.outlineOffset = '2px';
  }

  function clearMarks() {
    while (markedList.length) {
      const el = markedList.pop().deref();
      if (el && marked.has(el)) {
        const prev = marked.get(el);
        el.style.outline = prev.outline;
        el.style.outlineOffset = prev.outlineOffset;
        marked.delete(el);
      }
    }
  }

  function write(el, value) {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value;
  }

  function run(record) {
    const rules = globalThis.SafeFillRules;
    if (!rules) return { engine: VERSION, error: 'rules-missing', summary: { filled: 0, skipped: 0, unchanged: 0, frames: 0 }, items: [] };
    clearMarks();
    const { fields, elements, frames } = collect(document);
    const decisions = plan(fields, record, rules);

    for (const d of decisions) {
      if (d.status === 'filled') {
        const el = elements[d.targetId];
        const after = write(el, d.write);
        if (after === '') { d.status = 'skipped'; d.reason = 'rejected-by-page'; continue; }
        if (after !== d.write) d.reason = 'reformatted-by-page';
        mark(el, '2px solid #0F7B5F');
      } else if (d.markIds) {
        for (const id of d.markIds) mark(elements[id], '2px dashed #B4590A');
      }
      delete d.write;
    }
    return report(decisions, { frames });
  }

  globalThis.SafeFill = Object.freeze({ version: VERSION, tokens, plan, report, run, clearMarks });
})();
