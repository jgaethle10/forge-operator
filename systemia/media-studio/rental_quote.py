#!/usr/bin/env python3
"""Fail-closed, offline capacity quote estimator. No billing or GPU rental."""
import argparse
import json
from decimal import Decimal, InvalidOperation, ROUND_UP

CENT = Decimal("0.01")

def money(value):
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValueError("invalid monetary amount")
    if not amount.is_finite() or amount < 0:
        raise ValueError("monetary amounts must be finite and nonnegative")
    return amount

def quote(hours, gpu_hourly, storage, network, labor, licensing, fees, margin):
    values = {k: money(v) for k, v in locals().items()}
    if values["hours"] <= 0 or values["hours"] > 2:
        raise ValueError("pilot GPU hours must be greater than zero and no more than 2")
    if values["gpu_hourly"] > Decimal("0.75"):
        raise ValueError("GPU rate exceeds pilot candidate ceiling")
    if values["margin"] >= 1:
        raise ValueError("margin must be below 1")
    compute = values["hours"] * values["gpu_hourly"]
    costs = compute + sum(values[k] for k in ("storage", "network", "labor", "licensing", "fees"))
    price = (costs / (1 - values["margin"])).quantize(CENT, rounding=ROUND_UP)
    return {
        "status": "ESTIMATE_ONLY",
        "provisioning_authorized": False,
        "billing_authorized": False,
        "currency": "USD",
        "estimated_compute": str(compute.quantize(CENT, rounding=ROUND_UP)),
        "estimated_total_cost": str(costs.quantize(CENT, rounding=ROUND_UP)),
        "suggested_customer_price": str(price),
        "warning": "Not a provider billing cap. Storage, network, taxes and actual runtime may vary."
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for field in ("hours", "gpu-hourly", "storage", "network", "labor", "licensing", "fees", "margin"):
        parser.add_argument("--" + field, required=True)
    args = vars(parser.parse_args())
    try:
        result = quote(**{k.replace("-", "_"): v for k, v in args.items()})
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(result, indent=2))
