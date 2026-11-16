#!/usr/bin/env python3
"""Read-only structural inspector for preliminary KSS-style PDF drawing packages.

No site names, addresses, customer materials, images or drawing content is emitted.
This examines structural PDF properties, NOT visual composition or engineering truth.
"""
from __future__ import annotations
import argparse
from collections import Counter
from hashlib import sha256
import json
from pathlib import Path
import re
import sys

try:
    import fitz
except ImportError as exc:
    raise SystemExit("Missing required independent dependency: pymupdf (fitz)") from exc

ROLES = ("C101", "C102", "E101", "D501")
ROLE_RE = re.compile(r"\b(C101|C102|E101|D501)\b")
EXPECTED_SIZE_PT = (2592.0, 1728.0)


def inspect_pdf(path: Path, expected_sites: int | None = None) -> dict:
    if not path.is_file():
        raise ValueError("file_not_found")
    digest = sha256(path.read_bytes()).hexdigest()
    with fitz.open(path) as document:
        pages = []
        for index, page in enumerate(document):
            visible = page.get_text("text", sort=True)
            head = "\n".join(page.get_text("text", sort=False).splitlines()[:12])
            # Use the title area only so notes elsewhere cannot satisfy role identity.
            role = ROLE_RE.search(head)
            labels = [value.upper() for value in re.findall(r"[A-Z][A-Z ]{4,35}",visible.upper())]
            drawing_count = len(page.get_drawings())
            pages.append({
                "number": index + 1,
                "role": role.group(1) if role else None,
                "width_pt": round(page.rect.width, 2),
                "height_pt": round(page.rect.height, 2),
                "vector_drawing_count": drawing_count,
                "embedded_image_objects": len(page.get_images(full=True)),
                "has_preliminary_label": "PRELIMINARY" in visible.upper(),
                "has_not_for_construction": "NOT FOR CONSTRUCTION" in visible.upper(),
                "has_source_context": "SOURCE" in visible.upper(),
                "has_field_verify_context": ("VERIFY" in visible.upper() or "TBD" in visible.upper()),
            })
    count = len(pages)
    role_counts = Counter(p["role"] for p in pages if p["role"])
    alerts = []
    if count == 0:
        alerts.append("no_pages")
    if count % 4 != 0:
        alerts.append("page_count_not_multiple_of_four")
    if expected_sites is not None and count != expected_sites * 4:
        alerts.append("expected_site_sheet_count_mismatch")
    if not pages or any(abs(p["width_pt"] - EXPECTED_SIZE_PT[0]) > 2 or
                        abs(p["height_pt"] - EXPECTED_SIZE_PT[1]) > 2 for p in pages):
        alerts.append("nonstandard_36x24_landscape_sheet")
    if not set(ROLES).issubset(role_counts):
        alerts.append("missing_required_sheet_role")
    if any(p["role"] != ROLES[i % 4] for i, p in enumerate(pages)):
        alerts.append("sheet_roles_out_of_sequence")
    if any(not p["has_preliminary_label"] or not p["has_not_for_construction"] for p in pages):
        alerts.append("preliminary_construction_disclaimer_missing")
    if any(not p["has_source_context"] or not p["has_field_verify_context"] for p in pages):
        alerts.append("source_or_field_verify_context_missing")
    if any(p["vector_drawing_count"] < 10 and p["embedded_image_objects"] == 0 for p in pages):
        alerts.append("low_graphics_density_for_preliminary_plan")
    return {
        "schema": "evercraft.kss.pdf-structural-fidelity-review.v1",
        "source_sha256": digest,
        "pages": count,
        "inferred_site_groups_from_four_sheet_order": count // 4 if count % 4 == 0 else None,
        "role_counts": dict(sorted(role_counts.items())),
        "page_width_pt": sorted({p["width_pt"] for p in pages}),
        "page_height_pt": sorted({p["height_pt"] for p in pages}),
        "vector_drawing_count_range": [min((p["vector_drawing_count"] for p in pages), default=0),
                                       max((p["vector_drawing_count"] for p in pages), default=0)],
        "total_embedded_image_objects": sum(p["embedded_image_objects"] for p in pages),
        "alerts": alerts,
        "structural_gate": "PASS" if not alerts else "HOLD",
        "limits": "This is structural extraction only. No visual comparison, imagery ownership, GIS truth, site control, utility availability, ADA certification, survey or engineering approval is verified.",
        "external_release_allowed": False,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pdf", type=Path)
    ap.add_argument("--expected-sites", type=int)
    ap.add_argument("--output", type=Path)
    args = ap.parse_args()
    report = inspect_pdf(args.pdf, args.expected_sites)
    content = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(content)
    else:
        sys.stdout.write(content)
    return 0 if report["structural_gate"] == "PASS" else 2

if __name__ == "__main__":
    raise SystemExit(main())
