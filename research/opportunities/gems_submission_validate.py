#!/usr/bin/env python3
"""Validate a candidate DOE GEMS Prize GeoTIFF against a local training-features GeoTIFF.

Does not train a model, submit to DrivenData, upload data, or imply competition entry.
Only reads existing local raster files. Use authorized downloaded data.
Requirements: rasterio, numpy.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import rasterio


def validate(prediction: Path, reference: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []
    finite_count = 0
    total = 0
    data_min = float("inf")
    data_max = float("-inf")

    with rasterio.open(reference) as ref, rasterio.open(prediction) as out:
        if out.count != 1:
            errors.append(f"Expected one prediction band; got {out.count}")
        if out.dtypes[0] != "float32":
            errors.append(f"Expected float32 predictions; got {out.dtypes[0]}")
        if out.crs is None or out.crs.to_epsg() != 32611:
            errors.append(f"Expected EPSG:32611; got {out.crs}")
        if ref.crs is None or ref.crs.to_epsg() != 32611:
            warnings.append(f"Reference is not in EPSG:32611: {ref.crs}")
        if (out.width, out.height) != (ref.width, ref.height):
            errors.append(
                f"Raster dimensions differ: prediction {out.width}x{out.height}, "
                f"reference {ref.width}x{ref.height}"
            )
        if not np.allclose(tuple(out.transform), tuple(ref.transform), rtol=0, atol=1e-6):
            errors.append("Prediction geotransform differs from reference")
        if not np.isclose(out.transform.a, 100, atol=1e-6) or not np.isclose(
            out.transform.e, -100, atol=1e-6
        ):
            errors.append("Expected 100 m pixels and north-up image")
        if not np.isclose(out.transform.b, 0, atol=1e-9) or not np.isclose(
            out.transform.d, 0, atol=1e-9
        ):
            errors.append("Prediction has a rotated/skewed transform")
        if out.crs != ref.crs:
            errors.append(f"Prediction CRS differs from reference: {out.crs} vs {ref.crs}")

        # Windowed reads keep memory requirements low for large regional rasters.
        for _, window in out.block_windows(1):
            values = out.read(1, window=window, masked=False)
            total += values.size
            valid = np.isfinite(values)
            if out.nodata is not None:
                if np.isnan(out.nodata):
                    valid &= ~np.isnan(values)
                else:
                    valid &= values != out.nodata
            kept = values[valid]
            finite_count += int(kept.size)
            if kept.size:
                data_min = min(data_min, float(kept.min()))
                data_max = max(data_max, float(kept.max()))
                if np.any((kept < 0) | (kept > 1)):
                    errors.append(f"Values outside [0,1] in window {window}")
                    break
        if finite_count == 0:
            errors.append("No finite prediction values found")
        if finite_count > 0 and data_min == data_max:
            warnings.append("Prediction is constant: check model output (may be a baseline)")

    return {
        "prediction": str(prediction),
        "reference": str(reference),
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "finite_pixels": finite_count,
        "total_pixels_checked": total,
        "minimum_probability": None if finite_count == 0 else data_min,
        "maximum_probability": None if finite_count == 0 else data_max,
        "note": "Format validation only; competition eligibility and leaderboard score unverified.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prediction", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True, help="Official training_features.tif")
    args = parser.parse_args()
    for value in (args.prediction, args.reference):
        if not value.is_file():
            parser.error(f"File not found: {value}")
    try:
        report = validate(args.prediction, args.reference)
    except (OSError, rasterio.errors.RasterioError, ValueError) as exc:
        print(json.dumps({"valid": False, "error": str(exc)}, indent=2))
        return 2
    print(json.dumps(report, indent=2))
    return 0 if report["valid"] else 1


if __name__ == "__main__":
    sys.exit(main())
