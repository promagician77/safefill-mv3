import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine, field, rec, RECORD } from './helpers.mjs';

const { SafeFill, rules } = loadEngine();
// The engine runs in its own realm (as it does in a tab); compare plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const plan = (fields, record) => plain(SafeFill.plan(fields, record, rules));
const one = (fields, record) => plan(fields, record)[0];

test('fills when exactly one field matches', () => {
  const d = one([field('NPI')], rec('npi'));
  assert.equal(d.status, 'filled');
  assert.equal(d.write, '1234567893');
});

test('two plausible fields -> fills nothing (ambiguous)', () => {
  const d = one([field('Individual NPI'), field('Group NPI')], rec('npi'));
  assert.equal(d.status, 'skipped');
  assert.equal(d.reason, 'ambiguous');
  assert.deepEqual(d.candidates, ['Individual NPI', 'Group NPI']);
  assert.equal(d.write, undefined);
});

test('broad plausibility turns near-misses into skips, not guesses', () => {
  const d = one([field('Office phone'), field('Mobile phone')], rec('phone'));
  assert.equal(d.reason, 'ambiguous');
});

test('one field that fits two values -> both skipped (one value <-> one field)', () => {
  const contact = field('Contact phone or email');
  const ds = plan([contact], rec('phone', 'email'));
  assert.deepEqual(ds.map((d) => [d.key, d.reason]), [['email', 'shared-field'], ['phone', 'shared-field']]);
  assert.ok(ds.every((d) => d.write === undefined));
});

test('no plausible field -> skipped, never forced into a near field', () => {
  const ds = plan([field('Provider name')], rec('firstName', 'lastName'));
  assert.deepEqual(ds.map((d) => d.reason), ['no-match', 'no-match']);
});

test('hidden duplicates are not candidates; the visible field is filled', () => {
  const ds = plan([field('Email address'), field('Email address', { visible: false })], rec('email'));
  assert.equal(ds[0].status, 'filled');
});

test('read-only and disabled fields are never written', () => {
  assert.equal(one([field('ZIP code', { readOnly: true, value: '00000', untouched: false })], rec('zip')).reason, 'read-only');
  assert.equal(one([field('ZIP code', { disabled: true })], rec('zip')).reason, 'disabled');
});

test('never overwrites a value someone already entered', () => {
  const d = one([field('NPI', { value: '1111111111', untouched: false })], rec('npi'));
  assert.equal(d.reason, 'already-filled');
  const same = one([field('NPI', { value: '1234567893', untouched: false })], rec('npi'));
  assert.equal(same.status, 'unchanged');
});

test('never truncates: value longer than maxlength is skipped', () => {
  assert.equal(one([field('License number', { maxLength: 6 })], rec('licenseNumber')).reason, 'would-truncate');
});

test('respects the field pattern and input type', () => {
  assert.equal(one([field('ZIP code', { pattern: '\\d{4}' })], rec('zip')).reason, 'rejected-by-field');
  assert.equal(one([field('ZIP code', { pattern: '\\d{5}' })], rec('zip')).status, 'filled');
  assert.equal(one([field('Phone', { inputType: 'number' })], rec('phone')).reason, 'rejected-by-field');
});

test('dates: converted only when the field states its format', () => {
  assert.equal(one([field('Date of birth', { kind: 'date', inputType: 'date' })], rec('dob')).write, '1984-03-22');
  assert.equal(one([field('Date of birth', { placeholder: 'MM/DD/YYYY' })], rec('dob')).write, '03/22/1984');
  assert.equal(one([field('Birth date')], rec('dob')).reason, 'date-format-unknown');
});

test('selects: exactly one option must match by value or text', () => {
  const opts = [{ value: '', text: 'Select' }, { value: 'CA', text: 'California' }, { value: 'NV', text: 'Nevada' }];
  assert.equal(one([field('State', { kind: 'select', inputType: 'select', options: opts })], rec('state')).write, 'CA');
  const none = [{ value: '', text: 'Select' }, { value: 'NV', text: 'Nevada' }];
  assert.equal(one([field('State', { kind: 'select', inputType: 'select', options: none })], rec('state')).reason, 'no-matching-option');
  const dup = [{ value: 'CA', text: 'CA' }, { value: 'ca-2', text: 'CA' }];
  assert.equal(one([field('State', { kind: 'select', inputType: 'select', options: dup })], rec('state')).reason, 'ambiguous-option');
});

test('passwords, checkboxes and other non-text inputs are never candidates', () => {
  const pw = field('Phone', { kind: 'unsupported', inputType: 'password' });
  assert.equal(one([pw], rec('phone')).reason, 'no-match');
});

test('autocomplete tokens identify a field even without a label', () => {
  assert.equal(one([field('', { autocomplete: ['postal-code'], signals: [] })], rec('zip')).status, 'filled');
});

test('names and ids count as signals (camelCase, snake_case)', () => {
  assert.equal(one([field('', { signals: ['licenseNumber'] })], rec('licenseNumber')).status, 'filled');
  assert.equal(one([field('', { signals: ['npi_group'] }), field('', { signals: ['npi_individual'] })], rec('npi')).reason, 'ambiguous');
});

test('unexpected input from the backend is skipped, never trusted', () => {
  const ds = plan([field('NPI')], [{ key: 'npi', value: '12345' }, { key: 'ssn', value: 'x' }, { key: 'npi', value: '1234567893' }, { key: 'city', value: '' }]);
  assert.deepEqual(ds.map((d) => d.reason), ['bad-value', 'unknown-key', 'duplicate-key', 'empty-value']);
  assert.ok(ds.every((d) => d.write === undefined));
});

test('the report never contains a value', () => {
  const fields = [field('First name'), field('Last name'), field('NPI'), field('Email address'), field('Phone')];
  const r = plain(SafeFill.report(SafeFill.plan(fields, RECORD, rules), { frames: 0 }));
  const json = JSON.stringify(r);
  for (const { value } of RECORD) assert.ok(!json.includes(value), `report leaked ${value}`);
  assert.equal(r.summary.filled, 5);
});

test('rules are frozen: the page cannot change matching behavior', () => {
  assert.ok(Object.isFrozen(rules));
  assert.ok(Object.isFrozen(rules.npi));
  assert.ok(Object.isFrozen(rules.npi.phrases));
  assert.ok(Object.isFrozen(SafeFill));
});
