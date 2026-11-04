# Deploy M Rummy on Hostinger Premium Web Hosting

This version uses PHP 8.2+ and standard file storage. It works without a Node.js process, VPS, cron job, or database. Hostinger's managed Node.js offering is listed for Business and Cloud plans, so this app deliberately uses Premium-compatible PHP instead.

Official references:

- [Hostinger Node.js hosting options](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [Rummy gameplay reference supplied for this project](https://www.rummycircle.com/how-to-play-rummy/amp-multiplayer-rummy.html)

## Automatic deployment from GitHub

Use [GITHUB_ACTIONS.md](GITHUB_ACTIONS.md) to configure SSH-based deployment on this Premium plan. The existing **Check and test** workflow can deploy tested `main` commits automatically or on a manual run. Add the four Hostinger secrets and required repository variables, then enable deployment. For a subdomain mapped beneath the main domain’s public_html, set HOSTINGER_PUBLIC_PATH to that subdomain folder while keeping HOSTINGER_DEPLOY_PATH private; see the existing-subdomain section in GITHUB_ACTIONS.md. Existing config, accounts, and points are preserved with a private backup; active rounds block an update. The manual upload instructions below remain available.

## 1. Prepare a dedicated site

In hPanel, select your Premium hosting and create or select the domain/subdomain you want to use, such as `rummy.yourdomain.com`. Use a separate subdomain rather than replacing an existing WordPress or business website. Wait for its DNS to resolve, activate SSL, and enable Force HTTPS.

Under the site's PHP configuration, select **PHP 8.2 or newer** (8.3/8.4 are suitable). The app uses PHP's built-in JSON, cryptographic random, hashing, file, and password functions. No additional PHP extensions are required.

The application expects to run at `/` on that host. Hosting at a URL subdirectory requires adjusting absolute asset and API URLs and is outside this deployment recipe.

## 2. Get the upload files

Option A — no local build tools:

1. Open [the repository's Actions page](https://github.com/mastergrok-technologies/m-rummy/actions).
2. Open a successful **Check and test** run on `main`.
3. Download the **m-rummy-hostinger** artifact (GitHub may require you to sign in).
4. Extract the artifact download on your computer. Inside is `m-rummy-hostinger.zip`.

Option B — build from the repository:

```sh
git clone https://github.com/mastergrok-technologies/m-rummy.git
cd m-rummy
python3 tools/package.py
```

The output is `dist/m-rummy-hostinger.zip`. This ZIP contains `public_html/`, `server/`, and this guide. It excludes private configuration, runtime saves, tests, and development files.

If you cannot use either option, download the repository ZIP from GitHub → Code → Download ZIP, and manually copy `public/` contents (including `.htaccess`, excluding `router.php`) into `public_html/`, and `server/` into a sibling folder outside it.

## 3. Upload the correct directory layout

Open the dedicated site's File Manager. Navigate **one level above that site's `public_html` directory**. Upload and extract `m-rummy-hostinger.zip` there. The result must be:

```text
your-site-directory/
  public_html/
    .htaccess
    index.html
    app.js
    style.css
    favicon.svg
    api.php
    manifest.webmanifest
    sw.js
    offline.html
    icons/
  server/
    bootstrap.php
    game.php
    accounts.php
    rules.php
    config.example.php
  data/                  automatically created on the first API request
```

Some subdomains use a different document-root name. In that case, put the ZIP's `public_html` **contents** into the actual subdomain document root and keep `server/` as its sibling directory. `api.php` loads `../server/bootstrap.php`.

Do **not** put `server/`, `data/`, or the whole repository inside the public web folder. Do not overwrite another site's existing files. Remove any default Hostinger index page from this dedicated document root if it takes priority over `index.html`. Make sure hidden files are visible so `.htaccess` is included. Remove the uploaded ZIP after extraction.

## 4. Set private configuration

Copy `server/config.example.php` to **`server/config.php`**. Edit:

```php
<?php
return [
    'app_origin' => 'https://rummy.yourdomain.com',
    'secure_cookies' => true,
    'data_dir' => dirname(__DIR__) . '/data',
    'create_room_key' => '',
    'max_rooms' => 100,
    'win_points_per_opponent' => 100,
];
```

- Replace the example origin with your exact HTTPS URL, without trailing slash or path. If you use `www`, the configured origin must also contain `www`.
- Optionally replace the empty `create_room_key` with a long shared code. Only someone entering that code can create a table; it is not needed for friends joining existing rooms. It is entered under **Have a host access code?** on the home screen.
- The PHP worker must be able to create/write the private `data/` directory. If creation fails, create it manually beside `server/`, owned by the hosting account, with permission `700` where supported. Do not use `777`.
- `config.php` stays private and is excluded from Git and generated upload ZIPs.

## 5. Verify before inviting friends

1. Open the site over HTTPS. Create a player account and verify its profile balance starts at **10,000**. Create a table with a room password.
2. Use **Invite friends** to copy its link.
3. Open that link in a private/incognito window or another phone. Tabs in one browser profile are one player, so use a separate profile/device for the second player.
4. Register/sign in to a different player account, then join using the room password. Both seats should appear within about 1–2 seconds.
5. As host, deal. Draw a card, select a card from your hand, and discard. Verify the other player's turn begins.
6. Send a chat message. Refresh one browser and verify its hand/seat are restored.
7. Drop in the other window to finish the round. Check the scores and deal a rematch.
8. Open the site in **Android Chrome** and **iPhone Safari**. Verify card taps, horizontal hand scrolling, portrait/landscape layout, keyboard/chat, and reconnect after briefly backgrounding the browser. Use the footer's home-screen instructions if you want an app shortcut. Live games require internet; there is no offline play.
9. After the two-human round, verify the winner received **100 extra play points** (default), the loser kept their balance, and refreshes do not repeat the reward. Sign out and sign back in on a second device to check the saved profile.

## Existing installation: profiles and data upgrade

See [PROFILES.md](PROFILES.md). No SQL migrations are needed: the first API request automatically backs up the existing guest-only save and upgrades it to schema version 2. Back up `server/config.php` and `data/` first; upload the full matching public/server release, including `.htaccess` and `accounts.php`. Keep your existing configuration/data. Profile balances and histories are retained indefinitely while that private data is preserved. A default win is worth 100 play points per registered human opponent, configurable using `win_points_per_opponent` in the private config.

You can also create a fresh table and add a practice bot. Every actual move and winning declaration is checked by PHP; the browser never receives opponents' live hands or stock order.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Default hosting page appears | Correct domain document root, default index file priority, and `index.html` placement. |
| API returns 404 / app stays loading | `.htaccess` was included, URL rewriting is active, and this is a PHP hosting site rather than Hostinger Website Builder. As a diagnostic, `/api.php?route=session` should return JSON; keep using `/api/session` normally. |
| HTTP 500 or blank page | PHP version and error logs; `server/` must be immediately beside the actual document root. |
| Table storage error / HTTP 503 | `data/` location, ownership, free disk space, and write permission. The app refuses storage inside the public document root. A damaged save needs a backup restore, not deletion during a live game. |
| Request verification failed | Exact `app_origin`, HTTPS, consistent `www`/non-`www`, no API caching, browser cookies enabled. |
| Session expired immediately | SSL must be active; production cookies are Secure. Do not disable cookie security to work around HTTP. |
| Friend gets room not found | Full 12-character code, same site/origin, table not expired after 24 hours of inactivity. |
| Friend cannot join after deal | Join between rounds; the table accepts no new seats during a round. |
| Timer waited while everyone was offline | Expected for shared hosting. The next connected request resolves the overdue turn and starts the next timer. |
| Player cannot leave during a round | Drop to watch; leave after the round. Players with a drawn card must discard first. |
| Stale move message | Another move or timer update happened first. The refreshed hand is authoritative; try the intended move again. |

## Updates and backups

Before updating, finish all rounds and back up **`server/config.php` plus the complete private `data/` directory**. Upload changed public/server code, keeping the same private configuration and data. Rebuild or download a new upload ZIP after each release; never overwrite your private state with a sample save. Avoid file updates in the middle of rounds.

The project includes tests and CI, but a deployment on your specific Hostinger account still needs the checks above. No Hostinger account credentials or live deployment are included in this repository.

