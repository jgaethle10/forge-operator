"""Evercraft Aqua paired research screen v0.5.

An internal pre-analysis gate, not a treatment, causal attribution, safe reuse,
clinical, agronomic, or commercial certification. This estimates only a
conservative *candidate* water-offset signal under explicit assumptions.

Data are supplied by researchers; this module does not observe or verify sensors,
review human signatures, inspect site rights, or authorize crop-water handling.
"""
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from math import isfinite, sqrt
from statistics import mean, stdev
import json

# Upper, two-sided 95% Student-t critical values for 1..29 degrees freedom.
T95 = (12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
       2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120,
       2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064,
       2.060, 2.056, 2.052, 2.048, 2.045)


def finite(name, x, low=0):
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not isfinite(x) or x < low:
        raise ValueError(f'{name} must be a finite number >= {low}')
    return float(x)


@dataclass(frozen=True)
class PairedDay:
    date_utc: date
    baseline_external_l: float
    treatment_external_l: float
    condensate_collected_l: float
    condensate_reused_l: float
    baseline_system_kwh: float
    treatment_system_kwh: float
    quality_pass: bool
    crop_conditions_comparable: bool

    def __post_init__(self):
        if type(self.date_utc) is not date:
            raise ValueError('calendar date required; no ambiguous datetime timestamps')
        for k in ('baseline_external_l', 'treatment_external_l',
                  'condensate_collected_l', 'condensate_reused_l',
                  'baseline_system_kwh', 'treatment_system_kwh'):
            finite(k, getattr(self, k))
        if self.condensate_reused_l > self.condensate_collected_l + 1e-9:
            raise ValueError('reuse cannot exceed collection')
        if type(self.quality_pass) is not bool or type(self.crop_conditions_comparable) is not bool:
            raise ValueError('quality and comparability must be explicit Booleans')


@dataclass(frozen=True)
class Protocol:
    registration_id: str
    preregistered: bool
    independent_scientific_review: bool
    safe_reuse_authorized_for_specific_end_use: bool
    max_meter_error_l_per_daily_reading: float
    minimum_pairs: int = 14

    def __post_init__(self):
        if not isinstance(self.registration_id, str) or not self.registration_id.strip():
            raise ValueError('registration ID required')
        for k in ('preregistered', 'independent_scientific_review',
                  'safe_reuse_authorized_for_specific_end_use'):
            if type(getattr(self, k)) is not bool:
                raise ValueError(f'{k} must be bool')
        finite('max_meter_error_l_per_daily_reading', self.max_meter_error_l_per_daily_reading)
        if type(self.minimum_pairs) is not int or self.minimum_pairs < 2:
            raise ValueError('minimum_pairs must be integer >= 2')


@dataclass(frozen=True)
class TrialScreen:
    state: str
    paired_days: int
    captured_l: float
    safely_reused_l: float
    observed_external_withdrawal_difference_l: float
    statistical_95pct_lower_l: float
    meter_error_conservative_lower_l: float
    conservative_candidate_offset_l: float
    incremental_system_kwh: float
    reasons: tuple[str, ...]
    limitations: str


def evaluate_paired(days: list[PairedDay], protocol: Protocol) -> TrialScreen:
    if not days or any(not isinstance(d, PairedDay) for d in days):
        raise ValueError('supplied valid paired observations required: HOLD')
    last = None
    for d in days:
        if last is not None and d.date_utc != last + timedelta(days=1):
            raise ValueError('date gaps, duplicates or out-of-order days: HOLD')
        last = d.date_utc
        if not d.quality_pass or not d.crop_conditions_comparable:
            raise ValueError('sensor QA or grow conditions failed: HOLD')
        if not protocol.safe_reuse_authorized_for_specific_end_use and d.condensate_reused_l > 0:
            raise ValueError('unauthorized condensate use: HOLD')
    n = len(days)
    diffs = [d.baseline_external_l - d.treatment_external_l for d in days]
    delta = sum(diffs)
    used = sum(d.condensate_reused_l for d in days)
    capture = sum(d.condensate_collected_l for d in days)
    energy = sum(d.treatment_system_kwh - d.baseline_system_kwh for d in days)
    tcrit = T95[n-2] if n <= 30 else T95[-1]  # >=2.045 for df>=29: conservative
    sampling_lower = n * (mean(diffs) - tcrit * stdev(diffs) / sqrt(n)) if n >= 2 else float('-inf')
    meter_lower = delta - (2*n*protocol.max_meter_error_l_per_daily_reading)
    reasons = []
    if n < protocol.minimum_pairs:
        reasons.append('insufficient consecutive paired observations')
    if not protocol.preregistered:
        reasons.append('protocol not preregistered before observation')
    if not protocol.independent_scientific_review:
        reasons.append('independent scientific review not recorded')
    if not protocol.safe_reuse_authorized_for_specific_end_use:
        reasons.append('specific end-use reuse authorization absent')
    if used <= 0:
        reasons.append('no condensate actually reused')
    if sampling_lower <= 0:
        reasons.append('paired lower confidence bound does not exceed zero')
    if meter_lower <= 0:
        reasons.append('meter uncertainty overwhelms apparent difference')
    # This is a screening bound, not causal identification: even a clean paired
    # experiment may contain confounders. Cap credit at physically reused liters.
    candidate = max(0.0, min(used, sampling_lower, meter_lower)) if not reasons else 0.0
    return TrialScreen('RESEARCH_SIGNAL_NEEDS_EXTERNAL_CAUSAL_REVIEW' if candidate > 0 else 'HOLD_NO_DEFENSIBLE_OFFSET',
                       n, capture, used if protocol.safe_reuse_authorized_for_specific_end_use else 0.0,
                       delta, sampling_lower, meter_lower, candidate, energy,
                       tuple(reasons),
                       'Not a causal proof or validated field saving. Student-t calculation assumes '
                       'independent, representative paired differences; repeated days can be autocorrelated. '
                       'Meter error uses a worst-case bound; actual meter independence and calibration require review. '
                       'No annualization, irrigation reuse permission or scientific endorsement is implied.')


@dataclass(frozen=True)
class CropDemandScreen:
    reference_etr_mm: float
    crop_coefficient_kc: float
    crop_etc_mm: float
    estimated_effective_precip_mm: float
    net_irrigation_depth_mm: float
    estimated_gross_application_l: float


def crop_water_screen(reference_etr_mm, crop_coefficient_kc, effective_precip_mm,
                      crop_area_m2, application_efficiency):
    """WSU principle ETc=Kc*ETr; effective rainfall is a separate measured input.

    No site-specific Kc, soil moisture, true evapotranspiration, seasonal plant
    stress or end-use permit is provided by this calculation.
    """
    etr = finite('reference_etr_mm', reference_etr_mm)
    kc = finite('crop_coefficient_kc', crop_coefficient_kc)
    pe = finite('effective_precip_mm', effective_precip_mm)
    area = finite('crop_area_m2', crop_area_m2)
    eff = finite('application_efficiency', application_efficiency)
    if not 0 < eff <= 1:
        raise ValueError('application efficiency must be (0, 1]')
    etc = etr * kc
    net = max(0.0, etc-pe)
    return CropDemandScreen(etr, kc, etc, pe, net, net * area/eff)


def break_even_water_value_usd_per_m3(offset_l, extra_kwh, electricity_usd_kwh,
                                      extra_operating_usd, amortized_capital_usd):
    """Same-period nonnegative incremental cost burden per attributable cubic meter.

    No financing, seasonal forecast, tax or price quote. Use only if actual
    avoided withdrawals and avoided marginal costs are documented separately.
    """
    offset = finite('offset_l', offset_l)
    delta_kwh = finite('extra_kwh', extra_kwh)
    power = finite('electricity_usd_kwh', electricity_usd_kwh)
    opex = finite('extra_operating_usd', extra_operating_usd)
    capex = finite('amortized_capital_usd', amortized_capital_usd)
    return (delta_kwh*power + opex + capex)/(offset/1000) if offset > 0 else None


if __name__ == '__main__':
    example = [PairedDay(date(2026,10,1)+timedelta(days=i), 100, 90, 12, 10, 4, 6, True, True)
               for i in range(14)]
    print(json.dumps({'data_state':'SYNTHETIC ONLY / NOT MEASURED',
                      'screen':asdict(evaluate_paired(example, Protocol('example-001',True,True,True,1)))}, indent=2))
