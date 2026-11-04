import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

async function availablePort() {
  const server = net.createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port; await new Promise(r => server.close(r)); return port;
}

test('HTTP multiplayer, isolation, CSRF, competing moves, reconnect, and durable state', async t => {
  const data = await mkdtemp(join(tmpdir(), 'mr-http-'));
  const port = await availablePort(), base = `http://127.0.0.1:${port}`;
  let processPHP;
  let stderr = '';
  async function start() {
    processPHP = spawn(process.env.PHP_BIN || 'php', ['-S', `127.0.0.1:${port}`, '-t', 'public', 'public/router.php'], { cwd: resolve('.'), env: { ...process.env, RUMMY_DEV: '1', RUMMY_TEST_DATA_DIR: data }, stdio: ['ignore', 'ignore', 'pipe'] });
    processPHP.stderr.on('data', chunk => { stderr += chunk; });
    for (let i = 0; i < 80; i++) {
      try { const response = await fetch(base); if (response.ok) return; } catch { /* Startup only. */ }
      await delay(50);
    }
    throw new Error(`PHP failed to start: ${stderr}`);
  }
  async function stop() { if (processPHP.exitCode === null) { processPHP.kill(); await new Promise(r => processPHP.once('exit', r)); } }
  t.after(async () => { await stop(); await rm(data, { recursive: true, force: true }); });
  await start();
  async function user() {
    const response = await fetch(`${base}/api/session`); const cookie = response.headers.get('set-cookie').split(';')[0];
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i); assert.match(response.headers.get('set-cookie'), /SameSite=Strict/i);
    const session = await response.json(); assert.ok(session.csrf); return { cookie, ...session };
  }
  async function request(user, route, input, headers = {}) {
    const response = await fetch(`${base}/api/${route}`, { method: input === undefined ? 'GET' : 'POST', headers: { Cookie: user?.cookie || '', ...(input !== undefined ? { 'Content-Type': 'application/json', 'X-CSRF-Token': user?.csrf || '', Origin: base } : {}), ...headers }, body: input === undefined ? undefined : JSON.stringify(input) });
    return { status: response.status, body: await response.json() };
  }
  const a = await user(), b = await user(), outsider = await user();
  const created = await request(a, 'create', { name: 'Sunil', password: 'friends' }); assert.equal(created.status, 200);
  const code = created.body.code;
  assert.equal((await request(b, 'join', { code, name: 'Friend', password: 'wrong' })).status, 400);
  const joined = await request(b, 'join', { code, name: 'Friend', password: 'friends' }); assert.equal(joined.status, 200);
  const blocked = await request(outsider, `room?code=${code}`); assert.equal(blocked.status, 400); assert.equal(blocked.body.hand, undefined);
  const state = (await request(a, `room?code=${code}`)).body;
  assert.equal((await request(a, 'action', { code, action: 'start', version: state.version }, { 'X-CSRF-Token': 'bad' })).status, 403);
  assert.equal((await request(a, 'action', { code, action: 'start', version: state.version }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await request(b, 'action', { code, action: 'start', version: state.version })).status, 400);
  const started = await request(a, 'action', { code, action: 'start', version: state.version }); assert.equal(started.body.status, 'playing');
  assert.equal(started.body.hand.length, 13); assert.ok(started.body.players.every(p => !('hand' in p)));
  assert.equal(started.body.stock, undefined); assert.equal(started.body.passwordHash, undefined);
  // Bearer cookies are distinct from public player IDs.
  assert.ok(!JSON.stringify(started.body).includes(a.cookie.split('=')[1]));
  const duplicate = await Promise.all([1, 2].map(() => request(a, 'action', { code, action: 'draw', source: 'stock', version: started.body.version })));
  assert.deepEqual(duplicate.map(r => r.status).sort(), [200, 409]);
  const drawn = duplicate.find(r => r.status === 200).body;
  assert.equal(drawn.hand.length, 14);
  const rejected = await request(a, 'action', { code, action: 'discard', cardId: 'not-my-card', version: drawn.version }); assert.equal(rejected.status, 400);
  const discarded = await request(a, 'action', { code, action: 'discard', cardId: drawn.hand.at(-1).id, version: drawn.version }); assert.equal(discarded.status, 200); assert.equal(discarded.body.turn, b.id);
  const friend = (await request(b, `room?code=${code}`)).body;
  assert.equal(friend.hand.length, 13); assert.ok(!friend.hand.some(c => discarded.body.hand.some(d => d.id === c.id)));
  const chat = await request(b, 'action', { code, action: 'chat', text: '<script>alert(1)</script>', version: friend.version }); assert.equal(chat.status, 200);
  assert.equal(chat.body.messages.at(-1).text, '<script>alert(1)</script>');
  const source = await readFile('public/app.js', 'utf8'); assert.match(source, /esc\(m\.text\)/);
  // Path and private-storage access cannot serve files.
  assert.equal((await fetch(`${base}/server/config.php`)).status, 404);
  assert.equal((await fetch(`${base}/data/state.json`)).status, 404);
  const storage = JSON.parse(await readFile(join(data, 'state.json'), 'utf8'));
  assert.ok(storage.rooms[code].passwordHash); assert.ok(!JSON.stringify(storage).includes('"password":"friends"'));
  await stop(); await start();
  const resumed = await request(a, 'session'); assert.equal(resumed.body.id, a.id); assert.equal(resumed.body.room, code);
  const saved = (await request(a, `room?code=${code}`)).body;
  assert.equal(saved.version, chat.body.version); assert.deepEqual(saved.hand, discarded.body.hand); assert.equal(saved.turn, b.id);
  assert.equal(saved.messages.at(-1).text, '<script>alert(1)</script>');
  const finished = await request(b, 'action', { code, action: 'drop', version: saved.version }); assert.equal(finished.body.status, 'finished'); assert.equal(finished.body.result.winner, a.id);
  const rematch = await request(a, 'action', { code, action: 'start', version: finished.body.version }); assert.equal(rematch.body.round, 2); assert.equal(rematch.body.hand.length, 13);
});
