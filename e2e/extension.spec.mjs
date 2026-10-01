// The unpacked release build loaded into real Chromium.
import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ARGS, ORIGIN, OTHER, DIST } from './harness.mjs';

const RECORD = JSON.parse(readFileSync('fixtures/record.json', 'utf8'));
let context; let worker;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'sf-profile-')), {
    channel: 'chromium', headless: true, ignoreHTTPSErrors: true,
    args: [...ARGS, `--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
  });
  const isOurs = (w) => w.url().startsWith('chrome-extension://') && w.url().endsWith('/src/background.js');
  worker = context.serviceWorkers().find(isOurs) || await context.waitForEvent('serviceworker', isOurs);
  // Chrome binds extension APIs a moment after the worker starts.
  await expect.poll(() => worker.evaluate(() => typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.id)).toBe(true);
});
test.afterAll(async () => { await context.close(); });

async function openPopup() {
  const [popup] = await Promise.all([
    context.waitForEvent('page', (p) => p.url().endsWith('/popup.html')),
    worker.evaluate(() => chrome.windows.create({ url: chrome.runtime.getURL('popup.html'), focused: false, type: 'popup' })),
  ]);
  await popup.waitForLoadState();
  return popup;
}

async function requestFill(buttonText) {
  const app = await context.newPage();
  await app.goto(`${ORIGIN}/app.html`);
  const [portal] = await Promise.all([context.waitForEvent('page'), app.getByRole('button', { name: buttonText }).click()]);
  await portal.waitForURL(/\/portals\/portal-/);
  await portal.waitForLoadState();
  await expect(app.locator('#status')).toContainText('Request sent');
  return { app, portal };
}

test('Chrome gives the extension no storage API and only two permissions', async () => {
  const info = await worker.evaluate(() => ({ storage: typeof chrome.storage, perms: chrome.runtime.getManifest().permissions }));
  expect(info.storage).toBe('undefined');
  expect(info.perms.sort()).toEqual(['activeTab', 'scripting']);
});

test('CSP blocks any network call except the backend', async () => {
  let hits = 0;
  const server = createServer((_, res) => { hits++; res.end('x'); });
  await new Promise((ok) => server.listen(8799, '127.0.0.1', ok));
  const outcome = await worker.evaluate(() => fetch('http://127.0.0.1:8799/leak').then(() => 'sent', () => 'blocked'));
  const backend = await worker.evaluate((o) => fetch(o + '/demo-record.json').then((r) => r.status, () => 0), ORIGIN);
  server.close();
  expect(outcome).toBe('blocked');
  expect(hits).toBe(0);
  expect(backend).toBe(200);
});

test('full chain: app ticket, backend values, fill, report without values', async () => {
  const { app, portal } = await requestFill('Fill on Bluewater payer portal');
  await portal.bringToFront();
  const popup = await openPopup();
  await expect(popup.locator('#state')).toContainText('Ready to fill');
  await popup.locator('#fill').click();
  await expect(popup.locator('#totals')).toHaveText('4 filled, 7 skipped');
  await expect(portal.locator('#dob')).toHaveValue('03/22/1984');
  await expect(portal.locator('#city')).toHaveValue('Riverton');
  await expect(portal.locator('#npi-i')).toHaveValue('');
  expect(await portal.evaluate(() => window.__submits)).toBe(0);
  const shown = await popup.locator('body').innerText();
  for (const { value } of RECORD) expect(shown).not.toContain(value);
  await expect(popup.locator('#items')).toContainText('More than one field could take it: Individual NPI, Group NPI');
  await popup.close(); await app.close(); await portal.close();
});

test('a ticket is single use', async () => {
  const { app, portal } = await requestFill('Fill on State Board portal');
  await portal.bringToFront();
  const first = await openPopup();
  await first.locator('#fill').click();
  await expect(first.locator('#totals')).toHaveText('11 filled, 0 skipped');
  await first.close();
  const second = await openPopup();
  await expect(second.locator('#state')).toContainText('No fill request');
  await expect(second.locator('#fill')).toBeDisabled();
  await second.close(); await app.close(); await portal.close();
});

test('wrong site: the ticket is bound to the portal, nothing is filled elsewhere', async () => {
  const { app, portal } = await requestFill('Fill on State Board portal');
  const lookalike = await context.newPage();
  await lookalike.goto(`${OTHER}/portals/portal-a.html`);
  await lookalike.bringToFront();
  const popup = await openPopup();
  await popup.locator('#fill').click();
  await expect(popup.locator('#state')).toContainText(/different site|cannot read this tab/);
  await expect(lookalike.locator('#first-name')).toHaveValue('');
  await expect(portal.locator('#first-name')).toHaveValue('');
  await popup.close(); await lookalike.close(); await app.close(); await portal.close();
});

test('pages on other sites cannot reach the extension at all', async () => {
  const page = await context.newPage();
  await page.goto(`${OTHER}/app.html`);
  expect(await page.evaluate(() => !!(window.chrome && chrome.runtime && chrome.runtime.sendMessage))).toBe(false);
  await page.close();
});
