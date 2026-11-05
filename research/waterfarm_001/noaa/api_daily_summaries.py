"""Evercraft Aqua RC05: conservative NOAA Daily Summaries water-budget screen.

Input: saved text/plain CSV from NCEI Access Data Service with includeAttributes=true.
No network, field device control, water quality certification, or water right inference.
A trace precipitation report ('T') is not a dry day; for modeled *collectable*
water it has a conservative 0 mm lower bound, not an estimated amount.
Any missing data, nonempty quality flag, unsupported measurement flag, source
missing, duplicate day, or time invalidity HOLDS the full annual model.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import json
import calendar
import io
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from math import isfinite
from pathlib import Path

STATION = "USW00024243"

class QualityHold(ValueError):
    pass

@dataclass(frozen=True)
class Daily:
    date: date
    precipitation_mm_lower_bound: float | None
    classification: str
    measurement_flag: str
    quality_flag: str
    source_flag: str
    time: str

@dataclass(frozen=True)
class Audit:
    year: int
    source_sha256: str
    station: str
    expected_days: int
    received_days: int
    observed_amount_days: int
    trace_days: int
    missing_days: tuple[str, ...]
    bad_quality_days: tuple[str, ...]
    total_precip_mm_lower_bound: float | None
    status: str
    observations: tuple[Daily, ...]


def parse_csv(source: str, *, year: int, station: str = STATION) -> Audit:
    if not isinstance(source, str) or not source.strip():
        raise QualityHold("empty source")
    if not isinstance(year, int) or isinstance(year, bool) or year < 1900 or year > 2100:
        raise ValueError("invalid year")
    reader = csv.DictReader(io.StringIO(source))
    expected_cols = {"STATION", "DATE", "PRCP", "PRCP_ATTRIBUTES"}
    if reader.fieldnames is None or set(reader.fieldnames) != expected_cols:
        raise QualityHold("invalid NOAA attributes CSV header")
    found = {}
    for row in reader:
        if not isinstance(row, dict) or None in row or row["STATION"] != station:
            raise QualityHold("station mismatch or malformed CSV")
        try:
            day = date.fromisoformat(row["DATE"])
        except (TypeError, ValueError) as exc:
            raise QualityHold("invalid date") from exc
        if day.year != year or day in found:
            raise QualityHold("duplicate/outside year")
        value = row["PRCP"]
        attr = row["PRCP_ATTRIBUTES"]
        # NOAA can legitimately return PRCP and PRCP_ATTRIBUTES both empty.
        # This is a missing day, not a source-format failure and never zero rain.
        if value is None or value == "":
            found[day] = Daily(day, None, "MISSING", "", "", "", "")
            continue
        flags = attr.split(",") if isinstance(attr, str) else []
        if len(flags) != 4:
            raise QualityHold(f"bad attribute columns at {day}")
        m, q, s, t = flags
        if len(m) > 1 or len(q) > 1 or len(s) != 1 or t not in ("2400", "0700", "0800", "0900", "0000"):
            raise QualityHold(f"ambiguous source attributes on {day}")
        try:
            number = float(value)
        except ValueError as exc:
            raise QualityHold(f"nonnumeric precipitation on {day}") from exc
        if not isfinite(number) or number < 0:
            raise QualityHold(f"invalid precipitation on {day}")
        if q or m not in ("", "T") or not s:
            found[day] = Daily(day, None, "FLAGGED", m, q, s, t)
        elif m == "T":
            if number != 0:
                raise QualityHold(f"trace recorded with nonzero measured precipitation: {day}")
            found[day] = Daily(day, 0.0, "TRACE_LOWER_BOUND_ZERO", m, q, s, t)
        else:
            found[day] = Daily(day, number, "MEASURED", m, q, s, t)
    first, last = date(year,1,1), date(year+1,1,1)
    days, missing, bad = [], [], []
    d = first
    while d < last:
        obs = found.get(d)
        if obs is None:
            obs = Daily(d, None, "MISSING", "", "", "", "")
        days.append(obs)
        if obs.classification == "MISSING": missing.append(d.isoformat())
        if obs.classification == "FLAGGED": bad.append(d.isoformat())
        d += timedelta(days=1)
    ok = not missing and not bad
    total = round(sum(o.precipitation_mm_lower_bound for o in days if o.precipitation_mm_lower_bound is not None), 4) if ok else None
    return Audit(year, hashlib.sha256(source.encode('utf-8')).hexdigest(), station,
                 len(days), len(found), sum(o.classification=="MEASURED" for o in days),
                 sum(o.classification=="TRACE_LOWER_BOUND_ZERO" for o in days),
                 tuple(missing),tuple(bad),total,
                 "QC_ATTRIBUTES_SCREEN_COMPLETE_TRACES_ZERO_LOWER_BOUND" if ok else "HOLD_INCOMPLETE_OR_FLAGGED",
                 tuple(days))


def tank_scenario(audit: Audit, *, area_m2=100, tank_l=1000, daily_demand_l=1000, capture_fraction=0.8,
                  first_flush_mm_per_wet_day=0.0) -> dict:
    if audit.status.startswith("HOLD"):
        raise QualityHold("incomplete data: no full-year tank claim")
    for name,x in [("roof area",area_m2),("tank",tank_l),("demand",daily_demand_l),("capture fraction",capture_fraction),("first flush",first_flush_mm_per_wet_day)]:
        if not isinstance(x,(int,float)) or isinstance(x,bool) or not isfinite(x) or x<0:
            raise ValueError(f"bad {name}")
    if capture_fraction>1:raise ValueError("fraction cannot exceed one")
    storage = supply = overflow = potential = admitted = 0.0
    month_supply = [0.0]*12
    for obs in audit.observations:
        rain = obs.precipitation_mm_lower_bound
        if rain is None: raise QualityHold("missing day on internally complete audit")
        potential += rain*area_m2*capture_fraction
        inflow = max(0.0,rain-first_flush_mm_per_wet_day)*area_m2*capture_fraction
        admitted += inflow
        storage += inflow
        spill = max(0.0,storage-tank_l)
        overflow += spill
        storage -= spill
        used = min(storage,daily_demand_l)
        month_supply[obs.date.month-1]+=used
        supply += used
        storage -= used
    balance = admitted-(supply+overflow+storage)
    if abs(balance)>max(1e-6,admitted*1e-10):raise ArithmeticError("tank mass-balance error")
    return {"year":audit.year,"station":audit.station,"weather_source_sha256":audit.source_sha256,
            "weather_state":audit.status,"assumptions":{"roof_area_m2":area_m2,"tank_l":tank_l,"daily_demand_l":daily_demand_l,
            "capture_fraction":capture_fraction,"first_flush_mm_per_wet_day":first_flush_mm_per_wet_day},
            "gross_roof_potential_l":round(potential,3),"tank_admitted_l":round(admitted,3),
            "delivered_l":round(supply,3),"overflow_l":round(overflow,3),"ending_tank_l":round(storage,3),
            "outside_makeup_l":round(daily_demand_l*len(audit.observations)-supply,3),
            "month_delivered_l":[round(v,3) for v in month_supply],"balance_error_l":round(balance,9),
            "evidence_state":"REAL_STATION_OBSERVATIONS__HYPOTHETICAL_ROOF_STORAGE_AND_DEMAND__NOT_SITE_YIELD",
            "limitations":["Snow and ice reported as precipitation may not be capturable on observation day",
            "Trace precipitation lower-bound modeled as 0 usable liters, but not called dry",
            "No treatment/disinfection/roof approvals assumed; first flush based on wet DAYS not individual events",
            "Assumed rain enters tank before same-day demand; no evaporation or leaks",
            "Station precipitation can differ from host-site rainfall and irrigation demand"]}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input",required=True,type=Path)
    p.add_argument("--year",required=True,type=int)
    p.add_argument("--out",required=True,type=Path)
    a=p.parse_args()
    audit=parse_csv(a.input.read_text(encoding="utf-8"),year=a.year)
    results={"qc":{"year":audit.year,"sha256":audit.source_sha256,"expected":audit.expected_days,
           "received":audit.received_days,"trace_days":audit.trace_days,"missing":audit.missing_days,
           "bad_quality":audit.bad_quality_days,"observed_precip_mm_lower_bound":audit.total_precip_mm_lower_bound,"status":audit.status},
           "cases":[]}
    if not audit.status.startswith("HOLD"):
        results["cases"]=[tank_scenario(audit,tank_l=t) for t in (250,1000,5000,20000)]
    a.out.write_text(json.dumps(results,indent=2)+"\n")
    print(json.dumps(results["qc"],indent=2))

if __name__=="__main__":main()
