#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=""
RUN_USER=""
PORT="8791"
STATE_DIR="/var/lib/evercraft/payments"
CREDENTIAL_STATE_DIR="/var/lib/evercraft/home/credentials"
SECRET_DIR="/var/lib/evercraft/raven-secrets"
TOKEN_FILE="$SECRET_DIR/payments-token"
ENV_FILE="/etc/evercraft/raven-payments.env"
FABRIC_ENV="/etc/evercraft/fabric.env"
PUBLIC_ENV="/etc/evercraft/public-edge.env"
SERVICE="evercraft-raven-payments.service"

usage(){
  cat <<'EOF'
Usage:
  scripts/install-raven-payments-runtime.sh --repo-root /path/to/forge-operator [--user USER]

Installs the owned loopback Raven Nexus payment-intent runtime.
The service owns provider settlement credentials; Evercraft Fabric receives
only a loopback URL and a private bearer-token file path.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    --user) RUN_USER="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:-}"; shift 2 ;;
    --credential-state-dir) CREDENTIAL_STATE_DIR="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: Raven Payments installer must run as root." >&2
  exit 2
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERROR: --repo-root must point to the Forge Operator checkout." >&2
  exit 2
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
if [[ -z "$RUN_USER" ]]; then RUN_USER="$(stat -c '%U' "$REPO_ROOT")"; fi
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "ERROR: Raven Payments must run as the ordinary Evercraft runtime user." >&2
  exit 2
fi
if [[ ! "$PORT" =~ ^[0-9]{2,5}$ ]]; then
  echo "ERROR: invalid port" >&2
  exit 2
fi
if [[ ! -f "$REPO_ROOT/systemia/payments/raven-payment-runtime.mjs" ]]; then
  echo "ERROR: Raven payment runtime source missing." >&2
  exit 2
fi
if [[ ! -f "$FABRIC_ENV" ]]; then
  echo "ERROR: Fabric environment is not installed." >&2
  exit 3
fi

NODE_BIN="$(command -v node)"
PUBLIC_HOST=""
if [[ -f "$PUBLIC_ENV" ]]; then
  PUBLIC_HOST="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$PUBLIC_ENV" | tail -1)"
fi
PUBLIC_ORIGIN="${PUBLIC_HOST:+https://$PUBLIC_HOST}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-https://fabric.systemiacommandcenters.com}"

install -d -o "$RUN_USER" -g "$RUN_USER" -m 0700 "$STATE_DIR" "$STATE_DIR/orders"
install -d -o root -g "$RUN_USER" -m 0750 "$SECRET_DIR"

if [[ ! -s "$TOKEN_FILE" ]]; then
  tmp="$(mktemp)"
  "$NODE_BIN" -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url')+'\\n')" > "$tmp"
  install -o root -g "$RUN_USER" -m 0640 "$tmp" "$TOKEN_FILE"
  rm -f "$tmp"
fi
chmod 0640 "$TOKEN_FILE"

cat > "$ENV_FILE" <<EOF
EVERCRAFT_RAVEN_PAYMENTS_HOST=127.0.0.1
EVERCRAFT_RAVEN_PAYMENTS_PORT=$PORT
EVERCRAFT_RAVEN_PAYMENTS_TOKEN_FILE=$TOKEN_FILE
EVERCRAFT_PAYMENT_STATE_DIR=$STATE_DIR
EVERCRAFT_CREDENTIAL_STATE_DIR=$CREDENTIAL_STATE_DIR
EVERCRAFT_PAYMENT_PUBLIC_ORIGIN=$PUBLIC_ORIGIN
EOF
chmod 0600 "$ENV_FILE"

cat > "/etc/systemd/system/$SERVICE" <<EOF
[Unit]
Description=Evercraft Raven Nexus Payments
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$REPO_ROOT
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_BIN $REPO_ROOT/systemia/payments/raven-payment-runtime.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths=$STATE_DIR

[Install]
WantedBy=multi-user.target
EOF

tmp_env="$(mktemp)"
awk -F= '
  $1 != "EVERCRAFT_PAYMENT_INTENT_URL" &&
  $1 != "EVERCRAFT_PAYMENT_INTENT_TOKEN_FILE" &&
  $1 != "EVERCRAFT_PAYMENT_INTENT_TOKEN" { print }
' "$FABRIC_ENV" > "$tmp_env"
printf 'EVERCRAFT_PAYMENT_INTENT_URL=http://127.0.0.1:%s/v1/purchase-intents\\n' "$PORT" >> "$tmp_env"
printf 'EVERCRAFT_PAYMENT_INTENT_TOKEN_FILE=%s\\n' "$TOKEN_FILE" >> "$tmp_env"
install -o root -g root -m 0600 "$tmp_env" "$FABRIC_ENV"
rm -f "$tmp_env"

systemctl daemon-reload
systemctl enable --now "$SERVICE"

for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/health" >/tmp/evercraft-raven-payments-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

"$NODE_BIN" -e "
  const h=require('/tmp/evercraft-raven-payments-health.json');
  if(h.ok!==true) process.exit(2);
  if(h.service!=='evercraft-raven-payments') process.exit(3);
  if(h.loopback_only!==true) process.exit(4);
  if(h.canonical_order_owner!=='evercraft_payments') process.exit(5);
  if(h.provider_boundary!=='raven_nexus') process.exit(6);
  if(h.settlement_adapter!=='stripe') process.exit(7);
  if(h.direct_provider_checkout_allowed!==false) process.exit(8);
  if(h.base44_required!==false) process.exit(9);
"

echo "Evercraft Raven Payments resident is ready."
echo "Loopback purchase-intent: http://127.0.0.1:$PORT/v1/purchase-intents"
echo "Stripe adapter configured: $("$NODE_BIN" -e "const h=require('/tmp/evercraft-raven-payments-health.json');process.stdout.write(String(h.settlement_adapter_configured===true))")"
echo "No provider secret was written to Fabric configuration."
