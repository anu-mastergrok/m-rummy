// Deterministic browser fixtures exercise presentation only. PHP/HTTP tests cover rules.
// Run: npm install --no-save playwright && npx playwright install chromium
//      npm run test:ui
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function fixture(t, viewport = { width: 1920, height: 1080 }, multi = false, initial = {}) {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const hand = Array.from({ length: 13 }, (_, i) => ({ id: `card-${i}`, rank: i + 1, suit: 'H' }));
  const room = { code: 'ABCDEF123456', version: 1, round: 1, status: 'playing', phase: 'draw', me: 'me', host: 'me', turn: 'me', deadline: Date.now() + 60000, hand,
    players: [{ id: 'me', name: 'Me', total: 0, turns: 0, count: 13 }, { id: 'other', name: 'Friend', total: 10, count: 13 }],
    indicator: { id: 'wild', rank: 5, suit: 'C' }, wildRank: 5, stockCount: 70, topDiscard: { id: 'discard', rank: 6, suit: 'S' }, messages: [], activity: [], history: [], account: { name: 'Me', points: 10000 } };
  Object.assign(room, initial);
  const rooms = new Map([[room.code, room]]);
  if (multi) rooms.set('BBBBBB123456', { ...structuredClone(room), code: 'BBBBBB123456', deadline: Date.now() + 45000, hand: hand.map(c => ({ ...c, suit: 'S' })), messages: [] });
  const requests = [];
  let offline = false, hold = false, held, holdPoll = false, pollStarted, releasePoll;
  await page.route('http://rummy.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/api/')) {
      if (offline) return route.abort();
      if (path === '/api/session') return route.fulfill({ json: { csrf: 'test', room: room.code, rooms: [...rooms.keys()], tableLimit: 3, account: room.account } });
      if (path === '/api/tables') {
        const active = rooms.get(new URL(route.request().url()).searchParams.get('code'));
        const tables = [...rooms.values()].map(r => ({ code: r.code, version: r.version, round: r.round, status: r.status, phase: r.phase, deadline: r.deadline, yourTurn: r.turn === r.me, dropped: false, playerCount: r.players.length }));
        const payload = structuredClone({ tables, active: active ? { ...active, serverTime: Date.now() } : null, tableLimit: 3, serverTime: Date.now() });
        if (holdPoll) { holdPoll = false; pollStarted?.(); await new Promise(r => { releasePoll = r; }); }
        return route.fulfill({ json: payload });
      }
      if (path === '/api/create' || path === '/api/join') {
        const input = route.request().postDataJSON();
        if (path === '/api/join' && input.password !== 'friends') return route.fulfill({ status: 400, json: { error: 'Incorrect room password.' } });
        const code = path === '/api/join' ? input.code : 'CCCCCC123456';
        if (rooms.size >= 3) return route.fulfill({ status: 400, json: { error: 'You can join up to 3 tables.' } });
        const next = { ...structuredClone(room), code, status: 'lobby', phase: 'draw', round: 0, version: 1, hand: [], messages: [], players: [room.players[0]] };
        rooms.set(code, next); return route.fulfill({ json: { ...next, serverTime: Date.now() } });
      }
      if (path === '/api/action') {
        const input = route.request().postDataJSON(); requests.push(input);
        if (hold) await new Promise(r => { held = r; });
        const target = rooms.get(input.code);
        if (input.action === 'leave') { rooms.delete(input.code); return route.fulfill({ json: { left: true } }); }
        if (input.action === 'declare') return route.fulfill({ status: 400, json: { error: 'Your hand needs a pure sequence.' } });
        if (input.action === 'addBot') target.players.push({ id: `bot-${target.players.length}`, name: 'Practice bot', bot: true, total: 0, count: 0, turns: 0 });
        if (input.action === 'removeBot') target.players = target.players.filter(p => p.id !== input.playerId);
        if (input.action === 'start') { target.status = 'playing'; target.round = 1; target.hand = hand; }
        if (input.action === 'draw') { target.phase = 'discard'; target.hand = [...target.hand, { id: 'drawn', rank: 2, suit: 'S' }]; }
        if (input.action === 'discard') { target.hand = target.hand.filter(c => c.id !== input.cardId); target.turn = 'other'; target.phase = 'draw'; target.deadline = Date.now() + 60000; }
        if (input.action === 'chat') target.messages.push({ id: `m${requests.length}`, name: 'Me', text: input.text, time: Date.now() });
        target.version++;
        return route.fulfill({ json: { ...target, serverTime: Date.now() } });
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
  await page.locator('#connection').waitFor();
  return { page, room, rooms, requests, errors, holdNextPoll: () => { holdPoll = true; return new Promise(r => { pollStarted = r; }); }, releasePoll: () => releasePoll?.(), setOffline: value => { offline = value; }, hold: () => { hold = true; }, release: () => { hold = false; held?.(); } };
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

test('six-step tutorial supports back, finish, revisit and keyboard close', async t => {
  const { page, errors } = await fixture(t, { width: 390, height: 844 });
  await open(page, 'Learn rummy');
  assert.equal(await page.locator('#tutorial-back').isDisabled(), true);
  for (let step = 1; step <= 6; step++) {
    assert.equal(await page.locator('#tutorial-progress').textContent(), `Step ${step} of 6`);
    if (step === 3) {
      await page.locator('#tutorial-back').click();
      assert.equal(await page.locator('#tutorial-progress').textContent(), 'Step 2 of 6');
      await page.locator('#tutorial-next').click();
    }
    await page.locator('#tutorial-next').click();
  }
  assert.equal(await page.locator('#tutorial-dialog').evaluate(d => d.open), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('mr-tutorial-complete')), 'true');
  await page.locator('#rules-button').click(); await page.locator('#tutorial-button').click();
  assert.equal(await page.locator('#tutorial-progress').textContent(), 'Step 1 of 6');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#tutorial-dialog').evaluate(d => d.open), false);
  assert.deepEqual(errors, []);
});

test('round changes reset local groups and older snapshots cannot roll back the hand', async t => {
  const { page, room } = await fixture(t);
  await page.locator('[data-card="card-0"]').click(); await page.locator('[data-card="card-1"]').click(); await page.locator('[data-card="card-2"]').click();
  await page.locator('[data-action="group"]').click(); assert.equal(await page.locator('.ungroup').count(), 1);
  room.version++; room.round++;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelectorAll('.ungroup').length === 0);
  room.version = 0; room.hand = [];
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelector('#connection-banner').hidden);
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 13);
});

test('switching tables preserves per-table selection, groups and chat drafts with colliding card IDs', async t => {
  const { page, room, errors } = await fixture(t, { width: 390, height: 844 }, true);
  for (let i = 0; i < 3; i++) await page.locator(`[data-card="card-${i}"]`).click();
  await page.locator('[data-action="group"]').click();
  await page.locator('[data-card="card-4"]').click();
  await page.locator('#chat-input').fill('Draft at first table');
  await page.locator('[data-switch-table="BBBBBB123456"]').click();
  await page.waitForURL('**/?room=BBBBBB123456');
  assert.equal(await page.locator('.hand-scroll .selected').count(), 0);
  assert.equal(await page.locator('.ungroup').count(), 0);
  assert.equal(await page.locator('#chat-input').inputValue(), '');
  await page.locator('[data-card="card-5"]').click();
  await page.locator('#chat-input').fill('Draft at second table');
  await page.locator(`[data-switch-table="${room.code}"]`).click();
  await page.waitForURL(`**/?room=${room.code}`);
  assert.equal(await page.locator('[data-card="card-4"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-card="card-5"]').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('.ungroup').count(), 1);
  assert.equal(await page.locator('#chat-input').inputValue(), 'Draft at first table');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('[data-switch-table="BBBBBB123456"]').click();
  await page.waitForURL('**/?room=BBBBBB123456');
  await page.reload();
  await page.locator('[data-switch-table="BBBBBB123456"][aria-current="page"]').waitFor();
  assert.deepEqual(errors, []);
});

test('pending actions prevent table switching and commands use the selected table', async t => {
  const f = await fixture(t, undefined, true); const { page } = f;
  await page.locator('[data-switch-table="BBBBBB123456"]').click(); await page.waitForURL('**/?room=BBBBBB123456');
  f.hold(); await page.locator('[data-draw="stock"]').click();
  assert.equal(await page.locator(`[data-switch-table="${f.room.code}"]`).isDisabled(), true);
  assert.equal(await page.locator('[data-add-table]').isDisabled(), true);
  f.release(); await page.locator('[data-card="drawn"]').waitFor();
  assert.equal(f.requests[0].code, 'BBBBBB123456'); assert.equal(f.room.hand.length, 13);
  await page.locator(`[data-switch-table="${f.room.code}"]`).click(); await page.waitForURL(`**/?room=${f.room.code}`);
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 13);
  assert.match(await page.locator('[data-table-clock="BBBBBB123456"]').innerText(), /Your turn/);
  assert.deepEqual(f.errors, []);
});

test('create and leave affect only one table, and the cap disables Add table', async t => {
  const { page, room, rooms, errors } = await fixture(t, undefined, true);
  await page.locator('[data-add-table]').click(); await page.locator('#table-entry-submit').click();
  await page.waitForURL('**/?room=CCCCCC123456');
  assert.equal(rooms.size, 3); assert.equal(await page.locator('[data-add-table]').isDisabled(), true);
  await page.locator('[data-action="leave"]').click(); await page.locator('#confirm-yes').click();
  await page.getByRole('heading', { name: 'Choose your table' }).waitFor();
  assert.equal(rooms.size, 2); assert.equal(await page.locator('[data-add-table]').isDisabled(), false);
  await page.locator(`[data-switch-table="${room.code}"]`).click(); await page.waitForURL(`**/?room=${room.code}`);
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 13);
  assert.deepEqual(errors, []);
});

test('joining reports password failures in place and retains existing tables', async t => {
  const { page, rooms, errors } = await fixture(t);
  await page.locator('[data-add-table]').click(); await page.locator('[data-table-mode="join"]').click();
  await page.locator('#new-table-code').fill('DDDDDD123456'); await page.locator('#new-table-password').fill('wrong');
  await page.locator('#table-entry-submit').click();
  await page.waitForFunction(() => document.querySelector('#table-entry-error').textContent.includes('Incorrect'));
  assert.equal(rooms.size, 1); assert.equal(await page.locator('#new-table-code').inputValue(), 'DDDDDD123456');
  await page.locator('#new-table-password').fill('friends'); await page.locator('#table-entry-submit').click();
  await page.waitForURL('**/?room=DDDDDD123456'); assert.equal(rooms.size, 2); assert.deepEqual(errors, []);
});

test('expiration removes selected table without silently switching or replaying actions', async t => {
  const { page, room, rooms, requests, errors } = await fixture(t, undefined, true);
  rooms.delete(room.code); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.getByRole('heading', { name: 'Choose your table' }).waitFor();
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 0);
  await page.locator('[data-switch-table="BBBBBB123456"]').click(); await page.waitForURL('**/?room=BBBBBB123456');
  assert.equal(requests.length, 0); assert.deepEqual(errors, []);
});

test('an older in-flight aggregate poll cannot roll back turn indicators after a command', async t => {
  const f = await fixture(t, undefined, true); const { page, room } = f;
  await page.locator('[data-draw="stock"]').click(); await page.locator('[data-card="drawn"]').waitFor();
  await f.holdNextPoll();
  await page.locator('[data-card="drawn"]').click(); await page.locator('[data-action="discard"]').click();
  await page.waitForFunction(code => document.querySelector(`[data-table-clock="${code}"]`).textContent.startsWith('Playing'), room.code);
  const response = page.waitForResponse(r => r.url().includes('/api/tables'));
  f.releasePoll(); await (await response).finished(); await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator('.hand-scroll [data-card]').count(), 13);
  assert.match(await page.locator(`[data-table-clock="${room.code}"]`).innerText(), /^Playing/);
  assert.deepEqual(f.errors, []);
});

test('presence-only snapshots update seat badges without replacing cards or chat input', async t => {
  const { page, room, requests, errors } = await fixture(t);
  await page.locator('[data-card="card-4"]').click();
  await page.locator('#chat-input').fill('Draft remains'); await page.locator('#chat-input').focus();
  await page.evaluate(() => { window.cardBeforePresence = document.querySelector('[data-card="card-4"]'); window.chatBeforePresence = document.querySelector('#chat-input'); });
  const version = room.version, deadline = room.deadline;
  room.players[0].presence = 'online'; room.players[1].presence = 'away';
  await page.locator('[data-presence-player="other"][data-presence="away"]').waitFor();
  assert.equal(await page.locator('[data-presence-player="other"]').innerText(), 'Away');
  assert.equal(await page.evaluate(() => window.cardBeforePresence === document.querySelector('[data-card="card-4"]') && window.chatBeforePresence === document.querySelector('#chat-input')), true);
  assert.equal(await page.locator('[data-card="card-4"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#chat-input').inputValue(), 'Draft remains');
  assert.equal(await page.locator('#chat-input').evaluate(e => e === document.activeElement), true);
  room.players[1].presence = 'offline';
  await page.locator('[data-presence-player="other"][data-presence="offline"]').waitFor();
  room.players[1].presence = 'online';
  await page.locator('[data-presence-player="other"][data-presence="online"]').waitFor();
  assert.equal(room.version, version); assert.equal(room.deadline, deadline); assert.equal(requests.length, 0); assert.deepEqual(errors, []);
});

test('each page sends visibility and ordered heartbeats, with a fresh client after reload', async t => {
  const { page, errors } = await fixture(t);
  const visibleRequest = page.waitForRequest(r => r.url().includes('/api/tables') && new URL(r.url()).searchParams.get('visible') === '1');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const first = new URL((await visibleRequest).url());
  assert.match(first.searchParams.get('client'), /^[a-f0-9]{32}$/);
  await page.waitForFunction(() => document.querySelector('#connection-banner').hidden);
  const hiddenRequest = page.waitForRequest(r => r.url().includes('/api/tables') && new URL(r.url()).searchParams.get('visible') === '0');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = new URL((await hiddenRequest).url());
  assert.equal(hidden.searchParams.get('client'), first.searchParams.get('client'));
  assert.ok(Number(hidden.searchParams.get('sequence')) > Number(first.searchParams.get('sequence')));
  const foregroundRequest = page.waitForRequest(r => r.url().includes('/api/tables') && new URL(r.url()).searchParams.get('visible') === '1');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  const foreground = new URL((await foregroundRequest).url());
  assert.ok(Number(foreground.searchParams.get('sequence')) > Number(hidden.searchParams.get('sequence')));
  // The outgoing document can send a final hidden heartbeat during navigation.
  const reloadRequest = page.waitForRequest(r => r.url().includes('/api/tables') && new URL(r.url()).searchParams.get('client') !== first.searchParams.get('client'));
  await page.reload(); const reloaded = new URL((await reloadRequest).url());
  assert.notEqual(reloaded.searchParams.get('client'), first.searchParams.get('client')); assert.deepEqual(errors, []);
});

test('local network loss marks self reconnecting and treats remote presence as unknown until resync', async t => {
  const f = await fixture(t); const { page, room } = f;
  room.players.forEach(p => { p.presence = 'online'; });
  await page.locator('[data-presence-player="other"][data-presence="online"]').waitFor();
  f.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(await page.locator('[data-presence-player="me"]').innerText(), 'Reconnecting');
  assert.equal(await page.locator('[data-presence-player="other"]').innerText(), 'Status unknown');
  f.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.locator('[data-presence-player="other"][data-presence="online"]').waitFor();
  assert.equal(await page.locator('[data-presence-player="me"]').innerText(), 'Connected'); assert.deepEqual(f.errors, []);
});

 test('Figma splash stays visible during startup and clears after session recovery', async t => {
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
t.after(() => browser.close());
const page = await browser.newPage({viewport:{width:1920,height:1080}});
let release;const gate=new Promise(r=>release=r);
await page.route('http://rummy.test/**',async route=>{
const path=new URL(route.request().url()).pathname;
if(path==='/api/session'){await gate;return route.fulfill({json:{csrf:'test',rooms:[],account:null}});}
if(path.startsWith('/api/'))return route.fulfill({json:{tables:[],tableLimit:3}});
const file=path==='/'?'index.html':path.slice(1);
try{return route.fulfill({body:await readFile('public/'+file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html'});}catch{return route.fulfill({status:404});}
});
await page.goto('http://rummy.test/',{waitUntil:'domcontentloaded'});
await page.locator('.splash-art').evaluate(img=>img.decode());
assert.equal(await page.locator('.site-header').isVisible(),false);
assert.equal(await page.locator('.splash-art').evaluate(el=>el.getBoundingClientRect().width),640);

await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),390);

release();await page.locator('.landing').waitFor();
assert.equal(await page.locator('body').getAttribute('class'),'');
assert.equal(await page.locator('#app').getAttribute('aria-busy'),null);


});

const waitingPlayer = (id, name, extra = {}) => ({ id, name, total: 0, count: 0, turns: 0, presence: 'online', ...extra });
async function waitingScreenshot(page, name) {
  if (!process.env.UI_SCREENSHOT_DIR) return;
  await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
  await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}
test('waiting host sees six seats, invite flow and guarded bot/deal actions', async t => {
  const f = await fixture(t, { width: 1920, height: 1080 }, false, { status: 'lobby', round: 0, hand: [], players: [waitingPlayer('me', 'Me')] });
  const { page, requests } = f;
  assert.equal(await page.locator('.waiting-seat').count(), 6);
  assert.equal(await page.locator('.waiting-seat-open').count(), 5);
  assert.equal(await page.locator('.waiting-seat-self').innerText().then(s => s.includes('Me (you)')), true);
  assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
  assert.equal(await page.locator('.hand-panel').count(), 0);
  await waitingScreenshot(page, 'waiting-host-desktop');
  await page.getByRole('button', { name: 'Invite a friend to seat 2', exact: true }).click();
  assert.equal(await page.locator('#invite-url').inputValue(), 'http://rummy.test/?room=ABCDEF123456');
  await page.keyboard.press('Escape');
  f.hold(); await page.locator('[data-action="addBot"]').click();
  assert.equal(await page.locator('[data-action="addBot"]').isDisabled(), true);
  f.release(); await page.getByRole('button', { name: 'Remove Practice bot', exact: true }).waitFor();
  assert.equal(await page.locator('[data-action="start"]').isDisabled(), false);
  await page.getByRole('button', { name: 'Remove Practice bot', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.waiting-seat-open').length === 5);
  assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
  await page.locator('[data-action="addBot"]').click();
  await page.waitForFunction(() => !document.querySelector('[data-action="start"]').disabled);
  await page.locator('[data-action="start"]').click();
  await page.locator('.hand-panel').waitFor();
  assert.equal(await page.locator('.waiting-table').count(), 0);
  assert.equal(requests.filter(r => r.action === 'start').length, 1);
  assert.deepEqual(f.errors, []);
});
test('waiting guest retains chat, handles host changes and cannot use host controls', async t => {
  const f = await fixture(t, { width: 390, height: 844 }, false, { status: 'lobby', round: 0, hand: [], host: 'other', hasPassword: true, players: [waitingPlayer('me', 'Me'), waitingPlayer('other', '<script>Host</script>')] });
  const { page, room } = f;
  assert.equal(await page.locator('[data-action="start"], [data-action="addBot"], [data-remove]').count(), 0);
  assert.equal(await page.locator('.waiting-host-status').innerText(), 'Waiting for the host');
  assert.equal(await page.locator('.waiting-seat script').count(), 0);
  assert.match(await page.locator('.waiting-invite').innerText(), /Share its password separately/);
  await page.locator('#chat-input').fill('See you at the table');
  room.version++; room.host = 'me';
  await page.locator('[data-action="start"]').waitFor();
  assert.equal(await page.locator('#chat-input').inputValue(), 'See you at the table');
  assert.equal(await page.locator('#chat-input').evaluate(el => el === document.activeElement), true);
  await page.locator('#chat-form button').click();
  await page.locator('#messages .message').waitFor();
  assert.equal(room.messages[0].text, 'See you at the table');
  await waitingScreenshot(page, 'waiting-mobile');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
  f.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  assert.equal(await page.locator('[data-action="start"]').isDisabled(), true);
  assert.equal(await page.locator('[data-action="addBot"]').isDisabled(), true);
  assert.equal(await page.locator('#connection-banner').isVisible(), true);
  assert.deepEqual(f.errors, []);
});
test('full waiting table keeps long names contained across viewports', async t => {
  const f = await fixture(t, { width: 1024, height: 768 }, false, { status: 'lobby', round: 0, hand: [], players: [waitingPlayer('me', 'Me'), ...Array.from({ length: 5 }, (_, i) => waitingPlayer(`friend-${i}`, 'AveryLongNameWithoutSpaces', { bot: i === 4 }))] });
  const { page } = f;
  assert.equal(await page.locator('.waiting-seat-open').count(), 0);
  assert.equal(await page.locator('[data-action="addBot"]').isDisabled(), true);
  assert.equal(await page.locator('[data-action="start"]').isEnabled(), true);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), viewport.width);
    const overflow = await page.locator('.waiting-seat').evaluateAll(els => els.some(el => el.scrollWidth > el.clientWidth));
    assert.equal(overflow, false);
  }
  await waitingScreenshot(page, 'waiting-full-mobile');
  assert.deepEqual(f.errors, []);
});
