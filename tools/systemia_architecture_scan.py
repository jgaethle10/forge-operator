#!/usr/bin/env python3
"""Deterministic, read-only source topology scanner for Systemia.

It never imports or executes scanned application code.

Evidence boundary:
- Python: stdlib AST for imports, functions, async functions, and classes.
- JS/TS family: conservative literal import/export/require extraction only.
- Runtime behavior is never inferred from static source alone.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re

VERSION = "systemia-architecture-scan/1.1"

EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
EXCLUDES = {
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    "dist", "build", ".next", ".rivet_pydeps", ".playwright",
}

JS_IMPORT_PATTERNS = [
    re.compile(r"""^\s*import\s+(?:.+?\s+from\s+)?["']([^"']+)["']"""),
    re.compile(r"""^\s*export\s+.+?\s+from\s+["']([^"']+)["']"""),
    re.compile(r"""\brequire\s*\(\s*["']([^"']+)["']\s*\)"""),
    re.compile(r"""\bimport\s*\(\s*["']([^"']+)["']\s*\)"""),
]

BASE44_ENTITY_PATTERN = re.compile(
    r"""\bentities\.([A-Za-z_$][A-Za-z0-9_$]*)\.(filter|list|get|create|update|delete|bulkCreate|bulkUpdate)\b"""
)
BASE44_FUNCTION_INVOKE_PATTERN = re.compile(
    r"""\bfunctions\.invoke\s*\(\s*["']([^"']+)["']"""
)
BASE44_READ_METHODS = {"filter", "list", "get"}
BASE44_WRITE_METHODS = {"create", "update", "delete", "bulkCreate", "bulkUpdate"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_key(prefix: str, *parts: str) -> str:
    return f"{prefix}:{digest(chr(31).join(parts))[:24]}"


def relative(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root).as_posix()


def add_node(nodes: dict, key: str, node_type: str, name: str, locator: str, **extra) -> None:
    nodes[key] = {
        "node_key": key,
        "node_type": node_type,
        "display_name": name,
        "locator": locator,
        "evidence_state": "source_verified",
        "confidence": "verified",
        "status": "active",
        **extra,
    }


def add_edge(
    edges: dict,
    source: str,
    target: str,
    relation: str,
    file_path: str,
    line: int,
    excerpt: str,
    parser_mode: str,
    confidence: str = "verified",
) -> None:
    location = f"{file_path}:{line}"
    edge_key = stable_key("edge", source, target, relation, location, excerpt)
    edges[edge_key] = {
        "edge_key": edge_key,
        "from_node_key": source,
        "to_node_key": target,
        "relation_type": relation,
        "discovery_mode": "static",
        "source_location": location,
        "source_excerpt": excerpt.rstrip()[:500],
        "agreement_state": "declared_only",
        "confidence": confidence,
        "status": "active",
        "parser_mode": parser_mode,
    }


def file_node(root: Path, path: Path, nodes: dict) -> tuple[str, str, str]:
    rel = relative(root, path)
    source = path.read_text(encoding="utf-8", errors="replace")
    key = stable_key("file", rel)
    add_node(
        nodes,
        key,
        "file",
        rel,
        f"file:{rel}",
        file_path=rel,
        content_hash=digest(source),
    )
    return key, rel, source


def module_node(name: str, nodes: dict) -> str:
    key = stable_key("module", name)
    add_node(nodes, key, "module", name, f"module:{name}")
    return key


def entity_node(name: str, nodes: dict) -> str:
    key = stable_key("entity", name)
    add_node(nodes, key, "entity", name, f"entity:{name}")
    return key


def workflow_node(name: str, nodes: dict) -> str:
    key = stable_key("workflow", name)
    add_node(nodes, key, "workflow", name, f"workflow:{name}")
    return key


def symbol_node(rel: str, name: str, kind: str, nodes: dict) -> str:
    key = stable_key(kind, rel, name)
    add_node(
        nodes,
        key,
        kind,
        f"{rel}:{name}",
        f"{kind}:{rel}:{name}",
        file_path=rel,
        symbol=name,
    )
    return key


def scan_python(root: Path, path: Path, nodes: dict, edges: dict, coverage: list, warnings: list) -> None:
    file_key, rel, source = file_node(root, path, nodes)
    lines = source.splitlines()
    try:
        tree = ast.parse(source, filename=rel)
    except SyntaxError as exc:
        coverage.append({
            "file_path": rel,
            "parser_mode": "python_ast",
            "state": "failed",
            "notes": [str(exc)],
        })
        warnings.append({
            "file_path": rel,
            "line": exc.lineno or 1,
            "message": exc.msg,
        })
        return

    for item in ast.walk(tree):
        if isinstance(item, ast.Import):
            for alias in item.names:
                add_edge(
                    edges, file_key, module_node(alias.name, nodes), "imports",
                    rel, item.lineno, lines[item.lineno - 1], "python_ast",
                )
        elif isinstance(item, ast.ImportFrom):
            name = "." * (item.level or 0) + (item.module or "")
            add_edge(
                edges, file_key, module_node(name or ".", nodes), "imports",
                rel, item.lineno, lines[item.lineno - 1], "python_ast",
            )
        elif isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            add_edge(
                edges, file_key, symbol_node(rel, item.name, "function", nodes), "owns",
                rel, item.lineno, lines[item.lineno - 1], "python_ast",
            )
        elif isinstance(item, ast.ClassDef):
            add_edge(
                edges, file_key, symbol_node(rel, item.name, "class", nodes), "owns",
                rel, item.lineno, lines[item.lineno - 1], "python_ast",
            )

    coverage.append({
        "file_path": rel,
        "parser_mode": "python_ast",
        "state": "supported_complete",
        "notes": [
            "Imports/functions/classes are parsed.",
            "Dynamic imports, call graph, and runtime behavior are not claimed.",
        ],
    })


def scan_js_family(root: Path, path: Path, nodes: dict, edges: dict, coverage: list) -> None:
    file_key, rel, source = file_node(root, path, nodes)
    for line_number, raw in enumerate(source.splitlines(), 1):
        line = raw.split("//", 1)[0]
        for pattern in JS_IMPORT_PATTERNS:
            for match in pattern.finditer(line):
                add_edge(
                    edges,
                    file_key,
                    module_node(match.group(1), nodes),
                    "imports",
                    rel,
                    line_number,
                    raw,
                    "js_ts_literal_imports",
                    confidence="high",
                )

        for match in BASE44_ENTITY_PATTERN.finditer(line):
            entity_name = match.group(1)
            method = match.group(2)
            relation = "reads" if method in BASE44_READ_METHODS else "writes"
            add_edge(
                edges,
                file_key,
                entity_node(entity_name, nodes),
                relation,
                rel,
                line_number,
                raw,
                "base44_entity_literal_access",
                confidence="high",
            )

        for match in BASE44_FUNCTION_INVOKE_PATTERN.finditer(line):
            add_edge(
                edges,
                file_key,
                workflow_node(match.group(1), nodes),
                "invokes",
                rel,
                line_number,
                raw,
                "base44_function_literal_invoke",
                confidence="high",
            )

    coverage.append({
        "file_path": rel,
        "parser_mode": "js_ts_literal_plus_base44_access",
        "state": "partial",
        "notes": [
            "Literal import/export/require patterns are extracted.",
            "Literal Base44 entity accesses are classified as reads or writes.",
            "Literal functions.invoke targets are extracted as workflow invocations.",
            "This is not a full JS/TS parser.",
            "Computed entity names, computed function targets, bundler resolution, general call graph, and runtime behavior are not claimed.",
        ],
    })


def source_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for base, dirs, names in os.walk(root):
        dirs[:] = sorted(name for name in dirs if name not in EXCLUDES)
        for name in sorted(names):
            path = Path(base) / name
            if path.suffix.lower() in EXTENSIONS:
                files.append(path)
    return sorted(files, key=lambda path: relative(root, path))


def scan(root: Path) -> dict:
    root = root.resolve()
    nodes: dict = {}
    edges: dict = {}
    coverage: list = []
    warnings: list = []
    files = source_files(root)

    for path in files:
        if path.suffix.lower() == ".py":
            scan_python(root, path, nodes, edges, coverage, warnings)
        else:
            scan_js_family(root, path, nodes, edges, coverage)

    file_material = "\n".join(sorted(
        f"{node.get('file_path')}:{node.get('content_hash')}"
        for node in nodes.values()
        if node["node_type"] == "file"
    ))

    return {
        "scanner_version": VERSION,
        "root_scope": str(root),
        "source_revision": digest(file_material),
        "scan_mode": "static_only",
        "evidence_boundary": {
            "executes_scanned_code": False,
            "claims_runtime_behavior": False,
            "python_parser": "stdlib ast",
            "js_ts_parser": "literal imports + Base44 literal entity/function access; partial",
        },
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "files": len(files),
            "warnings": len(warnings),
        },
        "nodes": [nodes[key] for key in sorted(nodes)],
        "edges": [edges[key] for key in sorted(edges)],
        "coverage": sorted(coverage, key=lambda row: row["file_path"]),
        "warnings": sorted(
            warnings,
            key=lambda row: (row["file_path"], row["line"], row["message"]),
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    payload = scan(Path(args.root))
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"

    if args.out == "-":
        print(encoded, end="")
    else:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(encoded, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
