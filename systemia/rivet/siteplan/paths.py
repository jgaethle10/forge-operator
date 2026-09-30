from __future__ import annotations
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DATA_ROOT = Path(os.getenv("RIVET_SITEPLAN_DATA_ROOT", str(REPO_ROOT / "var" / "rivet-siteplans"))).resolve()
SOURCE_ROOT = Path(os.getenv("RIVET_SITEPLAN_SOURCE_ROOT", str(DATA_ROOT / "sites"))).resolve()
COMPILER_ROOT = Path(os.getenv("RIVET_SITEPLAN_COMPILER_ROOT", str(DATA_ROOT / "compiler_v2"))).resolve()

for directory in (DATA_ROOT, SOURCE_ROOT, COMPILER_ROOT):
    directory.mkdir(parents=True, exist_ok=True)
