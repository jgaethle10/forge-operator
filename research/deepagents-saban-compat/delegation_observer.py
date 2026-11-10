"""Collect actual Deep Agents task-tool calls from returned LangChain messages.

This is an observation helper, not independent attestation. Only explicit tool
call records count; a final answer saying 'I delegated' is insufficient.
"""
from __future__ import annotations
import hashlib
import json

AGENTS = {"claim-extractor", "claim-auditor"}

def extract_delegations(messages):
    calls = []
    for message_index, message in enumerate(messages):
        tool_calls = getattr(message, "tool_calls", None) or []
        for call in tool_calls:
            if not isinstance(call, dict) or call.get("name") != "task":
                continue
            args = call.get("args") or {}
            if not isinstance(args, dict):
                continue
            name = args.get("subagent_type")
            if name in AGENTS:
                calls.append({
                    "message_index": message_index,
                    "tool_call_id": call.get("id"),
                    "subagent": name,
                    "observed_task_call": True,
                })
    return calls

def delegation_receipt(messages):
    calls = extract_delegations(messages)
    seen = {x["subagent"] for x in calls}
    canonical = json.dumps(calls, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema": "evercraft.saban.deepagents-delegation-observation.v0",
        "observed_subagents": sorted(seen),
        "missing_subagents": sorted(AGENTS - seen),
        "all_subagent_task_calls_observed": seen == AGENTS,
        "tool_calls": calls,
        "trace_sha256": hashlib.sha256(canonical).hexdigest(),
        "execution_success_verified": False,
        "independently_attested": False,
    }
