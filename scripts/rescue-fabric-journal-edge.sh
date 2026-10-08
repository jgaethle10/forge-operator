#!/usr/bin/env bash
set -euo pipefail

REMOTE="origin"
BRANCH="main"
SERVICE="evercraft-fabric.service"
EXPECTED_ORIGIN="https://fabric.systemiacommandcenters.com/journal"
REPO_ROOT=""

usage(){
  cat <<'EOF'
Usage:
  sudo bash rescue-fabric-journal-edge.sh [--repo-root /path/to/forge-operator]

One-time bounded recovery for an owned Fabric checkout with verified clean
Journal source and working tree. Dirty or ignored publication evidence forces a
hold without deletion. Does not rewrite history or touch credentials.

If --repo-root is omitted, the script reads WorkingDirectory from
evercraft-fabric.service.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root) REPO_ROOT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run with sudo; recovery must reconcile the resident Fabric service." >&2
  exit 2
fi

if [[ -z "$REPO_ROOT" ]]; then
  REPO_ROOT="$(systemctl show -p WorkingDirectory --value "$SERVICE" 2>/dev/null || true)"
fi
if [[ -z "$REPO_ROOT" || ! -d "$REPO_ROOT/.git" ]]; then
  echo "ERROR: could not resolve the Forge checkout. Pass --repo-root explicitly." >&2
  exit 2
fi
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
RUN_USER="$(stat -c '%U' "$REPO_ROOT")"
if [[ -z "$RUN_USER" || "$RUN_USER" == "root" ]]; then
  echo "ERROR: Forge checkout must be owned by the ordinary Evercraft runtime user." >&2
  exit 2
fi

as_user(){
  runuser -u "$RUN_USER" -- "$@"
}

remote_url="$(as_user git -C "$REPO_ROOT" remote get-url "$REMOTE")"
if [[ ! "$remote_url" =~ ^(https://github\.com/|git@github\.com:)jgaethle10/forge-operator(\.git)?$ ]]; then
  echo "ERROR: refusing recovery because origin is not the authorized Forge repository." >&2
  exit 3
fi

echo "=== EVERCRAFT JOURNAL EDGE RESCUE ==="
echo "repo=$REPO_ROOT"
echo "user=$RUN_USER"
echo "before=$(as_user git -C "$REPO_ROOT" rev-parse HEAD)"

# Rescue must not discard the user's only copy of a Journal story or receipt.
# Untracked, tracked-dirty and legacy ignored paths are all protected. Operator
# reconciliation should archive and review evidence outside this automated lane.
dirty="$(as_user git -C "$REPO_ROOT" status --porcelain --untracked-files=all)"
journal_ignored="$(as_user git -C "$REPO_ROOT" ls-files --others --ignored --exclude-standard -- public/journal)"
if [[ -n "$journal_ignored" ]]; then
  echo "HOLD: ignored Journal publication evidence found. No files were deleted." >&2
  exit 4
fi
DIRT_CLASSIFIER="$REPO_ROOT/scripts/classify-fabric-checkout-dirt.mjs"
if [[ ! -f "$DIRT_CLASSIFIER" ]]; then
  echo "HOLD: missing checkout-drift classifier; cannot safely recover." >&2
  exit 4
fi
blocking="$(printf '%s\n' "$dirty" | as_user node "$DIRT_CLASSIFIER" --blocking-lines)"
journal_dirty="$(printf '%s\n' "$dirty" | as_user node "$DIRT_CLASSIFIER" --journal-dirty)"
if [[ -n "$blocking" || "$journal_dirty" == "true" ]]; then
  echo "HOLD: source or Journal evidence is dirty; refusing recovery without any deletion." >&2
  [[ -n "$blocking" ]] && printf '%s\n' "$blocking" >&2
  exit 4
fi

before="$(as_user git -C "$REPO_ROOT" rev-parse HEAD)"
as_user git -C "$REPO_ROOT" fetch --prune "$REMOTE" "$BRANCH"
target="$(as_user git -C "$REPO_ROOT" rev-parse "$REMOTE/$BRANCH")"

if ! as_user git -C "$REPO_ROOT" merge-base --is-ancestor "$before" "$target"; then
  echo "HOLD: main is not a fast-forward from the deployed checkout." >&2
  exit 5
fi

if [[ "$before" != "$target" ]]; then
  as_user git -C "$REPO_ROOT" merge --ff-only "$REMOTE/$BRANCH"
fi

# Ensure future recovery uses the hardened resident updater.
if [[ -f "$REPO_ROOT/scripts/install-fabric-self-update.sh" ]]; then
  bash "$REPO_ROOT/scripts/install-fabric-self-update.sh" --repo-root "$REPO_ROOT" --cadence 5min >/dev/null
fi

systemctl restart "$SERVICE"

health=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if health="$(curl -fsS --max-time 5 http://127.0.0.1:8787/health 2>/dev/null)"; then
    break
  fi
  sleep 1
done
[[ -n "$health" ]] || { echo "ERROR: Fabric did not recover local health." >&2; exit 6; }

printf '%s' "$health" | runuser -u "$RUN_USER" -- node -e "
  let body='';
  process.stdin.on('data',d=>body+=d);
  process.stdin.on('end',()=>{
    const h=JSON.parse(body||'{}');
    if(h.ok!==true||h.service!=='evercraft-fabric-local'||h.journal_mirror_ready!==true) process.exit(2);
  });
"

index="$(curl -fsS --max-time 5 http://127.0.0.1:8787/journal/index.json)"
printf '%s' "$index" | runuser -u "$RUN_USER" -- env EXPECTED_ORIGIN="$EXPECTED_ORIGIN" node -e "
  let body='';
  process.stdin.on('data',d=>body+=d);
  process.stdin.on('end',()=>{
    const x=JSON.parse(body||'{}');
    if(x.schema!=='evercraft.journal.index.v1'||x.live_edition!==true||!x.stories?.length) process.exit(2);
    const expected=process.env.EXPECTED_ORIGIN.replace(/\/$/,'')+'/';
    if(!String(x.stories[0].canonical_url||'').startsWith(expected)) process.exit(3);
  });
"

mkdir -p /var/lib/evercraft/fabric-update
after="$(as_user git -C "$REPO_ROOT" rev-parse HEAD)"
observed_at="$(date -u +%FT%TZ)"
cat > /var/lib/evercraft/fabric-update/journal-rescue.json <<EOF
{
  "schema":"evercraft.fabric-journal-rescue.v1",
  "state":"recovered",
  "from_ref":"$before",
  "release_ref":"$after",
  "canonical_origin":"$EXPECTED_ORIGIN",
  "source_changes_discarded":false,
  "generated_journal_reconciled":false,
  "journal_clean_verified":true,
  "observed_at":"$observed_at"
}
EOF
chmod 0640 /var/lib/evercraft/fabric-update/journal-rescue.json

echo "Evercraft Journal edge recovered at $after"
echo "Local canonical origin verified: $EXPECTED_ORIGIN"
