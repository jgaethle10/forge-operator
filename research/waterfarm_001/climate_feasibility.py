"""EVERCRAFT AQUA WATERFARM-001: climate and physics feasibility screen.

Research/advisory only. This is not a water-quality, yield, treatment, water-right,
 or equipment-control model. No external dependency or hardware interface.

Monthly precipitation dataset reproduces Yakima Airport station USW00024243
NOAA 1991–2020 monthly normals as tabulated by HistoricalClimate (secondary
publisher, confirm original NOAA archive before externally citing a design).
Source: https://historicalclimate.com/stations/yakima-air-terminal-wa-us-usw00024243
NOAA dataset: https://www.ncei.noaa.gov/products/land-based-station/us-climate-normals
"""
from dataclasses import asdict, dataclass
from math import exp, isfinite
import calendar
import json

MONTHLY_PRECIP_IN = (1.19, 0.81, 0.64, 0.55, 0.74, 0.50, 0.20, 0.21, 0.23, 0.64, 0.86, 1.44)
MONTH_NAMES = tuple(calendar.month_abbr[i] for i in range(1, 13))


def finite_number(name: str, value: float, *, min_value: float = 0, max_value: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise ValueError(f'{name} must be a finite number')
    if value < min_value or (max_value is not None and value > max_value):
        raise ValueError(f'{name} outside allowed range')
    return float(value)


@dataclass(frozen=True)
class MonthlyPotential:
    month: str
    precipitation_mm: float
    roof_input_l: float
    max_same_month_offset_l: float
    baseline_external_demand_l: float


@dataclass(frozen=True)
class RoofScenario:
    area_m2: float
    capture_fraction: float
    daily_demand_l: float
    monthly: tuple[MonthlyPotential, ...]
    annual_roof_input_l: float
    annual_external_demand_l: float
    annual_same_month_offset_upper_bound_l: float
    annual_ratio_optimistic: float


def roof_supply_potential(area_m2: float, capture_fraction: float,
                          daily_demand_l: float, precip_inches: tuple[float, ...] = MONTHLY_PRECIP_IN,
                          days: tuple[int, ...] | None = None) -> RoofScenario:
    """Optimistic gross collection and same-month demand offset, NO rain event schedule.

    Collection not adjusted for first flush, snow, bypass, roof contamination,
    tank limitations, imperfect demand timing, regulatory permission, etc.
    Uses no inter-month storage. Months treated as potential maxima, not forecasts.
    """
    area = finite_number('area_m2', area_m2)
    fraction = finite_number('capture_fraction', capture_fraction, max_value=1)
    demand = finite_number('daily_demand_l', daily_demand_l)
    if len(precip_inches) != 12:
        raise ValueError('exactly twelve monthly precipitation readings required')
    if days is None:
        days = tuple(calendar.monthrange(2025, i)[1] for i in range(1, 13))
    if len(days) != 12 or any(isinstance(d, bool) or not isinstance(d, int) or d < 28 or d > 31 for d in days):
        raise ValueError('invalid month days')
    rows = []
    for name, inches, count in zip(MONTH_NAMES, precip_inches, days):
        mm = 25.4 * finite_number('precip_inches', inches)
        roof = mm * area * fraction
        month_demand = count * demand
        rows.append(MonthlyPotential(name, mm, roof, min(roof, month_demand), month_demand))
    annual_in = sum(m.roof_input_l for m in rows)
    annual_dem = sum(m.baseline_external_demand_l for m in rows)
    upper = sum(m.max_same_month_offset_l for m in rows)
    return RoofScenario(area, fraction, demand, tuple(rows), annual_in, annual_dem, upper,
                        upper / annual_dem if annual_dem else 0.)


@dataclass(frozen=True)
class AirMoisturePotential:
    inlet_g_m3: float
    cold_coil_saturation_g_m3: float
    condensable_g_m3_upper: float
    max_collected_l: float


def saturation_vapor_density_g_m3(celsius: float) -> float:
    """Magnus approximation + ideal vapor gas, approximate near 0–50°C."""
    t = finite_number('temp_c', celsius, min_value=0, max_value=50)
    es_pa = 610.94 * exp(17.625 * t / (t + 243.04))
    return 1000.0 * es_pa / (461.5 * (t + 273.15))


def moist_air_upper_bound(inlet_c: float, inlet_rh_pct: float, coil_c: float,
                          air_m3: float, vapor_collection_fraction: float = 1.0) -> AirMoisturePotential:
    """Upper-bound vapor removable from a one-pass air stream.

    Does not model crop vapor replenishment, airflow alteration by cooling,
    sensible/latent loads, actual coil effectiveness, frost or outlet mixing.
    RH refers to inlet. Coil temp is an assumed outlet saturation temperature.
    """
    t_in = finite_number('inlet_c', inlet_c, min_value=0, max_value=50)
    t_coil = finite_number('coil_c', coil_c, min_value=0, max_value=50)
    if t_coil > t_in:
        raise ValueError('coil outlet temperature cannot exceed inlet')
    rh = finite_number('inlet_rh_pct', inlet_rh_pct, max_value=100)
    volume = finite_number('air_m3', air_m3)
    frac = finite_number('vapor_collection_fraction', vapor_collection_fraction, max_value=1)
    inlet = saturation_vapor_density_g_m3(t_in) * rh / 100
    outlet = saturation_vapor_density_g_m3(t_coil)
    condensable = max(0., inlet - outlet)
    return AirMoisturePotential(inlet, outlet, condensable,
                               condensable * volume * frac / 1000.)


@dataclass(frozen=True)
class EnergyScreen:
    target_l: float
    assumed_kwh_per_l: float
    assumed_price_usd_per_kwh: float
    electricity_kwh: float
    electricity_usd: float
    electricity_usd_per_m3: float


def energy_scenario(target_l: float, kwh_per_l: float, price_usd_per_kwh: float) -> EnergyScreen:
    """Cost of electricity only, NOT comprehensive water-production economics."""
    l = finite_number('target_l', target_l)
    intensity = finite_number('kwh_per_l', kwh_per_l)
    price = finite_number('price_usd_per_kwh', price_usd_per_kwh)
    electricity = l * intensity
    return EnergyScreen(l, intensity, price, electricity, electricity * price,
                        intensity * price * 1000)


def demo() -> dict:
    roof = roof_supply_potential(100, .8, 1000)
    indoor = moist_air_upper_bound(30, 80, 15, 1000, 1)
    outdoor = moist_air_upper_bound(30, 20, 15, 1000, 1)
    costs = [energy_scenario(1000, intensity, .12) for intensity in (.5, 1.2)]
    return {
        'evidence_state': 'SCENARIO_ONLY_NOT_OBSERVED',
        'source_station_id': 'USW00024243',
        'source_monthly_precip_inches': MONTHLY_PRECIP_IN,
        'source_note': 'Secondary publication of 1991-2020 NOAA normals, confirm with NOAA archive',
        'roof': asdict(roof),
        'air_humid_one_pass': asdict(indoor),
        'air_dry_one_pass': asdict(outdoor),
        'illustrative_energy_costs': [asdict(row) for row in costs],
        'warnings': ['No local measured humidity data used',
                     'Do not infer the air case represents Yakima actual humidity',
                     'Roof rainfall sums over months: ignore event timing, snow and tank losses',
                     'Electricity $0.12/kWh is illustrative, not a quoted Yakima tariff',
                     'No legal authorization, potable certification or agricultural treatment clearance',
                     'Condensate recycling is not newly created watershed water'],
    }


if __name__ == '__main__':
    print(json.dumps(demo(), indent=2))
