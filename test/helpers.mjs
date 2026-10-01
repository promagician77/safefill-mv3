import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Loads the exact extension files into an isolated context, the same two
// files the worker injects into a tab, in the same order.
export function loadEngine() {
  const ctx = vm.createContext({});
  for (const f of ['field-rules.js', 'fill-engine.js']) {
    vm.runInContext(readFileSync(join(ROOT, 'extension', 'src', f), 'utf8'), ctx, { filename: f });
  }
  return { SafeFill: ctx.SafeFill, rules: ctx.SafeFillRules };
}

let nextId = 0;
// Field descriptor as collect() produces it, with sensible defaults.
export function field(label, extra = {}) {
  const f = {
    id: nextId++, kind: 'text', inputType: 'text', visible: true, disabled: false, readOnly: false,
    maxLength: -1, pattern: '', placeholder: '', title: '', autocomplete: [],
    signals: label ? [label] : [], displayLabel: label || 'Unlabeled field',
    value: '', untouched: true, options: [], ...extra,
  };
  if (extra.signals) f.signals = extra.signals;
  return f;
}

export const RECORD = JSON.parse(readFileSync(join(ROOT, 'fixtures', 'record.json'), 'utf8'));
export const rec = (...keys) => RECORD.filter((r) => keys.includes(r.key));
