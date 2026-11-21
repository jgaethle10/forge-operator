"""Evidence gate for synthetic Deep Agents traces.

Pure Python. This validates supplied event records; it does not claim that a
model, checkpoint store, or real sandbox has executed.
"""
from __future__ import annotations
import hashlib
import json
from typing import Any

REQUIRED_AGENTS = frozenset({"claim-extractor", "claim-auditor"})

def evaluate_trace(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Fail closed unless each required subagent has a matching start/completion."""
    if not isinstance(events, list):
        raise TypeError("events must be a list")
    started: set[str] = set()
    completed: set[str] = set()
    errors: list[str] = []
    for index, event in enumerate(events):
        if not isinstance(event, dict):
            errors.append(f"event_{index}_not_object")
            continue
        agent, action = event.get("agent"), event.get("event")
        if agent not in REQUIRED_AGENTS:
            errors.append(f"event_{index}_unknown_agent")
            continue
        if action == "started":
            if agent in started:
                errors.append(f"event_{index}_duplicate_start")
            started.add(agent)
        elif action == "completed":
            if agent not in started or agent in completed:
                errors.append(f"event_{index}_invalid_completion")
            completed.add(agent)
        else:
            errors.append(f"event_{index}_unknown_action")
    missing = sorted(REQUIRED_AGENTS - completed)
    payload = json.dumps(events, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema": "evercraft.saban.deepagents-trace-gate.v0",
        "trace_sha256": hashlib.sha256(payload).hexdigest(),
        "required_agents": sorted(REQUIRED_AGENTS),
        "completed_agents": sorted(completed),
        "missing_agents": missing,
        "errors": errors,
        "verified_from_supplied_events": not errors and not missing,
        "independently_attested": False,
    }
