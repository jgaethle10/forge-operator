#!/usr/bin/env python3
"""Deterministic reconciliation for Systemia architecture evidence.

This tool keeps three evidence lanes separate:

1. declared source topology from systemia_architecture_scan.py
2. observed runtime relationships supplied as bounded JSON evidence
3. durable receipt evidence supplied as bounded JSON evidence

It does not execute application code, query production, or infer missing runtime
behavior from static source. Missing-observation and missing-receipt findings are
only emitted for relationships explicitly listed in a watch contract.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import json
from pathlib import Path
from typing import Any

VERSION = "systemia-architecture-reconcile/1.0"


def load_json(path: str | None, default: Any) -> Any:
    if not path:
        return default
    return json.loads(Path(path).read_text(encoding="utf-8"))


def relation_key(row: dict[str, Any]) -> tuple[str, str, str]:
    return (
        str(row["from_node_key"]),
        str(row["to_node_key"]),
        str(row["relation_type"]),
    )


def relation_id(key: tuple[str, str, str]) -> str:
    return "|".join(key)


def refs(row: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for field in ("evidence_ref", "receipt_ref", "source_ref"):
        value = row.get(field)
        if isinstance(value, str) and value:
            values.append(value)
    extra = row.get("evidence_refs")
    if isinstance(extra, list):
        values.extend(str(v) for v in extra if v)
    return values


def index_rows(rows: list[dict[str, Any]]) -> dict[tuple[str, str, str], list[dict[str, Any]]]:
    out: dict[tuple[str, str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        out[relation_key(row)].append(row)
    return dict(out)


def dedupe_strings(values: list[str]) -> list[str]:
    return sorted(set(v for v in values if v))


def reconcile(
    static_snapshot: dict[str, Any],
    runtime_rows: list[dict[str, Any]],
    receipt_rows: list[dict[str, Any]],
    watch_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    declared_rows = list(static_snapshot.get("edges") or [])
    declared = index_rows(declared_rows)
    observed = index_rows(runtime_rows)
    receipted = index_rows(receipt_rows)
    watched = {relation_key(row): row for row in watch_rows}

    all_keys = sorted(set(declared) | set(observed) | set(receipted) | set(watched))
    relationships: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []

    for key in all_keys:
        d = declared.get(key, [])
        o = observed.get(key, [])
        r = receipted.get(key, [])
        watch = watched.get(key, {})
        has_d, has_o, has_r = bool(d), bool(o), bool(r)

        if has_r:
            agreement = "receipt_confirmed"
        elif has_d and has_o:
            agreement = "declared_and_observed"
        elif has_o and not has_d:
            agreement = "observed_only"
        else:
            agreement = "declared_only"

        evidence_refs = dedupe_strings(
            [ref for row in d + o + r for ref in refs(row)]
        )
        source_locations = dedupe_strings(
            [str(row.get("source_location")) for row in d if row.get("source_location")]
        )

        relationships.append({
            "relation_id": relation_id(key),
            "from_node_key": key[0],
            "to_node_key": key[1],
            "relation_type": key[2],
            "agreement_state": agreement,
            "declared": has_d,
            "observed": has_o,
            "receipted": has_r,
            "declared_edge_keys": dedupe_strings(
                [str(row.get("edge_key")) for row in d if row.get("edge_key")]
            ),
            "source_locations": source_locations,
            "evidence_refs": evidence_refs,
        })

        if has_o and not has_d:
            findings.append({
                "finding_type": "observed_not_declared",
                "severity": watch.get("severity", "medium"),
                "relation_id": relation_id(key),
                "summary": "Runtime evidence describes a relationship absent from the supplied declared topology.",
                "evidence_refs": evidence_refs,
            })

        if watch.get("require_observed") is True and not has_o:
            findings.append({
                "finding_type": "declared_not_observed",
                "severity": watch.get("severity", "medium"),
                "relation_id": relation_id(key),
                "summary": "The watch contract requires runtime observation, but none was supplied for this relationship.",
                "evidence_refs": evidence_refs,
            })

        if watch.get("require_receipt") is True and not has_r:
            findings.append({
                "finding_type": "missing_downstream_receipt",
                "severity": watch.get("severity", "high"),
                "relation_id": relation_id(key),
                "summary": "The watch contract requires durable downstream proof, but no matching receipt was supplied.",
                "evidence_refs": evidence_refs,
            })

    findings.sort(key=lambda row: (row["finding_type"], row["relation_id"]))
    relationships.sort(key=lambda row: row["relation_id"])

    return {
        "reconciler_version": VERSION,
        "source_revision": static_snapshot.get("source_revision"),
        "evidence_boundary": {
            "executes_application_code": False,
            "queries_production": False,
            "missing_runtime_implies_dead_code": False,
            "missing_findings_require_explicit_watch_contract": True,
        },
        "input_counts": {
            "declared_edges": len(declared_rows),
            "runtime_rows": len(runtime_rows),
            "receipt_rows": len(receipt_rows),
            "watched_relations": len(watch_rows),
        },
        "counts": {
            "relationships": len(relationships),
            "findings": len(findings),
            "declared_only": sum(1 for row in relationships if row["agreement_state"] == "declared_only"),
            "observed_only": sum(1 for row in relationships if row["agreement_state"] == "observed_only"),
            "declared_and_observed": sum(1 for row in relationships if row["agreement_state"] == "declared_and_observed"),
            "receipt_confirmed": sum(1 for row in relationships if row["agreement_state"] == "receipt_confirmed"),
        },
        "relationships": relationships,
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--static", required=True, help="Static scanner JSON")
    parser.add_argument("--runtime", help="JSON array of observed relationships")
    parser.add_argument("--receipts", help="JSON array of durable receipt relationships")
    parser.add_argument("--watch", help="JSON array of explicit watch contracts")
    parser.add_argument("--out", default="-")
    args = parser.parse_args()

    payload = reconcile(
        load_json(args.static, {}),
        load_json(args.runtime, []),
        load_json(args.receipts, []),
        load_json(args.watch, []),
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
