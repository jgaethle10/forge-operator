#!/usr/bin/env python3
"""Offline XLSX metadata inventory. Never extracts archives, evaluates formulas, or certifies observations."""
import hashlib
import io
import json
import os
import pathlib
import re
import stat
import sys
import zipfile
import xml.etree.ElementTree as ET

LIMIT = 32 * 1024 * 1024
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def inspect(directory, source_key, digest):
    if not re.fullmatch(r"[a-z0-9-]{1,80}", source_key) or not re.fullmatch(r"[a-f0-9]{64}", digest):
        raise ValueError("invalid capture identity")
    root = pathlib.Path(directory)
    if not root.is_absolute() or root.resolve() != root:
        raise ValueError("private absolute directory required")
    meta = root.lstat()
    if not stat.S_ISDIR(meta.st_mode) or meta.st_uid != os.getuid() or meta.st_mode & 0o077:
        raise ValueError("private owner directory required")
    file = root / (source_key + "-" + digest + ".xlsx")
    with os.fdopen(os.open(file, os.O_RDONLY | os.O_NOFOLLOW), "rb") as handle:
        meta = os.fstat(handle.fileno())
        if not stat.S_ISREG(meta.st_mode) or meta.st_uid != os.getuid() or meta.st_mode & 0o077 or meta.st_size > LIMIT:
            raise ValueError("unsafe captured file")
        raw = handle.read(LIMIT + 1)
    if len(raw) > LIMIT or hashlib.sha256(raw).hexdigest() != digest:
        raise ValueError("capture digest mismatch")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries) > 5000 or len({x.filename for x in entries}) != len(entries):
            raise ValueError("invalid archive inventory")
        if sum(x.file_size for x in entries) > 128 * 1024 * 1024:
            raise ValueError("archive expansion limit")
        required = {"[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"}
        if not required.issubset(set(archive.namelist())):
            raise ValueError("missing workbook parts")
        info = archive.getinfo("xl/workbook.xml")
        if info.file_size > 1024 * 1024:
            raise ValueError("workbook metadata limit")
        xml = archive.read(info)
        if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper() or b"\x00" in xml:
            raise ValueError("unsafe workbook XML")
        workbook = ET.fromstring(xml)
        if workbook.tag != NS + "workbook":
            raise ValueError("unexpected workbook namespace")
        sheets = [{"name": x.attrib.get("name", ""), "state": x.attrib.get("state", "visible")}
                  for x in workbook.findall(NS + "sheets/" + NS + "sheet")]
        if not sheets or len(sheets) > 500 or any(not x["name"] for x in sheets):
            raise ValueError("invalid worksheet inventory")
    return {"schema": "evercraft.circular-recovery.workbook-inventory.v1",
            "sourceKey": source_key, "sha256": digest, "sheets": sheets,
            "metadataInspected": True, "worksheetSchemaVerified": False,
            "unitsVerified": False, "rowsVerified": 0, "availableSupplyVerified": False}

if __name__ == "__main__":
    try:
        if len(sys.argv) != 4:
            raise ValueError("usage: wa-workbook-inventory.py PRIVATE_DIRECTORY SOURCE_KEY SHA256")
        print(json.dumps(inspect(*sys.argv[1:]), ensure_ascii=True))
    except (OSError, ValueError, zipfile.BadZipFile, ET.ParseError, RuntimeError) as exc:
        print(json.dumps({"status": "held", "reason": type(exc).__name__, "rowsVerified": 0}), file=sys.stderr)
        sys.exit(1)
