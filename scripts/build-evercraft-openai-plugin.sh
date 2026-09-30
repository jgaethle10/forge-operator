#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/plugins/evercraft-fabric"
OUT_DIR="$ROOT/artifacts"
OUT="$OUT_DIR/evercraft-openai-plugin.zip"

if [[ ! -f "$PLUGIN_DIR/plugin.json" || ! -f "$PLUGIN_DIR/mcp.json" ]]; then
  echo "ERROR: Evercraft plugin package is incomplete" >&2
  exit 2
fi

mkdir -p "$OUT_DIR"
rm -f "$OUT"

python3 - "$PLUGIN_DIR" "$OUT" <<'PY'
from pathlib import Path
import sys, zipfile

root = Path(sys.argv[1]).resolve()
out = Path(sys.argv[2]).resolve()

exclude_names = {'.DS_Store'}
exclude_suffixes = {'.swp', '.tmp', '.bak'}

with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
    for path in sorted(root.rglob('*')):
        if path.is_dir():
            continue
        rel = path.relative_to(root)
        if any(part in {'.git', '__pycache__'} for part in rel.parts):
            continue
        if path.name in exclude_names or path.suffix in exclude_suffixes:
            continue
        zf.write(path, rel.as_posix())

print(out)
PY

python3 - "$OUT" <<'PY'
import sys, zipfile, json
from pathlib import PurePosixPath
archive=sys.argv[1]
with zipfile.ZipFile(archive) as zf:
    names=set(zf.namelist())
    required={'plugin.json','mcp.json','assets/evercraft-icon.png','skills/evercraft-router/SKILL.md'}
    missing=sorted(required-names)
    if missing:
        raise SystemExit("ERROR: release ZIP missing: "+", ".join(missing))
    plugin=json.loads(zf.read('plugin.json'))
    mcp=json.loads(zf.read('mcp.json'))
    iface=plugin['extensions']['com.openai']['interface']
    assert iface['logo']=='./assets/evercraft-icon.png'
    assert iface['composerIcon']=='./assets/evercraft-icon.png'
    url=mcp['mcpServers']['evercraft']['url']
    assert url=='https://fabric.systemiacommandcenters.com/mcp'
print("Evercraft OpenAI release ZIP validated.")
PY

printf '\nREADY TO UPLOAD:\n  %s\n' "$OUT"
