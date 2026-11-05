<?php
declare(strict_types=1);
require_once __DIR__ . '/../server/bootstrap.php';
require __DIR__ . '/helpers.php';
function presence_session(string $id = 'p0'): array { return ['id' => $id, 'expires' => 9999999999999, 'csrf' => 'private-csrf']; }
function presence_beat(array &$session, int $now, bool $visible = true, int $sequence = 1, string $client = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'): void {
    rummy_record_presence($session, compact('client', 'visible', 'sequence'), $now);
}
function presence_status(array $sessions, int $now): string {
    return rummy_player_presence(['sessions' => $sessions], [rummy_player('p0', 'Player')], $now)['p0'];
}
test('Presence moves from connected to away to offline at deterministic server deadlines', function() {
    $s = presence_session(); presence_beat($s, 100000);
    same(presence_status([$s], 115000), 'online'); same(presence_status([$s], 115001), 'away');
    same(presence_status([$s], 145000), 'away'); same(presence_status([$s], 145001), 'offline');
    presence_beat($s, 146000, true, 2); same(presence_status([$s], 146000), 'online');
});
test('A hidden tab or device cannot override another recent visible client', function() {
    $s = presence_session(); presence_beat($s, 100000);
    presence_beat($s, 101000, false, 1, str_repeat('b', 32)); same(presence_status([$s], 101000), 'online');
    presence_beat($s, 102000, false, 2); same(presence_status([$s], 102000), 'away');
    $device = presence_session(); presence_beat($device, 103000); same(presence_status([$s, $device], 103000), 'online');
    $device['expires'] = 102999; same(presence_status([$s, $device], 103000), 'away');
});
test('Out-of-order and duplicate updates do not replace a newer heartbeat or extend liveness', function() {
    $s = presence_session(); presence_beat($s, 100000, true, 5); $before = $s;
    presence_beat($s, 101000, false, 4); presence_beat($s, 102000, false, 5); same($s, $before);
    same(presence_status([$s], 116000), 'away');
});
test('Legacy sessions are unknown, signed-out seats are offline, and bots are identified', function() {
    same(presence_status([presence_session()], 100000), 'unknown'); same(presence_status([], 100000), 'offline');
    $players = [rummy_player('p0', 'Player'), rummy_player('bot', 'Bot', true)];
    $states = rummy_player_presence(['sessions' => [presence_session('outsider')]], $players, 100000);
    same($states['p0'], 'offline'); same($states['bot'], 'bot');
});
test('Presence metadata is bounded and malformed query values are rejected', function() {
    same(rummy_presence_input(['code' => 'ABCDEF123456']), null);
    foreach ([['client' => 'bad'], ['client' => str_repeat('a', 32), 'visible' => 'yes', 'sequence' => '1'], ['client' => str_repeat('a', 32), 'visible' => '1', 'sequence' => '-1'], ['client' => [], 'visible' => '1', 'sequence' => '1']] as $query) {
        rejects(fn() => rummy_presence_input($query), 'Invalid presence');
    }
    $s = presence_session();
    for ($i = 0; $i < 12; $i++) presence_beat($s, 100000 + $i, true, 1, str_pad(dechex($i), 32, '0', STR_PAD_LEFT));
    same(count($s['presenceClients']), RUMMY_PRESENCE_CLIENT_LIMIT);
    presence_beat($s, 200000, true, 1); same(count($s['presenceClients']), 1);
});
test('Heartbeats preserve game version, deadlines, hands, points and privacy', function() {
    $room = table(); $session = presence_session(); $store = ['sessions' => ['secret-token' => $session], 'rooms' => [$room['code'] => $room], 'users' => []];
    $before = $store['rooms']; presence_beat($store['sessions']['secret-token'], rummy_now());
    $view = rummy_room_view($store, $room, 'p0'); same($store['rooms'], $before); same($view['version'], $room['version']);
    same($view['players'][0]['presence'], 'online');
    foreach (['presenceClients', 'presenceSeen', 'seenAt', 'sequence', 'csrf', 'secret-token'] as $key) check(!str_contains(json_encode($view), $key));
    foreach ($view['players'] as $player) check(!isset($player['hand']));
});
echo "\n$passed presence tests passed.\n";
