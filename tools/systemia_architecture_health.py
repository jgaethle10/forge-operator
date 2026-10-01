#!/usr/bin/env python3
"""Bounded architecture health analysis for Systemia.

The analyzer consumes architecture evidence. It never executes application code
and never upgrades missing runtime evidence into a dead-code claim.

Findings are emitted only when they are structurally provable from supplied
edges (dependency cycles) or explicitly requested by a node watch contract
(orphan/dead-output expectations).
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
from typing import Any

VERSION = "systemia-architecture-health/1.0"


def load_json(path: str | None, default: Any) -> Any:
    if not path:
        return default
    return json.loads(Path(path).read_text(encoding="utf-8"))


def edge_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(payload.get("relationships"), list):
        return list(payload["relationships"])
    if isinstance(payload.get("edges"), list):
        return list(payload["edges"])
    return []


def edge_tuple(row: dict[str, Any]) -> tuple[str, str]:
    return str(row["from_node_key"]), str(row["to_node_key"])


def adjacency(rows: list[dict[str, Any]]) -> dict[str, set[str]]:
    graph: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        a, b = edge_tuple(row)
        graph[a].add(b)
        graph.setdefault(b, set())
    return dict(graph)


def strongly_connected_components(graph: dict[str, set[str]]) -> list[list[str]]:
    index = 0
    stack: list[str] = []
    on_stack: set[str] = set()
    indices: dict[str, int] = {}
    low: dict[str, int] = {}
    components: list[list[str]] = []

    def visit(v: str) -> None:
        nonlocal index
        indices[v] = index
        low[v] = index
        index += 1
        stack.append(v)
        on_stack.add(v)

        for w in sorted(graph.get(v, set())):
            if w not in indices:
                visit(w)
                low[v] = min(low[v], low[w])
            elif w in on_stack:
                low[v] = min(low[v], indices[w])

        if low[v] == indices[v]:
            component: list[str] = []
            while True:
                w = stack.pop()
                on_stack.remove(w)
                component.append(w)
                if w == v:
                    break
            components.append(sorted(component))

    for node in sorted(graph):
        if node not in indices:
            visit(node)

    return sorted(components, key=lambda c: (len(c), c))


def analyze(
    topology: dict[str, Any],
    reconciled: dict[str, Any],
    node_watch: list[dict[str, Any]],
) -> dict[str, Any]:
    static_rows = edge_rows(topology)
    reconciled_rows = edge_rows(reconciled)
    rows = reconciled_rows or static_rows

    all_nodes = {
        str(node.get("node_key"))
        for node in (topology.get("nodes") or [])
        if node.get("node_key")
    }
    for row in rows:
        a, b = edge_tuple(row)
        all_nodes.add(a)
        all_nodes.add(b)

    inbound: dict[str, int] = {node: 0 for node in all_nodes}
    outbound: dict[str, int] = {node: 0 for node in all_nodes}
    for row in rows:
        a, b = edge_tuple(row)
        outbound[a] = outbound.get(a, 0) + 1
        inbound[b] = inbound.get(b, 0) + 1

    findings: list[dict[str, Any]] = []

    graph = adjacency(rows)
    for component in strongly_connected_components(graph):
        self_loop = len(component) == 1 and component[0] in graph.get(component[0], set())
        if len(component) > 1 or self_loop:
            findings.append({
                "finding_type": "dependency_cycle",
                "severity": "info",
                "subject_node_keys": component,
                "summary": "A structural dependency cycle exists in the supplied architecture evidence.",
                "evidence_refs": [],
            })

    for rule in sorted(node_watch, key=lambda r: str(r.get("node_key", ""))):
        node = str(rule["node_key"])
        severity = str(rule.get("severity", "medium"))
        refs = [str(v) for v in (rule.get("evidence_refs") or []) if v]

        if rule.get("expect_connected") is True and inbound.get(node, 0) + outbound.get(node, 0) == 0:
            findings.append({
                "finding_type": "orphan_node",
                "severity": severity,
                "subject_node_keys": [node],
                "summary": "The node watch contract expects connectivity, but no supplied relationship touches this node.",
                "evidence_refs": refs,
            })

        if rule.get("expect_outbound") is True and outbound.get(node, 0) == 0:
            findings.append({
                "finding_type": "dead_output",
                "severity": severity,
                "subject_node_keys": [node],
                "summary": "The node watch contract expects at least one outbound consumer, but none exists in the supplied evidence.",
                "evidence_refs": refs,
            })

        if rule.get("expect_inbound") is True and inbound.get(node, 0) == 0:
            findings.append({
                "finding_type": "orphan_node",
                "severity": severity,
                "subject_node_keys": [node],
                "summary": "The node watch contract expects an inbound producer/caller, but none exists in the supplied evidence.",
                "evidence_refs": refs,
            })

    for finding in reconciled.get("findings") or []:
        if finding.get("finding_type") in {
            "observed_not_declared",
            "declared_not_observed",
            "missing_downstream_receipt",
        }:
            findings.append({
                "finding_type": finding["finding_type"],
                "severity": finding.get("severity", "medium"),
                "relation_id": finding.get("relation_id"),
                "summary": finding.get("summary", ""),
                "evidence_refs": list(finding.get("evidence_refs") or []),
            })

    findings.sort(key=lambda row: (
        str(row.get("finding_type")),
        str(row.get("relation_id", "")),
        "|".join(row.get("subject_node_keys") or []),
    ))

    return {
        "health_version": VERSION,
        "source_revision": topology.get("source_revision"),
        "evidence_boundary": {
            "executes_application_code": False,
            "queries_production": False,
            "missing_runtime_implies_dead_code": False,
            "orphan_and_dead_output_require_watch_contract": True,
            "cycle_findings_are_structural_only": True,
        },
        "counts": {
            "nodes": len(all_nodes),
            "relationships": len(rows),
            "findings": len(findings),
        },
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topology", required=True)
    parser.add_argument("--reconciled", help="Optional reconciler output")
    parser.add_argument("--node-watch", help="Optional JSON array of node watch contracts")
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    payload = analyze(
        load_json(args.topology, {}),
        load_json(args.reconciled, {}),
        load_json(args.node_watch, []),
    )
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
