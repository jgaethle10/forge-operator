#!/usr/bin/env python3
"""Research-only Saban planner: local model proposes, deterministic policy authorizes.

No execution, network access beyond loopback model endpoint, or production integration.
"""
import argparse
import hashlib
import json
import re
import urllib.request

REGISTRY = {
    "researcher": {"capabilities": ["read_public_evidence"]},
    "analyst": {"capabilities": ["analyze_supplied_evidence"]},
    "auditor": {"capabilities": ["review_worker_outputs"]},
}
MAX_WORKERS = 3
POLICY = "evercraft.saban.research-planner.v1"

def canonical(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))

def authorize(plan, objective):
    if not isinstance(objective, str) or not 1 <= len(objective) <= 1000:
        raise ValueError("invalid objective")
    if not isinstance(plan, dict) or set(plan) != {"objective", "workers"}:
        raise ValueError("invalid plan structure")
    if plan["objective"] != objective:
        raise ValueError("objective mismatch")
    workers = plan["workers"]
    if not isinstance(workers, list) or not 1 <= len(workers) <= MAX_WORKERS:
        raise ValueError("invalid worker count")
    seen = set()
    for worker in workers:
        if not isinstance(worker, dict) or set(worker) != {"role", "task", "capabilities"}:
            raise ValueError("invalid worker structure")
        role = worker["role"]
        if not isinstance(role, str) or role not in REGISTRY or role in seen:
            raise ValueError("unapproved or duplicate role")
        seen.add(role)
        task = worker["task"]
        if not isinstance(task, str) or not 1 <= len(task) <= 300:
            raise ValueError("invalid worker task")
        caps = worker["capabilities"]
        if not isinstance(caps, list) or len(caps) != len(set(map(str, caps))):
            raise ValueError("invalid capabilities")
        if any(not isinstance(c, str) for c in caps) or not set(caps).issubset(REGISTRY[role]["capabilities"]):
            raise ValueError("unapproved capability")
    return {
        "schema": POLICY,
        "status": "authorized_plan_only",
        "objective_sha256": hashlib.sha256(objective.encode()).hexdigest(),
        "workers": workers,
        "plan_sha256": hashlib.sha256(canonical(plan).encode()).hexdigest(),
        "execution_enabled": False,
    }

def propose(objective, endpoint, timeout):
    if not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):[0-9]{1,5}/v1/chat/completions", endpoint):
        raise ValueError("only local model endpoint allowed")
    instruction = (
        "You are a research-only mission planner. Respond with one JSON object, no markdown. "
        "Exactly two keys: objective (copy the user objective exactly), workers (1 to 3 entries). "
        "Each worker has exactly role, task, capabilities. Available roles and capabilities: "
        + canonical(REGISTRY) + ". Each role may appear at most once. "
        "Never request shell, filesystem, payment, publishing or network permissions."
    )
    payload = {"messages": [{"role": "system", "content": instruction},
                            {"role": "user", "content": objective}],
               "temperature": 0, "max_tokens": 350, "stream": False,
               "chat_template_kwargs": {"enable_thinking": False}}
    req = urllib.request.Request(endpoint, data=canonical(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        result = json.load(response)
    choice = result["choices"][0]
    if choice.get("finish_reason") != "stop":
        raise ValueError("incomplete planner response")
    return json.loads(choice["message"]["content"])

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--objective", required=True)
    p.add_argument("--endpoint", default="http://127.0.0.1:8080/v1/chat/completions")
    p.add_argument("--timeout", type=int, default=120)
    p.add_argument("--plan-file", help="Validate a supplied JSON plan without inference")
    a = p.parse_args()
    try:
        if a.plan_file:
            with open(a.plan_file, encoding="utf-8") as f:
                plan = json.load(f)
        else:
            plan = propose(a.objective, a.endpoint, a.timeout)
        result = authorize(plan, a.objective)
    except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as e:
        print("PLAN REJECTED:", str(e))
        return 1
    print(json.dumps(result, indent=2))
    print("PLAN AUTHORIZATION: PASS (NO EXECUTION)")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
