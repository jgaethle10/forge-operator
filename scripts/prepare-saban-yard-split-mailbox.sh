#!/usr/bin/env bash
set -euo pipefail

# Explicit, one-time mailbox provisioning ONLY. Never chown existing private
# Saban or Yard trees; never touch services, timers, or broker authority.
MODE=check
SABAN_USER=jessegaethle10
YARD_USER=evercraft
MAILBOX=/var/lib/evercraft/saban-yard-mailbox

usage(){
  cat <<'USAGE'
Usage: sudo bash scripts/prepare-saban-yard-split-mailbox.sh [--check | --apply]
       [--saban-user USER] [--yard-user USER]

Default --check is read-only. --apply creates only:
  /var/lib/evercraft/saban-yard-mailbox       root:root              0711
    requests/                                  SABAN_USER:YARD_GROUP  2750
    outcomes/                                  YARD_USER:SABAN_GROUP  2750

The issuing account can write requests but cannot modify Yard's results.
The Yard account can write outcomes but cannot modify Saban's requests.
Files are group-readable and not world-readable. NO broker secrets cross
this boundary. Does not activate any service or modify private state roots.
USAGE
}
while (($#)); do
  case "$1" in
    --check) MODE=check; shift ;;
    --apply) MODE=apply; shift ;;
    --saban-user) [[ $# -ge 2 ]] || exit 2; SABAN_USER="$2"; shift 2 ;;
    --yard-user) [[ $# -ge 2 ]] || exit 2; YARD_USER="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
[[ "$EUID" -eq 0 ]] || { echo "ERROR: run with sudo" >&2; exit 2; }
[[ "$SABAN_USER" =~ ^[a-z_][a-z0-9_-]*$ && "$YARD_USER" =~ ^[a-z_][a-z0-9_-]*$ ]] || {
  echo "ERROR: invalid user account" >&2; exit 2;
}
[[ "$SABAN_USER" != "$YARD_USER" ]] || {
  echo "ERROR: this mailbox requires two distinct runtime accounts" >&2; exit 2;
}
id "$SABAN_USER" >/dev/null && id "$YARD_USER" >/dev/null || {
  echo "ERROR: one runtime account is missing" >&2; exit 2;
}
SABAN_GROUP="$(id -gn "$SABAN_USER")"
YARD_GROUP="$(id -gn "$YARD_USER")"
[[ "$SABAN_GROUP" != "$YARD_GROUP" ]] || {
  echo "ERROR: accounts must not share a primary group" >&2; exit 2;
}
[[ -d /var/lib/evercraft && ! -L /var/lib/evercraft ]] || {
  echo "ERROR: existing /var/lib/evercraft directory required" >&2; exit 3;
}

# Do not replace existing directories or silently rewrite their owners/ACLs.
check_dir(){
  local p="$1" user="$2" group="$3" mode="$4"
  [[ -d "$p" && ! -L "$p" ]] || {
    echo "ERROR: mailbox directory missing or unsafe: $p" >&2; return 3;
  }
  local actual
  actual="$(stat -c '%U:%G:%a' "$p")"
  [[ "$actual" == "$user:$group:$mode" ]] || {
    echo "ERROR: unexpected directory owner/mode ($actual) for $p" >&2; return 3;
  }
}
if [[ "$MODE" == apply ]]; then
  if [[ ! -e "$MAILBOX" && ! -L "$MAILBOX" ]]; then
    install -d -o root -g root -m 0711 "$MAILBOX"
  fi
  check_dir "$MAILBOX" root root 711
  if [[ ! -e "$MAILBOX/requests" && ! -L "$MAILBOX/requests" ]]; then
    install -d -o "$SABAN_USER" -g "$YARD_GROUP" -m 2750 "$MAILBOX/requests"
  fi
  if [[ ! -e "$MAILBOX/outcomes" && ! -L "$MAILBOX/outcomes" ]]; then
    install -d -o "$YARD_USER" -g "$SABAN_GROUP" -m 2750 "$MAILBOX/outcomes"
  fi
fi

check_dir "$MAILBOX" root root 711
check_dir "$MAILBOX/requests" "$SABAN_USER" "$YARD_GROUP" 2750
check_dir "$MAILBOX/outcomes" "$YARD_USER" "$SABAN_GROUP" 2750
command -v runuser >/dev/null || { echo "ERROR: runuser is required" >&2; exit 3; }

runuser -u "$SABAN_USER" -- test -w "$MAILBOX/requests"
runuser -u "$SABAN_USER" -- test -r "$MAILBOX/outcomes"
runuser -u "$YARD_USER" -- test -r "$MAILBOX/requests"
runuser -u "$YARD_USER" -- test -w "$MAILBOX/outcomes"

if runuser -u "$SABAN_USER" -- test -w "$MAILBOX/outcomes" ||
   runuser -u "$YARD_USER" -- test -w "$MAILBOX/requests"; then
  echo "ERROR: one runtime account can modify the other's files" >&2
  exit 3
fi

echo "PASS: split-identity mailbox permissions are correct ($MODE)"
echo "Saban may write only requests; Yard may write only outcomes."
echo "No private state, account membership, services, timers, or credentials changed."
