#!/usr/bin/env python3
"""Source-grounded architecture query for Systemia.

This tool answers only from supplied architecture evidence. It does not infer
code behavior from names or model intuition. When evidence is absent or
ambiguous, it says so explicitly.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

VERSION = "systemia-architecture-query/1.0"


def load_json(path: str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def tokens(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        return " ".join(tokens(v) for v in value)
    if isinstance(value, dict):
        return " ".join(f"{k} {tokens(v)}" for k, v in sorted(value.items()))
    return str(value)


def score_row(query_terms: list[str], row: dict[str, Any]) -> int:
    searchable = " ".join([
        str(row.get("display_name", "")),
        str(row.get("locator", "")),
        str(row.get("file_path", "")),
        str(row.get("symbol", "")),
        str(row.get("node_key", "")),
    ]).lower()
    score = 0
    for term in query_terms:
        if term in searchable:
            score += 10
        if searchable == term:
            score += 50
        if str(row.get("symbol", "")).lower() == term:
            score += 40
        if str(row.get("display_name", "")).lower() == term:
            score += 40
    return score


def edge_evidence(node_key: str, edges: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hits = []
    for edge in edges:
        if edge.get("from_node_key") != node_key and edge.get("to_node_key") != node_key:
            continue
        hits.append({
            "edge_key": edge.get("edge_key"),
            "relation_type": edge.get("relation_type"),
            "direction": "outbound" if edge.get("from_node_key") == node_key else "inbound",
            "other_node_key": edge.get("to_node_key") if edge.get("from_node_key") == node_key else edge.get("from_node_key"),
            "source_location": edge.get("source_location"),
            "source_excerpt": edge.get("source_excerpt"),
            "discovery_mode": edge.get("discovery_mode"),
            "agreement_state": edge.get("agreement_state"),
            "source_refs": list(edge.get("source_refs") or []),
            "runtime_refs": list(edge.get("runtime_refs") or []),
            "receipt_refs": list(edge.get("receipt_refs") or []),
        })
    hits.sort(key=lambda row: (
        str(row.get("source_location", "")),
        str(row.get("relation_type", "")),
        str(row.get("edge_key", "")),
    ))
    return hits


def query_architecture(
    topology: dict[str, Any],
    query: str,
    limit: int = 10,
) -> dict[str, Any]:
    terms = [term.lower() for term in query.split() if term.strip()]
    nodes = list(topology.get("nodes") or [])
    edges = list(topology.get("edges") or [])

    ranked = []
    for node in nodes:
        score = score_row(terms, node)
        if score > 0:
            ranked.append((score, str(node.get("node_key", "")), node))
    ranked.sort(key=lambda item: (-item[0], item[1]))

    if not ranked:
        return {
            "query_version": VERSION,
            "query": query,
            "state": "not_found",
            "message": "No matching architecture evidence was supplied. No behavior claim can be made from this evidence set.",
            "matches": [],
        }

    top_score = ranked[0][0]
    tied_top = [item for item in ranked if item[0] == top_score]
    state = "ambiguous" if len(tied_top) > 1 else "found"

    matches = []
    for score, _, node in ranked[:limit]:
        node_key = str(node.get("node_key"))
        matches.append({
            "score": score,
            "node_key": node_key,
            "node_type": node.get("node_type"),
            "display_name": node.get("display_name"),
            "locator": node.get("locator"),
            "file_path": node.get("file_path"),
            "symbol": node.get("symbol"),
            "evidence_state": node.get("evidence_state"),
            "confidence": node.get("confidence"),
            "source_refs": list(node.get("source_refs") or []),
            "runtime_refs": list(node.get("runtime_refs") or []),
            "receipt_refs": list(node.get("receipt_refs") or []),
            "relationships": edge_evidence(node_key, edges),
        })

    return {
        "query_version": VERSION,
        "query": query,
        "state": state,
        "message": (
            "Multiple equally strong matches exist; inspect exact locators before making a behavior claim."
            if state == "ambiguous"
            else "Architecture evidence found. Material behavior claims should cite the returned exact source/runtime/receipt evidence."
        ),
        "source_revision": topology.get("source_revision"),
        "matches": matches,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--topology", required=True)
    parser.add_argument("--query", required=True)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    payload = query_architecture(load_json(args.topology), args.query, args.limit)
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
