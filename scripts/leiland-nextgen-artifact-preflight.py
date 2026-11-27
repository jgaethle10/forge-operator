#!/usr/bin/env python3
"""Verify recovered artifact bytes only. No extraction, execution or service writes."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

KEY_SHA = "cb2024baa735e998c5726bf0bc9e82a754843d34dbab6e226f695c897ab2c9fa"
MODEL_SHA = "7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5"
RUNTIME_SHA = "a32b9bdc4d664e21558726fee570b712124c624ccb37fa2eea93bb34a5a93591"

def require(ok, reason):
    if not ok:
        raise SystemExit("HELD: " + reason)

def digest(stream):
    h = hashlib.sha256()
    for block in iter(lambda: stream.read(1024*1024), b""):
        h.update(block)
    return h.hexdigest()

def file_hash(p):
    require(p.is_file() and not p.is_symlink(), "regular artifact required")
    with p.open("rb") as f:
        return digest(f)

def confined(root, name, *, link=False):
    rel = PurePosixPath(name)
    require(not rel.is_absolute() and ".." not in rel.parts, "unsafe relative path")
    p = root.joinpath(*rel.parts)
    require(p.resolve().is_relative_to(root), "path escapes artifact root")
    require(p.parent.resolve() == p.parent, "symlinked parent refused")
    if not link:
        require(not p.is_symlink(), "symlinked artifact refused")
    return p

def main():
    stage = Path.home()/".local/state/evercraft/eo001-sovereign-staging/verified-3zjvwku2"
    require(stage.is_dir() and stage.resolve() == stage, "original stage unavailable or symlinked")
    release = confined(stage, "archive/evercraft-ai-appliance-v0.2.0-node001-prealpha")
    key = confined(release, "keys/evercraft-node001-dev.pub.pem")
    manifest = confined(release, "manifests/SHA256SUMS")
    signature = confined(release, "manifests/SHA256SUMS.sig")
    der = subprocess.run(["openssl","pkey","-pubin","-in",str(key),"-outform","DER"],
                         check=True,capture_output=True).stdout
    require(hashlib.sha256(der).hexdigest() == KEY_SHA, "original signing key fingerprint mismatch")
    verified = subprocess.run(["openssl","pkeyutl","-verify","-pubin","-inkey",str(key),
                               "-rawin","-in",str(manifest),"-sigfile",str(signature)],
                              capture_output=True)
    require(verified.returncode == 0, "original release signature verification failed")
    seen = set()
    for line in manifest.read_text().splitlines():
        match = re.fullmatch(r"([0-9a-fA-F]{64}) [ *](.+)", line)
        require(match is not None, "manifest row unsupported")
        expected, name = match.groups()
        p = confined(release, name)
        require(p not in seen, "duplicate manifest file")
        seen.add(p)
        require(file_hash(p) == expected.lower(), "signed release file mismatch")
    require(len(seen) > 0, "empty signed manifest")
    print("SIGNED_RELEASE_FILES_VERIFIED=" + str(len(seen)), flush=True)
    root = confined(stage, "stage-root")
    model = confined(root, "opt/evercraft-ai/models/node001/Qwen3-4B-Q4_K_M.gguf")
    archive = confined(root, "var/cache/evercraft-ai/llama-b10751-bin-ubuntu-x64.tar.gz")
    payload = confined(root, "opt/evercraft-ai/runtime/llama.cpp-b10751-x86_64/payload")
    require(file_hash(model) == MODEL_SHA, "model checksum mismatch")
    require(file_hash(archive) == RUNTIME_SHA, "runtime archive checksum mismatch")
    members = set()
    with tarfile.open(archive, "r:gz") as tf:
        for member in tf.getmembers():
            p = confined(payload, member.name, link=member.issym())
            if member.isdir():
                require(p.is_dir() and not p.is_symlink(), "runtime directory mismatch")
                continue
            require(p not in members, "duplicate runtime archive member")
            members.add(p)
            if member.issym():
                require(p.is_symlink() and os.readlink(p) == member.linkname,
                        "runtime symlink mismatch")
            elif member.isfile() or member.islnk():
                with tf.extractfile(member) as original:
                    require(file_hash(p) == digest(original), "runtime file mismatch")
            else:
                require(False, "unsupported runtime archive member")
    require(bool(members), "empty runtime archive")
    actual = {p for p in payload.rglob("*") if p.is_symlink() or not p.is_dir()}
    require(actual == members, "untracked or missing payload files")
    server = confined(payload, "llama-b10751/llama-server")
    require(server in members and os.access(server, os.X_OK), "verified server not executable")
    print(json.dumps({
        "schema":"evercraft.leiland.artifact-preflight.v1",
        "release_signature_verified":True,
        "signed_release_files":len(seen),
        "model_sha256":MODEL_SHA,
        "runtime_archive_sha256":RUNTIME_SHA,
        "runtime_payload_members_verified":len(members),
        "llama_server_sha256":file_hash(server),
        "physical_containment_verified":False,
        "model_service_started":False,
        "production_modified":False
    }, indent=2))

if __name__ == "__main__":
    main()
