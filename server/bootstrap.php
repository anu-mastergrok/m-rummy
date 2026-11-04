<?php
declare(strict_types=1);
require_once __DIR__ . '/game.php';

final class RummyApiError extends RuntimeException {
    public function __construct(string $message, public int $status = 400, public ?array $state = null) { parent::__construct($message); }
}
function rummy_limit(array &$store, string $key, int $max, int $period = 60000): void {
    $now = rummy_now();
    if (!isset($store['limits'][$key]) || $store['limits'][$key]['until'] < $now) $store['limits'][$key] = ['count' => 0, 'until' => $now + $period];
    if (++$store['limits'][$key]['count'] > $max) throw new RummyApiError('Too many requests. Please wait a minute.', 429);
}
function rummy_current(array $store, string $id): ?string {
    foreach ($store['rooms'] as $code => $room) if (rummy_find($room, $id) !== null) return (string)$code;
    return null;
}
function rummy_handle(array &$store, array $config, string $route, string $method, array $input): array {
    $now = rummy_now(); $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    rummy_limit($store, 'ip:' . hash('sha256', $ip), 1800);
    $token = $_COOKIE['mr_session'] ?? '';
    $session = is_string($token) ? ($store['sessions'][$token] ?? null) : null;
    if ($session && $session['expires'] < $now) $session = null;
    if ($route === 'session' && $method === 'GET') {
        if (!$session) {
            rummy_limit($store, 'new:' . hash('sha256', $ip), 30);
            rummy_require(count($store['sessions']) < 10000, 'Server session limit reached. Please try later.');
            $token = bin2hex(random_bytes(32));
            $session = ['id' => bin2hex(random_bytes(16)), 'csrf' => bin2hex(random_bytes(24)), 'expires' => $now + 30 * 86400000];
            $store['sessions'][$token] = $session;
            setcookie('mr_session', $token, ['expires' => (int)($session['expires'] / 1000), 'path' => '/', 'secure' => $config['secure_cookies'], 'httponly' => true, 'samesite' => 'Strict']);
        }
        return ['id' => $session['id'], 'csrf' => $session['csrf'], 'room' => rummy_current($store, $session['id'])];
    }
    if (!$session) throw new RummyApiError('Your session expired. Reload this page.', 401);
    $id = $session['id']; rummy_limit($store, "user:$id", 180);
    if ($method === 'POST') {
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $expected = $config['app_origin'] ?: 'http://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
        if (($origin && $origin !== $expected) || !hash_equals($session['csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new RummyApiError('Request verification failed. Reload the page.', 403);
        rummy_limit($store, "actions:$id", 60);
    }
    if ($route === 'create' && $method === 'POST') {
        $key = $config['create_room_key'];
        if ($key !== '' && (!is_string($input['accessKey'] ?? null) || !hash_equals($key, $input['accessKey']))) throw new RummyApiError('Enter the host access code to create a table.', 403);
        rummy_require(rummy_current($store, $id) === null, 'You already have a table. Return to it or leave it first.');
        rummy_require(count($store['rooms']) < $config['max_rooms'], 'Server is full. Please try later.');
        $room = rummy_create($id, $input['name'] ?? null, $input['password'] ?? '');
        rummy_log($room, $room['players'][0]['name'] . ' opened the table.');
        $store['rooms'][$room['code']] = $room;
        return rummy_public($room, $id);
    }
    $code = $method === 'GET' ? ($_GET['code'] ?? '') : ($input['code'] ?? '');
    $code = is_string($code) ? strtoupper($code) : '';
    if (!preg_match('/^[A-F0-9]{12}$/', $code) || !isset($store['rooms'][$code])) throw new RummyApiError('Room not found or expired. Check the invite code.', 404);
    $room = &$store['rooms'][$code];
    if ($route === 'join' && $method === 'POST') {
        rummy_limit($store, "join:$id", 10);
        $current = rummy_current($store, $id);
        rummy_require($current === null || $current === $code, 'Leave your current table before joining another.');
        rummy_join($room, $id, $input['name'] ?? null, $input['password'] ?? '');
        return rummy_public($room, $id);
    }
    rummy_require(rummy_find($room, $id) !== null, 'Join this room first.');
    // Every connected player's poll advances an expired turn. Only one turn
    // advances per request; the exclusive storage lock prevents double moves.
    rummy_tick($room);
    if ($route === 'room' && $method === 'GET') return rummy_public($room, $id);
    if ($route !== 'action' || $method !== 'POST') throw new RummyApiError('Not found.', 404);
    $action = $input['action'] ?? '';
    if ($action === 'arrange') {
        rummy_limit($store, "arrange:$id", 12);
        return rummy_analyze($room['players'][rummy_find($room, $id)]['hand'], $room['wildRank']);
    }
    if (($input['version'] ?? null) !== $room['version']) throw new RummyApiError('The table changed. Your hand has been refreshed; try again.', 409, rummy_public($room, $id));
    switch ($action) {
        case 'start': rummy_start($room, $id); break;
        case 'addBot': rummy_bot($room, $id); break;
        case 'removeBot':
            rummy_require($room['host'] === $id && $room['status'] !== 'playing', 'Only the host can remove bots between rounds.');
            $i = is_string($input['playerId'] ?? null) ? rummy_find($room, $input['playerId']) : null;
            rummy_require($i !== null && $room['players'][$i]['bot'], 'Practice bot not found.');
            array_splice($room['players'], $i, 1); rummy_log($room, 'Practice bot removed.'); break;
        case 'draw': rummy_draw($room, $id, $input['source'] ?? null); break;
        case 'discard': rummy_discard($room, $id, $input['cardId'] ?? null); break;
        case 'declare': rummy_declare($room, $id, $input['cardId'] ?? null); break;
        case 'drop': rummy_drop($room, $id); break;
        case 'leave':
            rummy_leave($room, $id);
            if (!array_filter($room['players'], fn($p) => !$p['bot'])) unset($store['rooms'][$code]);
            return ['left' => true];
        case 'chat':
            rummy_limit($store, "chat:$id", 15);
            $text = $input['text'] ?? null;
            rummy_require(is_string($text) && trim($text) !== '' && strlen($text) <= 960 && preg_match('//u', $text) === 1, 'Messages must be 1–240 characters.');
            rummy_require(count(preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY)) <= 240, 'Messages must be 1–240 characters.');
            $p = $room['players'][rummy_find($room, $id)];
            $room['messages'][] = ['id' => bin2hex(random_bytes(8)), 'name' => $p['name'], 'text' => trim($text), 'time' => $now];
            $room['messages'] = array_slice($room['messages'], -40); $room['version']++; $room['updatedAt'] = $now; break;
        default: throw new RummyApiError('Unknown table action.');
    }
    return rummy_public($room, $id);
}

function rummy_api(): void {
    ini_set('display_errors', '0');
    header('Content-Type: application/json; charset=utf-8'); header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff'); header('Referrer-Policy: no-referrer');
    $config = ['app_origin' => '', 'secure_cookies' => true, 'data_dir' => dirname(__DIR__) . '/data', 'create_room_key' => '', 'max_rooms' => 100];
    if (is_file(__DIR__ . '/config.php')) $config = array_replace($config, require __DIR__ . '/config.php');
    if (getenv('RUMMY_TEST_DATA_DIR')) $config['data_dir'] = getenv('RUMMY_TEST_DATA_DIR');
    // Explicit dev flag is used only by the local CLI server, never hPanel.
    if (PHP_SAPI === 'cli-server' && getenv('RUMMY_DEV') === '1') $config['secure_cookies'] = false;
    $lock = null; $status = 200; $result = []; $store = null;
    try {
        $method = $_SERVER['REQUEST_METHOD']; $route = $_GET['route'] ?? '';
        if (!in_array($method, ['GET', 'POST'], true)) throw new RummyApiError('Method not allowed.', 405);
        if (!is_string($route) || !in_array($route, ['session', 'room', 'create', 'join', 'action'], true)) throw new RummyApiError('Not found.', 404);
        $input = [];
        if ($method === 'POST') {
            if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) throw new RummyApiError('Send JSON requests.', 415);
            $raw = file_get_contents('php://input', false, null, 0, 8193);
            if ($raw === false || strlen($raw) > 8192) throw new RummyApiError('Request is too large.', 413);
            try { $input = json_decode($raw, true, 32, JSON_THROW_ON_ERROR); } catch (JsonException) { throw new RummyApiError('Invalid JSON request.'); }
            rummy_require(is_array($input) && !array_is_list($input), 'Send a JSON object.');
        }
        $dir = $config['data_dir'];
        if (!is_dir($dir) && !mkdir($dir, 0700, true) && !is_dir($dir)) throw new LogicException('Cannot create storage.');
        // Guard against accidental placement beneath the public document root.
        $realDir = realpath($dir); $public = realpath($_SERVER['DOCUMENT_ROOT'] ?? __DIR__ . '/../public');
        if ($public && ($realDir === $public || str_starts_with($realDir . '/', $public . '/'))) throw new LogicException('Storage must be outside the document root.');
        $lock = fopen($dir . '/state.lock', 'c');
        if (!$lock || !flock($lock, LOCK_EX)) throw new LogicException('Cannot lock storage.');
        chmod($dir . '/state.lock', 0600);
        $path = $dir . '/state.json';
        $store = is_file($path) ? json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR) : ['sessions' => [], 'rooms' => [], 'limits' => [], 'cleanedAt' => 0];
        if (!is_array($store) || !isset($store['sessions'], $store['rooms'], $store['limits'])) throw new LogicException('Invalid saved state. Restore a backup.');
        if (rummy_now() - ($store['cleanedAt'] ?? 0) > 60000) {
            $time = rummy_now();
            foreach ($store['sessions'] as $key => $s) if ($s['expires'] < $time) unset($store['sessions'][$key]);
            foreach ($store['rooms'] as $key => $r) if ($time - $r['updatedAt'] > 86400000) unset($store['rooms'][$key]);
            foreach ($store['limits'] as $key => $limit) if ($limit['until'] < $time) unset($store['limits'][$key]);
            $store['cleanedAt'] = $time;
        }
        // Keep throttles even on failures, but roll back partially applied moves.
        $roomsBefore = $store['rooms'];
        try { $result = rummy_handle($store, $config, $route, $method, $input); }
        catch (RummyApiError $e) {
            if ($e->status !== 409) $store['rooms'] = $roomsBefore;
            $status = $e->status; $result = ['error' => $e->getMessage()];
            if ($e->state !== null) $result['state'] = $e->state;
        } catch (RuntimeException $e) { $store['rooms'] = $roomsBefore; $status = 400; $result = ['error' => $e->getMessage()]; }
        $encoded = json_encode($store, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        $temp = $dir . '/state.tmp';
        if (file_put_contents($temp, $encoded) !== strlen($encoded) || !chmod($temp, 0600) || !rename($temp, $path)) throw new LogicException('Cannot save game state.');
    } catch (RummyApiError $e) { $status = $e->status; $result = ['error' => $e->getMessage()]; }
    catch (RuntimeException $e) { $status = 400; $result = ['error' => $e->getMessage()]; }
    catch (Throwable $e) { error_log('M Rummy: ' . $e->getMessage()); $status = 503; $result = ['error' => 'The server could not load or save your table. Please try again shortly.']; }
    finally { if (is_resource($lock)) { flock($lock, LOCK_UN); fclose($lock); } }
    http_response_code($status); echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}
