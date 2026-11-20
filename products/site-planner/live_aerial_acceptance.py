#!/usr/bin/env python3
"""One-time live federal source acceptance; PUBLIC fixture only. No customer data.

Run on a constrained CI runner. It never writes user sites, orders or outbox.
"""
import hashlib
import sys
from aerial_sources import preview_from_address

PUBLIC_CENSUS_FIXTURE = "4600 Silver Hill Rd, Washington, DC 20233"


def main():
    try:
        data = preview_from_address(PUBLIC_CENSUS_FIXTURE)
        if data["schema"] != "evercraft.site-planner.usgs-address-aerial.v1":
            raise ValueError("Wrong provider schema")
        if data["match_class"] != "census_address_range_not_parcel":
            raise ValueError("Unexpected match classification")
        if data["parcel_boundaries_verified"] is not False or data["imagery_date_verified"] is not False:
            raise ValueError("Grounding claims changed unexpectedly")
        for name in ("site", "vicinity"):
            item = data[name]
            digest = item["sha256"]
            if len(digest) != 64 or not all(ch in "0123456789abcdef" for ch in digest):
                raise ValueError(name + " hash invalid")
            if item["width_pixels"] != 1024 or item["height_pixels"] != 752:
                raise ValueError(name + " image dimensions unexpected")
            print("VALID", name, "sha256", digest[:12], "bytes(base64)", len(item["image_base64"]))
        print("LIVE FEDERAL AERIAL PROBE: PASS")
        print("Census matched: sample address only; parcel/imagery dates unverified")
        return 0
    except Exception as exc:
        print("LIVE FEDERAL AERIAL PROBE: FAIL", type(exc).__name__, str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
