"""Evercraft Aqua: matched greenhouse trial evaluator, NOT a yield predictor.

Research-only; evaluates actual measurements from baseline and recovery treatment.
No avoided water claim unless baseline and experimental outside withdrawals are
measured under equivalent production conditions and safe end-use is approved.
"""
from dataclasses import dataclass, asdict
from math import isfinite
from typing import Sequence
import json


def nonnegative(name, value):
    if isinstance(value, bool) or not isinstance(value,(int,float)) or not isfinite(value) or value < 0:
        raise ValueError(f'{name}: expected finite nonnegative number')
    return float(value)


@dataclass(frozen=True)
class TrialDay:
    # Both arms same crops, plant area, lighting and reasonable microclimate window.
    baseline_freshwater_l: float
    experimental_freshwater_l: float
    condensate_captured_l: float
    experimental_condensate_reused_l: float
    baseline_power_kwh: float
    experimental_power_kwh: float
    paired_conditions_verified: bool
    potable_or_crop_use_authorized: bool
    sensor_quality_pass: bool

    def __post_init__(self):
        for key in ('baseline_freshwater_l','experimental_freshwater_l',
                    'condensate_captured_l','experimental_condensate_reused_l',
                    'baseline_power_kwh','experimental_power_kwh'):
            nonnegative(key,getattr(self,key))
        for key in ('paired_conditions_verified','potable_or_crop_use_authorized','sensor_quality_pass'):
            if type(getattr(self,key)) is not bool:
                raise ValueError(f'{key} must be Boolean')
        if self.experimental_condensate_reused_l > self.condensate_captured_l+1e-8:
            raise ValueError('Cannot reuse more condensate than captured')


@dataclass(frozen=True)
class Prices:
    avoidable_water_usd_per_m3: float
    electric_usd_per_kwh: float
    consumables_usd_per_day: float
    service_usd_per_year: float
    capital_usd: float

    def __post_init__(self):
        for name in self.__dataclass_fields__:
            nonnegative(name,getattr(self,name))


@dataclass(frozen=True)
class Evaluation:
    state: str
    observed_days: int
    captured_l: float
    authorized_reuse_l: float
    verified_reduction_in_external_water_l: float
    net_electricity_delta_kwh: float
    annualized_water_reduction_m3: float
    annualized_incremental_electricity_kwh: float
    modeled_annual_net_benefit_usd: float
    hypothetical_simple_payback_years: float | None
    reasoning: str


def evaluate(days: Sequence[TrialDay], prices: Prices, expected_operating_days_year: int) -> Evaluation:
    if not days:
        raise ValueError('No actual matched observations; HOLD')
    if isinstance(expected_operating_days_year,bool) or not isinstance(expected_operating_days_year,int) or not 1 <= expected_operating_days_year <= 366:
        raise ValueError('Invalid annual operating days')
    if not all(isinstance(x,TrialDay) for x in days):
        raise ValueError('Unvalidated observations')
    if not all(x.sensor_quality_pass and x.paired_conditions_verified for x in days):
        raise ValueError('Measurements unmatched, uncertified or incomplete; HOLD')
    total_capture=sum(x.condensate_captured_l for x in days)
    claimed_reuse=sum(x.experimental_condensate_reused_l for x in days)
    authorized=all(x.potable_or_crop_use_authorized for x in days)
    if not authorized and claimed_reuse>0:
        raise ValueError('Experimental reuse not approved. Do not use condensate. HOLD')
    difference=sum(x.baseline_freshwater_l-x.experimental_freshwater_l for x in days)
    # IMPORTANT: the v0.2 legacy API lacks preregistration, independent
    # scientific review, statistical error bounds and causal identification.
    # It must NEVER emit a validated avoided-withdrawals claim, even when
    # measured arm differences or an authorization flag are supplied. This
    # prevents downstream users from interpreting comparison deltas as proof.
    verified_reduction=0.0
    power_delta=sum(x.experimental_power_kwh-x.baseline_power_kwh for x in days)
    scale=expected_operating_days_year/len(days)
    annual_water_m3=0.0
    annual_energy=power_delta*scale
    annual_savings=(0.0
                    - annual_energy*prices.electric_usd_per_kwh
                    - prices.consumables_usd_per_day*expected_operating_days_year
                    - prices.service_usd_per_year)
    payback=None  # Legacy output never proves an attributable offset.
    state='HOLD_LEGACY_REQUIRES_PREREGISTERED_CAUSAL_REVIEW' if authorized else 'HOLD_NO_APPROVED_REUSE'
    why=('Observed outside-water delta (%.3f L) is descriptive, not attributable. '
         'Use evidence_gate.evaluate_paired with meter uncertainty, preregistration '
         'and independent scientific review. This legacy API reports zero verified '
         'savings and no commercial payback.' % difference)
    return Evaluation(state,len(days),total_capture,claimed_reuse if authorized else 0,
                      verified_reduction,power_delta,annual_water_m3,annual_energy,
                      annual_savings,payback,why)



def example():
    # Synthetic tests only, never claim measurements from the following numbers.
    prices=Prices(3,0.12,0.4,200,1500)
    days=[TrialDay(200,180,30,20,10,13,True,True,True) for _ in range(14)]
    return {'evidence':'SYNTHETIC EXAMPLE, NOT RECORDED FIELD DATA',
            'evaluation':asdict(evaluate(days,prices,300))}

if __name__=='__main__':
    print(json.dumps(example(),indent=2))
