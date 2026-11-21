"""Evercraft Aqua RC07: carryover, interannual storage, and conservative gates.

RESEARCH ONLY. Daily precipitation inputs are quality-screened station records,
NOT rooftop measurements. Tank, demand and collection are user-supplied
counterfactual assumptions. Never infer safe use, water rights, or field savings.

Repeat-year experiments replay the SAME observed climate year as hypothetical
weather in later cycles. They are NOT independently observed later years.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from math import isfinite
import re

from seasonal_screen import Configuration

STATUS = 'QC_ATTRIBUTES_SCREEN_COMPLETE_TRACES_ZERO_LOWER_BOUND'


@dataclass(frozen=True)
class Cycle:
    source_year: int
    source_sha256: str
    opening_tank_l: float
    admitted_l: float
    delivered_l: float
    gross_demand_l: float
    external_makeup_l: float
    overflow_l: float
    tank_losses_l: float
    ending_tank_l: float
    mass_balance_error_l: float
    active_month_delivered_l: float
    trace_days: int
    mode: str


def _valid_audit(audit):
    if getattr(audit, 'status', None) != STATUS:
        raise ValueError('HOLD: source year is incomplete, flagged or not quality-screened')
    if not isinstance(getattr(audit, 'year', None), int) or isinstance(audit.year, bool):
        raise ValueError('HOLD: invalid year')
    if getattr(audit,'station',None) != 'USW00024243':
        raise ValueError('HOLD: this station-scoped model requires Yakima Airport source')
    if not isinstance(getattr(audit, 'source_sha256', None), str) or not re.fullmatch(r'[0-9a-f]{64}', audit.source_sha256):
        raise ValueError('HOLD: missing or malformed source digest')
    from datetime import date, timedelta
    expected = date(audit.year, 1, 1)
    end = date(audit.year + 1, 1, 1)
    if not getattr(audit, 'observations', None):
        raise ValueError('HOLD: empty observations')
    count = 0
    for reading in audit.observations:
        if reading.date != expected:
            raise ValueError('HOLD: missing, duplicate, unordered or wrong-year day')
        if reading.classification not in ('MEASURED', 'TRACE_LOWER_BOUND_ZERO'):
            raise ValueError('HOLD: invalid precipitation class')
        p = reading.precipitation_mm_lower_bound
        if isinstance(p, bool) or not isinstance(p, (float, int)) or not isfinite(p) or p < 0:
            raise ValueError('HOLD: invalid precipitation quantity')
        if reading.classification == 'TRACE_LOWER_BOUND_ZERO' and p != 0:
            raise ValueError('HOLD: trace cannot be assigned measured precipitation')
        expected += timedelta(days=1)
        count += 1
    if expected != end or count != audit.expected_days:
        raise ValueError('HOLD: full-year observation coverage missing')


def run_cycle(audit, config: Configuration, opening_tank_l: float = 0.0, *, mode='OBSERVED_STATION_YEAR_SCENARIO') -> Cycle:
    """One complete quality-screened station year. Rain admitted before same-day demand.

    Operational caveats: wet-day first flush != rain-event flush, snow delayed,
    no crop-water safety, no measured greenhouse/farm water use.
    """
    _valid_audit(audit)
    if not isinstance(config, Configuration):
        raise TypeError('Configuration must be the validated RC06 dataclass')
    if isinstance(opening_tank_l, bool) or not isinstance(opening_tank_l, (int, float)) or not isfinite(opening_tank_l) or not 0 <= opening_tank_l <= config.capacity_l:
        raise ValueError('starting tank must be finite within the design capacity')
    if mode not in ('OBSERVED_STATION_YEAR_SCENARIO', 'SYNTHETIC_REPLAY_OF_ONE_STATION_YEAR'):
        raise ValueError('unsupported source mode')
    opening = float(opening_tank_l)
    tank = opening
    admitted = delivered = demanded = overflow = losses = active_month_delivered = 0.0
    trace_count = 0
    for obs in audit.observations:
        if obs.classification == 'TRACE_LOWER_BOUND_ZERO':
            trace_count += 1
        month = obs.date.month
        loss = tank * config.daily_tank_loss_fraction
        tank -= loss
        losses += loss
        rain = obs.precipitation_mm_lower_bound
        inflow = 0.0 if month in config.uncollectable_months else max(0.0, rain - config.first_flush_mm_per_wet_day) * config.roof_m2 * config.capture_fraction
        admitted += inflow
        tank += inflow
        spill = max(0.0, tank-config.capacity_l)
        overflow += spill
        tank -= spill
        demand = config.daily_demand_l if month in config.demand_months else 0.0
        demanded += demand
        use = min(tank, demand)
        tank -= use
        delivered += use
        if month in config.demand_months:
            active_month_delivered += use
    balance = opening+admitted-delivered-overflow-losses-tank
    if abs(balance)>max(1e-6,(opening+admitted)*1e-10):
        raise ArithmeticError('water mass balance failed')
    return Cycle(audit.year,audit.source_sha256,opening,admitted,delivered,demanded,demanded-delivered,overflow,losses,tank,balance,active_month_delivered,trace_count,mode)


def simulate_observed_years(audits, config: Configuration, opening_tank_l: float = 0.0):
    """Never fill missing years or stitch incomplete observations together."""
    audits=tuple(audits)
    if not audits:
        raise ValueError('HOLD: at least one validated source year is required')
    for i,audit in enumerate(audits):
        _valid_audit(audit)
        if i and audit.year != audits[i-1].year + 1:
            raise ValueError('HOLD: year gap or duplicate')
    tank=opening_tank_l
    results=[]
    for audit in audits:
        out=run_cycle(audit,config,tank)
        tank=out.ending_tank_l
        results.append(out)
    residual = results[0].opening_tank_l+sum(x.admitted_l for x in results)-sum(x.delivered_l+x.overflow_l+x.tank_losses_l for x in results)-results[-1].ending_tank_l
    if abs(residual) > max(1e-6, sum(x.admitted_l for x in results)*1e-10):
        raise ArithmeticError('cross-year water mass balance failed')
    return tuple(results)


def repeat_one_year(audit, config: Configuration, cycles: int = 5, opening_tank_l: float = 0.0):
    """Diagnostic repeat of ONE YEAR of station weather, NOT a historical series."""
    if isinstance(cycles,bool) or not isinstance(cycles,int) or not 1 <= cycles <= 50:
        raise ValueError('cycles must be an integer 1..50')
    _valid_audit(audit)
    out=[]
    tank=opening_tank_l
    for _ in range(cycles):
        r=run_cycle(audit,config,tank,mode='SYNTHETIC_REPLAY_OF_ONE_STATION_YEAR')
        out.append(r)
        tank=r.ending_tank_l
    return tuple(out)


def repeated_year_equilibrium(audit, config: Configuration, *, tolerance_l: float = 1e-6, maximum_repeats: int = 50):
    """Least reachable fixed point starting empty, not estimated climate equilibrium.

    Starting empty deliberately avoids implying a physically prefilled tank.
    The only 'forecast' is replaying identical days of one source year.
    """
    if not isinstance(maximum_repeats,int) or isinstance(maximum_repeats,bool) or not 2 <= maximum_repeats <= 1000:
        raise ValueError('invalid repeat bound')
    if isinstance(tolerance_l,bool) or not isinstance(tolerance_l,(int,float)) or not isfinite(tolerance_l) or not 0 < tolerance_l <= 1:
        raise ValueError('invalid tolerance')
    start=0.0
    for i in range(1,maximum_repeats+1):
        r=run_cycle(audit,config,start,mode='SYNTHETIC_REPLAY_OF_ONE_STATION_YEAR')
        if abs(r.ending_tank_l-start)<=tolerance_l:
            return {'cycles_to_fixed_point':i, 'annual_cycle':asdict(r),
                    'repeat_source_year':audit.year,
                    'evidence_state':'REPEATED_SINGLE_YEAR_WHAT_IF_NOT_OBSERVED_MULTIYEAR'}
        start=r.ending_tank_l
    raise ValueError('HOLD: repeating-year cycle did not converge; do not report equilibrium')