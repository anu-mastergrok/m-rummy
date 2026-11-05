<?php
declare(strict_types=1);

// Presence is advisory session metadata, never game state or a move revision.
const RUMMY_PRESENCE_ONLINE_MS = 15000;
const RUMMY_PRESENCE_STALE_MS = 45000;
const RUMMY_PRESENCE_CLIENT_LIMIT = 8;

function rummy_presence_input(array $query): ?array {
    $fields = ['client', 'visible', 'sequence'];
    if (!array_intersect($fields, array_keys($query))) return null;
    rummy_require(isset($query['client'], $query['visible'], $query['sequence'])
        && is_string($query['client']) && preg_match('/^[a-f0-9]{32}$/D', $query['client']) === 1
        && in_array($query['visible'], ['0', '1'], true)
        && is_string($query['sequence']) && ctype_digit($query['sequence'])
        && strlen($query['sequence']) <= 10 && (int)$query['sequence'] <= 1000000000,
        'Invalid presence update.');
    return ['client' => $query['client'], 'visible' => $query['visible'] === '1', 'sequence' => (int)$query['sequence']];
}

function rummy_record_presence(array &$session, array $input, int $now): void {
    $clients = $session['presenceClients'] ?? [];
    $previous = $clients[$input['client']] ?? null;
    // A delayed hidden-page request cannot overwrite a newer foreground update.
    if ($previous && $input['sequence'] <= $previous['sequence']) return;
    foreach ($clients as $client => $entry) {
        if ($now - $entry['seenAt'] > RUMMY_PRESENCE_STALE_MS) unset($clients[$client]);
    }
    if (!isset($clients[$input['client']]) && count($clients) >= RUMMY_PRESENCE_CLIENT_LIMIT) {
        uasort($clients, fn($a, $b) => $a['seenAt'] <=> $b['seenAt']);
        unset($clients[array_key_first($clients)]);
    }
    $clients[$input['client']] = ['seenAt' => $now, 'visible' => $input['visible'], 'sequence' => $input['sequence']];
    $session['presenceClients'] = $clients; $session['presenceSeen'] = true;
}

function rummy_player_presence(array $store, array $players, int $now): array {
    $states = [];
    foreach ($players as $player) $states[$player['id']] = ['sessions' => false, 'legacy' => false, 'online' => false, 'recent' => false];
    foreach ($store['sessions'] as $session) {
        $id = $session['id'];
        if (!isset($states[$id]) || ($session['expires'] ?? 0) <= $now) continue;
        $states[$id]['sessions'] = true;
        if (empty($session['presenceSeen'])) $states[$id]['legacy'] = true;
        foreach ($session['presenceClients'] ?? [] as $client) {
            $age = max(0, $now - $client['seenAt']);
            if ($age <= RUMMY_PRESENCE_STALE_MS) $states[$id]['recent'] = true;
            if ($client['visible'] && $age <= RUMMY_PRESENCE_ONLINE_MS) $states[$id]['online'] = true;
        }
    }
    $result = [];
    foreach ($players as $player) {
        $p = $states[$player['id']];
        $result[$player['id']] = $player['bot'] ? 'bot' : ($p['online'] ? 'online' : ($p['recent'] ? 'away' : ($p['legacy'] ? 'unknown' : 'offline')));
    }
    return $result;
}
