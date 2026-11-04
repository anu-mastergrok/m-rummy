<?php
// Local PHP development server only. Apache/LiteSpeed uses .htaccess instead.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/__responsive-test' && getenv('RUMMY_DEV') === '1') {
    readfile(__DIR__ . '/../test/responsive.html'); return true;
}
if (preg_match('#^/api/([a-z]+)$#', $path, $matches)) {
    $_GET['route'] = $matches[1]; require __DIR__ . '/api.php'; return true;
}
if ($path === '/') { readfile(__DIR__ . '/index.html'); return true; }
if (in_array($path, ['/index.html', '/app.js', '/style.css', '/favicon.svg', '/manifest.webmanifest', '/sw.js', '/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'], true)) return false;
http_response_code(404); header('Content-Type: application/json'); echo '{"error":"Not found."}';
