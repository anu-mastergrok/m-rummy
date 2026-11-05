import { remainingSeconds, reconcileGroups, tableStandings } from './board-state.js';
const app = document.querySelector('#app');
const suits = { S: '♠', H: '♥', D: '♦', C: '♣', J: '✦' };
const ranks = { 0: 'JK', 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
let session, state, busy = false, polling = false, failures = 0, mode = 'create', groups = [], selected = new Set(), chatDraft = '', clockOffset = 0;
let lastCode = '', confirmAction;
let connection = 'connected';
const groupKey = room => `mr-groups-${room.code}-${room.round}`;
const commandSelector = '[data-draw], [data-remove], [data-action="start"], [data-action="addBot"], [data-action="drop"], [data-action="discard"], [data-action="declare"], [data-action="arrange"], [data-action="leave"], #chat-form button';
let authMode = 'register', account = null, profileOffset = 0, authBusy = false;
const number = value => Number(value || 0).toLocaleString('en-IN');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const label = c => `${ranks[c.rank] || c.rank} ${c.suit === 'J' ? 'printed joker' : ({ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' })[c.suit]}`;
const card = (c, interactive = false, large = false) => `<${interactive ? 'button' : 'div'} class="card ${['H', 'D'].includes(c.suit) ? 'red' : ''} ${c.rank === 0 ? 'joker' : ''} ${large ? 'large-card' : ''} ${selected.has(c.id) && interactive ? 'selected' : ''}" ${interactive ? `type="button" data-card="${esc(c.id)}" aria-pressed="${selected.has(c.id)}" aria-label="${label(c)}${c.rank === state?.wildRank ? ', wild joker' : ''}"` : `aria-label="${label(c)}"`}><span class="card-corner">${ranks[c.rank] || c.rank}<small>${suits[c.suit]}</small></span><span class="card-suit" aria-hidden="true">${suits[c.suit]}</span><span class="card-corner bottom" aria-hidden="true">${ranks[c.rank] || c.rank}<small>${suits[c.suit]}</small></span>${c.rank === state?.wildRank && c.rank > 0 ? '<span class="wild-badge">WILD</span>' : ''}</${interactive ? 'button' : 'div'}>`;

function toast(text, error = false) {
  const el = document.querySelector('#toast'); el.textContent = text; el.className = `show ${error ? 'error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = ''; }, 5500);
}
async function request(path, data) {
  const response = await fetch(path, {
    method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': session?.csrf || '' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json();
  if (!response.ok) {
    if (result.state) accept(result.state);
    const e = new Error(result.error || 'Could not reach the table.'); e.status = response.status; throw e;
  }
  return result;
}
function saveGroups() { try { sessionStorage.setItem(groupKey(state), JSON.stringify(groups)); } catch { /* Private browsing may disable storage. */ } }
function accept(next) {
  if (state && next.code === state.code && next.version < state.version) return;
  const changed = !state || next.version !== state.version || next.code !== state.code;
  if (!state || next.code !== state.code || next.round !== state.round) {
    try { groups = JSON.parse(sessionStorage.getItem(groupKey(next)) || '[]'); } catch { groups = []; }
    selected.clear(); lastCode = next.code;
  }
  state = next; clockOffset = next.serverTime - Date.now();
  setAccount(next.account || null);
  selected = new Set([...selected].filter(id => next.hand.some(c => c.id === id)));
  groups = reconcileGroups(groups, next.hand);
  if (changed) renderRoom();
  updateClock(); syncControls();
}
function landing() {
  state = null; selected.clear(); groups = [];
  app.className = 'landing';
  const invite = new URLSearchParams(location.search).get('room') || '';
  if (invite) mode = 'join';
  app.innerHTML = `<section class="hero-copy"><div class="eyebrow"><span class="tiny-club">♣</span> THE BEST SEAT IS WITH FRIENDS</div><h1>Good cards.<br><em>Better company.</em></h1><p class="hero-sub">Your people. Your table. Bring everyone together for a little rummy, wherever the evening finds you.</p><div class="hero-details"><span><b>13</b> cards</span><i></i><span><b>2–6</b> players</span><i></i><span><b>∞</b> good times</span></div><div class="hero-note"><span>✦</span> Private rooms. Friendly points. Always free.</div></section>
    <section class="entry-section"><div class="card-art" aria-hidden="true"><div class="art-ring"></div><div class="art-card art-one">${card({ id: 'hero1', rank: 11, suit: 'S' })}</div><div class="art-card art-two">${card({ id: 'hero2', rank: 12, suit: 'H' })}</div><div class="art-card art-three">${card({ id: 'hero3', rank: 13, suit: 'C' })}</div><span class="art-star">✧</span><span class="art-caption">A little luck. A little skill.</span></div>
    <div class="entry-card"><div class="tabs" role="tablist" aria-label="Table options"><button role="tab" aria-selected="${mode === 'create'}" data-mode="create">Create a table</button><button role="tab" aria-selected="${mode === 'join'}" data-mode="join">Join friends</button></div><form id="entry-form"><label for="player-name">What should we call you?</label><input id="player-name" name="name" placeholder="Your name" minlength="2" maxlength="24" autocomplete="nickname" required value="${esc(localStorage.getItem('mr-name') || '')}">${mode === 'join' ? `<label for="room-code">Your invite code</label><input id="room-code" name="code" class="code-input" placeholder="e.g. A1B2C3D4E5F6" maxlength="12" pattern="[a-fA-F0-9]{12}" required value="${esc(invite)}">` : ''}<label for="room-password">Room password <span>${mode === 'create' ? '(optional)' : '(if your host set one)'}</span></label><input id="room-password" name="password" type="password" maxlength="100" placeholder="${mode === 'create' ? 'A little extra privacy' : 'Ask your host'}" autocomplete="off">${mode === 'create' ? '<details class="access-details"><summary>Have a host access code?</summary><label for="access-key">Server access code</label><input id="access-key" name="accessKey" type="password" autocomplete="off" maxlength="200" placeholder="Only if configured on your server"></details>' : ''}<button class="button primary full" type="submit">${mode === 'create' ? 'Create your table' : 'Take your seat'} <span aria-hidden="true">↗</span></button><p class="entry-note">${mode === 'create' ? 'Invite friends with a link, or warm up with a bot.' : 'One invite link. A whole evening of possibilities.'}</p></form></div></section>
    <section class="bottom-strip"><span class="mini-suits">♠ <span>♥</span> ♣ <span>♦</span></span><p>Same favourite game.<br><strong>A table that’s all yours.</strong></p><div><span>01 / MAKE A TABLE</span><span>02 / INVITE YOUR PEOPLE</span><span>03 / LET THE CARDS TALK</span></div></section>`;
  if (!account) renderAuth();
  else {
    const input = document.querySelector('#player-name'); input.value = account.name; input.readOnly = true;
    const badge = document.createElement('div'); badge.className = 'account-welcome';
    badge.innerHTML = `<span>Welcome back, ${esc(account.name)}</span><strong>♣ ${number(account.points)} play points</strong>`;
    document.querySelector('.entry-card').prepend(badge);
  }
}
function setAccount(next) {
  account = next;
  const button = document.querySelector('#profile-button');
  button.hidden = !account && !state;
  if (!account) button.textContent = 'Create your profile';
  if (account) button.innerHTML = `<span class="profile-initial">${esc(account.name.slice(0, 1).toUpperCase())}</span><span><small>Your profile</small><strong>${number(account.points)} pts</strong></span>`;
}
function renderAuth() {
  const create = authMode === 'register';
  document.querySelector('.entry-card').innerHTML = `<div class="tabs" role="tablist" aria-label="Player account"><button role="tab" aria-selected="${create}" data-auth-mode="register">Create account</button><button role="tab" aria-selected="${!create}" data-auth-mode="login">Sign in</button></div><div class="signup-offer"><span>♣</span><div><strong>${create ? 'Your first 10,000 points are on us.' : 'Your people. Your points. Your seat.'}</strong><p>${create ? 'Build your profile, one friendly win at a time.' : 'Sign in to keep playing with your saved balance.'}</p></div></div><form id="auth-form">${create ? '<label for="account-name">Your display name</label><input id="account-name" name="name" autocomplete="nickname" minlength="2" maxlength="24" placeholder="What should we call you?" required>' : ''}<label for="account-username">Username</label><input id="account-username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" pattern="[a-zA-Z0-9_]{3,24}" minlength="3" maxlength="24" placeholder="Letters, numbers, underscores" required><label for="account-password">Password ${create ? '<span>(at least 10 characters)</span>' : ''}</label><input id="account-password" name="password" type="password" autocomplete="${create ? 'new-password' : 'current-password'}" minlength="10" maxlength="128" placeholder="${create ? 'Choose a password you’ll remember' : 'Your account password'}" required>${create ? '<label for="account-confirm">Confirm password</label><input id="account-confirm" name="confirmPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required placeholder="Enter it once more">' : ''}<button type="submit" class="button primary full">${create ? 'Create account · Get 10,000 points' : 'Sign in to your table'} →</button><p class="entry-note">Play points have no cash value. ${create ? 'Keep your username and password safe.' : 'Use the same account on your phone or computer.'}</p></form>`;
}
async function loadProfile(offset = 0) {
  try {
    const profile = await request(`/api/profile?offset=${offset}`); profileOffset = offset; setAccount(profile);
    const dialog = document.querySelector('#profile-dialog');
    document.querySelector('#profile-content').innerHTML = `<h2>${esc(profile.name)}<small class="profile-handle">@${esc(profile.username)}</small></h2><div class="points-total"><span>YOUR PLAY POINTS</span><strong>${number(profile.points)}</strong><small>Saved to your account · available on every device</small></div><div class="profile-stats"><div><strong>${number(profile.wins)}</strong><span>Wins</span></div><div><strong>${number(profile.roundsPlayed)}</strong><span>Human rounds</span></div><div><strong>${number(profile.points - 10000)}</strong><span>Points earned</span></div></div><p class="profile-explainer">10,000 welcome points, once per account. Win against other registered players to earn more points. Losses leave your balance unchanged. Bot-only practice earns no profile points.</p><h3>Points history</h3><div class="points-history">${profile.history.map(event => `<div><span><strong>${event.type === 'signup' ? 'Welcome bonus' : event.type === 'win' ? `Round ${event.round} win` : `Round ${event.round} played`}</strong><small>${new Date(event.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}${event.room ? ` · ${esc(event.room)}` : ''}</small></span><span class="event-amount">${event.amount ? '+' : ''}${number(event.amount)}<small>${number(event.balance)} balance</small></span></div>`).join('')}</div><div class="history-pages"><button class="text-button" data-history="${Math.max(0, offset - 20)}" ${offset === 0 ? 'disabled' : ''}>← Newer</button><span>${Math.min(offset + 1, profile.historyTotal)}–${Math.min(offset + 20, profile.historyTotal)} of ${profile.historyTotal}</span><button class="text-button" data-history="${offset + 20}" ${offset + 20 >= profile.historyTotal ? 'disabled' : ''}>Older →</button></div><button id="sign-out" class="button secondary full">Sign out</button><p class="entry-note">Your balance and history stay saved when you sign out.</p>`;
    if (!dialog.open) dialog.showModal();
  } catch (e) { toast(e.message, true); }
}
function confirm(title, text, action) {
  document.querySelector('#confirm-title').textContent = title;
  document.querySelector('#confirm-text').textContent = text;
  confirmAction = action; document.querySelector('#confirm-dialog').showModal();
}
function turnText() {
  if (state.status === 'lobby') return 'The table is yours. Invite your people.';
  if (state.status === 'finished') return `${state.result.winnerName} takes the round.`;
  const p = state.players.find(p => p.id === state.turn);
  return state.turn === state.me ? state.phase === 'draw' ? 'Your turn. Pick a card.' : 'Select a discard. Make your move.' : `${p.name} is ${state.phase === 'draw' ? 'drawing' : 'choosing a discard'}…`;
}
function renderRoom() {
  const focus = document.activeElement?.id;
  const selectionStart = document.activeElement?.selectionStart;
  app.className = 'room-page';
  const me = state.players.find(p => p.id === state.me), host = state.host === state.me;
  const playing = state.status === 'playing', myTurn = playing && state.turn === state.me && !me.dropped;
  const canDiscard = myTurn && state.phase === 'discard';
  const isLobby = !playing;
  const inGroups = new Set(groups.flatMap(g => g.ids));
  const loose = state.hand.filter(c => !inGroups.has(c.id));
  const groupView = (ids, title, i) => `<div class="hand-group"><div class="group-heading"><span>${esc(title)}</span>${i !== undefined ? `<button class="ungroup" data-ungroup="${i}" aria-label="Ungroup ${esc(title)}">×</button>` : ''}</div><div class="cards">${ids.map(id => card(state.hand.find(c => c.id === id), true)).join('')}</div></div>`;
  app.innerHTML = `<div class="room-heading"><div><div class="eyebrow">YOUR PRIVATE CLUB <span class="connection" id="connection">● Connected</span></div><h1>The friends’ table<span class="round-badge">${state.round ? `Round ${state.round}` : 'Waiting room'}</span></h1></div><div class="button-row"><button class="button secondary small" data-action="invite">Invite friends <span>↗</span></button><button class="icon-button leave-button" data-action="leave" aria-label="Leave table" title="Leave table">⇥</button></div></div>
  <div id="connection-banner" class="connection-banner" role="status" hidden></div><div id="command-status" class="sr-only" role="status"></div>
  <div class="game-layout"><section class="table-column"><div class="felt-table"><div class="felt-top"><span>13-CARD INDIAN RUMMY</span><span class="room-code">ROOM ${state.code} ${state.hasPassword ? '· LOCKED' : ''}</span></div><div class="seats">${state.players.filter(p => p.id !== state.me).map(p => `<div class="seat ${playing && state.turn === p.id ? 'active' : ''} ${p.dropped ? 'dropped' : ''}"><div class="avatar">${p.bot ? '✦' : esc(p.name.slice(0, 1).toUpperCase())}</div><strong>${esc(p.name)}</strong><span>${p.bot ? 'Practice bot' : p.id === state.host ? 'Table host' : 'Friend'}${p.dropped ? ' · Dropped' : playing ? ` · ${p.count} cards` : ''}</span>${playing && !p.dropped ? '<div class="mini-hand">▥ ▥ ▥ ▥ ▥</div>' : ''}${host && isLobby && p.bot ? `<button class="remove-bot" data-remove="${p.id}">Remove</button>` : ''}</div>`).join('')}${state.players.length < 6 && isLobby ? `<button class="seat empty-seat" data-action="invite"><span class="avatar">+</span><strong>A seat for a friend</strong><span>Share your invite link</span></button>` : ''}</div>
  ${state.status === 'lobby' ? `<div class="lobby-center"><span class="table-club">♣</span><h2>Great company.<br>One good game.</h2><p>${host ? 'Invite a friend or add a practice bot to get started.' : 'Make yourself comfortable. Your host will deal shortly.'}</p><div class="button-row">${host ? `<button class="button cream" data-action="start" ${state.players.length < 2 ? 'disabled' : ''}>Deal the first round <span>→</span></button><button class="button felt-outline" data-action="addBot" ${state.players.length >= 6 ? 'disabled' : ''}>+ Practice bot</button>` : '<span class="waiting-label">Waiting for the host to deal…</span>'}</div></div>` : `<div class="deck-area"><div class="pile"><span class="pile-label">CLOSED DECK</span><button class="card card-back" data-draw="stock" ${!myTurn || state.phase !== 'draw' ? 'disabled' : ''} aria-label="Draw from closed deck"><span>♣</span><small>M RUMMY</small></button><span class="pile-caption">${state.stockCount} cards</span></div><div class="pile"><span class="pile-label">OPEN DECK</span><button class="open-pile" data-draw="discard" ${!myTurn || state.phase !== 'draw' || !state.topDiscard || [0, state.wildRank].includes(state.topDiscard.rank) ? 'disabled' : ''} aria-label="Draw from open deck">${state.topDiscard ? card(state.topDiscard) : '<span class="empty-card">Empty</span>'}</button><span class="pile-caption">${state.topDiscard && [0, state.wildRank].includes(state.topDiscard.rank) ? 'Joker · cannot pick' : 'Take the top card'}</span></div><div class="wild-indicator"><span class="pile-label">WILD JOKER</span>${card(state.indicator)}<span class="pile-caption">All ${ranks[state.wildRank] || state.wildRank}s are wild</span></div></div>`}
  <div class="table-status"><span class="status-dot"></span><span>${esc(turnText())}</span>${playing ? '<span id="turn-clock" class="turn-clock"></span>' : ''}</div></div>
  ${state.status === 'finished' ? `<section class="results"><div class="results-title"><span class="eyebrow">ROUND ${state.round} · ${state.result.reason === 'last-player' ? 'LAST PLAYER STANDING' : 'VALID DECLARATION'}</span><h2>${esc(state.result.winnerName)} wins <span>✦</span></h2>${state.result.pointsAward ? `<p class="win-points">${state.result.pointsAward.amount ? `+${number(state.result.pointsAward.amount)} play points credited to ${esc(state.result.winnerName)}’s profile` : 'No profile points awarded for this round'}</p>` : ''}</div><div class="score-table-wrap"><table class="score-table"><thead><tr><th>Player</th><th>Round penalty</th><th>Penalty total ↓</th></tr></thead><tbody>${state.result.scores.map(p => `<tr class="${p.id === state.result.winner ? 'winner-row' : ''}"><td>${esc(p.name)} ${p.id === state.result.winner ? '♣' : p.dropped ? '<small>Dropped</small>' : ''}</td><td>${p.penalty}</td><td>${p.total}</td></tr>`).join('')}</tbody></table></div>${state.result.groups.length ? `<details class="winner-hand"><summary>See the winning groups</summary>${state.result.groups.map(g => `<div><span>${g.type === 'pure' ? 'Pure sequence' : g.type === 'set' ? 'Set' : 'Sequence'}</span><div class="cards">${g.ids.map(id => card(state.result.scores.find(p => p.id === state.result.winner).hand.find(c => c.id === id))).join('')}</div></div>`).join('')}</details>` : ''}<div class="button-row">${host ? '<button class="button primary" data-action="start">Deal another round →</button>' : '<p>Waiting for the host to deal again.</p>'}${host && state.players.length < 6 ? '<button class="button secondary" data-action="addBot">+ Practice bot</button>' : ''}</div></section>` : ''}
  <section class="hand-panel"><div class="hand-header"><div><span class="eyebrow">${esc(me.name)} ${host ? '· HOST' : ''}</span><h2>Your hand <span>${state.hand.length} cards${me.dropped ? ' · Dropped' : ''}</span></h2></div><div class="hand-tools"><button class="text-button" data-action="sort" ${!state.hand.length ? 'disabled' : ''}>Sort ↕</button><button class="text-button" data-action="arrange" ${!state.hand.length ? 'disabled' : ''}>Auto-group ✦</button><button class="text-button" data-action="group" ${selected.size < 3 ? 'disabled' : ''}>Group (${selected.size})</button></div></div><div class="hand-scroll">${state.hand.length ? `${groups.map((g, i) => groupView(g.ids, g.title || `Group ${i + 1}`, i)).join('')}${loose.length ? groupView(loose.map(c => c.id), groups.length ? 'Ungrouped' : 'Tap cards to select · group 3 or more') : ''}` : '<div class="hand-placeholder"><span>♠ ♥ ♣ ♦</span><p>Your 13 cards will be right here when the round starts.</p></div>'}</div><div class="hand-footer"><span class="hand-hint">${me.dropped ? 'You’re watching this round. You’ll be back in the next one.' : canDiscard ? selected.size === 1 ? 'One card selected. Discard it, or declare if the rest of your hand is ready.' : 'Select one card for your discard.' : myTurn ? 'Pick a card from either deck to begin your turn.' : 'Select cards to make groups while you wait.'}</span><div class="button-row"><button class="button secondary small" data-action="drop" ${!playing || me.dropped || (myTurn && state.phase === 'discard') ? 'disabled' : ''}>Drop · ${me.turns === 0 ? '20' : '40'}</button><button class="button secondary small" data-action="discard" ${!canDiscard || selected.size !== 1 ? 'disabled' : ''}>Discard</button><button class="button primary small" data-action="declare" ${!canDiscard || selected.size !== 1 ? 'disabled' : ''}>Declare ↗</button></div></div></section></section>
  <aside class="sidebar"><section class="side-card"><div class="side-heading"><h2>Table talk</h2><span>${state.players.length}/6 seated</span></div><div class="messages" id="messages">${state.messages.length ? state.messages.map(m => `<div class="message"><span>${esc(m.name)} <time>${new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></span><p>${esc(m.text)}</p></div>`).join('') : '<div class="empty-chat"><span>“</span><p>The best part of cards?<br>The conversation.</p><small>Say hello to your table.</small></div>'}</div><form class="chat-form" id="chat-form"><label class="sr-only" for="chat-input">Message your table</label><input id="chat-input" maxlength="240" placeholder="Say something…" required autocomplete="off" value="${esc(chatDraft)}"><button type="submit" aria-label="Send message">↑</button></form></section><section class="side-card activity"><div class="side-heading"><h2>At the table</h2><span class="live-dot">LIVE</span></div><div>${state.activity.slice(0, 7).map(a => `<p><span></span>${esc(a.text)}</p>`).join('')}</div></section><section class="table-tip"><span>✧ THE WINNING HAND</span><p>Two sequences.<br>One of them pure.<br><em>The rest is up to you.</em></p><button class="text-button" data-action="rules">A quick rules refresher ↗</button></section>${state.history.length > 1 ? `<details class="side-card history"><summary>Previous rounds</summary>${state.history.slice(1).map(h => `<p>Round ${h.round} <strong>${esc(h.winner)}</strong></p>`).join('')}</details>` : ''}</aside></div>`;
  const messageBox = document.querySelector('#messages'); if (messageBox) messageBox.scrollTop = messageBox.scrollHeight;
  if (focus === 'chat-input') { const input = document.querySelector('#chat-input'); input.focus(); input.setSelectionRange(selectionStart, selectionStart); }
  updateClock(); syncControls(true);
}
function updateClock() {
  const el = document.querySelector('#turn-clock'); if (!el || !state) return;
  const seconds = remainingSeconds(state.deadline, clockOffset);
  el.textContent = `${seconds}s`; el.classList.toggle('urgent', seconds <= 15);
}
function syncControls(fresh = false) {
  if (!state) return;
  const blocked = busy || connection !== 'connected';
  app.querySelectorAll(commandSelector).forEach(button => {
    if (fresh || !button.dataset.legal) button.dataset.legal = button.disabled ? 'no' : 'yes';
    button.disabled = blocked || button.dataset.legal === 'no';
  });
  app.querySelectorAll('[data-card], [data-ungroup], [data-action="sort"], [data-action="group"]').forEach(button => {
    if (fresh || !button.dataset.legal) button.dataset.legal = button.disabled ? 'no' : 'yes';
    button.disabled = busy || button.dataset.legal === 'no';
  });
  app.setAttribute('aria-busy', String(busy));
  const indicator = document.querySelector('#connection');
  if (indicator) {
    indicator.textContent = connection === 'connected' ? '● Connected' : connection === 'syncing' ? '● Syncing' : '● Reconnecting';
    indicator.classList.toggle('offline', connection !== 'connected');
  }
  const banner = document.querySelector('#connection-banner');
  if (banner) {
    banner.hidden = connection === 'connected';
    banner.textContent = connection === 'syncing' ? 'Refreshing your hand and turn from the server…' : 'Connection interrupted. Reconnecting automatically. Game actions resume after your table is refreshed.';
  }
  const status = document.querySelector('#command-status');
  if (status) status.textContent = busy ? 'Sending your action…' : '';
}
function setConnection(next) { connection = next; syncControls(); }
async function action(actionName, extra = {}) {
  if (busy || !state || connection !== 'connected') return false;
  busy = true; syncControls();
  try {
    const result = await request('/api/action', { code: state.code, version: state.version, action: actionName, ...extra });
    if (actionName === 'arrange') {
      groups = result.groups.map(g => {
        const highAce = g.ids.some(id => state.hand.find(c => c.id === id)?.rank === 13);
        const rank = c => c.rank === 1 && highAce ? 14 : c.rank || 99;
        const ids = [...g.ids].sort((a, b) => rank(state.hand.find(c => c.id === a)) - rank(state.hand.find(c => c.id === b)));
        return { ...g, ids, title: g.type === 'pure' ? 'Pure sequence' : g.type === 'sequence' ? 'Sequence' : 'Set' };
      });
      saveGroups(); selected.clear(); renderRoom();
      toast(result.valid && state.hand.length === 13 ? 'Your 13 cards form a valid declaration.' : 'Grouped your hand. After drawing, select a final discard to declare.');
    } else if (result.left) { history.replaceState({}, '', '/'); landing(); }
    else { if (['discard', 'declare'].includes(actionName)) selected.clear(); accept(result); saveGroups(); }
    return true;
  } catch (e) {
    if (!e.status || e.status >= 500) setConnection('reconnecting');
    toast(e.message, true); return false;
  }
  finally { busy = false; syncControls(); }
}
async function poll() {
  if (!state || polling || busy) return;
  polling = true;
  if (connection !== 'connected') setConnection('syncing');
  try {
    const result = await request(`/api/room?code=${state.code}`);
    if (result.code !== state?.code) return;
    failures = 0; accept(result); setConnection('connected');
  } catch (e) {
    if (++failures === 2) toast('Connection interrupted. Reconnecting automatically…', true);
    setConnection('reconnecting');
    if (e.status === 404) { history.replaceState({}, '', '/'); landing(); toast(e.message, true); }
  } finally { polling = false; }
}
app.addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target || target.disabled) return;
  if (target.dataset.authMode) { if (authBusy) return; authMode = target.dataset.authMode; renderAuth(); return; }
  if (target.dataset.mode) { mode = target.dataset.mode; landing(); return; }
  if (target.dataset.card) {
    const id = target.dataset.card; selected.has(id) ? selected.delete(id) : selected.add(id);
    renderRoom(); document.querySelector(`[data-card="${CSS.escape(id)}"]`)?.focus(); return;
  }
  if (target.dataset.ungroup !== undefined) { groups.splice(Number(target.dataset.ungroup), 1); saveGroups(); renderRoom(); return; }
  if (target.dataset.remove) return action('removeBot', { playerId: target.dataset.remove });
  if (target.dataset.draw) return action('draw', { source: target.dataset.draw });
  switch (target.dataset.action) {
    case 'invite': {
      document.querySelector('#invite-url').value = `${location.origin}/?room=${state.code}`;
      document.querySelector('#invite-dialog').showModal(); break;
    }
    case 'rules': document.querySelector('#rules-dialog').showModal(); break;
    case 'sort': {
      const sorted = [...state.hand].sort((a, b) => ['S', 'H', 'C', 'D', 'J'].indexOf(a.suit) - ['S', 'H', 'C', 'D', 'J'].indexOf(b.suit) || a.rank - b.rank);
      groups = [{ ids: sorted.map(c => c.id), title: 'Sorted by suit' }]; selected.clear(); saveGroups(); renderRoom(); break;
    }
    case 'group': {
      if (selected.size < 3) break;
      groups = groups.map(g => ({ ...g, title: 'Group', ids: g.ids.filter(id => !selected.has(id)) })).filter(g => g.ids.length);
      groups.push({ title: 'Your group', ids: [...selected] }); selected.clear(); saveGroups(); renderRoom(); break;
    }
    case 'drop': confirm('Sit this round out?', `You’ll take ${state.players.find(p => p.id === state.me).turns === 0 ? 20 : 40} points and rejoin the next deal.`, () => action('drop')); break;
    case 'leave':
      if (state.status === 'playing') toast('Leave after the round ends. You can drop to sit this round out.', true);
      else confirm('Leave the table?', 'Your seat will be released. If you’re the host, another friend takes over.', () => action('leave'));
      break;
    case 'declare': confirm('Ready to show your hand?', 'Your selected card is the final discard. We’ll check the other 13 for two sequences, one pure, and valid groups throughout.', () => action('declare', { cardId: [...selected][0] })); break;
    case 'discard': await action('discard', { cardId: [...selected][0] }); break;
    case 'start': case 'addBot': case 'arrange': await action(target.dataset.action); break;
  }
});
app.addEventListener('input', event => { if (event.target.id === 'chat-input') chatDraft = event.target.value; });
app.addEventListener('submit', async event => {
  event.preventDefault();
  if (event.target.id === 'auth-form') {
    if (authBusy) return;
    const data = Object.fromEntries(new FormData(event.target));
    if (authMode === 'register' && data.password !== data.confirmPassword) { toast('Your passwords do not match.', true); return; }
    delete data.confirmPassword;
    authBusy = true; busy = true;
    const button = event.target.querySelector('[type="submit"]'); button.disabled = true;
    const text = button.textContent; button.textContent = authMode === 'register' ? 'Creating your profile…' : 'Signing you in…';
    try {
      session = await request(authMode === 'register' ? '/api/register' : '/api/login', data);
      setAccount(session.account); lastCode = ''; state = null; selected.clear(); groups = [];
      if (session.room) { const room = await request(`/api/room?code=${session.room}`); history.replaceState({}, '', `/?room=${room.code}`); accept(room); }
      else landing();
      toast(authMode === 'register' ? 'Welcome! 10,000 play points are saved to your profile.' : 'Welcome back. Your profile and points are restored.');
    } catch (e) { toast(e.message, true); button.disabled = false; button.textContent = text; }
    finally { authBusy = false; busy = false; }
    return;
  }
  if (event.target.id === 'chat-form') {
    if (!chatDraft.trim() || busy) return;
    const text = chatDraft; chatDraft = ''; const sent = await action('chat', { text });
    if (!sent) chatDraft = text;
    const input = document.querySelector('#chat-input'); if (input) { input.value = chatDraft; input.focus(); }
    return;
  }
  if (event.target.id !== 'entry-form' || busy) return;
  busy = true;
  const button = event.target.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Setting your seat…';
  const data = Object.fromEntries(new FormData(event.target));
  try {
    const result = await request(mode === 'create' ? '/api/create' : '/api/join', data);
    localStorage.setItem('mr-name', data.name); history.replaceState({}, '', `/?room=${result.code}`); accept(result); setConnection('connected');
  } catch (e) { toast(e.message, true); button.disabled = false; button.textContent = mode === 'create' ? 'Create your table ↗' : 'Take your seat ↗'; }
  finally { busy = false; }
});
document.querySelector('#rules-button').addEventListener('click', () => document.querySelector('#rules-dialog').showModal());
document.querySelector('#mobile-button').addEventListener('click', () => document.querySelector('#mobile-dialog').showModal());
document.querySelector('#profile-button').addEventListener('click', () => { if (account) loadProfile(); else landing(); });
document.querySelector('#profile-dialog').addEventListener('click', async event => {
  const target = event.target.closest('button'); if (!target || target.disabled) return;
  if (target.dataset.history !== undefined) return loadProfile(Number(target.dataset.history));
  if (target.id === 'sign-out') {
    if (busy || authBusy) return;
    busy = true; target.disabled = true;
    try {
      session = await request('/api/logout', { logout: true });
      document.querySelector('#profile-dialog').close(); state = null; lastCode = ''; selected.clear(); groups = []; chatDraft = '';
      history.replaceState({}, '', '/'); setAccount(null); authMode = 'login'; landing(); toast('Signed out. Your points are saved.');
    } catch (e) { toast(e.message, true); target.disabled = false; }
    finally { busy = false; }
  }
});
document.addEventListener('click', event => { const button = event.target.closest('[data-close]'); if (button) document.getElementById(button.dataset.close).close(); });
document.querySelector('#confirm-yes').addEventListener('click', () => { document.querySelector('#confirm-dialog').close(); confirmAction?.(); });
document.querySelector('#copy-invite').addEventListener('click', async () => {
  const input = document.querySelector('#invite-url');
  try { await navigator.clipboard.writeText(input.value); toast('Invite copied. Send it to your people.'); }
  catch { input.focus(); input.select(); toast('Select and copy this link to share it.'); }
});
async function boot() {
  try {
    session = await request('/api/session');
    setAccount(session.account || null);
    if (session.room) { const room = await request(`/api/room?code=${session.room}`); history.replaceState({}, '', `/?room=${room.code}`); accept(room); }
    else landing();
    setConnection('connected');
  } catch (e) { app.innerHTML = '<div class="boot-error"><h1>The table is taking a moment.</h1><p>Check your connection and reload to try again.</p><button class="button primary" id="retry">Try again</button></div>'; document.querySelector('#retry').onclick = boot; toast(e.message, true); }
}
setInterval(poll, 1200); setInterval(updateClock, 500);
document.addEventListener('visibilitychange', () => { if (!document.hidden && state) { setConnection('syncing'); poll(); } });
window.addEventListener('offline', () => setConnection('reconnecting'));
window.addEventListener('online', () => { if (state) { setConnection('syncing'); poll(); } });
boot();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch(() => { /* Live browser play remains available without installation support. */ });
}
