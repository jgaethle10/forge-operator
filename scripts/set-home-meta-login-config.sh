#!/usr/bin/env bash
# Configure Facebook Login for Business without touching the existing App Secret.
set +x
set -euo pipefail
umask 077
if [[ "$EUID" -ne 0 ]]; then
  echo "Run with sudo on the Evercraft-owned Penguin host." >&2
  exit 2
fi
if [[ "$#" -ne 1 ]]; then
  echo "Usage: sudo bash scripts/set-home-meta-login-config.sh NUMERIC_META_CONFIG_ID" >&2
  exit 2
fi
CONFIG_ID="$1"
if [[ ! "$CONFIG_ID" =~ ^[0-9]{5,30}$ ]]; then
  echo "Meta Configuration ID must be numeric." >&2
  exit 2
fi
ENV_FILE=/etc/evercraft/home.env
if [[ ! -f "$ENV_FILE" || -L "$ENV_FILE" || "$(stat -c '%a' "$ENV_FILE")" != "600" ]]; then
  echo "Private Evercraft Home environment is missing or incorrectly permissioned." >&2
  exit 3
fi
python3 - "$ENV_FILE" "$CONFIG_ID" <<'PY'
import os, pathlib, re, sys, tempfile
file, config_id = sys.argv[1:]
p = pathlib.Path(file)
stat = p.lstat()
if not p.is_file() or p.is_symlink() or stat.st_mode & 0o077:
    raise SystemExit('home_env_not_private_regular_file')
if not re.fullmatch(r'[0-9]{5,30}', config_id):
    raise SystemExit('invalid_meta_login_config_id')
data = p.read_text()
if not re.search(r'^CLIP_META_APP_ID=[0-9]{5,30}$', data, re.M) or not re.search(r'^CLIP_META_APP_SECRET_FILE=/',data,re.M):
    raise SystemExit('meta_app_not_configured_first')
if len(re.findall(r'^CLIP_META_LOGIN_CONFIG_ID=',data,re.M)) > 1:
    raise SystemExit('duplicate_meta_login_config_id')
if re.search(r'^CLIP_META_LOGIN_CONFIG_ID=',data,re.M):
    updated = re.sub(r'^CLIP_META_LOGIN_CONFIG_ID=.*$', 'CLIP_META_LOGIN_CONFIG_ID='+config_id, data, count=1, flags=re.M)
else:
    updated = data.rstrip('\n') + '\nCLIP_META_LOGIN_CONFIG_ID=' + config_id + '\n'
fd, temp = tempfile.mkstemp(prefix='.meta-login-config-', dir=p.parent)
try:
    with os.fdopen(fd,'w') as f:
        f.write(updated)
        f.flush()
        os.fchmod(f.fileno(),0o600)
        os.fchown(f.fileno(),stat.st_uid,stat.st_gid)
        os.fsync(f.fileno())
    os.replace(temp,file)
except:
    if os.path.exists(temp): os.unlink(temp)
    raise
print('Meta Login Configuration ID saved; app secret and existing Home settings preserved.')
PY
systemctl restart evercraft-home.service
if ! systemctl is-active --quiet evercraft-home.service; then
  echo "Home restart failed; check sudo systemctl status evercraft-home.service." >&2
  exit 5
fi
echo "Evercraft Home active. Return to Facebook Pages > Connect Facebook once."
