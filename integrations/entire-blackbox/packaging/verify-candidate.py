#!/usr/bin/env python3
"""Verify archive checksum, member identity and format in an isolated consumer job.

This is a packaging proof, not a signature, publisher identity, release or
evidence that an external provider committed an operation.
"""
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
import tarfile
import zipfile

def require(condition, message):
    if not condition:
        raise ValueError(message)

def main():
    require(len(sys.argv) in (3, 4), "usage: verify-candidate.py <asset-dir> <version> [linux-binary-output]")
    root = pathlib.Path(sys.argv[1]).resolve()
    version = sys.argv[2]
    require(re.fullmatch(r"\d+\.\d+\.\d+", version) is not None, "bad version")
    require(root.is_dir(), "no asset directory")
    platforms = [(goos, arch) for goos in ("linux", "darwin", "windows") for arch in ("amd64", "arm64")]
    wanted = {
        f"entire-blackbox_{version}_{goos}_{arch}.{ 'zip' if goos == 'windows' else 'tar.gz' }":
            ("entire-blackbox.exe" if goos == "windows" else "entire-blackbox")
        for goos, arch in platforms
    }
    checksums = root / "checksums.txt"
    require(checksums.is_file() and not checksums.is_symlink(), "checksums.txt missing")
    lines = checksums.read_text(encoding="utf-8").splitlines()
    hashes = {}
    for line in lines:
        match = re.fullmatch(r"([a-f0-9]{64})  ([a-zA-Z0-9_.-]+)", line)
        require(match is not None, "bad checksum manifest line")
        digest, name = match.groups()
        require(name not in hashes, "duplicate checksum file")
        hashes[name] = digest
    require(set(hashes) == set(wanted), "manifest does not contain exactly six expected assets")
    require({p.name for p in root.iterdir()} == set(wanted) | {"checksums.txt"}, "unexpected files in candidate")
    results = []
    linux_data = None
    for name, member_name in wanted.items():
        path = root / name
        require(path.is_file() and not path.is_symlink(), f"asset missing or symlink: {name}")
        require(hashlib.sha256(path.read_bytes()).hexdigest() == hashes[name], f"checksum mismatch: {name}")
        if name.endswith(".zip"):
            with zipfile.ZipFile(path) as archive:
                require(archive.namelist() == [member_name], f"unexpected ZIP members: {name}")
                info = archive.infolist()[0]
                require(info.file_size > 1000 and not info.is_dir(), "invalid ZIP member")
                require(not stat.S_ISLNK(info.external_attr >> 16), "symlink ZIP member")
                binary = archive.read(member_name)
                require(binary[:2] == b"MZ", "unexpected Windows binary header")
        else:
            with tarfile.open(path, mode="r:gz") as archive:
                members = archive.getmembers()
                require(len(members) == 1 and members[0].name == member_name and members[0].isfile(), f"unexpected TAR members: {name}")
                require(members[0].size > 1000, "invalid TAR member")
                binary = archive.extractfile(members[0]).read()
                if "_linux_" in name:
                    require(binary[:4] == b"\x7fELF", "unexpected Linux binary header")
                elif "_darwin_" in name:
                    require(binary[:4] in (b"\xcf\xfa\xed\xfe", b"\xfe\xed\xfa\xcf"), "unexpected macOS binary header")
        if name.endswith("_linux_amd64.tar.gz"):
            linux_data = binary
        results.append({"name": name, "archive_sha256": hashes[name], "binary_sha256": hashlib.sha256(binary).hexdigest()})
    if len(sys.argv) == 4:
        target = pathlib.Path(sys.argv[3])
        require(linux_data is not None, "no linux amd64 candidate")
        target.write_bytes(linux_data)
        target.chmod(0o755)
    print(json.dumps({"state": "CANDIDATE_CHECKSUMS_AND_ARCHIVES_VALID", "externally_published": False,
                      "independent_provider_verified": False, "assets": results}, indent=2))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"PACKAGE_PROOF_REJECTED: {exc}", file=sys.stderr)
        sys.exit(1)
