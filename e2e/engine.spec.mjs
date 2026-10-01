// The exact release files, injected into the sample portals in real Chromium.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARGS, ORIGIN, DIST } from './harness.mjs';

test.use({ launchOptions: { args: ARGS }, ignoreHTTPSErrors: true });

const RECORD = JSON.parse(readFileSync('fixtures/record.json', 'utf8'));

async function fill(page, portal) {
  await page.goto(`${ORIGIN}/portals/${portal}.html`);
  await page.addScriptTag({ path: join(DIST, 'src/field-rules.js') });
  await page.addScriptTag({ path: join(DIST, 'src/fill-engine.js') });
  return page.evaluate((rec) => window.SafeFill.run(rec), RECORD);
}
const byKey = (report) => Object.fromEntries(report.items.map((i) => [i.key, i.status === 'filled' ? 'filled' : i.reason]));

test('clean portal: every value has exactly one home and is filled', async ({ page }) => {
  const r = await fill(page, 'portal-a');
  expect(r.summary).toEqual({ filled: 11, skipped: 0, unchanged: 0, frames: 0 });
  await expect(page.locator('#npi')).toHaveValue('1234567893');
  await expect(page.locator('#dob')).toHaveValue('1984-03-22');
  await expect(page.locator('#state')).toHaveValue('CA');
  expect(await page.evaluate(() => window.__submits)).toBe(0);
});

test('tricky portal: ambiguity, limits and read-only fields are skipped', async ({ page }) => {
  const r = await fill(page, 'portal-b');
  expect(byKey(r)).toEqual({
    firstName: 'no-match', lastName: 'no-match', dob: 'filled', npi: 'ambiguous', licenseNumber: 'would-truncate',
    email: 'filled', phone: 'ambiguous', street: 'filled', city: 'filled', state: 'ambiguous', zip: 'read-only',
  });
  await expect(page.locator('#dob')).toHaveValue('03/22/1984');
  await expect(page.locator('#npi-i')).toHaveValue('');
  await expect(page.locator('#npi-g')).toHaveValue('');
  await expect(page.locator('#lic')).toHaveValue('');
  await expect(page.locator('#email2')).toHaveValue('');
  await expect(page.locator('#zip')).toHaveValue('00000');
  expect(await page.evaluate(() => window.__submits)).toBe(0);
});

test('app-style portal: values survive re-render, shadow DOM filled, shared field skipped', async ({ page }) => {
  const r = await fill(page, 'portal-c');
  expect(byKey(r)).toEqual({
    firstName: 'filled', lastName: 'filled', dob: 'date-format-unknown', npi: 'already-filled', licenseNumber: 'filled',
    email: 'ambiguous', phone: 'shared-field', street: 'filled', city: 'filled', state: 'filled', zip: 'filled',
  });
  expect(r.summary.frames).toBe(1);
  await page.evaluate(() => window.__rerender());
  await expect(page.locator('[name=f1]')).toHaveValue('Dana');
  await expect(page.locator('#f5')).toHaveValue('RN-882140');
  await expect(page.locator('#f6')).toHaveValue('1111111111');
  await expect(page.locator('#f3')).toHaveValue('');
  await expect(page.locator('address-block #s')).toHaveValue('41 Harbor View Rd');
  await expect(page.locator('address-block #z')).toHaveValue('94965');
  expect(await page.evaluate(() => window.__submits)).toBe(0);
});

test('control: a naive .value write is wiped by the re-render (why the engine uses native setters)', async ({ page }) => {
  await page.goto(`${ORIGIN}/portals/portal-c.html`);
  await page.evaluate(() => { document.querySelector('#f2').value = 'Naive'; window.__rerender(); });
  await expect(page.locator('#f2')).toHaveValue('');
});

test('reports never contain a value', async ({ page }) => {
  for (const portal of ['portal-a', 'portal-b', 'portal-c']) {
    const json = JSON.stringify(await fill(page, portal));
    for (const { value } of RECORD) expect(json).not.toContain(value);
  }
});
