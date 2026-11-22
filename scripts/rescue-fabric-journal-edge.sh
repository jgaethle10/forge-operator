#!/usr/bin/env bash
set -euo pipefail

# Legacy rescue is now a read-only diagnostic, not a deployment shortcut.
# Unpublished Journal or Worlds edits must never be discarded automatically.
REMOTE="origin"
REPO_ROOT=""
SERVICE="evercraft-fabric.service"

usage() {
  cat <<'EOF'
Usage:
  sudo bash rescue-fabric-journal-edge.sh [--repo-root /path/to/forge-operator]

READ-ONLY: inspect the approved owner checkout for Journal or source changes.
This command never restores, cleans, resets, fetches, merges, restarts,
installs services or writes a misleading recovery receipt.
After intentional source reconciliation use the guarded Fabric updater.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="\${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "\${EUID}" -ne 0 ]]; then
  echo "ERROR: run with sudo to inspect the resident-owned checkout" >&2
  exit 2
fi

if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(systemctl show -p WorkingDirectory --value "$SERVICE" 2>/dev/null || true)"
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "HOLD: Forge checkout not resolved; pass --repo-root explicitly" >&2
  exit 2
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd -P)"
RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "HOLD: Forge checkout must be owned by an ordinary runtime user" >&2
  exit 2
fi

as_user() { runuser -u "$RUN_USER" -- "$@"; }

remote_url="$(as_user git -C "$REPO_ROOT" remote get-url "$REMOTE")"
if [[ ! "$remote_url" =~ ^(https://github\.com/|git@github\.com:)jgaethle10/forge-operator(\.git)?$ ]]; then
  echo "HOLD: refusing recovery because origin is not the authorized Forge repository" >&2
  exit 3
fi

classifier="$REPO_ROOT/scripts/classify-fabric-checkout-dirt.mjs"
if [[ ! -f "$classifier" || -L "$classifier" ]]; then
  echo "HOLD: required checkout-drift classifier is missing or unsafe" >&2
  exit 4
fi

status="$(as_user git -C "$REPO_ROOT" status --porcelain=v1 --untracked-files=all)"
blocking="$(printf '%s\n' "$status" | as_user node "$classifier" --blocking-lines)"
journal_dirty="$(printf '%s\n' "$status" | as_user node "$classifier" --journal-dirty)"

echo "=== EVERCRAFT JOURNAL RESCUE SAFETY PREFLIGHT ==="
echo "checked_out_release=$(as_user git -C "$REPO_ROOT" rev-parse --short HEAD)"
echo "service=$(systemctl is-active "$SERVICE" 2>/dev/null || true)"
echo "changed_entries=$(printf '%s\n' "$status" | sed '/^$/d' | wc -l)"
echo "journal_dirty=$journal_dirty"

if [[ -n "$blocking" || "$journal_dirty" == "true" ]]; then
  echo "HOLD: unpublished Journal or source work remains." >&2
  echo "HOLD: preserve and independently reconcile every affected file before updating." >&2
  echo "HOLD: no files changed by this preflight." >&2
  exit 4
fi

echo "PREFLIGHT: no source or Journal blockers observed."
echo "NO_DEPLOY: this retired rescue performs no mutation; only use the guarded Fabric updater."
