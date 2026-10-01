#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/plugins/evercraft-fabric"
OUT_DIR="$ROOT/artifacts"
OUT="$OUT_DIR/evercraft-openai-plugin.zip"

required=(
  "plugin.json"
  "mcp.json"
  ".codex-plugin/plugin.json"
  ".mcp.json"
  "assets/evercraft-icon.png"
  "skills/evercraft-router/SKILL.md"
)

for rel in "${required[@]}"; do
  if [[ ! -f "$PLUGIN_DIR/$rel" ]]; then
    echo "ERROR: Evercraft plugin release is missing $rel" >&2
    exit 2
  fi
done

mkdir -p "$OUT_DIR"
rm -f "$OUT"

python3 - "$PLUGIN_DIR" "$OUT" "${required[@]}" <<'PY'
from pathlib import Path
import sys, zipfile

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()
members = sorted(sys.argv[3:])

with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for rel in members:
        source = (root / rel).resolve()
        if root not in source.parents:
            raise SystemExit(f"ERROR: release member escapes package root: {rel}")
        data = source.read_bytes()
        info = zipfile.ZipInfo(rel, date_time=(1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        info.create_system = 3
        zf.writestr(info, data)

print(out)
PY

python3 - "$OUT" <<'PY'
import sys, zipfile, json
archive=sys.argv[1]
expected={
    'plugin.json',
    'mcp.json',
    '.codex-plugin/plugin.json',
    '.mcp.json',
    'assets/evercraft-icon.png',
    'skills/evercraft-router/SKILL.md',
}
with zipfile.ZipFile(archive) as zf:
    names=set(zf.namelist())
    if names != expected:
        missing=sorted(expected-names)
        extra=sorted(names-expected)
        raise SystemExit(f"ERROR: release ZIP membership mismatch missing={missing} extra={extra}")
    plugin=json.loads(zf.read('plugin.json'))
    compatibility=json.loads(zf.read('.codex-plugin/plugin.json'))
    mcp=json.loads(zf.read('mcp.json'))
    iface=plugin['extensions']['com.openai']['interface']
    assert plugin['version']=='1.0.3'
    assert compatibility['version']==plugin['version']
    assert iface['category']=='Business & Operations'
    assert iface['logo']=='./assets/evercraft-icon.png'
    assert iface['composerIcon']=='./assets/evercraft-icon.png'
    url=mcp['mcpServers']['evercraft']['url']
    assert url=='https://fabric.systemiacommandcenters.com/mcp'
print("Evercraft OpenAI release ZIP validated.")
PY

printf '\nREADY TO UPLOAD:\n  %s\n' "$OUT"
