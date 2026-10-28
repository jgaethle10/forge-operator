#!/usr/bin/env python3
"""Vast pricing/instance inventory for Fallen Studios. READ ONLY, no rental.
No host addresses, labels, environment, API keys or account identifiers are emitted.
GPU pricing and bandwidth/storage pricing should be treated as host-set live quotes.
"""
import os, json, urllib.request, datetime, pathlib, sys

API="https://console.vast.ai/api/v0"
key=os.environ.get("VAST_API_KEY","")
if not key: raise SystemExit("HOLD: no Vast key (no provider mutation)")

def query(endpoint, payload=None):
    headers={"Authorization":"Bearer "+key,"Content-Type":"application/json"}
    kwargs={"headers":headers,"timeout":20}
    if payload is not None:
        kwargs["data"]=json.dumps(payload).encode()
        kwargs["method"]="POST"
    else:
        kwargs["method"]="GET"
    with urllib.request.urlopen(urllib.request.Request(API+endpoint,**kwargs),timeout=20) as r:
        return json.load(r)

def numeric(x):
    if isinstance(x,bool) or x is None: return None
    try:
        n=float(x)
        return n if n>=0 and n<1e8 else None
    except (TypeError,ValueError): return None

try:
    inventory=query("/instances/")
    if not isinstance(inventory,dict) or not isinstance(inventory.get("instances"),list):
        raise ValueError("account_instance_inventory_unknown_shape")
    num_instances=len(inventory["instances"])
    q={
      "verified":{"eq":True},"rentable":{"eq":True},
      "gpu_name":{"in":["RTX 4090"]},"num_gpus":{"eq":1},
      "gpu_ram":{"gte":23000},"cpu_ram":{"gte":32000},
      "reliability":{"gte":0.95},"disk_space":{"gte":10},
      "type":"ondemand","limit":50,"order":[["dph_total","asc"]]
    }
    result=query("/bundles/",q)
    offers=result.get("offers",result.get("instances",None))
    if not isinstance(offers,list):raise ValueError("offers_response_unknown_shape")
    rows=[]
    for item in offers:
        if not isinstance(item,dict):continue
        rate=numeric(item.get("dph_total"))
        disk_month=numeric(item.get("storage_cost"))
        up=numeric(item.get("inet_up_cost"))
        down=numeric(item.get("inet_down_cost"))
        vram=numeric(item.get("gpu_ram"));ram=numeric(item.get("cpu_ram"))
        reliability=numeric(item.get("reliability2",item.get("reliability")))
        if (rate is None or rate>0.75 or rate<=0 or vram is None or vram<23000
          or ram is None or ram<32000 or reliability is None or reliability<0.95
          or item.get("gpu_name")!="RTX 4090" or item.get("num_gpus")!=1):continue
        billable_fields_complete=all(x is not None for x in (disk_month,up,down))
        # Cautious upper bound: dph_total may already include a default storage allowance.
        # Adding all storage may double-count, which is safer than undercounting.
        upper=(rate*2+(10*disk_month/730*2)+(1*up)+(1*down)) if billable_fields_complete else None
        rows.append({
            "offer_id":item.get("id"),"gpu":"RTX 4090","usd_per_gpu_hour":rate,
            "storage_usd_per_gb_month":disk_month,
            "inet_up_usd_per_gb":up,"inet_down_usd_per_gb":down,
            "budgeted_hours":2,"budgeted_disk_gb":10,
            "budgeted_ingress_gb":1,"budgeted_egress_gb":1,
            "upper_estimate_usd":round(upper,4) if upper is not None else None,
            "budget_3usd_appears_to_fit":upper is not None and upper<=3,
            "provider_filter_verified":True,
            "host_status_independently_verified":False,
            "rental_approved":False
        })
    rows.sort(key=lambda x:x["usd_per_gpu_hour"])
    report={
      "schema":"evercraft.fallen.vast.complete-readonly-quote.v1",
      "checked_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "mode":"READ_ONLY","rental_started":False,
      "account_instances_count":num_instances,
      "scanned_offers":len(offers),"qualified_gpu_offers":len(rows),
      "complete_price_offers":sum(row["upper_estimate_usd"] is not None for row in rows),
      "examples":rows[:5],
      "status":"QUOTES_AVAILABLE_RENTAL_STILL_HELD" if rows else "HOLD_NO_MATCH",
      "warning":"Quotes are not reservations. No paid instance, no charge; independent cleanup and host status remain unverified."
    }
except Exception as exc:
    # Avoid printing provider responses with privileged account fields.
    print("HOLD: read-only price/inventory check failed:",type(exc).__name__,str(exc)[:120])
    raise SystemExit(2)
out=pathlib.Path("artifacts/fallen-flagship-council/vast-complete-readonly-quote.json")
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(report,indent=2)+"\n")
print(json.dumps(report,indent=2))
