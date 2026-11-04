<?php
declare(strict_types=1);
require __DIR__ . '/helpers.php';

test('Two complete decks with unique physical IDs and unbiased shuffle conservation', function() {
    $d = rummy_deck(); same(count($d), 106); same(count(array_unique(array_column($d, 'id'))), 106);
    $s = rummy_shuffle($d); $a = array_column($d, 'id'); $b = array_column($s, 'id'); sort($a); sort($b); same($a, $b);
});
test('Natural and ace-high/low sequences; no ace wrap', function() {
    same(rummy_meld(cards('S1 S2 S3'), 7), 'pure'); same(rummy_meld(cards('H12 H13 H1'), 7), 'pure');
    same(rummy_meld(cards('H13 H1 H2'), 7), null); same(rummy_meld(cards('S3 S3 S4'), 7), null);
});
test('Wild joker may play its natural position in a pure sequence', function() { same(rummy_meld(cards('C6 C7 C8'), 7), 'pure'); });
test('Joker substitution completes sequences and sets', function() {
    same(rummy_meld(cards('S3 S5 J0'), 7), 'sequence'); same(rummy_meld(cards('D9 C9 H7'), 7), 'set');
    same(rummy_meld(cards('S3 S7 H7'), 7), 'sequence');
});
test('Sets reject duplicate suits and five-card sets; all jokers rejected', function() {
    same(rummy_meld(cards('S9 S9 H9'), 7), null); same(rummy_meld(cards('S9 H9 C9 D9 J0'), 7), null);
    same(rummy_meld(cards('S7 H7 J0'), 7), null); same(rummy_meld(cards('S9 H9 C9 D9'), 7), 'set');
});
test('Exact solver recognizes a complete 13-card declaration', function() {
    $result = rummy_analyze(valid_hand(), 13); same($result['valid'], true); same($result['penalty'], 0);
    $ids = array_merge(...array_column($result['groups'], 'ids')); same(count($ids), 13); same(count(array_unique($ids)), 13);
});
test('Pure sequence plus three sets is not a declaration; only pure sequence exempt', function() {
    $r = rummy_analyze(cards('S1 S2 S3 S4 S6 H6 D6 S8 H8 D8 S10 H10 D10'), 13);
    same($r['valid'], false); same($r['penalty'], 72);
});
test('Two sequences exempt valid melds; only unmatched cards score', function() {
    $r = rummy_analyze(cards('S1 S2 S3 H4 H5 H6 D7 C7 H7 S9 C12 D11 C1'), 13);
    same($r['valid'], false); same($r['penalty'], 39);
});
test('No pure sequence scores all non-jokers, capped at 80', function() {
    $r = rummy_analyze(cards('S10 H10 D10 C10 S12 H12 D12 C12 S1 H1 D1 C1 J0'), 7);
    same($r['valid'], false); same($r['penalty'], 80);
});
test('Physical duplicate card IDs cannot be reused', function() { $h = valid_hand(); $h[1] = $h[0]; rejects(fn() => rummy_analyze($h, 13), 'Invalid hand'); });
test('Jokers and face-card points', function() { same(rummy_points(cards('H1')[0], 7), 10); same(rummy_points(cards('H7')[0], 7), 0); same(rummy_points(cards('J0')[0], 7), 0); });
test('Passwords, clean names, join idempotency, and six-seat limit', function() {
    $r = rummy_create('a', '  Sunil  ', 'secret'); same($r['players'][0]['name'], 'Sunil');
    rejects(function() use (&$r) { rummy_join($r, 'b', 'Friend', 'wrong'); }, 'password');
    rummy_join($r, 'b', 'Friend', 'secret'); rummy_join($r, 'b', 'Friend', 'wrong'); same(count($r['players']), 2);
    for ($i = 2; $i < 6; $i++) rummy_join($r, "p$i", "Friend $i", 'secret');
    rejects(function() use (&$r) { rummy_join($r, 'extra', 'Extra', 'secret'); }, 'full');
    rejects(fn() => rummy_create('a', 'x'), '2 characters');
});
test('Only host starts; requires opponent; no mid-round joins', function() {
    $r = rummy_create('p0', 'Sunil'); rejects(function() use (&$r) { rummy_start($r, 'p0'); }, 'friend');
    rummy_join($r, 'p1', 'Friend', ''); rejects(function() use (&$r) { rummy_start($r, 'p1'); }, 'host');
    rummy_start($r, 'p0'); rejects(function() use (&$r) { rummy_join($r, 'p2', 'Late friend', ''); }, 'started');
});
test('Six-player deal conserves all cards and gives everyone 13', function() {
    $r = table(6); same(physical_count($r), 106); same(count($r['stock']), 26);
    foreach ($r['players'] as $p) same(count($p['hand']), 13);
    $ids = array_column(array_merge($r['stock'], $r['discard'], [$r['indicator']], ...array_column($r['players'], 'hand')), 'id');
    same(count(array_unique($ids)), 106);
});
test('Public state hides every opponent hand, stock order, password and bearer tokens', function() {
    $r = table(); $state = rummy_public($r, 'p0');
    same(count($state['hand']), 13); check(!isset($state['stock'], $state['passwordHash']));
    foreach ($state['players'] as $p) check(!isset($p['hand']));
    rejects(fn() => rummy_public($r, 'intruder'), 'Join');
});
test('Server enforces turns and draw/discard order; cannot discard another hand', function() {
    $r = table(); rejects(function() use (&$r) { rummy_draw($r, 'p1', 'stock'); }, 'turn');
    rejects(function() use (&$r) { rummy_discard($r, 'p0', 'no-card'); }, 'Draw');
    rummy_draw($r, 'p0', 'stock'); same(count($r['players'][0]['hand']), 14);
    rejects(function() use (&$r) { rummy_draw($r, 'p0', 'stock'); }, 'Discard');
    rejects(function() use (&$r) { rummy_discard($r, 'p0', $r['players'][1]['hand'][0]['id']); }, 'hand');
    rummy_discard($r, 'p0', $r['players'][0]['hand'][13]['id']); same($r['turn'], 1); same(physical_count($r), 106);
});
test('Open-deck jokers and immediate return are refused', function() {
    $r = table(); $r['wildRank'] = 7; $r['discard'] = cards('H7');
    rejects(function() use (&$r) { rummy_draw($r, 'p0', 'discard'); }, 'Jokers');
    $r['discard'] = [['id' => 'open-test', 'suit' => 'H', 'rank' => 8]]; rummy_draw($r, 'p0', 'discard');
    rejects(function() use (&$r) { rummy_discard($r, 'p0', 'open-test'); }, 'different');
});
test('Stock exhaustion recycles discards while preserving top open card', function() {
    $r = table(); $r['stock'] = []; $r['discard'] = cards('H2 H3 H4');
    rummy_draw($r, 'p0', 'stock'); same(count($r['stock']), 1); same($r['discard'][0]['rank'], 4); same(count($r['players'][0]['hand']), 14);
});
test('Invalid declaration changes no cards or turn', function() {
    $r = table(); rummy_draw($r, 'p0', 'stock'); $r['players'][0]['hand'] = cards('S2 S4 S6 S8 S10 S12 H2 H4 H6 H8 H10 H12 D2 D4'); $r['wildRank'] = 13;
    $before = $r; rejects(function() use (&$r) { rummy_declare($r, 'p0', $r['players'][0]['hand'][13]['id']); }, 'Not a valid'); same($r, $before);
});
test('Valid declaration finishes, publishes result, and rematch resets hand but keeps totals', function() {
    $r = table(); rummy_draw($r, 'p0', 'stock'); $r['wildRank'] = 13;
    $r['players'][0]['hand'] = array_merge(valid_hand(), [['id' => 'last-discard', 'rank' => 2, 'suit' => 'C']]);
    rummy_declare($r, 'p0', 'last-discard'); same($r['status'], 'finished'); same($r['result']['winner'], 'p0'); same($r['result']['scores'][0]['penalty'], 0);
    $total = $r['players'][1]['total']; rummy_start($r, 'p0'); same($r['round'], 2); same($r['turn'], 1); same($r['players'][1]['total'], $total); same(physical_count($r), 106);
});
test('First and middle drops; final remaining player wins', function() {
    $r = table(3); rummy_drop($r, 'p2'); same($r['players'][2]['penalty'], 20);
    rummy_draw($r, 'p0', 'stock'); rejects(function() use (&$r) { rummy_drop($r, 'p0'); }, 'Discard');
    rummy_discard($r, 'p0', $r['players'][0]['hand'][13]['id']); rummy_drop($r, 'p0');
    same($r['players'][0]['penalty'], 40); same($r['result']['winner'], 'p1'); same($r['result']['scores'][2]['penalty'], 20);
});
test('Timeout advances once, maintains hand sizes and conserves cards', function() {
    $r = table(); check(rummy_tick($r, $r['deadline'] + 1)); same($r['turn'], 1); same(count($r['players'][0]['hand']), 13); same(physical_count($r), 106);
    check(!rummy_tick($r, rummy_now()));
});
test('Bot turn uses same draw/discard flow and preserves deck', function() {
    $r = rummy_create('p0', 'Sunil'); rummy_bot($r, 'p0'); rummy_start($r, 'p0');
    rummy_draw($r, 'p0', 'stock'); rummy_discard($r, 'p0', $r['players'][0]['hand'][13]['id']);
    rummy_tick($r, $r['deadline'] + 1); same(physical_count($r), 106);
    check($r['status'] === 'finished' || ($r['turn'] === 0 && count($r['players'][1]['hand']) === 13));
});
test('Leaving transfers host; only bots may be removed by host', function() {
    $r = rummy_create('p0', 'Sunil'); rummy_join($r, 'p1', 'Friend', ''); rummy_bot($r, 'p0'); rummy_leave($r, 'p0'); same($r['host'], 'p1');
    rummy_start($r, 'p1'); rejects(function() use (&$r) { rummy_leave($r, 'p1'); }, 'round');
});
echo "\n$passed rule and game tests passed.\n";
