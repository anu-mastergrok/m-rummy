#!/usr/bin/env bash
set -euo pipefail

# All connection values come from Actions secrets/variables, never YAML string
# interpolation into shell code. No passwords or bearer sessions are logged.
for key in HOSTINGER_SSH_HOST HOSTINGER_SSH_USER HOSTINGER_DEPLOY_PATH HOSTINGER_APP_URL HOSTINGER_SSH_KEY_FILE HOSTINGER_KNOWN_HOSTS_FILE GITHUB_SHA; do
  if [[ -z "${!key:-}" ]]; then echo "Missing required deployment setting: $key" >&2; exit 1; fi
done
port="${HOSTINGER_SSH_PORT:-65002}"
php_binary="${HOSTINGER_PHP_BINARY:-php}"
[[ "$port" =~ ^[0-9]{1,5}$ ]] && ((10#$port >= 1 && 10#$port <= 65535)) || { echo 'Invalid SSH port.' >&2; exit 1; }
[[ "$HOSTINGER_SSH_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo 'Invalid SSH host.' >&2; exit 1; }
[[ "$HOSTINGER_SSH_USER" =~ ^[A-Za-z0-9_][A-Za-z0-9_-]*$ ]] || { echo 'Invalid SSH username.' >&2; exit 1; }
[[ "$HOSTINGER_DEPLOY_PATH" =~ ^/home/[A-Za-z0-9_./-]+$ && "$HOSTINGER_DEPLOY_PATH" != *'..'* && "$HOSTINGER_DEPLOY_PATH" != */public_html* && "$HOSTINGER_DEPLOY_PATH" != */ ]] || { echo 'Set the private absolute site path above public_html, without a trailing slash.' >&2; exit 1; }
[[ "$HOSTINGER_APP_URL" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?$ ]] || { echo 'Set an exact HTTPS origin, without a trailing slash or path.' >&2; exit 1; }
[[ "$php_binary" =~ ^[A-Za-z0-9_./-]+$ && "$php_binary" != *'..'* && "$php_binary" != -* ]] || { echo 'Invalid PHP CLI executable.' >&2; exit 1; }
[[ "$GITHUB_SHA" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid commit SHA.' >&2; exit 1; }
[[ -s "$HOSTINGER_SSH_KEY_FILE" && -s "$HOSTINGER_KNOWN_HOSTS_FILE" && -f dist/m-rummy-release.tar.gz ]] || { echo 'SSH key, verified host keys, and release archive are required.' >&2; exit 1; }

ssh_options=(-F /dev/null -i "$HOSTINGER_SSH_KEY_FILE" -o "UserKnownHostsFile=$HOSTINGER_KNOWN_HOSTS_FILE" -o StrictHostKeyChecking=yes -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20)
destination="$HOSTINGER_SSH_USER@$HOSTINGER_SSH_HOST"
stage="$HOSTINGER_DEPLOY_PATH/.rummy-staging/$GITHUB_SHA"
ssh "${ssh_options[@]}" -p "$port" "$destination" "umask 077; mkdir -p -- '$stage'"
scp "${ssh_options[@]}" -P "$port" dist/m-rummy-release.tar.gz "$destination:$stage/release.tar.gz"
ssh "${ssh_options[@]}" -p "$port" "$destination" "tar -xzf '$stage/release.tar.gz' -C '$stage' && '$php_binary' '$stage/install.php' '$HOSTINGER_DEPLOY_PATH' '$stage' '$HOSTINGER_APP_URL' '$GITHUB_SHA'"

# Do not print the response: /api/session includes browser credentials.
curl --silent --show-error --fail --proto '=https' --tlsv1.2 --max-time 30 --retry 3 --retry-delay 2 \
  "$HOSTINGER_APP_URL/api/session?deployment=$GITHUB_SHA" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert isinstance(d.get("id"),str) and isinstance(d.get("csrf"),str) and "account" in d, "Unexpected application response"; print("Hostinger HTTPS/API smoke check passed.")'
ssh "${ssh_options[@]}" -p "$port" "$destination" "rm -rf -- '$stage'"
