#!/usr/bin/env python3
"""Evercraft YVL v4 original artifact integrity and WordPress structural recovery gate.

No network, no extraction, no replacement ZIP creation, no deployment.
The expected ZIP names are the originating November 16 v4 package names.
This tool DOES NOT claim recovered source unless it reads the actual bytes.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import sys
import zipfile

EXPECTED = {
    "Evercraft_YVL_v4_Interactive_Site.zip": "interactive",
    "Evercraft_YVL_v4_WordPress_Theme.zip": "theme",
    "Evercraft_YVL_v4_Content_Plugin.zip": "content_plugin",
    "Evercraft_YVL_v4_Engineering_Pack.zip": "engineering",
}
MAX_ENTRIES = 5000
MAX_UNCOMPRESSED = 150 * 1024 * 1024
MAX_SINGLE_FILE = 30 * 1024 * 1024
MAX_RATIO = 300


def check_zip(path, kind):
    result = {
        "artifact": path.name,
        "kind": kind,
        "present": path.is_file(),
        "status": "missing",
        "sha256": None,
        "file_bytes": None,
        "entry_count": 0,
        "review_flags": [],
    }
    if not path.is_file():
        return result
    if path.is_symlink():
        result["status"] = "blocked"
        result["review_flags"].append("symlink_artifact_refused")
        return result
    result["file_bytes"] = path.stat().st_size
    result["sha256"] = hashlib.file_digest(path.open("rb"), "sha256").hexdigest()
    try:
        with zipfile.ZipFile(path, "r") as archive:
            infos = archive.infolist()
            result["entry_count"] = len(infos)
            if not infos or len(infos) > MAX_ENTRIES:
                raise ValueError("empty_or_oversized_archive_index")
            total = 0
            names = set()
            for member in infos:
                raw = member.filename
                parts = PurePosixPath(raw).parts
                if not raw or raw.startswith("/") or "\\" in raw or ".." in parts:
                    raise ValueError("unsafe_archive_member_path")
                normal = raw.casefold()
                if normal in names:
                    raise ValueError("duplicate_archive_member_name")
                names.add(normal)
                mode = (member.external_attr >> 16)
                if stat.S_ISLNK(mode):
                    raise ValueError("symbolic_link_archive_member")
                if member.flag_bits & 1:
                    raise ValueError("encrypted_archive_member")
                if member.file_size > MAX_SINGLE_FILE:
                    raise ValueError("oversized_archive_member")
                if member.file_size and member.file_size / max(1, member.compress_size) > MAX_RATIO:
                    raise ValueError("suspicious_compression_ratio")
                total += member.file_size
                if total > MAX_UNCOMPRESSED:
                    raise ValueError("archive_total_uncompressed_limit")
            failure = archive.testzip()
            if failure:
                raise ValueError("archive_crc_failure")

            paths = [x.filename.lower() for x in infos if not x.is_dir()]
            def content_for(filename):
                match = next((x for x in infos if x.filename.lower().endswith(filename)), None)
                if not match or match.file_size > 200_000:
                    return ""
                return archive.read(match).decode("utf-8", "replace")

            if kind == "interactive":
                if not any(p.endswith("index.html") for p in paths):
                    result["review_flags"].append("static_index_html_not_found")
            elif kind == "theme":
                styles = [p for p in paths if p.endswith("/style.css") or p == "style.css"]
                if not styles or "theme name:" not in content_for("style.css").lower():
                    result["review_flags"].append("wordpress_theme_header_not_found")
                if not any(p.endswith("index.php") or p.endswith("templates/index.html") for p in paths):
                    result["review_flags"].append("wordpress_theme_entry_template_not_found")
            elif kind == "content_plugin":
                php = [i for i in infos if i.filename.lower().endswith(".php")]
                if not php:
                    result["review_flags"].append("wordpress_plugin_php_not_found")
                elif not any("plugin name:" in archive.read(i).decode("utf-8", "replace").lower() for i in php if i.file_size <= MAX_SINGLE_FILE):
                    result["review_flags"].append("wordpress_plugin_header_not_found")
                if not any("register_post_type" in archive.read(i).decode("utf-8", "replace") for i in php if i.file_size < 2_000_000):
                    result["review_flags"].append("content_type_registration_needs_review")
            elif kind == "engineering":
                if not any("readme" in p or p.endswith(".md") for p in paths):
                    result["review_flags"].append("engineering_documentation_not_found")
                if not any(("wxr" in p or "migration" in p or "inventory" in p) for p in paths):
                    result["review_flags"].append("wxr_migration_tool_not_located")

            result["status"] = "needs_source_review" if result["review_flags"] else "structurally_valid"
            result["uncompressed_bytes"] = total
    except (OSError, zipfile.BadZipFile, zipfile.LargeZipFile, ValueError, RuntimeError) as exc:
        result["status"] = "blocked"
        result["review_flags"].append(str(exc)[:100])
    return result


def audit(directory):
    d = Path(directory)
    results = [check_zip(d / filename, kind) for filename, kind in EXPECTED.items()]
    return {
        "schema": "evercraft.yvl.v4.artifact-recovery.v1",
        "source": "existing_original_v4_archives_only",
        "expected_archives": len(EXPECTED),
        "original_zip_bytes_verified": sum(1 for r in results if r["present"] and r["status"] != "blocked"),
        "archive_integrity_verified": all(r["present"] and r["status"] != "blocked" for r in results),
        "structural_review_complete": all(r["status"] == "structurally_valid" for r in results),
        "wordpress_runtime_verified": False,
        "accessibility_wcag22aa_verified": False,
        "public_library_client_experience_verified": False,
        "yvl_vendor_authorization_verified": False,
        "production_deployed": False,
        "proposal_submitted": False,
        "artifacts": results,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dir", required=True, help="Private directory containing the four ORIGINAL v4 ZIP files")
    p.add_argument("--out", help="Optional JSON report, never original archive location")
    opts = p.parse_args()
    report = audit(opts.dir)
    output = json.dumps(report, indent=2) + "\n"
    if opts.out:
        dest = Path(opts.out)
        if dest.exists():
            raise SystemExit("refuse_report_overwrite")
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("x", encoding="utf-8") as f:
            f.write(output)
    else:
        sys.stdout.write(output)
    return 0 if report["structural_review_complete"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
