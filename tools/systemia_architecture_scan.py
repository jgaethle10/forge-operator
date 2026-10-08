#!/usr/bin/env python3
"""Deterministic, read-only source topology scanner for Systemia.

It never imports or executes scanned application code.

Evidence boundary:
- Python: stdlib AST for imports, functions, async functions, and classes.
- JS/TS family: conservative literal imports, Base44 direct access, literal
  function targets, and locally verified helper-mediated entity access.
- Optional function.jsonc manifests are declarative source evidence only.
  Manifest absence is never negative evidence.
- Runtime behavior and provider deployment are never inferred from static source alone.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re

VERSION = "systemia-architecture-scan/1.4"

EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
MANIFEST_NAME = "function.jsonc"
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
    r"""\bentities\.([A-Za-z_$][A-Za-z0-9_$]*)\s*\.\s*(filter|list|get|create|update|delete|bulkCreate|bulkUpdate)\b""",
    re.MULTILINE,
)
BASE44_FUNCTION_INVOKE_PATTERN = re.compile(
    r"""\bfunctions\s*\.\s*invoke\s*\(\s*["']([^"']+)["']""",
    re.MULTILINE,
)
BASE44_HTTP_FUNCTION_PATTERN = re.compile(
    r"""https://base44\.app/api/apps/[^\`"'\\s]+/functions/([A-Za-z_$][A-Za-z0-9_$-]*)"""
)
BASE44_READ_METHODS = {"filter", "list", "get"}
BASE44_WRITE_METHODS = {"create", "update", "delete", "bulkCreate", "bulkUpdate"}
BASE44_ENTITY_METHODS = BASE44_READ_METHODS | BASE44_WRITE_METHODS
LITERAL_HELPER_NAMES = {
    "createIfMissing", "upsert", "one", "latest", "first", "newest", "existsByRef",
}


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


def automation_node(name: str, automation: dict, nodes: dict) -> str:
    key = stable_key("workflow", "automation", name)
    metadata = {
        "evidence_lane": "declared_only",
        "type": automation.get("type"),
        "is_active": automation.get("is_active"),
        "schedule_mode": automation.get("schedule_mode"),
        "schedule_type": automation.get("schedule_type"),
        "repeat_unit": automation.get("repeat_unit"),
        "repeat_interval": automation.get("repeat_interval"),
        "ends_type": automation.get("ends_type"),
        "ends_after_count": automation.get("ends_after_count"),
        "one_time_date": automation.get("one_time_date"),
    }
    metadata = {key_: value for key_, value in metadata.items() if value is not None}
    add_node(
        nodes,
        key,
        "workflow",
        name,
        f"automation:{name}",
        notes=json.dumps(metadata, sort_keys=True, separators=(",", ":")),
    )
    return key


def _matching_brace(source: str, open_index: int) -> int | None:
    depth = 0
    quote = None
    escaped = False
    line_comment = False
    block_comment = False
    i = open_index

    while i < len(source):
        ch = source[i]
        nxt = source[i + 1] if i + 1 < len(source) else ""

        if line_comment:
            if ch == "\n":
                line_comment = False
            i += 1
            continue
        if block_comment:
            if ch == "*" and nxt == "/":
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if quote is not None:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in {"'", '"', "`"}:
            quote = ch
            i += 1
            continue
        if ch == "/" and nxt == "/":
            line_comment = True
            i += 2
            continue
        if ch == "/" and nxt == "*":
            block_comment = True
            i += 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return None


def _simple_param(raw: str) -> str | None:
    candidate = raw.strip().split("=", 1)[0].strip().split(":", 1)[0].strip()
    return candidate if re.fullmatch(r"[A-Za-z_$][A-Za-z0-9_$]*", candidate) else None


def _verified_helper_relations(source: str) -> dict[str, tuple[str, ...]]:
    relations: dict[str, tuple[str, ...]] = {}
    for helper_name in sorted(LITERAL_HELPER_NAMES):
        pattern = re.compile(
            rf"\b(?:async\s+)?function\s+{re.escape(helper_name)}\s*\(([^)]*)\)\s*\{",
            re.MULTILINE,
        )
        match = pattern.search(source)
        if not match:
            continue
        params = [_simple_param(part) for part in match.group(1).split(",")]
        if len(params) < 2 or params[0] != "sr" or not params[1]:
            continue
        entity_param = params[1]
        close = _matching_brace(source, match.end() - 1)
        if close is None:
            continue
        body = source[match.end():close]
        access = re.compile(
            rf"\bsr\s*\.entities\s*\[\s*{re.escape(entity_param)}\s*\]\s*\.\s*"
            rf"(filter|list|get|create|update|delete|bulkCreate|bulkUpdate)\b"
        )
        methods = {item.group(1) for item in access.finditer(body)}
        helper_relations = []
        if methods & BASE44_READ_METHODS:
            helper_relations.append("reads")
        if methods & BASE44_WRITE_METHODS:
            helper_relations.append("writes")
        if helper_relations:
            relations[helper_name] = tuple(helper_relations)
    return relations


def scan_verified_helper_calls(
    source: str,
    rel: str,
    file_key: str,
    nodes: dict,
    edges: dict,
) -> int:
    helper_relations = _verified_helper_relations(source)
    count = 0
    lines = source.splitlines()
    for helper_name, relations in helper_relations.items():
        call_pattern = re.compile(
            rf"\b{re.escape(helper_name)}\s*\(\s*sr\s*,\s*['\"]([A-Za-z_$][A-Za-z0-9_$]*)['\"]"
        )
        for match in call_pattern.finditer(source):
            entity_name = match.group(1)
            line_number = source.count("\n", 0, match.start()) + 1
            excerpt = lines[line_number - 1] if 0 < line_number <= len(lines) else match.group(0)
            for relation in relations:
                add_edge(
                    edges,
                    file_key,
                    entity_node(entity_name, nodes),
                    relation,
                    rel,
                    line_number,
                    excerpt,
                    "base44_verified_literal_helper_access",
                    confidence="high",
                )
                count += 1
    return count


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
    source_lines = source.splitlines()

    for line_number, raw in enumerate(source_lines, 1):
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

    def strip_line_comment_preserving_urls(line: str) -> str:
        protected = line.replace("https://", "https:__DOUBLE_SLASH__").replace("http://", "http:__DOUBLE_SLASH__")
        stripped = protected.split("//", 1)[0]
        return stripped.replace("https:__DOUBLE_SLASH__", "https://").replace("http:__DOUBLE_SLASH__", "http://")

    source_for_access = "\n".join(strip_line_comment_preserving_urls(line) for line in source_lines)

    for match in BASE44_ENTITY_PATTERN.finditer(source_for_access):
        entity_name = match.group(1)
        method = match.group(2)
        relation = "reads" if method in BASE44_READ_METHODS else "writes"
        line_number = source_for_access.count("\n", 0, match.start()) + 1
        excerpt = re.sub(r"\s*\.\s*", ".", " ".join(match.group(0).split()))
        add_edge(
            edges,
            file_key,
            entity_node(entity_name, nodes),
            relation,
            rel,
            line_number,
            excerpt,
            "base44_entity_literal_access",
            confidence="high",
        )

    helper_edges = scan_verified_helper_calls(source, rel, file_key, nodes, edges)

    for match in BASE44_FUNCTION_INVOKE_PATTERN.finditer(source_for_access):
        line_number = source_for_access.count("\n", 0, match.start()) + 1
        excerpt = re.sub(r"\s*\.\s*", ".", " ".join(match.group(0).split()))
        add_edge(
            edges,
            file_key,
            workflow_node(match.group(1), nodes),
            "invokes",
            rel,
            line_number,
            excerpt,
            "base44_function_literal_invoke",
            confidence="high",
        )

    for match in BASE44_HTTP_FUNCTION_PATTERN.finditer(source_for_access):
        line_number = source_for_access.count("\n", 0, match.start()) + 1
        excerpt = " ".join(match.group(0).split())
        add_edge(
            edges,
            file_key,
            workflow_node(match.group(1), nodes),
            "invokes",
            rel,
            line_number,
            excerpt,
            "base44_http_function_url",
            confidence="high",
        )

    coverage.append({
        "file_path": rel,
        "parser_mode": "js_ts_literal_plus_base44_access",
        "state": "partial",
        "notes": [
            "Literal import/export/require patterns are extracted.",
            "Literal Base44 entity accesses are classified as reads or writes across whitespace/newlines.",
            f"{helper_edges} helper-mediated entity edges were added only when a local helper body proved the Base44 operation and the call used a literal entity target.",
            "Literal functions.invoke targets are extracted across whitespace/newlines as workflow invocations.",
            "Literal Base44 HTTPS function endpoints are extracted as workflow invocations.",
            "Line comments are removed while preserving http/https URL strings; block-comment parsing is not claimed.",
            "This is not a full JS/TS parser.",
            "Unverified helper semantics, computed entity names, computed function targets, bundler resolution, general call graph, and runtime behavior are not claimed.",
        ],
    })


def _manifest_field_line(source: str, value: str) -> tuple[int, str]:
    lines = source.splitlines() or [source]
    pattern = re.compile(rf"""["']name["']\s*:\s*["']{re.escape(value)}["']""")
    for line_number, line in enumerate(lines, 1):
        if pattern.search(line):
            return line_number, line
    return 1, lines[0] if lines else ""


def scan_manifest(root: Path, path: Path, nodes: dict, edges: dict, coverage: list, warnings: list) -> None:
    file_key, rel, source = file_node(root, path, nodes)
    try:
        payload = json.loads(source)
    except json.JSONDecodeError as exc:
        coverage.append({
            "file_path": rel,
            "parser_mode": "base44_function_manifest",
            "state": "failed",
            "notes": [f"Malformed JSON-compatible function.jsonc: {exc.msg} at line {exc.lineno} column {exc.colno}."],
        })
        warnings.append({
            "file_path": rel,
            "line": exc.lineno or 1,
            "message": f"Malformed function.jsonc: {exc.msg}",
        })
        return

    if not isinstance(payload, dict):
        warnings.append({"file_path": rel, "line": 1, "message": "function.jsonc root is not an object"})
        coverage.append({
            "file_path": rel,
            "parser_mode": "base44_function_manifest",
            "state": "failed",
            "notes": ["Manifest root is not an object."],
        })
        return

    function_name = payload.get("name")
    function_key = None
    if isinstance(function_name, str) and function_name:
        line_number, excerpt = _manifest_field_line(source, function_name)
        function_key = workflow_node(function_name, nodes)
        add_edge(
            edges, file_key, function_key, "owns", rel, line_number, excerpt,
            "base44_function_manifest", confidence="high",
        )

    automation_count = 0
    automations = payload.get("automations", [])
    if isinstance(automations, list):
        for automation in automations:
            if not isinstance(automation, dict):
                continue
            automation_name = automation.get("name")
            if not isinstance(automation_name, str) or not automation_name:
                continue
            line_number, excerpt = _manifest_field_line(source, automation_name)
            auto_key = automation_node(automation_name, automation, nodes)
            add_edge(
                edges, file_key, auto_key, "owns", rel, line_number, excerpt,
                "base44_function_manifest_automation", confidence="high",
            )
            if function_key is not None and automation.get("type") == "scheduled":
                add_edge(
                    edges, auto_key, function_key, "invokes", rel, line_number, excerpt,
                    "base44_function_manifest_schedule", confidence="high",
                )
            automation_count += 1

    coverage.append({
        "file_path": rel,
        "parser_mode": "base44_function_manifest",
        "state": "supported_complete",
        "notes": [
            "Manifest presence is declarative metadata only; absence is never negative evidence.",
            f"{automation_count} automation declaration(s) parsed.",
            "is_active and schedule fields remain declared-only and never count as runtime observation.",
            "Provider deployment or callability is not inferred from a manifest.",
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


def manifest_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for base, dirs, names in os.walk(root):
        dirs[:] = sorted(name for name in dirs if name not in EXCLUDES)
        for name in sorted(names):
            if name == MANIFEST_NAME:
                files.append(Path(base) / name)
    return sorted(files, key=lambda path: relative(root, path))


def scan(root: Path) -> dict:
    root = root.resolve()
    nodes: dict = {}
    edges: dict = {}
    coverage: list = []
    warnings: list = []
    files = source_files(root)
    manifests = manifest_files(root)

    for path in files:
        if path.suffix.lower() == ".py":
            scan_python(root, path, nodes, edges, coverage, warnings)
        else:
            scan_js_family(root, path, nodes, edges, coverage)

    for path in manifests:
        scan_manifest(root, path, nodes, edges, coverage, warnings)

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
            "claims_provider_deployment_from_manifest": False,
            "manifest_absence_is_negative_evidence": False,
            "python_parser": "stdlib ast",
            "js_ts_parser": "literal imports + Base44 direct access + locally verified literal helper access + literal function targets; partial",
            "manifest_parser": "optional JSON-compatible function.jsonc declarative metadata",
        },
        "counts": {
            "nodes": len(nodes),
            "edges": len(edges),
            "files": len(files) + len(manifests),
            "code_files": len(files),
            "manifest_files": len(manifests),
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
