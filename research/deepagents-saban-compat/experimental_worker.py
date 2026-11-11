"""Opt-in Deep Agents experiment. Run ONLY inside an isolated disposable container.

No Systemia credentials, host mounts, public ingress, or production tool access.
The worker deliberately exposes no custom host tools. Deep Agents may expose its
own filesystem tools, so container isolation is a hard prerequisite.
"""
import json
import os
import sys
import time
from delegation_observer import delegation_receipt
from pathlib import Path

def main():
    if os.environ.get("EVERCRAFT_DISPOSABLE_SANDBOX") != "I_CONFIRM_ISOLATION":
        raise SystemExit("BLOCKED: disposable sandbox acknowledgement required")
    if os.environ.get("EVERCRAFT_PRODUCTION") or os.environ.get("EVERCRAFT_CAPACITY_TOKENS_JSON"):
        raise SystemExit("BLOCKED: production environment variables detected")
    model_name = os.environ.get("EVERCRAFT_SPIKE_MODEL")
    if not model_name:
        raise SystemExit("BLOCKED: EVERCRAFT_SPIKE_MODEL required")
    from deepagents import create_deep_agent
    from langchain.chat_models import init_chat_model
    from langgraph.checkpoint.memory import MemorySaver

    model = init_chat_model(model_name)
    agents = [
        {"name": "claim-extractor", "description": "Extract factual claims and quote supporting lines.",
         "system_prompt": "Use only supplied synthetic documents. Report source lines. Never invent citations."},
        {"name": "claim-auditor", "description": "Independently check extracted claims for contradictions.",
         "system_prompt": "Compare supplied synthetic documents and flag unsupported claims."},
    ]
    agent = create_deep_agent(
        model=model,
        subagents=agents,
        checkpointer=MemorySaver(),
        system_prompt=(
            "This is a synthetic evaluation. Delegate extraction to claim-extractor "
            "and independent verification to claim-auditor. Return a compact JSON "
            "object with claims, evidence, discrepancies and verdict. "
            "Do not access files, shell, network, or external services."
        ),
    )
    documents = {
        "A": "L1: Sample engine is rated at 12 kW.\nL2: It was tested on Tuesday.",
        "B": "L1: Sample engine is rated at 10 kW.\nL2: The test date was Tuesday."
    }
    started = time.monotonic()
    result = agent.invoke(
        {"messages": [{"role": "user", "content": "Compare these synthetic records: " + json.dumps(documents)}]},
        config={"configurable": {"thread_id": "evercraft-deepagents-synthetic-001"},
                "recursion_limit": 35},
    )
    messages = result.get("messages", [])
    last = messages[-1].content if messages else ""
    delegation = delegation_receipt(messages)
    receipt = {
        "schema": "evercraft.saban.deepagents-spike.v0",
        "synthetic": True,
        "runtime_invoked": True,
        "checkpoint_recovery_tested": False,
        "model": model_name,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "message_count": len(messages),
        "delegation_observation": delegation,
        "two_subagent_delegation_observed": delegation["all_subagent_task_calls_observed"],
        "response": last if isinstance(last, str) else str(last),
        "limitations": ["In-memory checkpoint only", "Subagent delegation not independently verified by this receipt",
                        "No Systemia/Fabric integration", "Container isolation must be externally verified"],
    }
    destination = Path("/tmp/evercraft-deepagents-receipt.json")
    destination.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"receipt_path": str(destination), "message_count": len(messages),
                      "two_subagent_delegation_observed": delegation["all_subagent_task_calls_observed"]}))

if __name__ == "__main__":
    main()
