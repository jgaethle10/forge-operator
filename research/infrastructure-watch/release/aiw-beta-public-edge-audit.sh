#!/usr/bin/env bash
# American Infrastructure Watch | production edge inspection ONLY.
# Does not write any configuration, symlink, route, DNS, TLS or service.
set -euo pipefail

CONFIG=/etc/evercraft/Caddyfile
PUBLIC_ENV=/etc/evercraft/public-edge.env
ROOT=/srv/evercraft/infrastructure-watch
RELEASE="$ROOT/releases/270291e8a8c3b32f10ca3f6dc47142e9e3542238-47d8da45c45d"

echo '=== EVERCRAFT AIW PUBLIC-EDGE STRUCTURE AUDIT (READ ONLY) ==='
test -f "$CONFIG" && test -r "$CONFIG" || { echo "HOLD: Caddy configuration not readable"; exit 1; }
test -f "$PUBLIC_ENV" && test -r "$PUBLIC_ENV" || { echo "HOLD: public edge environment not readable"; exit 1; }
test -f "$RELEASE/index.html" || { echo "HOLD: immutable staged release missing"; exit 1; }
test -f "$RELEASE/SHA256SUMS" || { echo "HOLD: archive receipt absent"; exit 1; }

EDGE_HOST="$(awk -F= '$1=="EVERCRAFT_PUBLIC_HOST"{print substr($0,index($0,"=")+1)}' "$PUBLIC_ENV" | tail -1)"
EDGE_EMAIL="$(awk -F= '$1=="EVERCRAFT_ACME_EMAIL"{print substr($0,index($0,"=")+1)}' "$PUBLIC_ENV" | tail -1)"
if [ "$EDGE_HOST" != 'fabric.systemiacommandcenters.com' ]; then
  echo "HOLD: unexpected owned Caddy public host; no route proposal"
  exit 1
fi
echo 'public_host=verified'

echo '=== REAL RESIDENT CADDY VALIDATION ==='
if env EVERCRAFT_PUBLIC_HOST="$EDGE_HOST" EVERCRAFT_ACME_EMAIL="$EDGE_EMAIL" \
    /usr/bin/caddy validate --config "$CONFIG" --adapter caddyfile >/dev/null 2>&1; then
  echo 'caddy_validation=PASS (using resident public-edge env)'
else
  echo 'caddy_validation=FAIL (public cutover held)'
  exit 1
fi

echo '=== RUNTIME SERVICE STATE ==='
systemctl is-active evercraft-fabric.service || true
systemctl is-active evercraft-public-edge.service || true

echo '=== IMMUTABLE RELEASE RECEIPT ==='
(cd "$RELEASE" && sha256sum -c SHA256SUMS) |
  awk 'BEGIN { n=0 } /: OK$/ { n++ } END { print "release_checksum_entries_verified=" n; if(n!=12)exit 1 }'
python3 - "$RELEASE" <<'PY'
import hashlib,json,sys
from pathlib import Path
p=Path(sys.argv[1])
j=json.loads((p/"release.json").read_text())
assert j["source_commit"]=="270291e8a8c3b32f10ca3f6dc47142e9e3542238"
assert j["wa_2026_deep_records"]==8618
assert j["wa_2026_total"]==8619
assert j["national_state_summaries_2025"]==52
assert j["public_release_ready"] is False
assert j["public_url_verified"] is False
print("source_and_release_contract=VERIFIED")
PY
if id -u caddy >/dev/null 2>&1; then
  if runuser -u caddy -- test -r "$RELEASE/index.html"; then
    echo 'caddy_read_access=PASS'
  else
    echo 'caddy_read_access=FAIL: cannot serve staged release'
  fi
else
  echo 'caddy_read_access=NOT_VERIFIED: caddy service user absent'
fi

echo '=== EXISTING CADDY ROUTE SHAPE (VALUES/SENSITIVE DIRECTIVES REDACTED) ==='
python3 - "$CONFIG" <<'PY'
from pathlib import Path
import re,sys
p=Path(sys.argv[1])
content=p.read_text()
for no,raw in enumerate(content.splitlines(),1):
    s=raw.strip()
    if not s or s.startswith("#"):continue
    indent="  "*(max(0,(len(raw)-len(raw.lstrip()))//2))
    if s=="{" or s=="}":
        print(f"{no:03d} {indent}{s}")
        continue
    if re.search(r"\b(token|password|credential|secret|authorization|basic_auth|bearer|api_key)\b",s,re.I):
        print(f"{no:03d} {indent}[sensitive directive redacted]")
        continue
    if s.startswith("{$EVERCRAFT_PUBLIC_HOST}"):
        print(f"{no:03d} {indent}FABRIC_PUBLIC_HOST {{")
        continue
    head=s.split()[0].removesuffix("{")
    if head in {"handle","handle_path","route","redir","import","root","rewrite","uri","file_server","reverse_proxy","respond","tls","header","encode","log","request_body","@","handle_errors"}:
        args=s[len(s.split()[0]):].strip()
        if head in {"reverse_proxy","tls","import","header","log","request_body","respond"}:
            if head=="reverse_proxy":
                match=re.search(r"127\.0\.0\.1:\d+",args)
                args=match.group(0) if match else "[target redacted]"
            else:
                args="{...}" if s.endswith("{") else "[args redacted]"
        elif head in {"handle","handle_path","route","redir","root","rewrite","uri"}:
            args=" ".join(x if re.fullmatch(r"[A-Za-z0-9_./*:-]+",x) else "[value]" for x in args.split()[:3])
        print(f"{no:03d} {indent}{head} {args}".rstrip())
        continue
    if s.endswith("{"):
        print(f"{no:03d} {indent}[other block declaration] {{")
    else:
        print(f"{no:03d} {indent}[other directive: {head[:28]}]")
PY

if [ -e "$ROOT/current" ] || [ -L "$ROOT/current" ]; then
  echo 'aiw_current_link=EXISTS; review before any cutover'
else
  echo 'aiw_current_link=ABSENT; production AIW path is not activated'
fi
echo '=== NEXT ACTION ==='
echo 'Review full route structure before preparing a candidate Caddyfile.'
echo 'caddy_changed=false'
echo 'dns_changed=false'
echo 'services_restarted=false'
echo 'public_website_activated=false'
