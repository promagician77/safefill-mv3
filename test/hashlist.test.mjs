import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, parse, compare, sha256 } from '../scripts/lib/hashlist.mjs';

const h = (s) => sha256(Buffer.from(s));

test('format is sorted and sha256sum-compatible', () => {
  const text = format([{ path: 'b.js', sha256: h('b') }, { path: 'a.js', sha256: h('a') }]);
  assert.equal(text, `${h('a')}  a.js\n${h('b')}  b.js\n`);
});

test('compare reports missing, extra and changed files', () => {
  const expected = parse(`${h('a')}  a.js\n${h('b')}  b.js\n`);
  const actual = new Map([['a.js', h('A')], ['c.js', h('c')]]);
  const r = compare(expected, actual);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, ['b.js']);
  assert.deepEqual(r.extra, ['c.js']);
  assert.equal(r.changed[0].path, 'a.js');
});

test('malformed, duplicate, unsafe and empty lists are rejected', () => {
  assert.throws(() => parse('nothex  a.js'), /malformed/);
  assert.throws(() => parse(`${h('a')}  a.js\n${h('a')}  a.js`), /twice/);
  assert.throws(() => parse(`${h('a')}  ../etc/passwd`), /unsafe/);
  assert.throws(() => parse(''), /empty/);
});
