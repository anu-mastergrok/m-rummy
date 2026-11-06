import { tutorialSteps } from './tutorial.js';
import { remainingSeconds, reconcileGroups, tableStandings, presencePresentation } from './board-state.js';
const app = document.querySelector('#app');
const suits = { S: '♠', H: '♥', D: '♦', C: '♣', J: '✦' };
const ranks = { 0: 'JK', 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
let session, state, busy = false, polling = false, failures = 0, mode = 'create', groups = [], selected = new Set(), chatDraft = '', clockOffset = 0;
let lastCode = '', confirmAction;
let connection = 'connected';
let tables = [], tableLimit = 3, tableEpoch = 0;
const tableUi = new Map();
const presenceClient = [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
let presenceSequence = 0;
let openGamePanel = null, declarationError = '', chatComposerMode = 'replies';
const chatReplies = ['Hello everyone!', 'Good luck!', 'Nice hand!', 'Well played!', 'Thanks!', 'One moment, please.'];
con…49999 tokens truncated…game-dialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1 && bounds.y + bounds.height <= height + 1);
    for (const [asset, size] of [['chat-back', 36], ['chat-emoji', 40], ['chat-send', 40]]) {
      const box = await page.locator(`#game-dialog img[src$="${asset}.svg"]`).boundingBox();
      assert.equal(box.width, size); assert.equal(box.height, size);
    }
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `chat-replies-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Well played!', exact: true }).click();
    assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'Well played!');
    assert.equal(f.requests.length, 0);
    await page.locator('#dialog-chat-input').fill('Hello ');
    await page.getByRole('button', { name: 'Choose emoji' }).click();
    assert.equal(await page.locator('.chat-emoji-grid button').count(), 8);
    await page.getByRole('button', { name: 'Insert thumbs up' }).click();
    assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'Hello 👍');
    assert.equal(await page.locator('#dialog-chat-count').innerText(), '8/240');
    assert.equal(f.requests.length, 0);
    if (process.env.UI_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `chat-emoji-${width}.png`), fullPage: true });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#chat-input').inputValue(), 'Hello 👍');
    assert.equal(await page.locator('[data-card="card-0"]').getAttribute('aria-pressed'), 'true');
    await open(page, 'Settings');
    assert.equal(await page.locator('#game-dialog').getAttribute('data-panel'), 'settings');
    await page.keyboard.press('Escape'); assert.deepEqual(f.errors, []);
  });
}

test('chat insertion respects cursor selection and length limit; incoming messages preserve draft and history position', async t => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ id: `old-${i}`, name: 'Friend', text: `Earlier message ${i}`, time: 1793901600000 + i * 60000 }));
  const f = await fixture(t, { width: 390, height: 844 }, false, { messages }); const { page, room } = f;
  await open(page, 'Chat');
  assert.equal(await page.locator('#dialog-messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 2), true);
  await page.locator('#dialog-chat-input').fill('Hello friend');
  await page.locator('#dialog-chat-input').evaluate(el => el.setSelectionRange(6, 12));
  await page.getByRole('button', { name: 'Choose emoji' }).click();
  await page.getByRole('button', { name: 'Insert thumbs up' }).click();
  assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'Hello 👍');
  await page.locator('#dialog-chat-input').fill('x'.repeat(240));
  await page.getByRole('button', { name: 'Insert heart' }).click();
  assert.equal((await page.locator('#dialog-chat-input').inputValue()).length, 240);
  assert.match(await page.locator('#toast').innerText(), /240/);
  await page.locator('#dialog-chat-input').fill('A draft while reading');
  await page.locator('#dialog-chat-input').evaluate(el => el.setSelectionRange(2, 7));
  await page.locator('#dialog-messages').evaluate(el => { el.scrollTop = 0; });
  room.messages.push({ id: 'incoming', name: 'Friend', text: 'Incoming update', time: 1793903500000 }); room.version++;
  await page.locator('#dialog-messages').getByText('Incoming update', { exact: true }).waitFor({ state: 'attached' });
  assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'A draft while reading');
  assert.deepEqual(await page.locator('#dialog-chat-input').evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 7]);
  assert.equal(await page.locator('#dialog-messages').evaluate(el => el.scrollTop), 0);
  assert.equal(await page.locator('#chat-emoji-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dialog-chat-input');
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

test('rejected and pending chat sends retain drafts and do not send twice', async t => {
  const f = await fixture(t); const { page, requests, room } = f;
  await open(page, 'Chat');
  await page.locator('#dialog-chat-input').fill('Retry this draft');
  f.rejectNextChat(); await page.locator('#dialog-chat-send').click();
  await page.locator('#toast.error').waitFor();
  await page.waitForFunction(() => document.querySelector('#dialog-chat-input').value === 'Retry this draft' && !document.querySelector('#dialog-chat-send').disabled);
  assert.equal(await page.locator('#dialog-chat-count').innerText(), '16/240');
  assert.equal(requests.length, 1); assert.equal(room.messages.length, 0);
  f.hold(); await page.locator('#dialog-chat-send').click();
  await page.waitForFunction(() => document.querySelector('#dialog-chat-send').disabled);
  await page.locator('#dialog-chat-send').evaluate(el => { el.click(); el.click(); });
  assert.equal(requests.length, 2);
  await page.locator('#dialog-chat-input').fill('Newer draft');
  f.release(); await page.waitForFunction(() => !document.querySelector('#dialog-chat-send').disabled);
  assert.equal(await page.locator('#dialog-chat-input').inputValue(), 'Newer draft');
  assert.equal(room.messages.length, 1); assert.equal(room.messages[0].text, 'Retry this draft');
  assert.equal(requests.length, 2); assert.deepEqual(f.errors, []);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1920, 1080]]) {
  test(`source settings fit ${width}px and display preferences persist after reload`, async t => {
    const f = await fixture(t, { width, height }); const { page } = f;
    await open(page, 'Settings');
    await page.locator('#game-dialog img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    assert.equal(await page.locator('[data-settings-panel="lastDeal"]').isDisabled(), true);
    assert.equal(await page.getByRole('checkbox').count(), 2);
    assert.match(await page.locator('.settings-option-unavailable').innerText(), /Game Music.*not available/s);
    for (const asset of ['settings-info', 'settings-music', 'settings-cards']) {
      const box = await page.locator(`#game-dialog img[src$="${asset}.svg"]`).boundingBox();
      assert.equal(box.width, 40); assert.equal(box.height, 40);
    }
    const back = await page.locator('#game-dialog img[src$="chat-back.svg"]').boundingBox();
    assert.equal(back.width, 36); assert.equal(back.height, 36);
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `settings-${width}.png`), fullPage: true });
    }
    await page.getByLabel('Spread out hand cards', { exact: true }).check();
    await page.getByLabel('Reduce motion', { exact: true }).check();
    assert.match(await page.locator('#settings-save-status').innerText(), /Saved on this browser/);
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('roomy-cards') && el.classList.contains('quiet-motion')), true);
    await page.keyboard.press('Escape'); await page.reload(); await page.locator('#connection').waitFor();
    await open(page, 'Settings');
    assert.equal(await page.getByLabel('Spread out hand cards', { exact: true }).isChecked(), true);
    assert.equal(await page.getByLabel('Reduce motion', { exact: true }).isChecked(), true);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
  });
}

test('settings remain usable offline and a completed round unlocks last deal without replacing focused preferences', async t => {
  const f = await fixture(t); const { page, room } = f;
  await open(page, 'Settings');
  const preference = page.getByLabel('Reduce motion', { exact: true }); await preference.focus();
  const element = await preference.elementHandle();
  room.history = [{ round: 1, winner: '<img src=x onerror=alert(1)>', scores: [{ name: '<script>Friend</script>', penalty: 0, total: 20 }, { name: 'Me', penalty: 40, total: 60 }] }]; room.version++;
  await page.waitForFunction(() => !document.querySelector('[data-settings-panel="lastDeal"]').disabled);
  assert.equal(await element.evaluate(el => el === document.activeElement), true);
  await page.locator('[data-settings-panel="lastDeal"]').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-panel-title');
  assert.match(await page.locator('.last-deal-summary').innerText(), /<img src=x/);
  assert.equal(await page.locator('#game-dialog .card, #game-dialog script').count(), 0);
  assert.equal(await page.locator('#game-dialog img').count(), 1);
  assert.equal(await page.locator('#game-dialog tbody tr').count(), 2);
  if (process.env.UI_SCREENSHOT_DIR) {
    await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, 'settings-last-deal-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, 'settings-last-deal-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
  }
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-panel-title');
  await page.locator('[data-settings-panel="information"]').click();
  assert.equal(await page.evaluate(() => document.activeElement.id), 'game-panel-title');
  assert.match(await page.locator('#game-dialog').innerText(), /60 seconds/);
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  f.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.getByLabel('Reduce motion', { exact: true }).check();
  assert.equal(await page.getByLabel('Reduce motion', { exact: true }).isChecked(), true);
  assert.equal(f.requests.length, 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.connection-progress img').evaluate(el => getComputedStyle(el).animationName), 'none');
  f.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => document.querySelector('#connection-banner').hidden);
  assert.deepEqual(f.errors, []);
});

test('settings explain unavailable browser storage and isolate styling from other panels', async t => {
  const f = await fixture(t, { width: 390, height: 844 }); const { page } = f;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) { if (key === 'mr-preferences') throw new DOMException('Blocked', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await open(page, 'Settings');
  await page.getByLabel('Spread out hand cards', { exact: true }).check();
  assert.match(await page.locator('#settings-save-status').innerText(), /Applied for this visit.*unavailable/);
  await page.keyboard.press('Escape'); await open(page, 'Settings');
  assert.equal(await page.getByLabel('Spread out hand cards', { exact: true }).isChecked(), true);
  assert.match(await page.locator('#settings-save-status').innerText(), /Applied for this visit/);
  await page.keyboard.press('Escape'); await open(page, 'Chat');
  assert.equal(await page.locator('#game-dialog').getAttribute('data-panel'), 'chat');
  assert.equal(await page.locator('.settings-options').count(), 0);
  await page.keyboard.press('Escape');
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1920, 1080]]) {
  test(`game information fits ${width}px and describes supported rules without exposing cards`, async t => {
    const f = await fixture(t, { width, height }, false, { hasPassword: true }); const { page } = f;
    await open(page, 'Table info');
    await page.locator('#game-dialog img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.evaluate(async () => { const img = new Image(); img.src = '/assets/figma/info-title.svg'; await img.decode(); if (!img.naturalWidth || !img.naturalHeight) throw Error('Missing information title artwork'); });
    assert.equal(await page.locator('#game-dialog .card, #game-dialog [data-draw]').count(), 0);
    const facts = await page.locator('.info-fact').evaluateAll(els => Object.fromEntries(els.map(el => [el.querySelector('dt').textContent, el.querySelector('dd').textContent])));
    assert.equal(facts['No. of decks'], '2 packs');
    assert.equal(facts['Printed jokers'], '1 per deck · 2 total');
    assert.equal(facts['Human turns'], '60 seconds · Server timed');
    assert.equal(facts['First drop'], '20 penalty points');
    assert.equal(facts['Middle drop'], '40 penalty points');
    assert.equal(facts['Maximum round penalty'], '80 points');
    assert.equal(facts['Stakes'], 'Free play · No money involved');
    assert.match(facts.Privacy, /Password protected/);
    assert.match(await page.locator('#game-panel-title').evaluate(el => getComputedStyle(el).backgroundImage), /info-title.svg/);
    const icon = await page.locator('#game-dialog img[src$="info-close.svg"]').boundingBox();
    assert.equal(icon.width, 40); assert.equal(icon.height, 40);
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `game-information-${width}.png`), fullPage: true });
    }
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('#game-dialog')), true); }
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.open), false);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
  });
}

test('information facts refresh without losing close-button focus and Settings return navigation works', async t => {
  const f = await fixture(t); const { page, room } = f;
  await open(page, 'Settings'); await page.locator('[data-settings-panel="information"]').click();
  await page.getByRole('button', { name: 'Close table panel', exact: true }).focus();
  room.players.push(waitingPlayer('newcomer', 'New friend', { count: 13 })); room.round = 2; room.hasPassword = true; room.version++;
  await page.waitForFunction(() => [...document.querySelectorAll('.info-fact')].some(el => el.querySelector('dt').textContent === 'Players' && el.querySelector('dd').textContent === '3 / 6'));
  assert.match(await page.locator('.info-facts').innerText(), /Round 2/);
  assert.match(await page.locator('.info-facts').innerText(), /Password protected/);
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close table panel');
  await page.getByRole('button', { name: 'Back to settings', exact: true }).click();
  assert.equal(await page.locator('#game-dialog').getAttribute('data-panel'), 'settings');
  assert.equal(await page.getByLabel('Reduce motion', { exact: true }).isVisible(), true);
  await page.keyboard.press('Escape'); await open(page, 'Chat');
  assert.equal(await page.locator('#game-dialog').getAttribute('data-panel'), 'chat');
  assert.equal(await page.locator('.info-facts').count(), 0);
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

test('information follows the selected table and its waiting state', async t => {
  const f = await fixture(t, { width: 390, height: 844 }, true, { hasPassword: true }); const { page, rooms } = f;
  const second = rooms.get('BBBBBB123456'); second.hasPassword = false; second.status = 'lobby'; second.round = 0; second.hand = []; second.version++;
  await open(page, 'Table info');
  assert.match(await page.locator('.info-room-summary').innerText(), /ABCDEF123456/);
  assert.match(await page.locator('.info-facts').innerText(), /Password protected/);
  await page.keyboard.press('Escape');
  await page.locator('[data-switch-table="BBBBBB123456"]').click(); await page.locator('.waiting-page').waitFor();
  await open(page, 'Table info');
  assert.match(await page.locator('.info-room-summary').innerText(), /BBBBBB123456/);
  assert.equal(await page.locator('#info-status').innerText(), 'Waiting for players');
  assert.match(await page.locator('.info-facts').innerText(), /Not started/);
  assert.doesNotMatch(await page.locator('#game-panel-content').innerText(), /ABCDEF123456|Password protected/);
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

for (const [width, height] of [[390, 844], [768, 1024], [1024, 768], [1920, 1080]]) {
  test(`standings fit six seats at ${width}px with tied ranks and public totals only`, async t => {
    const players = [waitingPlayer('me', 'Me', { total: 20, count: 13 }),
      waitingPlayer('other', 'Alpha', { total: 0, count: 13 }),
      waitingPlayer('third', 'Beta', { total: 0, count: 13 }),
      waitingPlayer('fourth', 'VeryLongUnbrokenPlayerDisplayName', { total: 80, count: 13 }),
      waitingPlayer('fifth', 'Practice bot', { total: 40, bot: true, count: 13 }),
      waitingPlayer('sixth', '<script>Friend</script>', { total: 25, count: 13 })];
    const f = await fixture(t, { width, height }, false, { players }); const { page } = f;
    await open(page, 'Standings');
    await page.locator('#game-dialog img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    const places = await page.locator('[data-standing-player] .standing-place>span').allTextContents();
    assert.deepEqual(places, ['1', '1', '3', '4', '5', '6']);
    assert.equal(await page.locator('.standing-place small').count(), 2);
    assert.match(await page.locator('[data-standing-player="me"]').innerText(), /You/);
    assert.equal(await page.locator('#game-dialog .card, #game-dialog script').count(), 0);
    assert.equal(await page.locator('.standing-winner').count(), 0);
    assert.equal(await page.locator('.standing-round [aria-label="Not settled"]').count(), 6);
    assert.match(await page.locator('[data-standing-player="sixth"]').innerText(), /<script>Friend<\/script>/);
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.locator('.standings-table-wrap').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const icon = await page.locator('#game-dialog img[src$="info-close.svg"]').boundingBox();
    assert.equal(icon.width, 40); assert.equal(icon.height, 40);
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `standings-${width}.png`), fullPage: true });
    }
    await page.locator('#standings-back').scrollIntoViewIfNeeded(); await page.locator('#standings-back').click();
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.open), false);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
  });
}

test('standings distinguish the round winner from cumulative rank and clear revealed cards on a new round', async t => {
  const hands = Array.from({ length: 2 }, (_, p) => Array.from({ length: 13 }, (_, i) => ({ id: `revealed-${p}-${i}`, suit: p ? 'S' : 'H', rank: i + 1 })));
  const result = { winner: 'other', winnerName: 'Friend', reason: 'last-player', groups: [], scores: [
    { id: 'me', name: 'Me', penalty: 20, total: 20, hand: hands[0] },
    { id: 'other', name: 'Friend', penalty: 0, total: 50, hand: hands[1] },
  ] };
  const players = [waitingPlayer('me', 'Me', { total: 20, count: 13 }), waitingPlayer('other', 'Friend', { total: 50, count: 13 })];
  const f = await fixture(t, { width: 1920, height: 1080 }, false, { players, status: 'finished', deadline: 0, result, hand: hands[0] }); const { page, room } = f;
  await open(page, 'Standings');
  assert.equal(await page.locator('[data-standing-player="me"] .standing-place>span').innerText(), '1');
  assert.equal(await page.locator('[data-standing-player="other"] .standing-place>span').innerText(), '2');
  assert.equal(await page.locator('[data-standing-player="other"] .standing-round').innerText(), '0');
  assert.equal(await page.locator('[data-standing-player="other"] .standing-winner').innerText(), 'Round winner');
  assert.equal(await page.locator('[data-standing-player="me"] .standing-winner').count(), 0);
  await page.locator('#standings-reveal-toggle').click();
  assert.equal(await page.locator('.standings-revealed .card').count(), 26);
  room.messages.push({ id: 'update', name: 'Me', text: 'Round reviewed', time: Date.now() }); room.version++;
  await page.waitForFunction(() => document.querySelector('#game-dialog .standings-revealed')?.open && document.querySelector('#messages')?.textContent.includes('Round reviewed'));
  assert.equal(await page.locator('.standings-revealed').evaluate(el => el.open), true);
  if (process.env.UI_SCREENSHOT_DIR) {
    await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, 'standings-revealed-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, 'standings-revealed-mobile.png'), fullPage: true });
  }
  room.status = 'playing'; room.result = null; room.round = 2; room.version++; room.deadline = Date.now() + 60000;
  await page.waitForFunction(() => !document.querySelector('#game-dialog .standings-revealed'));
  assert.equal(await page.locator('#game-dialog .card').count(), 0);
  assert.equal(await page.locator('.standing-winner').count(), 0);
  assert.match(await page.locator('.standings-footer').innerText(), /Round 2 in progress/);
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

test('live standings reorder without losing close focus and stay scoped when switching tables', async t => {
  const f = await fixture(t, { width: 390, height: 844 }, true); const { page, room, rooms } = f;
  await open(page, 'Standings'); await page.getByRole('button', { name: 'Close table panel', exact: true }).focus();
  room.players[0].total = 40; room.players[1].total = 10; room.version++;
  await page.waitForFunction(() => document.querySelector('[data-standing-player]')?.dataset.standingPlayer === 'other');
  assert.equal(await page.locator('[data-standing-player="me"] .standing-total').innerText(), '40');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close table panel');
  await page.keyboard.press('Escape');
  const second = rooms.get('BBBBBB123456'); second.players[0].total = 5; second.players[1].total = 60; second.version++;
  await page.locator('[data-switch-table="BBBBBB123456"]').click(); await open(page, 'Standings');
  assert.match(await page.locator('.standings-summary').innerText(), /BBBBBB123456/);
  assert.equal(await page.locator('[data-standing-player="me"] .standing-total').innerText(), '5');
  assert.doesNotMatch(await page.locator('.standings-summary').innerText(), /ABCDEF123456/);
  await page.keyboard.press('Escape'); await open(page, 'Settings');
  assert.equal(await page.locator('#game-dialog').getAttribute('data-panel'), 'settings');
  assert.equal(await page.locator('.standings-table').count(), 0);
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

for (const [width, height] of [[320, 740], [390, 844], [768, 1024], [1920, 1080]]) {
  test(`private View Cards at ${width}px shows all 14 faces without overlap or horizontal scroll`, async t => {
    const hand = Array.from({ length: 14 }, (_, i) => ({ id: `inspect-${i}`, rank: i === 13 ? 0 : i + 1, suit: i === 13 ? 'J' : 'D' }));
    const f = await fixture(t, { width, height }, false, { hand, phase: 'discard' }); const { page } = f;
    await open(page, 'View cards');
    assert.equal(await page.locator('#game-dialog .card').count(), 14);
    assert.equal(await page.locator('#game-dialog button[data-card]').count(), 0);
    assert.equal(await page.locator('#game-dialog .joker').count(), 1);
    assert.equal(await page.locator('#game-dialog .wild-badge').count(), 1);
    assert.match(await page.locator('.hand-view-summary').innerText(), /14 cards/);
    assert.match(await page.locator('#hand-view-note').innerText(), /timer keeps running/);
    assert.equal(await page.locator('#game-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const boxes = await page.locator('.hand-view-groups .card').evaluateAll(cards => cards.map(c => {
      const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    }));
    for (const [i, a] of boxes.entries()) {
      assert.equal(a.width, width <= 600 ? 57 : 72); assert.equal(a.height, width <= 600 ? 82 : 104);
      for (const b of boxes.slice(i + 1)) assert.ok(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y);
    }
    if (process.env.UI_SCREENSHOT_DIR) {
      await mkdir(process.env.UI_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.UI_SCREENSHOT_DIR, `view-cards-${width}.png`), fullPage: true });
    }
    await page.locator('#hand-view-back').click();
    assert.equal(await page.locator('#game-dialog').evaluate(d => d.open), false);
    assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
  });
}

test('View Cards preserves real groups and selection while live snapshots remove stale cards', async t => {
  const f = await fixture(t); const { page, room } = f;
  for (const id of ['card-0', 'card-1', 'card-2']) await page.locator(`[data-card="${id}"]`).click();
  await page.locator('[data-action="group"]').click();
  await page.locator('[data-card="card-3"]').click();
  await open(page, 'View cards');
  assert.deepEqual(await page.locator('.hand-view-group-heading h3').allTextContents(), ['Your group', 'Ungrouped']);
  assert.deepEqual(await page.locator('.hand-view-group-heading>span').allTextContents(), ['3 cards', '10 cards']);
  await page.locator('#hand-view-back').focus();
  room.hand = room.hand.filter(c => c.id !== 'card-0'); room.version++;
  await page.waitForFunction(() => document.querySelectorAll('#game-dialog .card').length === 12);
  assert.deepEqual(await page.locator('.hand-view-group-heading>span').allTextContents(), ['2 cards', '10 cards']);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'hand-view-back');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('[data-card="card-3"]').getAttribute('aria-pressed'), 'true');
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});

test('View Cards follows empty hands, rematches and table privacy without carrying stale cards', async t => {
  const f = await fixture(t, { width: 390, height: 844 }, true); const { page, room } = f;
  await open(page, 'View cards');
  room.hand = []; room.version++;
  await page.locator('.hand-view-empty').waitFor();
  assert.equal(await page.locator('#game-dialog .card').count(), 0);
  assert.match(await page.locator('.hand-view-summary').innerText(), /0 cards/);
  room.round = 2; room.hand = [{ id: 'new-round-card', rank: 12, suit: 'C' }]; room.wildRank = 12; room.players[0].dropped = true; room.version++;
  await page.waitForFunction(() => document.querySelector('.hand-view-summary')?.textContent.includes('ROUND 2'));
  assert.equal(await page.locator('#game-dialog .card').count(), 1);
  assert.equal(await page.locator('#game-dialog .card').getAttribute('aria-label'), 'Q clubs');
  assert.match(await page.locator('.hand-view-summary').innerText(), /Dropped/);
  assert.equal(await page.locator('#game-dialog .wild-badge').count(), 1);
  await page.keyboard.press('Escape');
  await page.locator('[data-switch-table="BBBBBB123456"]').click(); await open(page, 'View cards');
  assert.match(await page.locator('.hand-view-summary').innerText(), /BBBBBB123456/);
  assert.equal(await page.locator('#game-dialog .card').count(), 13);
  assert.equal(await page.locator('#game-dialog .red').count(), 0);
  assert.doesNotMatch(await page.locator('#game-dialog').innerText(), /Dropped/);
  await page.keyboard.press('Escape'); await open(page, 'Settings');
  assert.equal(await page.locator('.hand-view-groups').count(), 0);
  assert.equal(f.requests.length, 0); assert.deepEqual(f.errors, []);
});
