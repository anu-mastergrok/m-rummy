// Deterministic browser fixtures exercise presentation only. PHP/HTTP tests cover rules.
// Run: npm install --no-save playwright && npx playwright install chromium
//      npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function fixture(t, viewport = { width: 1920, height: 1080 }) {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const hand = Array.from({ length: 13 }, (_, i) => ({ id: `card-${i}`, rank: i + 1, suit: 'H' }));
  const room = { code: 'ABCDEF123456', version: 1, round: 1, status: 'playing', phase: 'draw', me: 'me', host: 'me', turn: 'me', deadline: Date.now() + 60000, hand,
    players: [{ id: 'me', name: 'Me', total: 0, turns: 0, count: 13 }, { id: 'other', name: 'Friend', total: 10, count: 13 }],
    indicator: { id: 'wild', rank: 5, suit: 'C' }, wildRank: 5, stockCount: 70, topDiscard: { id: 'discard', rank: 6, suit: 'S' }, messages: [], activity: [], history: [], account: { name: 'Me', points: 10000 } };
  const requests = [];
  let offline = false, hold = false, held;
  await page.route('http://rummy.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (offline) return route.abort();
      if (path === '/api/session') return route.fulfill({ json: { csrf: 'test', room: room.code, account: room.account } });
      if (path === '/api/action') {
        const input = route.request().postDataJSON(); requests.push(input);
        if (hold) await new Promise(r => { held = r; });
        if (input.action === 'declare') return route.fulfill({ status: 400, json: { error: 'Your hand needs a pure sequence.' } });
        if (input.action === 'draw') { room.phase = 'discard'; room.hand = [...hand, { id: 'drawn', rank: 2, suit: 'S' }]; }
        if (input.action === 'chat') room.messages.push({ id: `m${requests.length}`, name: 'Me', text: input.text, time: Date.now() });
        room.version++;
      }
      return route.fulfill({ json: { ...room, serverTime: Date.now() } });
    }
    try {
      const file = path === '/' ? 'index.html' : path.slice(1);
      const contentType = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      return route.fulfill({ body: await readFile(resolve('public', file)), contentType });
    } catch { return route.fulfill({ status: 404 }); }
  });
  await page.goto('http://rummy.test/');
  await page.getByRole('button', { name: 'View cards', exact: true }).waitFor();
  return { page, room, requests, errors, setOffline: value => { offline = value; }, hold: () => { hold = true; }, release: () => { hold = false; held?.(); } };
}
const open = (page, name) => page.getByRole('button', { name, exact: true }).click();
const close = page => page.getByRole('button', { name: 'Close table panel' }).click();

test('table panels show private hand, real standings, settings and safe chat', async t => {
  const { page, room, errors } = await fixture(t);
  await open(page, 'View cards'); assert.equal(await page.locator('#game-dialog .card').count(), 13); await close(page);
  await open(page, 'Standings'); assert.match(await page.locator('#game-dialog').innerText(), /Friend/); assert.equal(await page.locator('#game-dialog .card').count(), 0); await close(page);
  await open(page, 'Table info'); assert.match(await page.locator('#game-dialog').innerText(), /Free play/); await close(page);
  await open(page, 'Settings'); await page.getByLabel('Spread out hand cards').check();
  assert.match(await page.locator('html').getAttribute('class'), /roomy-cards/); await close(page);
  await open(page, 'Chat'); await page.locator('#dialog-chat-input').fill('<img src=x onerror=alert(1)>');
  await page.locator('#dialog-chat-form button').click();
  await page.locator('#game-dialog .message').waitFor();
  assert.equal(room.messages[0].text, '<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#game-dialog .message img').count(), 0);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#game-dialog').evaluate(d => d.open), false);
  assert.deepEqual(errors, []);
});

test('pending moves cannot be repeated and rejected declaration preserves hand', async t => {
  const f = await fixture(t); const { page, requests } = f;
  f.hold(); await page.getByRole('button', { name: 'Draw from closed deck' }).click();
  await page.waitForFunction(() => document.querySelector('[data-draw="stock"]').disabled);
  assert.equal(await page.locator('[data-draw="discard"]').isDisabled(), true);
  assert.equal(requests.length, 1); f.release();
  await page.locator('[data-card="drawn"]').waitFor(); await page.locator('[data-card="drawn"]').click();
  await page.locator('[data-action="declare"]').click(); await page.locator('#confirm-yes').click();
  await page.getByRole('heading', { name: 'Review your declaration' }).waitFor();
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 14);
  assert.match(await page.locator('#game-dialog').innerText(), /pure sequence/);
  await page.waitForFunction(() => !document.querySelector('[data-panel-action="arrange"]').disabled);
  await close(page); assert.equal(await page.locator('[data-action="declare"]').isDisabled(), false);
  assert.deepEqual(f.errors, []);
});

test('network uncertainty gates commands until an authoritative snapshot returns', async t => {
  const f = await fixture(t); const { page } = f;
  f.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(await page.locator('[data-draw="stock"]').isDisabled(), true);
  assert.equal(await page.locator('#connection-banner').isVisible(), true);
  await open(page, 'Chat'); await page.locator('#dialog-chat-input').fill('Keep my draft');
  assert.equal(await page.locator('#dialog-chat-form button').isDisabled(), true);
  f.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !document.querySelector('[data-draw="stock"]').disabled);
  assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'Keep my draft');
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1920, 1080]]) {
  test(`table tools fit ${width}x${height} and keyboard focus stays inside dialog`, async t => {
    const { page, errors } = await fixture(t, { width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await open(page, 'Settings');
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('#game-dialog')), true);
    }
    assert.equal(await page.locator('#game-dialog').evaluate(d => d.scrollWidth <= d.clientWidth), true);
    assert.deepEqual(errors, []);
  });
}
