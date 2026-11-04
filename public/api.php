<?php
declare(strict_types=1);
$guardPath = dirname(__DIR__) . '/.deploy.lock';
if (is_link($guardPath)) { http_response_code(503); exit; }
$guard = @fopen($guardPath, is_file($guardPath) ? 'r' : 'c');
if (is_resource($guard)) @chmod($guardPath, 0600);
if (!$guard || !flock($guard, LOCK_SH | LOCK_NB)) {
    http_response_code(503); header('Retry-After: 10'); header('Cache-Control: no-store');
    header('Content-Type: application/json'); echo '{"error":"A quick update is in progress. Reconnecting shortly."}';
    if (is_resource($guard)) fclose($guard);
    exit;
}
try {
    require dirname(__DIR__) . '/server/bootstrap.php';
    rummy_api();
} finally { flock($guard, LOCK_UN); fclose($guard); }
