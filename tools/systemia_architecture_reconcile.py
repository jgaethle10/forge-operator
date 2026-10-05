#!/usr/bin/env python3
"""Reconcile declared topology, runtime observations, and durable receipts.

This tool is read-only. It merges evidence channels without upgrading one channel
into another. Static source is not runtime proof; runtime activity is not
downstream receipt proof.

Runtime coverage is assumed partial unless the caller explicitly proves otherwise.
That means an unobserved declared edge is *not* automatically treated as dead.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

VERSION = "systemia-architecture-reconcile/1.1"
DEFAULT_WATCH = {"routes_to", "invokes", "publishes_to", "emits", "consumes", "writes"}
DEFAULT_RECEIPT_REQUIRED = {"publishes_to", "routes_to"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def load_json(path: str | None) -> Any:
    if not path:
        return None
    return json.loads(Path(path).read_text(encoding="utf-8"))


def rows_from_payload(payload: Any, *keys: str) -> list[dict]:
    if payload is None:
        return []
    if isinstance(payload, list):
        return [row for row in payload if isinstance(row, dict)]
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return [row for row in value if isinstance(row, dict)]
    return []


def edge_identity(edge: dict) -> tuple[str, str, str]:
    return (
        str(edge["from_node_key"]),
        str(edge["to_node_key"]),
        str(edge["relation_type"]),
    )


def refs(edge: dict | None) -> list[str]:
    if not edge:
        return []
    found: list[str] = []
    for field in ("source_refs", "runtime_refs", "receipt_refs", "evidence_refs"):
        value = edge.get(field) or []
        if isinstance(value, str):
            value = [value]
        found.extend(str(item) for item in value if item)
    return sorted(set(found))


def aggregate_edges(edges: list[dict]) -> dict[tuple[str, str, str], dict]:
    grouped: dict[tuple[str, str, str], dict] = {}
    for edge in edges:
        try:
            ident = edge_identity(edge)
        except KeyError:
            continue
        current = grouped.get(ident)
        if current is None:
            current = {
                "from_node_key": ident[0],
                "to_node_key": ident[1],
                "relation_type": ident[2],
                "source_refs": [],
                "runtime_refs": [],
                "receipt_refs": [],
                "evidence_refs": [],
                "observation_states": [],
            }
            grouped[ident] = current

        for field in ("source_refs", "runtime_refs", "receipt_refs", "evidence_refs"):
            values = edge.get(field) or []
            if isinstance(values, str):
                values = [values]
            current[field] = sorted(set(current[field]) | {str(v) for v in values if v})

        states = edge.get("observation_states")
        if not states and edge.get("observation_state"):
            states = [edge.get("observation_state")]
        if isinstance(states, str):
            states = [states]
        if states:
            current["observation_states"] = sorted(
                set(current["observation_states"]) | {str(v) for v in states if v}
            )

    return grouped


def normalize_locator_observations(
    topology_payload: Any,
    observations: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Resolve locator-based runtime observations against a declared topology.

    Observations that reference an unknown source or target are returned separately.
    They are not silently discarded and are not invented into the declared graph.
    """
    nodes = rows_from_payload(topology_payload, "nodes")
    by_locator = {
        str(node.get("locator")): str(node.get("node_key"))
        for node in nodes
        if node.get("locator") and node.get("node_key")
    }

    normalized: list[dict] = []
    unresolved: list[dict] = []

    for observation in observations:
        source_locator = str(observation.get("source_locator") or "")
        target_locator = str(observation.get("target_locator") or "")
        relation = str(observation.get("relation_type") or "")
        source_key = by_locator.get(source_locator)
        target_key = by_locator.get(target_locator)

        if not source_key or not target_key or not relation:
            unresolved.append({
                "observation_key": observation.get("observation_key"),
                "source_locator": source_locator,
                "target_locator": target_locator,
                "relation_type": relation,
                "missing_source_locator": bool(source_locator and not source_key),
                "missing_target_locator": bool(target_locator and not target_key),
                "missing_relation_type": not bool(relation),
                "evidence_refs": refs(observation),
            })
            continue

        observation_key = str(observation.get("observation_key") or "")
        runtime_refs = [observation_key] if observation_key else []
        normalized.append({
            "from_node_key": source_key,
            "to_node_key": target_key,
            "relation_type": relation,
            "runtime_refs": runtime_refs,
            # These receipt refs are supporting evidence attached to the runtime
            # observation. They do not make the edge "receipted" in reconciliation.
            "receipt_refs": observation.get("receipt_refs") or [],
            "evidence_refs": observation.get("evidence_refs") or [],
            "observation_state": observation.get("observation_state") or "attempted",
        })

    return normalized, unresolved


def observation_succeeded(edge: dict | None) -> bool:
    if not edge:
        return False
    states = set(str(v) for v in (edge.get("observation_states") or []) if v)
    if not states:
        # Backward-compatible direct observed edges represent an observed runtime edge.
        return True
    return "succeeded" in states


def reconcile(
    declared: list[dict],
    observed: list[dict],
    receipted: list[dict],
    watch_relations: set[str] | None = None,
    receipt_required: set[str] | None = None,
    runtime_coverage_complete: bool = False,
) -> dict:
    watch = DEFAULT_WATCH if watch_relations is None else watch_relations
    required = DEFAULT_RECEIPT_REQUIRED if receipt_required is None else receipt_required

    declared_map = aggregate_edges(declared)
    observed_map = aggregate_edges(observed)
    receipt_map = aggregate_edges(receipted)
    identities = sorted(set(declared_map) | set(observed_map) | set(receipt_map))

    reconciled: list[dict] = []
    findings: list[dict] = []

    for ident in identities:
        d = declared_map.get(ident)
        o = observed_map.get(ident)
        r = receipt_map.get(ident)
        relation = ident[2]

        if r:
            agreement = "receipt_confirmed"
        elif d and o:
            agreement = "declared_and_observed"
        elif d:
            agreement = "declared_only"
        else:
            agreement = "observed_only"

        evidence = sorted(set(refs(d) + refs(o) + refs(r)))

        row = {
            "edge_key": "reconciled:" + digest("\x1f".join(ident))[:24],
            "from_node_key": ident[0],
            "to_node_key": ident[1],
            "relation_type": relation,
            "agreement_state": agreement,
            "declared": bool(d),
            "observed": bool(o),
            "receipted": bool(r),
            "observation_states": (o or {}).get("observation_states", []),
            "evidence_refs": evidence,
        }
        reconciled.append(row)

        if relation in watch and o and not d:
            findings.append({
                "finding_key": "finding:" + digest("observed_not_declared\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "observed_not_declared",
                "severity": "high",
                "subject_edge_key": row["edge_key"],
                "summary": f"Runtime observed {relation} edge not represented in declared topology.",
                "evidence_refs": evidence,
            })

        if runtime_coverage_complete and relation in watch and d and not o:
            findings.append({
                "finding_key": "finding:" + digest("declared_not_observed\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "declared_not_observed",
                "severity": "medium",
                "subject_edge_key": row["edge_key"],
                "summary": f"Declared {relation} edge was not observed in a runtime evidence window explicitly marked complete.",
                "evidence_refs": evidence,
            })

        if relation in required and o and observation_succeeded(o) and not r:
            findings.append({
                "finding_key": "finding:" + digest("missing_downstream_receipt\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "missing_downstream_receipt",
                "severity": "high",
                "subject_edge_key": row["edge_key"],
                "summary": f"Observed successful {relation} edge lacks a separate durable downstream receipt.",
                "evidence_refs": evidence,
            })

    return {
        "reconciler_version": VERSION,
        "evidence_boundary": {
            "declared_is_runtime_proof": False,
            "runtime_is_receipt_proof": False,
            "receipt_is_source_declaration": False,
            "runtime_coverage_complete": runtime_coverage_complete,
            "unobserved_declared_edge_is_dead_by_default": False,
        },
        "counts": {
            "declared_edges": len(declared_map),
            "observed_edges": len(observed_map),
            "receipt_edges": len(receipt_map),
            "reconciled_edges": len(reconciled),
            "findings": len(findings),
        },
        "edges": reconciled,
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--declared", required=True)
    parser.add_argument("--observed")
    parser.add_argument("--observed-locators")
    parser.add_argument("--receipted")
    parser.add_argument("--out", default="-")
    parser.add_argument("--watch-relation", action="append")
    parser.add_argument("--receipt-required-relation", action="append")
    parser.add_argument(
        "--runtime-coverage-complete",
        action="store_true",
        help="Only use when the supplied runtime evidence window is demonstrably complete for the watched scope.",
    )
    args = parser.parse_args()

    declared_payload = load_json(args.declared)
    declared = rows_from_payload(declared_payload, "edges")

    observed = rows_from_payload(load_json(args.observed), "edges", "observations", "entities")
    unresolved: list[dict] = []
    if args.observed_locators:
        locator_rows = rows_from_payload(
            load_json(args.observed_locators),
            "observations",
            "entities",
            "edges",
        )
        normalized, unresolved = normalize_locator_observations(declared_payload, locator_rows)
        observed.extend(normalized)

    receipted = rows_from_payload(load_json(args.receipted), "edges", "receipts", "entities")

    payload = reconcile(
        declared,
        observed,
        receipted,
        set(args.watch_relation) if args.watch_relation else None,
        set(args.receipt_required_relation) if args.receipt_required_relation else None,
        runtime_coverage_complete=args.runtime_coverage_complete,
    )
    payload["unresolved_runtime_observations"] = unresolved
    payload["counts"]["unresolved_runtime_observations"] = len(unresolved)

    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.out == "-":
        print(encoded, end="")
    else:
        Path(args.out).write_text(encoded, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
