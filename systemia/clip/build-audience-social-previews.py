#!/usr/bin/env python3
"""Render first-party Evercraft Clip SVGs into supported social preview PNGs."""
import argparse
from pathlib import Path
import struct

SLUGS = (
    "partscout", "valuescout", "playbook-lab", "site-rescue",
    "creative-studio", "publisher-lab", "relay-notes",
)
FORMATS = {"feed": (1080, 1350), "story": (1080, 1920)}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default="public/clip/audience-sites")
    parser.add_argument("--destination", default="_public_pages/clip/audience-sites")
    args = parser.parse_args()
    try:
        import cairosvg
    except ImportError as exc:
        raise SystemExit("clip_png_converter_missing_dependency:cairosvg") from exc

    src, dst = Path(args.source), Path(args.destination)
    count = 0
    for slug in SLUGS:
        for variant, size in FORMATS.items():
            source = src / slug / (variant + ".svg")
            if not source.is_file():
                raise SystemExit("clip_png_source_missing:" + str(source))
            target = dst / slug / (variant + ".png")
            target.parent.mkdir(parents=True, exist_ok=True)
            cairosvg.svg2png(url=str(source), write_to=str(target),
                             output_width=size[0], output_height=size[1])
            payload = target.read_bytes()
            if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
                raise SystemExit("clip_png_signature_invalid:" + str(target))
            dimensions = struct.unpack(">II", payload[16:24])
            if dimensions != size or len(payload) < 1024:
                raise SystemExit("clip_png_invalid_dimensions_or_size:" + str(target))
            print("Clip PNG verified:", target, dimensions, len(payload), "bytes")
            count += 1
    if count != 14:
        raise SystemExit("clip_png_count_mismatch:" + str(count))
    print("CLIP_PNG_BUILD_SUCCESS count=14")

if __name__ == "__main__":
    main()
