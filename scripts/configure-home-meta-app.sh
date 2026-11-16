#!/usr/bin/env bash
# First-party Meta App setup on the existing Evercraft Home resident.
# Supply only the public App ID as an argument. Enter the secret privately on tty.
set +x
set -euo pipefail
umask 077

ENV_FILE=/etc/evercraft/home.env
STATE_ROOT=/var/lib/evercraft/home
PRIVATE_DIR="$STATE_ROOT/private"
SECRET_FILE="$PRIVATE_DIR/meta-app-secret"
REDIRECT_URI="https://fabric.systemiacommandcenters.com/home/api/clip/facebook/oauth/callback"

if [[ "$EUID" -ne 0 ]]; then
  echo "Run as root: sudo bash scripts/configure-home-meta-app.sh <numeric-app-id>" >&2
  exit 2
fi
APP_ID="$(printf "%s" "$@")"
if [[ "$#" -ne 1 || ! "$APP_ID" =~ ^[0-9]{5,30}$ ]]; then
  echo "Provide the numeric Meta App ID. Never pass the App Secret as an argument." >&2
  exit 2
fi
if [[ ! -f "$ENV_FILE" || -L "$ENV_FILE" || ! -d "$STATE_ROOT" || -L "$STATE_ROOT" ]]; then
  echo "Evercraft Home's owned resident or private configuration is missing." >&2
  exit 3
fi
if [[ "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then
  echo "Home env permissions must be 0600. No changes made." >&2
  exit 3
fi
RUN_USER="$(stat -c '%U' "$STATE_ROOT")"
RUN_GROUP="$(stat -c '%G' "$STATE_ROOT")"
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" || "$RUN_USER" == "UNKNOWN" ]]; then
  echo "Home state must belong to a non-root Evercraft resident user." >&2
  exit 3
fi

printf 'Meta App ID: %s\n' "$APP_ID"
printf 'Allowed callback: %s\n' "$REDIRECT_URI"
IFS= read -r -s -p "Paste Meta App Secret (input hidden): " META_SECRET < /dev/tty
printf '\n'
if [[ ! "$META_SECRET" =~ ^.{32,2048}$ ]]; then
  unset META_SECRET
  echo "Meta App Secret length invalid. No changes made." >&2
  exit 4
fi

install -d -m 0700 -o "$RUN_USER" -g "$RUN_GROUP" "$PRIVATE_DIR"
if [[ -L "$SECRET_FILE" ]]; then
  unset META_SECRET
  echo "Refusing a symlinked secret destination." >&2
  exit 4
fi
TMP="$(mktemp "$PRIVATE_DIR/.meta-secret-XXXXXXXX")"
trap 'rm -f "$TMP"' EXIT
printf '%s\n' "$META_SECRET" > "$TMP"
unset META_SECRET
chown "$RUN_USER:$RUN_GROUP" "$TMP"
chmod 0600 "$TMP"
mv -f "$TMP" "$SECRET_FILE"
trap - EXIT

# Change only Meta keys; preserve the existing owner, Passport, Clip, and release settings.
python3 - "$ENV_FILE" "$APP_ID" "$SECRET_FILE" "$REDIRECT_URI" <<'PY'
import os, pathlib, re, sys, tempfile
env, app_id, secret_file, callback = sys.argv[1:]
p = pathlib.Path(env)
st = p.lstat()
if not p.is_file() or p.is_symlink() or st.st_mode & 0o077:
    raise SystemExit('Home environment is not a private regular file')
original = p.read_text()
updates = {
    'CLIP_META_APP_ID': app_id,
    'CLIP_META_APP_SECRET_FILE': secret_file,
    'CLIP_META_REDIRECT_URI': callback,
    'CLIP_META_GRAPH_VERSION': 'v27.0',
}
for key in updates:
    if len(re.findall(rf'^{key}=', original, flags=re.MULTILINE)) > 1:
        raise SystemExit('Duplicate Meta configuration key: '+key)
result = []
seen = set()
for line in original.splitlines():
    match = re.fullmatch(r'([A-Z][A-Z0-9_]*)=(.*)', line)
    if match and match.group(1) in updates:
        key = match.group(1)
        result.append(key+'='+updates[key])
        seen.add(key)
    else:
        result.append(line)
for key, value in updates.items():
    if key not in seen:
        result.append(key+'='+value)
fd, tmp = tempfile.mkstemp(prefix='.meta-config-', dir=p.parent)
try:
    with os.fdopen(fd, 'w') as f:
        f.write('\n'.join(result).rstrip('\n')+'\n')
        f.flush()
        os.fsync(f.fileno())
        os.fchmod(f.fileno(), 0o600)
        os.fchown(f.fileno(), st.st_uid, st.st_gid)
    os.replace(tmp, env)
except:
    if os.path.exists(tmp): os.unlink(tmp)
    raise
print('Private Meta configuration installed; existing Home settings preserved.')
PY

systemctl restart evercraft-home.service
if ! systemctl is-active --quiet evercraft-home.service; then
  echo "Home restart failed. Check sudo systemctl status evercraft-home.service." >&2
  exit 5
fi
echo "Evercraft Home restarted successfully."
echo "Sign into Home and choose Facebook Pages > Connect Facebook once."
