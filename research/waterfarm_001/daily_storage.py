"""WATERFARM-001: deterministic, audit-friendly roof water storage screen.

Advisory research only. Does not infer permits, safe water quality, daily weather,
or actual efficiency. All precipitation and daily demand must be supplied. At
most one assumed first flush per wet *day*, not per actual storm; this is an
explicit model limitation. Rain is available before same-day demand; reality
may differ. Separate monthly-normal illustrations are SYNTHETIC time series.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite
from typing import Iterable


def number(label: str, value: float, minimum: float = 0.0) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value) or value < minimum:
        raise ValueError(f"{label} must be a finite number >= {minimum}")
    return float(value)


@dataclass(frozen=True)
class Day:
    date: date
    precipitation_mm: float
    nonpotable_demand_l: float

    def __post_init__(self):
        if not isinstance(self.date, date) or isinstance(self.date, __import__('datetime').datetime):
            raise ValueError('date must be a date without time')
        number('precipitation_mm', self.precipitation_mm)
        number('nonpotable_demand_l', self.nonpotable_demand_l)


@dataclass(frozen=True)
class Model:
    roof_area_m2: float
    tank_capacity_l: float
    collection_fraction: float
    first_flush_mm_per_wet_day: float = 0.0
    eligible_roof_and_site_approved: bool = False
    nonpotable_delivery_approved: bool = False

    def __post_init__(self):
        for key in ('roof_area_m2', 'tank_capacity_l', 'collection_fraction', 'first_flush_mm_per_wet_day'):
            number(key, getattr(self, key))
        if self.collection_fraction > 1:
            raise ValueError('collection_fraction must be <=1')
        if type(self.eligible_roof_and_site_approved) is not bool or type(self.nonpotable_delivery_approved) is not bool:
            raise ValueError('approval flags must be bool')


@dataclass(frozen=True)
class Summary:
    days: int
    input_mm: float
    potential_roof_l: float
    admitted_roof_l: float
    delivered_l: float
    demand_l: float
    external_makeup_l: float
    overflow_l: float
    ending_tank_l: float
    days_fully_supplied: int
    max_consecutive_days_with_external_demand: int
    mass_balance_error_l: float


def simulate(days: Iterable[Day], config: Model) -> Summary:
    """Simulate inventory exactly once/day, fail closed on gaps, empty or disorder.

    Internal tank conservation: available inflow = used + overflow + stored.
    No climate/weather completeness guarantee other than consecutive dates.
    """
    previous = None
    count = 0
    tank = 0.0
    rain_mm = raw = admitted = supplied = demand_total = overflow = 0.0
    full_days = current_external_streak = longest_external_streak = 0
    for day in days:
        if not isinstance(day, Day):
            raise ValueError('each reading must be a validated Day')
        if previous is not None and day.date != previous + timedelta(days=1):
            raise ValueError('input date gap, duplicate or disorder: HOLD')
        previous = day.date
        count += 1
        rain_mm += day.precipitation_mm
        demand_total += day.nonpotable_demand_l
        gross = day.precipitation_mm * config.roof_area_m2 * config.collection_fraction
        raw += gross
        first_flush = min(day.precipitation_mm, config.first_flush_mm_per_wet_day)
        collected = ((day.precipitation_mm-first_flush) * config.roof_area_m2 * config.collection_fraction
                     if config.eligible_roof_and_site_approved else 0.0)
        admitted += collected
        after_rain = tank + collected
        spill = max(0.0, after_rain - config.tank_capacity_l)
        overflow += spill
        available = after_rain - spill
        used = min(available, day.nonpotable_demand_l) if config.nonpotable_delivery_approved else 0.0
        tank = available - used
        supplied += used
        external = day.nonpotable_demand_l-used
        if external > 1e-8:
            current_external_streak += 1
            longest_external_streak = max(longest_external_streak, current_external_streak)
        else:
            current_external_streak = 0
            full_days += 1
    if not count:
        raise ValueError('no days supplied: HOLD')
    mass_error = admitted - supplied - overflow - tank
    if abs(mass_error) > max(1e-6, admitted * 1e-10):
        raise ArithmeticError('water mass balance failed')
    return Summary(count, rain_mm, raw, admitted, supplied, demand_total,
                   demand_total-supplied, overflow, tank, full_days,
                   longest_external_streak, mass_error)


def monthly_normal_synthetic(monthly_inches: tuple[float, ...], year: int,
                             demand_l_day: float, profile: str) -> tuple[Day, ...]:
    """Build synthetic event sequences with identical monthly totals.

    PROFILE uniform = equal rainfall every day; final_day = all rainfall on
    last day of month; neither is a forecast or climatological event frequency.
    """
    import calendar
    if profile not in ('uniform', 'final_day'):
        raise ValueError('unknown distribution profile')
    if len(monthly_inches) != 12:
        raise ValueError('requires 12 months')
    number('demand_l_day', demand_l_day)
    if isinstance(year, bool) or type(year) is not int or not 1900 <= year <= 2200:
        raise ValueError('invalid year')
    rows = []
    for month, inches in enumerate(monthly_inches, start=1):
        mm = 25.4 * number('monthly precip', inches)
        count = calendar.monthrange(year, month)[1]
        for day in range(1, count + 1):
            rain = mm/count if profile == 'uniform' else (mm if day == count else 0.0)
            rows.append(Day(date(year, month, day), rain, demand_l_day))
    return tuple(rows)


def gross_savings_capital_limit(delivered_l_year: float, unit_water_value_usd_per_m3: float,
                                target_payback_years: float) -> float:
    """Maximum capex in zero-OPEX fantasy; never a quoted cost or ROI."""
    l = number('delivered_l_year', delivered_l_year)
    v = number('unit_water_value_usd_per_m3', unit_water_value_usd_per_m3)
    y = number('target_payback_years', target_payback_years)
    return l / 1000 * v * y
