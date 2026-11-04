import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
// .runtime/php is an optional ignored local executable, useful in sandboxes.
const php = process.env.PHP_BIN || (existsSync(`${root}.runtime/php`) ? `${root}.runtime/php` : 'php');
const processPHP = spawn(php, ['-S', `${flag('--host') || '0.0.0.0'}:${flag('--port') || process.env.PORT || 3000}`, '-t', 'public', 'public/router.php'], { cwd: root, stdio: 'inherit', env: { ...process.env, RUMMY_DEV: '1' } });
processPHP.on('error', error => { console.error(`Install PHP 8.2+ to start the app: ${error.message}`); process.exit(1); });
processPHP.on('exit', code => process.exit(code || 0));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => processPHP.kill(signal));
