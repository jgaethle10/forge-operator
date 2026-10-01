#!/usr/bin/env bash
set -euo pipefail

RELAY_USER="evercraft-relay"
PUBLIC_KEY_FILE=""
TUNNEL_PORT=18787
STATE_DIR="/var/lib/evercraft/relay-enrollment"

usage(){
  cat <<'EOF'
Usage:
  sudo scripts/install-fabric-relay-account.sh \
    --public-key-file /path/to/chromebook-relay.pub \
    [--relay-user evercraft-relay] \
    [--tunnel-port 18787]

Creates a least-privilege SSH relay account for Evercraft Fabric.

The account:
  - accepts public-key authentication only
  - cannot allocate a TTY
  - cannot open shell/login/subsystem sessions (MaxSessions 0)
  - may create remote TCP forwarding only
  - may listen only on 127.0.0.1:<tunnel-port>
  - may not expose GatewayPorts
  - records a non-secret enrollment receipt with the SSH key fingerprint
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --relay-user) RELAY_USER="${2:-}"; shift 2 ;;
    --public-key-file) PUBLIC_KEY_FILE="${2:-}"; shift 2 ;;
    --tunnel-port) TUNNEL_PORT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "${EUID}" -eq 0 ]] || { echo "ERROR: run with sudo" >&2; exit 2; }
[[ "$RELAY_USER" =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || { echo "ERROR: invalid relay user" >&2; exit 2; }
[[ -f "$PUBLIC_KEY_FILE" ]] || { echo "ERROR: public key file not found" >&2; exit 2; }
[[ "$TUNNEL_PORT" =~ ^[0-9]+$ ]] && (( TUNNEL_PORT >= 1 && TUNNEL_PORT <= 65535 )) || {
  echo "ERROR: invalid tunnel port" >&2
  exit 2
}
command -v sshd >/dev/null 2>&1 || { echo "ERROR: openssh-server is required on relay node" >&2; exit 2; }
command -v ssh-keygen >/dev/null 2>&1 || { echo "ERROR: ssh-keygen is required" >&2; exit 2; }

PUBKEY="$(tr -d '\r\n' <"$PUBLIC_KEY_FILE")"
[[ "$PUBKEY" =~ ^(ssh-ed25519|sk-ssh-ed25519@openssh.com|ecdsa-sha2-nistp256|sk-ecdsa-sha2-nistp256@openssh.com)[[:space:]] ]] || {
  echo "ERROR: relay key type rejected; use an Ed25519 or modern ECDSA public key" >&2
  exit 2
}

RELAY_HOME="/var/lib/$RELAY_USER"
if ! id "$RELAY_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$RELAY_HOME" --shell /bin/bash "$RELAY_USER"
fi
passwd -l "$RELAY_USER" >/dev/null 2>&1 || true

install -d -o "$RELAY_USER" -g "$RELAY_USER" -m 0700 "$RELAY_HOME/.ssh"
KEY_OPTIONS="restrict,port-forwarding,permitlisten=\"127.0.0.1:$TUNNEL_PORT\",command=\"/usr/bin/false\""
printf '%s %s\n' "$KEY_OPTIONS" "$PUBKEY" >"$RELAY_HOME/.ssh/authorized_keys"
chown "$RELAY_USER:$RELAY_USER" "$RELAY_HOME/.ssh/authorized_keys"
chmod 0600 "$RELAY_HOME/.ssh/authorized_keys"

install -d -m 0755 /etc/ssh/sshd_config.d
CONFIG="/etc/ssh/sshd_config.d/90-evercraft-fabric-relay.conf"
cat >"$CONFIG" <<EOF
Match User $RELAY_USER
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PubkeyAuthentication yes
    AllowTcpForwarding remote
    GatewayPorts no
    PermitListen 127.0.0.1:$TUNNEL_PORT
    PermitTTY no
    X11Forwarding no
    AllowAgentForwarding no
    MaxSessions 0
EOF

if ! sshd -t -f /etc/ssh/sshd_config; then
  echo "ERROR: sshd configuration validation failed" >&2
  exit 3
fi

systemctl reload ssh.service 2>/dev/null || systemctl reload sshd.service 2>/dev/null || {
  echo "ERROR: could not reload ssh daemon" >&2
  exit 4
}

install -d -m 0750 "$STATE_DIR"
FINGERPRINT="$(ssh-keygen -lf "$PUBLIC_KEY_FILE" -E sha256 | awk '{print $2}')"
cat >"$STATE_DIR/latest.json" <<EOF
{
  "schema":"evercraft.fabric-relay-enrollment.v1",
  "relay_user":"$RELAY_USER",
  "remote_bind":"127.0.0.1",
  "remote_port":$TUNNEL_PORT,
  "authentication":"publickey_only",
  "allow_tcp_forwarding":"remote",
  "gateway_ports":false,
  "max_sessions":0,
  "public_key_fingerprint":"$FINGERPRINT",
  "secret_material_exposed":false,
  "observed_at":"$(date -u +%FT%TZ)"
}
EOF
chmod 0640 "$STATE_DIR/latest.json"

echo "Evercraft relay account enrolled."
cat "$STATE_DIR/latest.json"
