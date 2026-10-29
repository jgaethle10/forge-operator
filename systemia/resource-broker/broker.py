#!/usr/bin/env python3
"""Systemia resource broker v0: deterministic, offline, non-provisioning placement."""
from decimal import Decimal, InvalidOperation
import json, sys

KINDS = {"render", "training", "inference", "transcription", "simulation", "browser", "general"}
def dec(value):
    try: v = Decimal(str(value))
    except (InvalidOperation, ValueError): raise ValueError("invalid number")
    if not v.is_finite() or v < 0: raise ValueError("number must be finite and nonnegative")
    return v

def plan(job, offers):
    if job.get("kind") not in KINDS: raise ValueError("unsupported workload kind")
    hours=dec(job.get("estimated_hours"))
    if hours <= 0: raise ValueError("estimated_hours must be positive")
    max_hourly=dec(job.get("max_hourly_usd"))
    max_total=dec(job.get("max_estimated_compute_usd"))
    min_vram=dec(job.get("min_vram_gb",0))
    min_ram=dec(job.get("min_ram_gb",0))
    eligible=[]
    for offer in offers:
        if not isinstance(offer,dict): continue
        try:
            rate=dec(offer.get("hourly_usd"))
            vram=dec(offer.get("vram_gb",0))
            ram=dec(offer.get("ram_gb",0))
            if not offer.get("available") or not offer.get("verified"): continue
            if rate > max_hourly or rate*hours > max_total: continue
            if vram < min_vram or ram < min_ram: continue
            if offer.get("provider") not in ("evercraft-owned","vast","other-approved"): continue
            eligible.append((rate*hours,rate,str(offer.get("id")),offer))
        except ValueError:
            continue
    eligible.sort(key=lambda item:(item[0],item[1],item[2]))
    best=eligible[0] if eligible else None
    return {"schema":"systemia.resource-placement-plan.v0",
            "workload_kind":job["kind"],
            "status":"CANDIDATE_FOUND" if best else "NO_ELIGIBLE_CAPACITY",
            "candidate":{"provider":best[3]["provider"],"id":best[3]["id"],
                         "estimated_compute_usd":str(best[0])} if best else None,
            "estimated_cost_excludes":["storage","network","taxes","idle charges"],
            "provisioning_authorized":False,"spending_authorized":False,
            "execution_performed":False}

if __name__=="__main__":
    payload=json.load(sys.stdin)
    print(json.dumps(plan(payload["job"],payload["offers"]),indent=2))
