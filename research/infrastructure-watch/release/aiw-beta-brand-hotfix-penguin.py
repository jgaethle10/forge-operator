#!/usr/bin/env python3
"""Versioned AIW identity hotfix. Default --check is non-mutating.

This changes only the two legacy crosshair marks + their CSS on the already
served public index. The map, data, about page, licenses and Caddyfile remain
byte-for-byte unchanged. --activate atomically advances only AIW's current
symlink, and rolls back the symlink if local HTTPS verification fails.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path("/srv/evercraft/infrastructure-watch")
RELEASES = ROOT / "releases"
CURRENT = ROOT / "current"
BASE = RELEASES / "270291e8a8c3b32f10ca3f6dc47142e9e3542238-47d8da45c45d"
BRANDED = RELEASES / (BASE.name + "-evercraft-brand-v2")
SOURCE = "270291e8a8c3b32f10ca3f6dc47142e9e3542238"
LIVE_CADDY_SHA256 = "3b8ebe191ebe1009c1a59b10e79783678d998bc4ca13c22e82ead34c1dca9ef8"
EXPECTED = {
    "index.html", "about.html", "data/states.json", "data/states.geojson",
    "data/wa-summary.json", "data/wa-bridges.json", "vendor/leaflet.js",
    "vendor/leaflet.css", "vendor/LEAFLET-LICENSE",
    "vendor/US-ATLAS-LICENSE", "robots.txt", "release.json", "SHA256SUMS"
}
HOST = "fabric.systemiacommandcenters.com"


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files_and_bytes(root):
    require(root.is_dir() and not root.is_symlink(), "Unexpected release directory")
    observed = {
        str(p.relative_to(root)): p for p in root.rglob("*") if p.is_file()
    }
    require(set(observed) == EXPECTED, "Static release file membership changed")
    require(all(not p.is_symlink() for p in observed.values()), "Release contains symlink")
    return {name: path.read_bytes() for name, path in observed.items()}


def verify(release):
    data = files_and_bytes(release)
    manifest = json.loads(data["release.json"])
    require(manifest.get("schema") == "evercraft.aiw.public-beta-static.v1", "Wrong release schema")
    require(manifest.get("source_commit") == SOURCE, "Wrong pinned source")
    require(manifest.get("national_state_summaries_2025") == 52, "Wrong state summary count")
    require(manifest.get("wa_2026_total") == 8619 and manifest.get("wa_2026_poor") == 403,
            "Wrong Washington summary")
    require(manifest.get("wa_2026_deep_records") == 8618, "Wrong Washington deep coverage")
    require(manifest.get("public_url_verified") is False, "Altered original release-evidence claim")
    declared = manifest.get("files", {})
    require(set(declared) == EXPECTED - {"release.json", "SHA256SUMS"}, "Incomplete release manifest")
    for name, claimed in declared.items():
        require(digest(data[name]) == claimed, "Release manifest checksum mismatch: " + name)
    sums = data["SHA256SUMS"].decode("ascii").splitlines()
    require(len(sums) == 12, "Expected 12 SHA256SUMS entries")
    found = {}
    for line in sums:
        require(len(line) >= 67 and line[64:66] == "  ", "Invalid SHA256SUMS entry")
        found[line[66:]] = line[:64]
    require(set(found) == EXPECTED - {"SHA256SUMS"}, "Wrong SHA256SUMS membership")
    for name, claimed in found.items():
        require(digest(data[name]) == claimed, "SHA256SUMS mismatch: " + name)
    return data, manifest


def load_exporter(path):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), "Reviewed exporter is missing")
    spec = importlib.util.spec_from_file_location("aiw_public_beta_brand_exporter", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    require(module.AIW_BRAND_REVISION == "evercraft-bridge-compass-20261120",
            "Unexpected brand revision")
    return module


def create_new_payload(original, manifest, exporter):
    original_page = original["index.html"].decode("utf8")
    require('<div class="symbol" aria-hidden="true">⌖</div>' in original_page,
            "Original release header already differs")
    new_page = exporter.apply_brand_to_public(original_page).encode("utf8")
    require(new_page != original["index.html"], "Brand patch did not change index")
    require(new_page.count(b'<svg') >= 2, "Brand marks missing from updated page")
    require("⌖".encode("utf8") not in new_page, "Crosshair survived brand update")
    contents = dict(original)
    contents["index.html"] = new_page
    metadata = dict(manifest)
    metadata["files"] = dict(manifest["files"])
    metadata["files"]["index.html"] = digest(new_page)
    metadata["branding_revision"] = exporter.AIW_BRAND_REVISION
    metadata["branding_applied_utc"] = datetime.now(timezone.utc).isoformat()
    contents["release.json"] = (
        json.dumps(metadata, ensure_ascii=False, sort_keys=True,
                   separators=(",", ":"), allow_nan=False) + "\n"
    ).encode("utf8")
    contents["SHA256SUMS"] = "".join(
        digest(contents[name]) + "  " + name + "\n"
        for name in sorted(EXPECTED - {"SHA256SUMS"})
    ).encode("ascii")
    # Every nonbranding asset and every published federal record is unchanged.
    for name in EXPECTED - {"index.html", "release.json", "SHA256SUMS"}:
        require(contents[name] == original[name], "Unexpected nonbrand mutation: " + name)
    return contents


def stage(payload):
    if BRANDED.exists() or BRANDED.is_symlink():
        require(not BRANDED.is_symlink(), "Brand release path points to symlink")
        existing = files_and_bytes(BRANDED)
        # Prior failed attempts may have the same content but a different UTC
        # receipt; compare all stable files and the manifest's brand metadata.
        for name in EXPECTED - {"release.json", "SHA256SUMS"}:
            require(existing[name] == payload[name], "Existing staged brand differs: " + name)
        verify(BRANDED)
        require(json.loads(existing["release.json"]).get("branding_revision")
                == "evercraft-bridge-compass-20261120", "Wrong existing brand revision")
        return BRANDED

    tmp = Path(tempfile.mkdtemp(prefix=".aiw-brand-stage-", dir=RELEASES))
    try:
        for name, contents in payload.items():
            dst = tmp / name
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(contents)
            dst.chmod(0o644)
        for d in tmp.rglob("*"):
            if d.is_dir():
                d.chmod(0o755)
        tmp.chmod(0o755)
        verify(tmp)
        tmp.rename(BRANDED)
    except Exception:
        shutil.rmtree(tmp, ignore_errors=True)
        raise
    return BRANDED


def read_current():
    require(CURRENT.is_symlink(), "AIW current is not the expected symbolic link")
    target = Path(os.readlink(CURRENT))
    require(target.is_absolute() and target in {BASE, BRANDED}, "Unexpected current target")
    return target


def local_url(path):
    result = subprocess.run([
        "curl", "--noproxy", "*", "--silent", "--show-error", "--fail",
        "--insecure", "--max-time", "8",
        "--resolve", HOST + ":8443:127.0.0.1",
        "https://" + HOST + ":8443" + path
    ], capture_output=True, check=True, timeout=12)
    return result.stdout


def atomic_pointer(target):
    with tempfile.TemporaryDirectory(prefix=".aiw-brand-link-", dir=ROOT) as td:
        link = Path(td) / "next"
        link.symlink_to(target)
        os.replace(link, CURRENT)


def apply(mode, exporter):
    require(os.geteuid() == 0, "Run approved hotfix as root on Penguin")
    require(ROOT.is_dir() and not ROOT.is_symlink(), "AIW release root missing")
    require(RELEASES.is_dir() and not RELEASES.is_symlink(), "AIW release store missing")
    require(digest(Path("/etc/evercraft/Caddyfile").read_bytes()) == LIVE_CADDY_SHA256,
            "Shared Caddyfile changed; brand switch held")
    for service in ("evercraft-public-edge.service", "evercraft-fabric.service"):
        subprocess.run(["systemctl", "is-active", "--quiet", service], check=True)
    original, metadata = verify(BASE)
    current = read_current()
    if current == BRANDED:
        verify(BRANDED)
        require("branding_revision" in json.loads((BRANDED / "release.json").read_text()),
                "Brand release metadata missing")
        require(digest(local_url("/infrastructure-watch/")) ==
                digest((BRANDED / "index.html").read_bytes()), "Brand route not serving expected bytes")
        print("brand_already_live_and_byte_verified=true")
        return

    require(current == BASE, "Unexpected preexisting AIW symlink target")
    payload = create_new_payload(original, metadata, exporter)
    require(digest(local_url("/infrastructure-watch/")) == digest(original["index.html"]),
            "Current public HTML no longer matches pinned baseline; refuse patch")
    if mode == "--check":
        print("brand_change=exactly_two_visual_marks_and_CSS")
        print("unchanged_public_evidence_files=10")
        print("new_index_sha256=" + digest(payload["index.html"]))
        print("preflight=PASS")
        print("live_release_unchanged=true")
        return
    target = stage(payload)
    changed = False
    try:
        require(read_current() == BASE, "Current release changed before pointer switch")
        atomic_pointer(target)
        changed = True
        page = local_url("/infrastructure-watch/")
        require(digest(page) == digest((target / "index.html").read_bytes()),
                "Public header did not switch to branded HTML")
        require(page.count(b'<svg') >= 2, "SVG logo not served")
        for route, asset in (
            ("/infrastructure-watch/data/states.json", "data/states.json"),
            ("/infrastructure-watch/data/wa-bridges.json", "data/wa-bridges.json"),
            ("/infrastructure-watch/vendor/leaflet.js", "vendor/leaflet.js"),
        ):
            require(digest(local_url(route)) == digest(original[asset]),
                    "Existing asset changed after branding: " + asset)
        local_url("/health")
        require(read_current() == target, "Pointer changed during validation")
    except BaseException:
        if changed and read_current() == target:
            atomic_pointer(BASE)
            print("branding_validation_failed_rolled_back_to_original=true", file=sys.stderr)
        raise

    print("EVERCRAFT_AI_WATCH_BRAND=LIVE_LOCAL_HTTPS_VERIFIED")
    print("new_brand_release=" + str(target))
    print("brand_revision=" + exporter.AIW_BRAND_REVISION)
    print("map_evidence_and_data=UNCHANGED")
    print("caddyfile=UNCHANGED")
    print("services_restarted=false")
    print("public_external_https=NOT_INDEPENDENTLY_VERIFIED")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--exporter", required=True, help="Reviewed pinned public beta exporter")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", dest="mode", action="store_const", const="--check")
    mode.add_argument("--activate", dest="mode", action="store_const", const="--activate")
    parser.set_defaults(mode="--check")
    args = parser.parse_args()
    apply(args.mode, load_exporter(args.exporter))


if __name__ == "__main__":
    main()
