#!/usr/bin/env python3
"""Evercraft Parcel v0.1. Local exact-byte split/reconstruct, no uploads or encryption."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys

BLOCK = 1024 * 1024
PART_RE = re.compile(r"part-[0-9]{5}\.bin\Z")
SHA_RE = re.compile(r"[a-f0-9]{64}\Z")


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(BLOCK), b""):
            h.update(block)
    return h.hexdigest()


def write_json_atomic(path, doc):
    staging = path.with_suffix(path.suffix + ".partial")
    with open(staging, "x", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, sort_keys=True, indent=2)
        f.write("\n")
        f.flush()
        os.fsync(f.fileno())
    os.replace(staging, path)


def split(source, folder, max_bytes):
    source = Path(source)
    folder = Path(folder)
    if not source.is_file() or source.is_symlink():
        raise ValueError("Input must be a regular source file, not a symlink")
    if max_bytes < 1 or max_bytes > 2_000_000_000:
        raise ValueError("Chunk size must be 1..2,000,000,000 bytes")
    if folder.exists() and any(folder.iterdir()):
        raise ValueError("Destination folder must be empty")
    folder.mkdir(parents=True, exist_ok=True)
    if source.resolve().parent == folder.resolve():
        raise ValueError("Do not place source inside destination")
    parts = []
    full = hashlib.sha256()
    total = 0
    try:
        with open(source, "rb") as f:
            idx = 0
            while True:
                block = f.read(max_bytes)
                if not block:
                    break
                idx += 1
                if idx > 99999:
                    raise ValueError("Too many parts")
                name = f"part-{idx:05d}.bin"
                p = folder / name
                with open(p, "xb") as out:
                    out.write(block)
                full.update(block)
                total += len(block)
                parts.append({"name": name, "size": len(block), "sha256": hashlib.sha256(block).hexdigest()})
        manifest = {
            "format": "evercraft-parcel-v0.1", "original_name": source.name,
            "original_size": total, "original_sha256": full.hexdigest(),
            "max_part_bytes": max_bytes, "parts": parts,
            "notes": "Split parts must be transported by an authorized channel. This tool DOES NOT upload, encrypt, send, or bypass provider limits."
        }
        write_json_atomic(folder / "parcel-manifest.json", manifest)
        return manifest
    except Exception:
        for p in folder.glob("part-*.bin"):
            p.unlink(missing_ok=True)
        (folder / "parcel-manifest.json.partial").unlink(missing_ok=True)
        raise


def restore(folder, output_folder):
    folder = Path(folder)
    output_folder = Path(output_folder)
    manifest = json.loads((folder / "parcel-manifest.json").read_text(encoding="utf-8"))
    if manifest.get("format") != "evercraft-parcel-v0.1":
        raise ValueError("Unsupported manifest format")
    name = manifest.get("original_name")
    if not isinstance(name, str) or name in ("", ".", "..") or Path(name).name != name or "\\" in name:
        raise ValueError("Unsafe output name")
    parts = manifest.get("parts")
    if not isinstance(parts, list):
        raise ValueError("Invalid parts list")
    expected_bytes = manifest.get("original_size")
    if not isinstance(expected_bytes, int) or isinstance(expected_bytes, bool) or expected_bytes < 0:
        raise ValueError("Invalid total size")
    digest = manifest.get("original_sha256")
    if not isinstance(digest, str) or not SHA_RE.fullmatch(digest):
        raise ValueError("Invalid overall hash")
    for i, part in enumerate(parts, 1):
        if not isinstance(part, dict) or part.get("name") != f"part-{i:05d}.bin" or not PART_RE.fullmatch(part["name"]):
            raise ValueError("Unexpected part ordering or unsafe part name")
        if not isinstance(part.get("size"), int) or isinstance(part["size"], bool) or part["size"] < 1:
            raise ValueError("Invalid part size")
        if not isinstance(part.get("sha256"), str) or not SHA_RE.fullmatch(part["sha256"]):
            raise ValueError("Invalid part hash")
    if sum(x["size"] for x in parts) != expected_bytes:
        raise ValueError("Manifest size mismatch")
    output_folder.mkdir(parents=True, exist_ok=True)
    target = output_folder / name
    if target.exists():
        raise FileExistsError("Output already exists; refusing to overwrite")
    partial = output_folder / (name + ".evercraft-partial")
    if partial.exists():
        raise FileExistsError("Previous partial output exists; investigate manually")
    full = hashlib.sha256()
    copied = 0
    try:
        with open(partial, "xb") as out:
            for part in parts:
                p = folder / part["name"]
                if p.is_symlink() or not p.is_file():
                    raise ValueError("Missing or unsafe part: " + part["name"])
                if p.stat().st_size != part["size"]:
                    raise ValueError("Part size mismatch: " + part["name"])
                ch = hashlib.sha256()
                with open(p, "rb") as inp:
                    for block in iter(lambda: inp.read(BLOCK), b""):
                        ch.update(block)
                        full.update(block)
                        copied += len(block)
                        out.write(block)
                if ch.hexdigest() != part["sha256"]:
                    raise ValueError("Part SHA256 failed: " + part["name"])
            out.flush()
            os.fsync(out.fileno())
        if copied != expected_bytes or full.hexdigest() != digest:
            raise ValueError("Overall size/hash failed")
        os.replace(partial, target)
        return target
    except Exception:
        partial.unlink(missing_ok=True)
        raise


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="action", required=True)
    a = sub.add_parser("split", help="Split exact bytes into sized parts + SHA256 manifest")
    a.add_argument("source", type=Path)
    a.add_argument("output_folder", type=Path)
    a.add_argument("--max-mib", type=float, default=8.0, help="part limit MiB (default 8; provider limit varies)")
    b = sub.add_parser("restore", help="Rebuild file only after verifying every part and original SHA256")
    b.add_argument("parcel_folder", type=Path)
    b.add_argument("output_folder", type=Path)
    args = p.parse_args()
    try:
        if args.action == "split":
            data = split(args.source, args.output_folder, int(args.max_mib * 1024 * 1024))
            print(f"Created {len(data['parts'])} parts; {data['original_size']} original bytes; SHA256 {data['original_sha256']}")
            print(f"Manifest: {args.output_folder / 'parcel-manifest.json'}")
        else:
            print(f"Verified and restored: {restore(args.parcel_folder, args.output_folder)}")
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print("FAIL CLOSED:", exc, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
