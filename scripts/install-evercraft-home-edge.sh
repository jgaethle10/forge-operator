#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
RUN_USER=""
HOME_PORT="4310"
PUBLIC_ENV="/etc/evercraft/public-edge.env"
HOME_ENV="/etc/evercraft/home.env"
HOME_STATE="/var/lib/evercraft/home"
HOME_SECRET_DIR="/var/lib/evercraft/home-secrets"
HOME_SERVICE="evercraft-home.service"
CADDYFILE="/etc/evercraft/Caddyfile"

usage(){
  cat <<'EOF'
Usage:
  scripts/install-evercraft-home-edge.sh --repo-root /path/to/forge-operator [--user USER]

Installs the private Evercraft Home resident on the already-owned Fabric HTTPS edge.
No new cloud host or paid infrastructure is created.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Evercraft Home edge installer must run as root." >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERROR: --repo-root must point to the Forge Operator checkout." >&2
  exit 2
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
RELEASE_REF="$(git -c safe.directory="$REPO_ROOT" -C "$REPO_ROOT" rev-parse HEAD)"
if [[ ! "$RELEASE_REF" =~ ^[a-f0-9]{40}$ ]]; then
  echo "ERROR: Forge release ref is invalid." >&2
  exit 3
fi
if [[ -z "$RUN_USER" ]]; then
  RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
fi
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "ERROR: Home runtime must use the ordinary Evercraft checkout owner." >&2
  exit 2
fi
if [[ ! -s "$PUBLIC_ENV" ]]; then
  echo "ERROR: owned Fabric public-edge environment is not installed." >&2
  exit 3
fi
if [[ ! -f "$REPO_ROOT/systemia/evercraft-home/owner-claim.json" ]]; then
  echo "ERROR: owner-claim manifest is missing." >&2
  exit 3
fi

NODE_BIN="$(command -v node)"
PUBLIC_HOST="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$PUBLIC_ENV" | tail -1)"
ACME_EMAIL="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$PUBLIC_ENV" | tail -1)"
if [[ -z "$PUBLIC_HOST" || -z "$ACME_EMAIL" ]]; then
  echo "ERROR: public edge host/email are not configured." >&2
  exit 3
fi

CLAIM_JSON="$REPO_ROOT/systemia/evercraft-home/owner-claim.json"
CLAIM_SHA="$("$NODE_BIN" -e "const x=require(process.argv[1]);if(!/^[a-f0-9]{64}$/.test(x.claim_sha256||''))process.exit(2);process.stdout.write(x.claim_sha256)" "$CLAIM_JSON")"
OWNER_SUBJECT="$("$NODE_BIN" -e "const x=require(process.argv[1]);process.stdout.write(String(x.subject_ref||'user:owner'))" "$CLAIM_JSON")"
OWNER_LOGIN="$("$NODE_BIN" -e "const x=require(process.argv[1]);process.stdout.write(String(x.login||'owner'))" "$CLAIM_JSON")"
OWNER_DISPLAY="$("$NODE_BIN" -e "const x=require(process.argv[1]);process.stdout.write(String(x.display_name||'Owner'))" "$CLAIM_JSON")"

install -d -o "$RUN_USER" -g "$RUN_USER" -m 0700 "$HOME_STATE" "$HOME_STATE/identity" "$HOME_STATE/passport" "$HOME_STATE/credentials"
install -d -o root -g root -m 0700 "$HOME_SECRET_DIR"

IDENTITY_SECRET_FILE="$HOME_SECRET_DIR/identity-secret"
if [[ ! -s "$IDENTITY_SECRET_FILE" ]]; then
  umask 077
  "$NODE_BIN" -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url')+'\n')" > "$IDENTITY_SECRET_FILE"
fi
chmod 0600 "$IDENTITY_SECRET_FILE"
IDENTITY_SECRET="$(tr -d '\r\n' < "$IDENTITY_SECRET_FILE")"
if [[ "${#IDENTITY_SECRET}" -lt 32 ]]; then
  echo "ERROR: generated identity signing material is invalid." >&2
  exit 4
fi

cat > "$HOME_ENV" <<EOF
EVERCRAFT_HOME_HOST=127.0.0.1
EVERCRAFT_HOME_PORT=$HOME_PORT
EVERCRAFT_HOME_AUTH=passport
EVERCRAFT_HOME_OPERATOR=$OWNER_DISPLAY
EVERCRAFT_IDENTITY_KEY_ID=edge-home-2026-10
EVERCRAFT_IDENTITY_SECRET=$IDENTITY_SECRET
EVERCRAFT_IDENTITY_STATE_DIR=$HOME_STATE/identity
EVERCRAFT_PASSPORT_STATE_DIR=$HOME_STATE/passport
EVERCRAFT_CREDENTIAL_STATE_DIR=$HOME_STATE/credentials
EVERCRAFT_HOME_SESSION_TTL_SECONDS=1800
EVERCRAFT_HOME_COOKIE_SECURE=true
EVERCRAFT_HOME_COOKIE_PATH=/home
EVERCRAFT_HOME_RELEASE_REF=$RELEASE_REF
EVERCRAFT_OWNER_CLAIM_SHA256=$CLAIM_SHA
EVERCRAFT_OWNER_SUBJECT_REF=$OWNER_SUBJECT
EVERCRAFT_OWNER_LOGIN=$OWNER_LOGIN
EVERCRAFT_OWNER_DISPLAY_NAME=$OWNER_DISPLAY
SYSTEMIA_ORIGIN=
RAVEN_ORIGIN=
YARD_ORIGIN=
NETWORK_ORIGIN=
SOVEREIGN_AI_ORIGIN=
EXTERNAL_AI_ORIGIN=
LEGACY_APP_ORIGIN=
EOF
chmod 0600 "$HOME_ENV"

cat > "/etc/systemd/system/$HOME_SERVICE" <<EOF
[Unit]
Description=Evercraft Personal Home
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$HOME_ENV
ExecStart=$NODE_BIN $REPO_ROOT/systemia/evercraft-home/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only

[Install]
WantedBy=multi-user.target
EOF

# Shared edge ownership: Home must not replace broker/Fabric routes on updates.
# Only provision the initial template if no Caddy configuration exists.
# A nonempty configuration without Home/Fabric handlers is not ours to destroy.
if [[ -s "$CADDYFILE" ]]; then
  if ! grep -Fq 'handle_path /home/*' "$CADDYFILE" ||
     ! grep -Fq 'reverse_proxy 127.0.0.1:4310' "$CADDYFILE" ||
     ! grep -Fq 'reverse_proxy 127.0.0.1:8787' "$CADDYFILE"; then
    echo "HOLD: existing shared Caddy configuration does not contain the expected Home + Fabric routes; will not overwrite." >&2
    exit 7
  fi
  echo "Evercraft Home: preserving the shared public Caddyfile (including broker routes)."
else
cat > "$CADDYFILE" <<'EOF'
{
  http_port 18080
  https_port 8443
  email {$EVERCRAFT_ACME_EMAIL}
  admin off
}

{$EVERCRAFT_PUBLIC_HOST} {
  @evercraftHomeRoot path /home
  redir @evercraftHomeRoot /home/ 308

  handle_path /home/* {
    reverse_proxy 127.0.0.1:4310
  }

  handle {
    reverse_proxy 127.0.0.1:8787
  }

  header {
    X-Content-Type-Options "nosniff"
    Referrer-Policy "no-referrer"
    Permissions-Policy "geolocation=(), microphone=(), camera=()"
    -Server
  }

  log {
    output file /var/log/caddy/evercraft-fabric-access.log
    format json
  }
}
EOF
fi

systemctl daemon-reload
systemctl enable "$HOME_SERVICE" >/dev/null
systemctl restart "$HOME_SERVICE"
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$HOME_PORT/api/health" >/tmp/evercraft-home-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done
"$NODE_BIN" -e "const h=require('/tmp/evercraft-home-health.json'); const expected=process.argv[1]; if(h.ok!==true||h.service!=='evercraft-home'||h.auth_mode!=='passport'||h.source_release_ref!==expected||h.owner_claim_available!==true&&h.owner_bootstrapped!==true) process.exit(2)" "$RELEASE_REF"

EVERCRAFT_PUBLIC_HOST="$PUBLIC_HOST" EVERCRAFT_ACME_EMAIL="$ACME_EMAIL" caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
systemctl restart evercraft-public-edge.service

echo "Evercraft Home edge resident is ready."
echo "Public front door: https://$PUBLIC_HOST/home/"
echo "Owner state is either already claimed or waiting for the one-time private claim code."
