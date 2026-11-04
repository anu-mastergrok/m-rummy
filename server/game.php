<?php
declare(strict_types=1);
require_once __DIR__ . '/rules.php';
const RUMMY_TURN_MS = 60000;
function rummy_now(): int { return (int) floor(microtime(true) * 1000); }
function rummy_require(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
function rummy_name(mixed $value): string {
    rummy_require(is_string($value), 'Enter your name.');
    $value = preg_replace('/[\x00-\x1f\x7f]/u', '', trim($value));
    rummy_require(is_string($value) && preg_match('//u', $value) === 1, 'Use a valid name.');
    $chars = preg_split('//u', $value, -1, PREG_SPLIT_NO_EMPTY);
    rummy_require(count($chars) >= 2, 'Use a name with at least 2 characters.');
    return implode('', array_slice($chars, 0, 24));
}
function rummy_player(string $id, string $name, bool $bot = false): array {
    return ['id' => $id, 'name' => $name, 'bot' => $bot, 'hand' => [], 'dropped' => false, 'penalty' => 0, 'total' => 0, 'turns' => 0];
}
function rummy_log(array &$room, string $text): void {
    array_unshift($room['activity'], ['id' => bin2hex(random_bytes(8)), 'text' => $text, 'time' => rummy_now()]);
    $room['activity'] = array_slice($room['activity'], 0, 40);
    $room['updatedAt'] = rummy_now(); $room['version']++;
}
function rummy_create(string $id, mixed $name, mixed $password = ''): array {
    rummy_require(is_string($password) && strlen($password) <= 200, 'Room password is too long.');
    return [
        'code' => strtoupper(bin2hex(random_bytes(6))), 'host' => $id, 'status' => 'lobby', 'round' => 0, 'version' => 0,
        'createdAt' => rummy_now(), 'updatedAt' => rummy_now(),
        'passwordHash' => $password !== '' ? password_hash(hash('sha256', $password), PASSWORD_DEFAULT) : '',
        'players' => [rummy_player($id, rummy_name($name))], 'activity' => [], 'messages' => [], 'history' => [],
        'stock' => [], 'discard' => [], 'indicator' => null, 'wildRank' => 0, 'turn' => 0, 'phase' => 'draw', 'deadline' => 0,
        'drawnOpen' => null, 'result' => null,
    ];
}
function rummy_find(array $room, string $id): ?int {
    foreach ($room['players'] as $i => $p) if ($p['id'] === $id) return $i;
    return null;
}
function rummy_join(array &$room, string $id, mixed $name, mixed $password): void {
    if (rummy_find($room, $id) !== null) return;
    rummy_require(is_string($password) && strlen($password) <= 200, 'Incorrect room password.');
    rummy_require(!$room['passwordHash'] || password_verify(hash('sha256', $password), $room['passwordHash']), 'Incorrect room password.');
    rummy_require($room['status'] !== 'playing', 'This round has started. Join after the round ends.');
    rummy_require(count($room['players']) < 6, 'This table is full.');
    $p = rummy_player($id, rummy_name($name)); $room['players'][] = $p;
    rummy_log($room, $p['name'] . ' joined the table.');
}
function rummy_bot(array &$room, string $id): void {
    rummy_require($room['host'] === $id, 'Only the host can add practice bots.');
    rummy_require($room['status'] !== 'playing', 'Wait until the round ends.');
    rummy_require(count($room['players']) < 6, 'This table is full.');
    $number = 1 + count(array_filter($room['players'], fn($p) => $p['bot']));
    $p = rummy_player('bot-' . bin2hex(random_bytes(8)), "Bot $number", true);
    $room['players'][] = $p; rummy_log($room, $p['name'] . ' joined for practice.');
}
function rummy_start(array &$room, string $id, array $accountIds = [], int $winPoints = 100): void {
    rummy_require($room['host'] === $id, 'Only the host can deal a round.');
    rummy_require($room['status'] !== 'playing', 'A round is already in progress.');
    rummy_require(count($room['players']) >= 2, 'Invite a friend or add a practice bot first.');
    $room['roundId'] = bin2hex(random_bytes(16));
    $room['rewardParticipants'] = array_values(array_map(fn($p) => $p['id'], array_filter($room['players'], fn($p) => !$p['bot'] && in_array($p['id'], $accountIds, true))));
    $room['winPointsPerOpponent'] = $winPoints;
    $room['pointsSettled'] = false;
    $room['stock'] = rummy_shuffle(rummy_deck()); $room['discard'] = []; $room['indicator'] = array_pop($room['stock']);
    $room['wildRank'] = $room['indicator']['rank'] ?: 1;
    foreach ($room['players'] as &$p) { $p['hand'] = []; $p['dropped'] = false; $p['penalty'] = 0; $p['turns'] = 0; } unset($p);
    for ($i = 0; $i < 13; $i++) foreach ($room['players'] as &$p) $p['hand'][] = array_pop($room['stock']); unset($p);
    $room['discard'][] = array_pop($room['stock']); $room['round']++; $room['status'] = 'playing';
    $room['turn'] = ($room['round'] - 1) % count($room['players']); $room['phase'] = 'draw'; $room['result'] = null; $room['drawnOpen'] = null;
    $room['deadline'] = rummy_now() + ($room['players'][$room['turn']]['bot'] ? 1800 : RUMMY_TURN_MS);
    rummy_log($room, 'Round ' . $room['round'] . ' dealt. ' . $room['players'][$room['turn']]['name'] . ' plays first.');
}
function rummy_actor(array $room, string $id, string $phase): int {
    rummy_require($room['status'] === 'playing', 'No round in progress.');
    $p = $room['players'][$room['turn']];
    rummy_require($p['id'] === $id && !$p['dropped'], 'Wait for your turn.');
    rummy_require($room['phase'] === $phase, $phase === 'draw' ? 'Discard a card first.' : 'Draw a card first.');
    return $room['turn'];
}
function rummy_next(array &$room): void {
    do { $room['turn'] = ($room['turn'] + 1) % count($room['players']); } while ($room['players'][$room['turn']]['dropped']);
    $room['phase'] = 'draw'; $room['drawnOpen'] = null;
    $room['deadline'] = rummy_now() + ($room['players'][$room['turn']]['bot'] ? 1800 : RUMMY_TURN_MS);
}
function rummy_draw(array &$room, string $id, mixed $source): void {
    $i = rummy_actor($room, $id, 'draw');
    rummy_require(in_array($source, ['stock', 'discard'], true), 'Choose the closed or open deck.');
    if ($source === 'stock' && !$room['stock']) {
        $top = array_pop($room['discard']); $room['stock'] = rummy_shuffle($room['discard']); $room['discard'] = $top ? [$top] : [];
    }
    rummy_require(count($room[$source]) > 0, 'This deck is empty. Choose the other deck.');
    $top = $room[$source][count($room[$source]) - 1];
    rummy_require($source !== 'discard' || !rummy_wild($top, $room['wildRank']), 'Jokers cannot be picked from the open deck.');
    $card = array_pop($room[$source]); $room['players'][$i]['hand'][] = $card; $room['phase'] = 'discard';
    $room['drawnOpen'] = $source === 'discard' ? $card['id'] : null;
    rummy_log($room, $room['players'][$i]['name'] . ' drew from the ' . ($source === 'stock' ? 'closed' : 'open') . ' deck.');
}
function rummy_discard(array &$room, string $id, mixed $cardId): void {
    $i = rummy_actor($room, $id, 'discard');
    rummy_require(is_string($cardId) && $cardId !== $room['drawnOpen'], 'Choose a different discard from your hand.');
    $index = array_search($cardId, array_column($room['players'][$i]['hand'], 'id'), true);
    rummy_require($index !== false, 'Choose a card from your hand.');
    $card = array_splice($room['players'][$i]['hand'], $index, 1)[0];
    $room['discard'][] = $card; $room['players'][$i]['turns']++;
    $name = $room['players'][$i]['name']; rummy_next($room); rummy_log($room, "$name discarded a card.");
}
function rummy_finish(array &$room, int $winner, array $groups = [], string $reason = 'declaration'): void {
    $scores = [];
    foreach ($room['players'] as $i => &$p) {
        $penalty = $i === $winner ? 0 : ($p['dropped'] ? $p['penalty'] : rummy_analyze($p['hand'], $room['wildRank'])['penalty']);
        $p['total'] += $penalty;
        $scores[] = ['id' => $p['id'], 'name' => $p['name'], 'penalty' => $penalty, 'total' => $p['total'], 'dropped' => $p['dropped'], 'hand' => $p['hand']];
    } unset($p);
    $room['status'] = 'finished'; $room['deadline'] = 0; $p = $room['players'][$winner];
    $room['result'] = ['winner' => $p['id'], 'winnerName' => $p['name'], 'groups' => $groups, 'reason' => $reason, 'scores' => $scores];
    array_unshift($room['history'], ['round' => $room['round'], 'winner' => $p['name'], 'scores' => array_map(fn($s) => ['name' => $s['name'], 'penalty' => $s['penalty'], 'total' => $s['total']], $scores)]);
    $room['history'] = array_slice($room['history'], 0, 20);
    rummy_log($room, $p['name'] . ' won round ' . $room['round'] . ($reason === 'last-player' ? ' as the last player at the table!' : ' with a valid declaration!'));
}
function rummy_declare(array &$room, string $id, mixed $cardId): void {
    $i = rummy_actor($room, $id, 'discard');
    rummy_require(is_string($cardId) && $cardId !== $room['drawnOpen'], 'Choose a different final discard.');
    $index = array_search($cardId, array_column($room['players'][$i]['hand'], 'id'), true);
    rummy_require($index !== false, 'Select your final discard first.');
    $hand = $room['players'][$i]['hand']; $card = array_splice($hand, $index, 1)[0];
    $result = rummy_analyze($hand, $room['wildRank']);
    rummy_require(count($hand) === 13 && $result['valid'], 'Not a valid declaration: all 13 cards need valid groups, including two sequences and one pure sequence.');
    $room['players'][$i]['hand'] = $hand; $room['discard'][] = $card; rummy_finish($room, $i, $result['groups']);
}
function rummy_drop(array &$room, string $id): void {
    rummy_require($room['status'] === 'playing', 'No round in progress.');
    $i = rummy_find($room, $id); rummy_require($i !== null && !$room['players'][$i]['dropped'], 'You are already out of this round.');
    rummy_require(!($room['turn'] === $i && $room['phase'] === 'discard'), 'Discard before dropping.');
    $room['players'][$i]['dropped'] = true; $room['players'][$i]['penalty'] = $room['players'][$i]['turns'] === 0 ? 20 : 40;
    rummy_log($room, $room['players'][$i]['name'] . ' dropped for ' . $room['players'][$i]['penalty'] . ' points.');
    $active = array_keys(array_filter($room['players'], fn($p) => !$p['dropped']));
    if (count($active) === 1) rummy_finish($room, $active[0], [], 'last-player');
    elseif ($room['turn'] === $i) rummy_next($room);
}
function rummy_leave(array &$room, string $id): void {
    rummy_require($room['status'] !== 'playing', 'You can leave after the round ends. Drop to sit this round out.');
    $i = rummy_find($room, $id); rummy_require($i !== null, 'You are not seated here.');
    $p = array_splice($room['players'], $i, 1)[0];
    if ($room['host'] === $id) {
        $humans = array_values(array_filter($room['players'], fn($p) => !$p['bot']));
        $room['host'] = $humans[0]['id'] ?? null;
    }
    rummy_log($room, $p['name'] . ' left the table.');
}
function rummy_tick(array &$room, ?int $now = null): bool {
    if ($room['status'] !== 'playing' || ($now ?? rummy_now()) < $room['deadline']) return false;
    $id = $room['players'][$room['turn']]['id']; $bot = $room['players'][$room['turn']]['bot'];
    if ($room['phase'] === 'draw') rummy_draw($room, $id, 'stock');
    $hand = $room['players'][$room['turn']]['hand'];
    $eligible = array_values(array_filter($hand, fn($c) => $c['id'] !== $room['drawnOpen']));
    if ($bot) {
        // One exact grouping search; then try promising discards first. No
        // opponent cards or future stock are consulted by the bot.
        $arranged = rummy_analyze($hand, $room['wildRank']);
        usort($eligible, function($a, $b) use ($arranged, $room) {
            $aLoose = in_array($a['id'], $arranged['loose'], true); $bLoose = in_array($b['id'], $arranged['loose'], true);
            return ((int)$bLoose <=> (int)$aLoose) ?: (rummy_points($b, $room['wildRank']) <=> rummy_points($a, $room['wildRank']));
        });
        // If grouping leaves at most one loose card, a valid 13-card finish
        // can exist. Check each discard to catch longer-run splits as well.
        if (count($arranged['loose']) <= 1) {
            foreach ($eligible as $candidate) {
                $remaining = array_values(array_filter($hand, fn($c) => $c['id'] !== $candidate['id']));
                if (rummy_analyze($remaining, $room['wildRank'])['valid']) { rummy_declare($room, $id, $candidate['id']); return true; }
            }
        }
        $cardId = $eligible[0]['id'];
    } else $cardId = $eligible[count($eligible) - 1]['id'];
    rummy_discard($room, $id, $cardId);
    if (!$bot) rummy_log($room, "A missed turn was played automatically for " . $room['players'][rummy_find($room, $id)]['name'] . '.');
    return true;
}
function rummy_public(array $room, string $id): array {
    $i = rummy_find($room, $id); rummy_require($i !== null, 'Join this room first.');
    $players = array_map(function($p) { $p['count'] = count($p['hand']); unset($p['hand']); return $p; }, $room['players']);
    $turnId = $room['players'][$room['turn']]['id'] ?? null;
    return [
        'code' => $room['code'], 'host' => $room['host'], 'status' => $room['status'], 'round' => $room['round'], 'version' => $room['version'],
        'players' => $players, 'hand' => $room['players'][$i]['hand'], 'me' => $id, 'stockCount' => count($room['stock']),
        'topDiscard' => $room['discard'] ? $room['discard'][count($room['discard']) - 1] : null,
        'indicator' => $room['indicator'], 'wildRank' => $room['wildRank'], 'turn' => $turnId,
        'phase' => $room['phase'], 'deadline' => $room['deadline'], 'serverTime' => rummy_now(), 'drawnOpen' => $turnId === $id ? $room['drawnOpen'] : null,
        'result' => $room['result'], 'history' => $room['history'], 'activity' => array_slice($room['activity'], 0, 15),
        'messages' => $room['messages'], 'hasPassword' => (bool)$room['passwordHash'],
    ];
}
