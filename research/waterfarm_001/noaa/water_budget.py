"""WaterFarm observational rainfall -> hypothetical roof/tank/demand scenario.

No regulatory authorization, treatment/quality clearance or observed customer data.
A station is not a roof; this model is for pre-feasibility and comparison only.
A QC-complete GHCN station year is required; missing/flagged days cause HOLD.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from math import isfinite
import argparse
import json
from pathlib import Path
from ghcnd_source import DataHold, Intake, parse_station


def positive(name: str, x: float, *, zero_ok: bool = True) -> float:
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not isfinite(x) or x < 0 or (not zero_ok and x == 0):
        raise ValueError(f'{name} must be finite and {"nonnegative" if zero_ok else "positive"}')
    return float(x)


@dataclass(frozen=True)
class TankCase:
    tank_l: float
    roof_area_m2: float
    daily_nonpotable_demand_l_assumed: float
    capture_coefficient_assumed: float
    first_flush_mm_per_wet_day_assumed: float
    incoming_rain_l: float
    admitted_l: float
    delivered_to_demand_l: float
    overflow_l: float
    ending_storage_l: float
    external_makeup_l: float
    demand_l: float
    longest_consecutive_days_with_makeup: int
    mass_error_l: float
    evidence_state: str


def scenario(intake: Intake, *, roof_area_m2: float, tank_l: float,
             daily_nonpotable_demand_l: float, capture_fraction: float = .8,
             first_flush_mm_per_wet_day: float = 0.0) -> TankCase:
    """Research upper bound with real station rainfall only when QC-screened.

    Assumptions: all rainfall from reported observation day can be captured
    before that day's demand; site weather = station weather, water quality
    and roof eligibility not asserted; no evaporation/leaks/snow storage.
    """
    if intake.days_held or 'COMPLETE_QC_SCREEN' not in intake.status:
        raise DataHold('QC incomplete: no tank/yield estimate may be produced')
    area = positive('roof area', roof_area_m2)
    capacity = positive('tank', tank_l)
    daily = positive('daily demand', daily_nonpotable_demand_l)
    coef = positive('capture_fraction', capture_fraction)
    flush = positive('first flush', first_flush_mm_per_wet_day)
    if coef > 1:
        raise ValueError('capture coefficient > 1 is invalid')
    stored = admitted = delivered = overflow = gross = 0.0
    longest = run = 0
    for obs in intake.days:
        if obs.status != 'CLEAR' or obs.prcp_mm is None:
            raise DataHold('internal inconsistency in weather QC')
        rain = obs.prcp_mm
        gross += rain * area
        rain_in = max(0, rain-flush) * area * coef
        admitted += rain_in
        stock = stored + rain_in
        spill = max(0.0, stock - capacity)
        overflow += spill
        stored = stock-spill
        use = min(stored, daily)
        stored -= use
        delivered += use
        if use < daily - 1e-8:
            run += 1
            longest = max(longest, run)
        else:
            run = 0
    demand = daily * len(intake.days)
    balance = admitted - delivered - overflow - stored
    if abs(balance) > max(1e-6, admitted * 1e-10):
        raise ArithmeticError('tank mass balance failed')
    return TankCase(capacity, area, daily, coef, flush, gross, admitted,
                    delivered, overflow, stored, demand-delivered, demand,
                    longest, balance,
                    'HYPOTHETICAL_ROOF_AND_DEMAND_USING_QC_SCREENED_STATION_RAINFALL_SOURCE_AUTHENTICITY_UNVERIFIED')


def compare_tanks(intake: Intake, tanks_l: tuple[float, ...], *, roof_area_m2: float,
                  daily_nonpotable_demand_l: float, capture_fraction: float=.8,
                  first_flush_mm_per_wet_day: float=0.0) -> dict:
    if not tanks_l:
        raise ValueError('must compare at least one tank size')
    sizes = [positive('tank capacity', t) for t in tanks_l]
    if sizes != sorted(set(sizes)):
        raise ValueError('tank capacities must be increasing and unique')
    rows = [asdict(scenario(intake, roof_area_m2=roof_area_m2, tank_l=t,
                            daily_nonpotable_demand_l=daily_nonpotable_demand_l,
                            capture_fraction=capture_fraction,
                            first_flush_mm_per_wet_day=first_flush_mm_per_wet_day)) for t in sizes]
    return {'input_station':intake.station,'input_year':intake.year,
            'ghcnd_raw_sha256':intake.raw_sha256,
            'source_authenticity':'UNVERIFIED_UNLESS_OFFICIAL_HTTPS_DOWNLOAD_RECEIPT_VALIDATED',
            'overall_state':'RESEARCH_ONLY_HYPOTHETICAL_TANK_AND_DEMAND',
            'results':rows,
            'limitations':['Observed station PRCP is not verified roof inflow or available liquid water.',
                           'Snow/freeze, overflow time within day, first-flush event count, evap, leaks and treatment omitted.',
                           'Assumed demand is NOT measured site withdrawal or production.',
                           'No installation, permission, water rights, quality or economic viability inferred.']}


def main():
    a = argparse.ArgumentParser(description=__doc__)
    a.add_argument('--input', type=Path, required=True, help='NOAA GHCN .dly file, not fabricated input')
    a.add_argument('--year', type=int, default=2025)
    a.add_argument('--roof-m2', type=float, default=100)
    a.add_argument('--daily-demand-l', type=float, default=1000,
                   help='Hypothetical demand; never inferred from real customer')
    a.add_argument('--tanks-l', type=float, nargs='+', default=[250,1000,5000,20000])
    a.add_argument('--out', type=Path, default=Path('tank_screen.json'))
    opts = a.parse_args()
    obs = parse_station(opts.input.read_bytes(), year=opts.year)
    result = compare_tanks(obs,tuple(opts.tanks_l),roof_area_m2=opts.roof_m2,
                           daily_nonpotable_demand_l=opts.daily_demand_l)
    opts.out.write_text(json.dumps(result, indent=2)+'\n')
    print('SCENARIO_ONLY:', opts.out)

if __name__=='__main__': main()
