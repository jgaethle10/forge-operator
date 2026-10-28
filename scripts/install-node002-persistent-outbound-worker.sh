#!/usr/bin/env bash
set -Eeuo pipefail

# User-space installation only. No root commands, no WSL boot-task creation,
# no public ingress, no changes to existing Node002 shadow telemetry services.
# Use only a reviewed detached Forge worktree (not the mutable daily checkout).

usage(){
  echo "Usage: bash scripts/install-node002-persistent-outbound-worker.sh --repo-root /path/to/reviewed-worktree --expected-ref FULL_40_SHA --activate" >&2
}

REPO_ROOT=""
EXPECTED=""
ACTIVATE=false
while (($#)); do
  case "$1" in
    --repo-root) [[ $# -ge 2 ]] || { usage;exit 2; }; REPO_ROOT="$2"; shift 2;;
    --expected-ref) [[ $# -ge 2 ]] || { usage;exit 2; }; EXPECTED="$2"; shift 2;;
    --activate) ACTIVATE=true; shift;;
    *) usage; exit 2;;
  esac
done

if [[ "$ACTIVATE" != true || -z "$REPO_ROOT" || ! "$EXPECTED" =~ ^[a-f0-9]{40}$ ]]; then
  usage
  exit 2
fi
if ((EUID==0));then echo "HOLD: run as the ordinary NextGen Ubuntu user, never sudo." >&2;exit 3;fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
if [[ ! -d "$REPO_ROOT/.git" && ! -f "$REPO_ROOT/.git" ]];then
  echo "HOLD: reviewed detached Forge worktree not found." >&2;exit 3
fi
if [[ "$REPO_ROOT" =~ [[:space:]] ]];then
  echo "HOLD: worktree path must not contain spaces for safe unit generation." >&2;exit 3
fi
ACTUAL="$(git -C "$REPO_ROOT" rev-parse HEAD)"
if [[ "$ACTUAL" != "$EXPECTED" ]];then
  echo "HOLD: worktree source SHA mismatch." >&2;exit 3
fi
if [[ "$(git -C "$REPO_ROOT" status --porcelain --untracked-files=no)" != "" ]];then
  echo "HOLD: worktree has modified tracked files." >&2;exit 3
fi
if ! command -v systemctl >/dev/null || ! systemctl --user show-environment >/dev/null 2>&1; then
  echo "HOLD: WSL Ubuntu user systemd is not active." >&2;exit 4
fi
NODE_BIN="$(command -v node)"
if [[ -z "$NODE_BIN" ]];then echo "HOLD: Node.js not found." >&2;exit 4;fi
if ! "$NODE_BIN" -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(2)';then
  echo "HOLD: Node.js >=20 required." >&2;exit 4
fi

# Prevent a second agent while a bounded canary or another admission service
# could still be connected for the same device.
if pgrep -u "$(id -u)" -f '[n]ode002-live-bridge-canary\.mjs' >/dev/null 2>&1;then
  echo "HOLD: previous four-minute Node002 agent still running. Stop it first." >&2;exit 5
fi
if pgrep -u "$(id -u)" -f '[r]emote-admission-service\.mjs' >/dev/null 2>&1;then
  echo "HOLD: an existing remote admission agent is running. Avoid competing sessions." >&2;exit 5
fi

if ! "$NODE_BIN" "$REPO_ROOT/scripts/node002-persistent-outbound-worker.mjs" --preflight;then
  echo "HOLD: verified local NodeSeed and exact authorized public broker are prerequisites." >&2;exit 5
fi

UNIT_NAME="evercraft-node002-outbound-worker.service"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_FILE="$UNIT_DIR/$UNIT_NAME"
if [[ -e "$UNIT_FILE" ]] && ! grep -Fq 'Evercraft NextGen owner-authorized SHA256-only outbound worker' "$UNIT_FILE";then
  echo "HOLD: existing unit with matching name is not owned by this installer." >&2;exit 6
fi

mkdir -p "$UNIT_DIR"
umask 077
cat > "$UNIT_FILE" <<EOF
[Unit]
Description=Evercraft NextGen owner-authorized SHA256-only outbound worker
After=network-online.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=$NODE_BIN $REPO_ROOT/scripts/node002-persistent-outbound-worker.mjs --serve
Restart=always
RestartSec=15
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF
chmod 0600 "$UNIT_FILE"
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

echo "SERVICE INSTALLED. Enable/start requested; connection needs separate verification."
systemctl --user show "$UNIT_NAME" -p Id -p ActiveState -p NRestarts --no-pager
echo "Worker status command:"
echo "$NODE_BIN $REPO_ROOT/scripts/node002-persistent-outbound-worker.mjs --status"
echo "Stop command: systemctl --user stop $UNIT_NAME"
echo "IMPORTANT: Windows/WSL shutdown stops workers until WSL starts again."
