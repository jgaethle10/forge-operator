#!/usr/bin/env python3
"""Export an allowlisted, self-contained plugin repo candidate without publishing it."""
import hashlib
import json
import pathlib
import re
import sys

SOURCE = pathlib.Path(__file__).resolve().parent.parent
ALLOW = (
 "main.go", "main_test.go", "examples/unknown.json",
 "packaging/build-candidate.sh", "packaging/verify-candidate.py", "packaging/RELEASE_GATE.md"
)
OLD = "module github.com/jgaethle10/forge-operator/integrations/entire-blackbox"
NEW = "module github.com/jgaethle10/entire-blackbox"
EXTRA = {
 "entire-plugin.yml": "name: blackbox\ndescription: Read-only agent external-action evidence triage; local claims are never provider-verified\n",
 ".goreleaser.yaml": (
  "version: 2\nproject_name: entire-blackbox\n"
  "builds:\n  - main: .\n    binary: entire-blackbox\n    env: [CGO_ENABLED=0]\n"
  "    goos: [darwin, linux, windows]\n    goarch: [amd64, arm64]\n"
  "archives:\n  - formats: [tar.gz]\n    format_overrides:\n"
  "      - goos: windows\n        formats: [zip]\n"
  "checksum:\n  name_template: checksums.txt\n"
 ),
 ".gitignore": "/dist/\n/entire-blackbox\n/entire-blackbox.exe\n",
 "README.md": (
  "# Evercraft Black Box | Entire CLI command candidate\n\n"
  "**Engineering source export, NOT a release or licensed public product.** "
  "This local, read-only command inspects untrusted agent claims of external actions. "
  "It has no authenticated provider readback and always reports externally_verified:false. "
  "No payments, retries, device dispatch, or real-world side effects occur.\n\n"
  "## Local QA\n\n    go test -count=1 ./...\n    go build -o entire-blackbox .\n"
  "    ./entire-blackbox inspect examples/unknown.json\n\n"
  "This candidate came from Evercraft Forge Operator. The original PR #1291, "
  "actual Entire local CLI test #1367, and archive handoff #1372 remain separate review gates. "
  "Source, ownership, production authority, terms, and release permissions must be confirmed "
  "by Systemia and the owner before any public launch. "
  "No LICENSE file is provided because permission to license or distribute "
  "has not been granted. Add an approved license before publication.\n\n"
  "No Entire endorsement, public catalog listing, existing separate repository, "
  "paid partnership, or deployed provider verification is claimed.\n"
 )
}
SCHEMA = "evercraft.entire-blackbox.standalone-export.v1"

def digest(b):
 return hashlib.sha256(b).hexdigest()

def write(root, path, data):
 target = root / path
 target.parent.mkdir(parents=True, exist_ok=True)
 target.write_bytes(data)

def stage(root, commit):
 if root.exists(): raise ValueError("refuse to overwrite existing output")
 if not re.fullmatch(r"[a-f0-9]{40}", commit): raise ValueError("concrete 40-character source SHA required")
 root.mkdir(parents=True)
 origin = {}
 staged = {}
 for name in ALLOW:
  source = SOURCE / name
  if not source.is_file() or source.is_symlink(): raise ValueError("missing or symlink source: "+name)
  raw = source.read_bytes()
  origin[name] = digest(raw)
  staged[name] = digest(raw)
  write(root,name,raw)
 mod = (SOURCE / "go.mod").read_bytes()
 if mod.count(OLD.encode()) != 1: raise ValueError("original module path changed")
 origin["go.mod"] = digest(mod)
 mod = mod.replace(OLD.encode(),NEW.encode(),1)
 staged["go.mod"] = digest(mod)
 write(root,"go.mod",mod)
 for name, value in EXTRA.items():
  raw = value.encode("utf-8")
  staged[name] = digest(raw)
  write(root,name,raw)
 meta = {
  "schema":SCHEMA, "origin_repo":"jgaethle10/forge-operator",
  "origin_commit":commit, "origin_subdir":"integrations/entire-blackbox",
  "destination_repo_proposed":"jgaethle10/entire-blackbox",
  "source_file_sha256":origin, "staged_file_sha256":staged,
  "publication_state":"NOT_PUBLISHED", "license_state":"OWNER_DECISION_REQUIRED",
  "release_authorized":False,"entire_index_approved":False,
  "external_provider_verified":False,
  "proof_limit":"Source and archive integrity only; not a trusted signature or provider outcome."
 }
 write(root,"PROVENANCE.json",(json.dumps(meta,indent=2,sort_keys=True)+"\n").encode())
 print("STANDALONE_REPO_CANDIDATE_STAGED",commit,len(staged))

def verify(root):
 meta=json.loads((root/"PROVENANCE.json").read_text())
 if meta["schema"]!=SCHEMA: raise ValueError("wrong manifest schema")
 if (meta["release_authorized"] or meta["entire_index_approved"] or
     meta["external_provider_verified"] or meta["publication_state"]!="NOT_PUBLISHED" or
     meta["license_state"]!="OWNER_DECISION_REQUIRED"): raise ValueError("invalid release hold")
 expected=set(meta["staged_file_sha256"])|{"PROVENANCE.json"}
 got=set()
 for p in root.rglob("*"):
  if p.is_symlink(): raise ValueError("symlink in staged output")
  if p.is_file(): got.add(p.relative_to(root).as_posix())
 if got!=expected: raise ValueError("unexpected or missing file: "+str(sorted(got^expected)))
 for name,h in meta["staged_file_sha256"].items():
  if digest((root/name).read_bytes())!=h: raise ValueError("file integrity mismatch: "+name)
 if NEW not in (root/"go.mod").read_text(): raise ValueError("standalone module not set")
 if "name: blackbox" not in (root/"entire-plugin.yml").read_text(): raise ValueError("invalid plugin metadata")
 print("STANDALONE_EXPORT_VERIFY_PASS",meta["origin_commit"],len(expected))

def main():
 if len(sys.argv)==4 and sys.argv[1]=="stage":
  root=pathlib.Path(sys.argv[2]).resolve()
  stage(root,sys.argv[3])
  verify(root)
 elif len(sys.argv)==3 and sys.argv[1]=="verify":
  verify(pathlib.Path(sys.argv[2]).resolve())
 else: raise ValueError("usage: prepare-standalone.py stage <new-dir> <commit-sha> | verify <existing-dir>")

if __name__=="__main__":
 try: main()
 except (ValueError,OSError,KeyError,AssertionError) as err:
  print("STANDALONE_EXPORT_REJECTED:",err,file=sys.stderr)
  sys.exit(1)
