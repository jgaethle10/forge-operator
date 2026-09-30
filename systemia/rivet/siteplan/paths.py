from __future__ import annotations
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

DATA_ROOT = Path(
    os.getenv("RIVET_SITEPLAN_DATA_ROOT", str(REPO_ROOT / "var" / "rivet-siteplans"))
).expanduser().resolve()
SOURCE_ROOT = Path(
    os.getenv("RIVET_SITEPLAN_SOURCE_ROOT", str(DATA_ROOT / "sites"))
).expanduser().resolve()
COMPILER_ROOT = Path(
    os.getenv("RIVET_SITEPLAN_COMPILER_ROOT", str(DATA_ROOT / "compiler_v2"))
).expanduser().resolve()

IDENTITY_ROOT = COMPILER_ROOT / "identity"
EVIDENCE_ROOT = COMPILER_ROOT / "evidence"
MODEL_ROOT = COMPILER_ROOT / "models"
GEOMETRY_ROOT = COMPILER_ROOT / "geometry"
AERIAL_CACHE_ROOT = COMPILER_ROOT / "aerial_cache"
RENDER_ROOT = COMPILER_ROOT / "render"
RECEIPT_ROOT = COMPILER_ROOT / "receipts"
ARTIFACT_ROOT = COMPILER_ROOT / "artifacts"
CORRECTION_ROOT = COMPILER_ROOT / "fast_corrections"

RUNTIME_DIRS = (
    DATA_ROOT,
    SOURCE_ROOT,
    COMPILER_ROOT,
    IDENTITY_ROOT,
    EVIDENCE_ROOT,
    MODEL_ROOT,
    GEOMETRY_ROOT,
    AERIAL_CACHE_ROOT,
    RENDER_ROOT,
    RECEIPT_ROOT,
    ARTIFACT_ROOT,
    CORRECTION_ROOT,
)

for directory in RUNTIME_DIRS:
    directory.mkdir(parents=True, exist_ok=True)

def runtime_layout() -> dict[str, str]:
    return {
        "data_root": str(DATA_ROOT),
        "source_root": str(SOURCE_ROOT),
        "compiler_root": str(COMPILER_ROOT),
        "identity_root": str(IDENTITY_ROOT),
        "evidence_root": str(EVIDENCE_ROOT),
        "model_root": str(MODEL_ROOT),
        "geometry_root": str(GEOMETRY_ROOT),
        "aerial_cache_root": str(AERIAL_CACHE_ROOT),
        "render_root": str(RENDER_ROOT),
        "receipt_root": str(RECEIPT_ROOT),
        "artifact_root": str(ARTIFACT_ROOT),
        "correction_root": str(CORRECTION_ROOT),
    }
