"""Evercraft Aqua RC06: rainfall timing / water-demand / storage sensitivity.

Models published daily station rain after external source QA. No roof, water
quality, permits, physical irrigation deliveries, or crop estimates verified.
Input Audit is quality-screened in noaa_api_screen; full-year gaps HOLD.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from math import isfinite
from typing import Callable


def valid(name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (float, int)) or not isfinite(value) or value < 0:
        raise ValueError(f'{name} must be a nonnegative finite quantity')
    return float(value)


@dataclass(frozen=True)
class Configuration:
    roof_m2: float = 100
    capture_fraction: float = 0.8
    capacity_l: float = 1000
    first_flush_mm_per_wet_day: float = 0
    daily_tank_loss_fraction: float = 0
    uncollectable_months: tuple[int, ...] = ()
    demand_months: tuple[int, ...] = tuple(range(1, 13))
    daily_demand_l: float = 1000

    def __post_init__(self):
        for key in ('roof_m2', 'capture_fraction', 'capacity_l',
                    'first_flush_mm_per_wet_day', 'daily_tank_loss_fraction', 'daily_demand_l'):
            valid(key, getattr(self, key))
        if self.capture_fraction > 1 or self.daily_tank_loss_fraction > 1:
            raise ValueError('fractions cannot exceed one')
        for name in ('uncollectable_months', 'demand_months'):
            months = getattr(self, name)
            if type(months) is not tuple or any(type(m) is not int or not 1 <= m <= 12 for m in months):
                raise ValueError(f'{name} must be tuple of calendar month numbers')
            if len(set(months)) != len(months):
                raise ValueError(f'{name} contains duplicates')


@dataclass(frozen=True)
class Result:
    source_year: int
    source_sha256: str
    input_l: float
    captured_l: float
    delivered_l: float
    gross_demand_l: float
    external_makeup_l: float
    overflow_l: float
    tank_losses_l: float
    ending_tank_l: float
    mass_balance_error_l: float
    delivered_by_month_l: tuple[float, ...]
    demand_by_month_l: tuple[float, ...]
    observation_status: str
    modeled_status: str


def simulate(audit, config: Configuration) -> Result:
    """One-day-step research scenario, rainfall admitted before day's demand.

    If a month is excluded from collection, *none* of its reported rain
    enters storage: a deliberately severe upper/lower sensitivity, NOT a
    scientific snowmelt model. Tank loss is a fraction of beginning-of-day
    stock before rainfall. This is not a substitute for hourly hydrology.
    """
    if audit.status != 'QC_ATTRIBUTES_SCREEN_COMPLETE_TRACES_ZERO_LOWER_BOUND':
        raise ValueError('HOLD: no complete quality-screened source year')
    if not isinstance(config, Configuration):
        raise TypeError('Configuration required')
    admitted = delivered = demand_total = overflow = losses = 0.0
    tank = 0.0
    delivered_by_month = [0.0] * 12
    demand_by_month = [0.0] * 12
    for reading in audit.observations:
        if reading.precipitation_mm_lower_bound is None or reading.classification not in ('MEASURED', 'TRACE_LOWER_BOUND_ZERO'):
            raise ValueError('HOLD: invalid internal observation')
        month = reading.date.month
        loss = tank * config.daily_tank_loss_fraction
        tank -= loss
        losses += loss
        inflow = 0.0 if month in config.uncollectable_months else (
            max(0.0, reading.precipitation_mm_lower_bound-config.first_flush_mm_per_wet_day)
            * config.roof_m2 * config.capture_fraction)
        admitted += inflow
        tank += inflow
        spill = max(0.0, tank - config.capacity_l)
        tank -= spill
        overflow += spill
        demand = config.daily_demand_l if month in config.demand_months else 0.0
        delivered_day = min(tank, demand)
        tank -= delivered_day
        delivered += delivered_day
        demand_total += demand
        delivered_by_month[month-1] += delivered_day
        demand_by_month[month-1] += demand
    error = admitted - (delivered+overflow+losses+tank)
    if abs(error) > max(1e-6, admitted*1e-10):
        raise ArithmeticError('model water-mass imbalance')
    return Result(audit.year,audit.source_sha256,admitted,admitted,delivered,demand_total,
                  demand_total-delivered,overflow,losses,tank,error,
                  tuple(delivered_by_month), tuple(demand_by_month),audit.status,
                  'SCENARIO_NOT_FIELD_WITHDRAWAL_OR_ECONOMIC_PROOF')


def break_even_value_usd_m3(delivered_l_year: float, capex_usd: float,
                             annual_maintenance_usd: float, project_life_years: float,
                             discount_fraction: float = 0.0) -> float | None:
    """Annualized minimum avoided marginal water value before taxes/other costs.

    Uses annuity annual capital-recovery factor for uniform annual net supply.
    Returns None if no delivery; assumes no residual value; no water tariff
    inferred, no assertion that a grower can avoid paying the supply cost.
    """
    for k,v in [('delivered_l_year',delivered_l_year),('capex_usd',capex_usd),
                ('annual_maintenance_usd',annual_maintenance_usd),('project_life_years',project_life_years),
                ('discount_fraction',discount_fraction)]: valid(k,v)
    if project_life_years <= 0 or discount_fraction > 1:
        raise ValueError('invalid project life or rate')
    if delivered_l_year == 0:
        return None
    if discount_fraction == 0:
        annualized_capital = capex_usd / project_life_years
    else:
        r=discount_fraction; annualized_capital=capex_usd*r/(1-(1+r)**(-project_life_years))
    return (annualized_capital+annual_maintenance_usd)/(delivered_l_year/1000.0)


def year_profiles(audit) -> dict:
    """Sensitivity matrix that never asserts capture permissions or site demand."""
    settings={
        'all_year_base':Configuration(capacity_l=1000),
        'growing_season_only':Configuration(capacity_l=1000,demand_months=(5,6,7,8,9)),
        'growing_season_larger_tank':Configuration(capacity_l=5000,demand_months=(5,6,7,8,9)),
        'growing_season_no_winter_collection':Configuration(capacity_l=5000,demand_months=(5,6,7,8,9),uncollectable_months=(11,12,1,2)),
        'growing_season_first_flush_1mm':Configuration(capacity_l=5000,demand_months=(5,6,7,8,9),first_flush_mm_per_wet_day=1.0),
        'growing_season_0p2pct_daily_loss':Configuration(capacity_l=5000,demand_months=(5,6,7,8,9),daily_tank_loss_fraction=0.002),
        'growing_season_20k_tank':Configuration(capacity_l=20000,demand_months=(5,6,7,8,9)),
    }
    return {name:asdict(simulate(audit,scenario)) for name,scenario in settings.items()}
