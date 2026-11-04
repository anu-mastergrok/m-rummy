<?php
// Copy to config.php. Keep this file outside public_html and out of Git.
return [
    // Use exactly the public origin, without a trailing slash.
    'app_origin' => 'https://rummy.example.com',
    // Set true for Hostinger HTTPS. False is only for local HTTP development.
    'secure_cookies' => true,
    // Default: data/ beside server/, never in public_html.
    'data_dir' => dirname(__DIR__) . '/data',
    // Optional shared code required when creating a new table.
    'create_room_key' => '',
    'max_rooms' => 100,
    // Play points credited per registered human opponent beaten in a round.
    'win_points_per_opponent' => 100,
];
