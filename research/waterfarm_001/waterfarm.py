"""WATERFARM-001: advisory-only water-balance model, not a control system.

All flow units are liters/day, energy in kWh/day, area in square meters,
precipitation/first-flush in millimeters. No water-quality certification.
"""
from dataclasses import dataclass
from math import isfinite


def _nonnegative(name: str, value: float) -> float:
    if isinstance(value, bool) or not isfinite(value) or value < 0:
        raise ValueError(f"{name} must be finite and nonnegative")
    return value


@dataclass(frozen=True)
class Site:
    roof_area_m2: float
    tank_capacity_l: float
    capture_efficiency: float = 0.80
    first_flush_mm: float = 0.0
    roof_capture_authorized: bool = False
    condensate_reuse_authorized: bool = False
    nonpotable_delivery_authorized: bool = False

    def __post_init__(self) -> None:
        _nonnegative("roof_area_m2", self.roof_area_m2)
        _nonnegative("tank_capacity_l", self.tank_capacity_l)
        _nonnegative("capture_efficiency", self.capture_efficiency)
        _nonnegative("first_flush_mm", self.first_flush_mm)
        if self.capture_efficiency > 1:
            raise ValueError("capture_efficiency cannot exceed 1")


@dataclass(frozen=True)
class DailyObservation:
    rainfall_mm: float
    demand_l: float
    measured_condensate_l: float = 0.0
    condenser_energy_kwh: float = 0.0

    def __post_init__(self) -> None:
        for key in ("rainfall_mm", "demand_l", "measured_condensate_l", "condenser_energy_kwh"):
            _nonnegative(key, getattr(self, key))


@dataclass(frozen=True)
class DailyResult:
    harvested_rain_l: float
    recovered_condensate_l: float
    quarantined_condensate_l: float
    delivered_nonpotable_l: float
    external_makeup_l: float
    overflow_l: float
    ending_tank_l: float
    condenser_kwh_per_l: float | None
    mass_balance_error_l: float


def roof_rain_l(site: Site, rainfall_mm: float) -> float:
    """1 mm precipitation over 1 m² equals 1 liter, before losses."""
    _nonnegative("rainfall_mm", rainfall_mm)
    if not site.roof_capture_authorized:
        return 0.0
    return site.roof_area_m2 * max(0.0, rainfall_mm - site.first_flush_mm) * site.capture_efficiency


def simulate_day(site: Site, reading: DailyObservation, starting_tank_l: float = 0.0) -> DailyResult:
    """Simulate an isolated water tank; never controls a real valve or pump.

    Authorization booleans represent a *completed independent site review*, not
    a regulatory determination by this program. Contaminated/uncertified water
    remains segregated. No potable use is modeled.
    """
    _nonnegative("starting_tank_l", starting_tank_l)
    if starting_tank_l > site.tank_capacity_l:
        raise ValueError("starting water exceeds tank capacity")

    rain = roof_rain_l(site, reading.rainfall_mm)
    recaptured = reading.measured_condensate_l if site.condensate_reuse_authorized else 0.0
    quarantined = reading.measured_condensate_l - recaptured
    gross_stored = starting_tank_l + rain + recaptured
    overflow = max(0.0, gross_stored - site.tank_capacity_l)
    available = gross_stored - overflow
    delivered = min(available, reading.demand_l) if site.nonpotable_delivery_authorized else 0.0
    external = reading.demand_l - delivered
    ending = available - delivered
    balance = starting_tank_l + rain + recaptured - overflow - delivered - ending
    intensity = (reading.condenser_energy_kwh / reading.measured_condensate_l
                 if reading.measured_condensate_l > 0 else None)
    return DailyResult(rain, recaptured, quarantined, delivered,
                       external, overflow, ending, intensity, balance)
