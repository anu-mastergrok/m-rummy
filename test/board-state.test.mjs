import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileGroups, remainingSeconds, tableStandings, presencePresentation } from '../public/board-state.js';
test('deadline recomputes after suspension and respects server clock offset', () => {
  assert.equal(remainingSeconds(61000, 1000, 1000), 59);
  assert.equal(remainingSeconds(61000, 1000, 59001), 1);
  assert.equal(remainingSeconds(61000, 1000, 120000), 0);
});
test('saved groups reject malformed data, duplicates and missing cards without merging physical copies', () => {
  const hand = [{ id: 'deck1-7H' }, { id: 'deck2-7H' }, { id: 'deck1-8H' }];
  assert.deepEqual(reconcileGroups({ ids: [] }, hand), []);
  const groups = reconcileGroups([null, { ids: 'bad' }, { ids: ['deck1-7H', 'deck1-7H', 'missing'], title: 'Old' }, { ids: ['deck1-7H', 'deck2-7H'] }], hand);
  assert.deepEqual(groups, [{ ids: ['deck1-7H'], title: 'Group' }, { ids: ['deck2-7H'], title: 'Group' }]);
});
test('standings preserve tied ranks and do not mutate player seat order', () => {
  const players = [{ name: 'Z', total: 30 }, { name: 'B', total: 10 }, { name: 'A', total: 10 }];
  assert.deepEqual(tableStandings(players).map(p => [p.name, p.place]), [['A', 1], ['B', 1], ['Z', 3]]);
  assert.equal(players[0].name, 'Z');
});

test('presence labels use an allowlist and fall back for absent or unexpected server values', () => {
  assert.deepEqual(presencePresentation('away'), { status: 'away', label: 'Away' });
  assert.deepEqual(presencePresentation('online'), { status: 'online', label: 'Connected' });
  for (const value of [undefined, null, '__proto__', '<script>', 'bad-status']) assert.equal(presencePresentation(value).status, 'unknown');
});
