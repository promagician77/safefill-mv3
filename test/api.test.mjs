import { test } from 'node:test';
import assert from 'node:assert/strict';
import record from '../api/_record.js';
import { issueTicket, readTicket } from '../api/_lib.js';
import { RECORD } from './helpers.mjs';

test('demo API record matches the fixture the tests use', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(record)), RECORD);
});

test('demo tickets: valid, tampered, and expired', () => {
  const t = issueTicket({ r: 'R-1042', p: 'https://x.test/portals/portal-a.html' });
  assert.equal(readTicket(t).r, 'R-1042');
  assert.equal(readTicket(t.slice(0, -2) + 'xx'), null);
  const [payload] = t.split('.');
  const stale = Buffer.from(JSON.stringify({ r: 'R-1042', exp: Date.now() - 1 })).toString('base64url');
  assert.equal(readTicket(stale + '.' + t.split('.')[1]), null);
  assert.ok(payload.length > 0);
});
