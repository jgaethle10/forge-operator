#!/usr/bin/env python3
"""Reconcile declared topology, runtime observations, and durable receipts.

This tool is read-only. It merges evidence channels without upgrading one channel
into another. Static source is not runtime proof; runtime activity is not
downstream receipt proof.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

VERSION = "systemia-architecture-reconcile/1.0"
DEFAULT_WATCH = {"routes_to", "invokes", "publishes_to", "emits", "consumes", "writes"}
DEFAULT_RECEIPT_REQUIRED = {"publishes_to", "routes_to", "writes"}


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def edge_identity(edge: dict) -> tuple[str, str, str]:
    return (
        str(edge["from_node_key"]),
        str(edge["to_node_key"]),
        str(edge["relation_type"]),
    )


def load_edges(path: str | None) -> list[dict]:
    if not path:
        return []
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    return payload.get("edges", [])


def refs(edge: dict) -> list[str]:
    found: list[str] = []
    for field in ("source_refs", "runtime_refs", "receipt_refs", "evidence_refs"):
        value = edge.get(field) or []
        if isinstance(value, str):
            value = [value]
        found.extend(str(item) for item in value)
    return sorted(set(found))


def reconcile(
    declared: list[dict],
    observed: list[dict],
    receipted: list[dict],
    watch_relations: set[str] | None = None,
    receipt_required: set[str] | None = None,
) -> dict:
    watch = DEFAULT_WATCH if watch_relations is None else watch_relations
    required = DEFAULT_RECEIPT_REQUIRED if receipt_required is None else receipt_required

    declared_map = {edge_identity(edge): edge for edge in declared}
    observed_map = {edge_identity(edge): edge for edge in observed}
    receipt_map = {edge_identity(edge): edge for edge in receipted}
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

        evidence = sorted(set(
            (refs(d) if d else [])
            + (refs(o) if o else [])
            + (refs(r) if r else [])
        ))

        reconciled.append({
            "edge_key": "reconciled:" + digest("\x1f".join(ident))[:24],
            "from_node_key": ident[0],
            "to_node_key": ident[1],
            "relation_type": relation,
            "agreement_state": agreement,
            "declared": bool(d),
            "observed": bool(o),
            "receipted": bool(r),
            "evidence_refs": evidence,
        })

        if relation in watch and o and not d:
            findings.append({
                "finding_key": "finding:" + digest("observed_not_declared\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "observed_not_declared",
                "severity": "high",
                "subject_edge_key": reconciled[-1]["edge_key"],
                "summary": f"Runtime observed {relation} edge not represented in declared topology.",
                "evidence_refs": evidence,
            })

        if relation in watch and d and not o and observed:
            findings.append({
                "finding_key": "finding:" + digest("declared_not_observed\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "declared_not_observed",
                "severity": "medium",
                "subject_edge_key": reconciled[-1]["edge_key"],
                "summary": f"Declared {relation} edge was not observed in supplied runtime evidence.",
                "evidence_refs": evidence,
            })

        if relation in required and (d or o) and not r:
            findings.append({
                "finding_key": "finding:" + digest("missing_downstream_receipt\x1f" + "\x1f".join(ident))[:24],
                "finding_type": "missing_downstream_receipt",
                "severity": "high",
                "subject_edge_key": reconciled[-1]["edge_key"],
                "summary": f"{relation} edge lacks a durable downstream receipt.",
                "evidence_refs": evidence,
            })

    return {
        "reconciler_version": VERSION,
        "evidence_boundary": {
            "declared_is_runtime_proof": False,
            "runtime_is_receipt_proof": False,
            "receipt_is_source_declaration": False,
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
    parser.add_argument("--receipted")
    parser.add_argument("--out", default="-")
    parser.add_argument("--watch-relation", action="append")
    parser.add_argument("--receipt-required-relation", action="append")
    args = parser.parse_args()

    payload = reconcile(
        load_edges(args.declared),
        load_edges(args.observed),
        load_edges(args.receipted),
        set(args.watch_relation) if args.watch_relation else None,
        set(args.receipt_required_relation) if args.receipt_required_relation else None,
    )
    encoded = json.dumps(payload, indent=2, sort_keys=True) + "\n"
    if args.out == "-":
        print(encoded, end="")
    else:
        Path(args.out).write_text(encoded, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
