"""Evercraft Flight Sentinel v0.5 -- SIMULATION ONLY.
Toy planar point-mass research, no aircraft I/O, cryptographic sensor
attestation, operational fallback, or physical safety guarantees.
"""
from dataclasses import dataclass
from pathlib import Path
import math
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"v0_4"))
from virtual_airframe import (FlightGate, Proposal, propagate, State, Reading,
                              MIN_XY, MAX_XY, HORIZON_S, SAMPLE_DT_S)

def numeric(x):
    return type(x) in (int, float) and math.isfinite(x)

@dataclass(frozen=True)
class TestRigAnchor:
    x_m: float
    y_m: float
    timestamp_s: float
    self_test_ok: bool = True
    provenance_label: str = 'BENCH_HIDDEN_STATE' # not authentication

@dataclass(frozen=True)
class Decision05:
    allowed: bool
    mode: str
    reasons: tuple[str, ...]
    worst_clearance_m: float | None
    nominal_path: tuple[tuple[float, float], ...]
    advisory: str

class RobustGuardian:
    """Simulated independent reference + bounded wind reachability."""
    def __init__(self, wind_bound_m_s=7.0, anchor_tolerance_m=8.0,
                 require_anchor=True):
        if not numeric(wind_bound_m_s) or not 0 <= wind_bound_m_s <= 20:
            raise ValueError('invalid synthetic wind bound')
        if not numeric(anchor_tolerance_m) or not 0 <= anchor_tolerance_m <= 50:
            raise ValueError('invalid synthetic anchor tolerance')
        self.wind_bound_m_s=wind_bound_m_s
        self.anchor_tolerance_m=anchor_tolerance_m
        self.require_anchor=require_anchor
        self.base=FlightGate()
        self.latched=False

    def check(self, proposal: Proposal, now_s: float,
              anchor: TestRigAnchor | None) -> Decision05:
        if not numeric(now_s):
            self.latched=True
            return Decision05(False,'REQUEST_REVIEW',('INVALID_CLOCK',),
                              None,(),'SYMBOLIC_HOLD_AND_REVIEW')
        baseline=self.base.evaluate(proposal,now_s)
        reasons=list(baseline.reasons)
        clearance=None
        if self.latched:
            reasons.append('INTERLOCK_LATCHED_V05')
        anchor_ok=False
        if anchor is None:
            if self.require_anchor:
                reasons.append('ANCHOR_UNAVAILABLE')
        elif not isinstance(anchor,TestRigAnchor):
            reasons.append('ANCHOR_INVALID')
        elif (not all(numeric(v) for v in
                      (anchor.x_m,anchor.y_m,anchor.timestamp_s))
              or type(anchor.self_test_ok) is not bool
              or anchor.provenance_label!='BENCH_HIDDEN_STATE'):
            reasons.append('ANCHOR_INVALID')
        elif not anchor.self_test_ok:
            reasons.append('ANCHOR_SELF_TEST_FAILED')
        elif now_s-anchor.timestamp_s>.5 or anchor.timestamp_s>now_s+.05:
            reasons.append('ANCHOR_STALE')
        else:
            anchor_ok=True
        if (anchor_ok and isinstance(proposal,Proposal)
            and isinstance(proposal.readings,tuple)
            and len(proposal.readings)==2):
            a,b=proposal.readings
            if (all(isinstance(r,Reading) for r in (a,b)) and
                all(numeric(v) for r in (a,b) for v in (r.x_m,r.y_m))):
                fused=((a.x_m+b.x_m)/2,(a.y_m+b.y_m)/2)
                if math.dist(fused,(anchor.x_m,anchor.y_m))>self.anchor_tolerance_m:
                    reasons.append('INDEPENDENT_REFERENCE_CONFLICT')
            else:
                reasons.append('UNUSABLE_SENSOR_SET')
        # Box assumes constant wind bounds for each planar axis. This is not
        # a vehicle-specific aerodynamic model or proven uncertainty bound.
        if not reasons and isinstance(proposal,Proposal):
            a,b=proposal.readings
            state=State((a.x_m+b.x_m)/2,(a.y_m+b.y_m)/2,
                        proposal.heading_rad,proposal.speed_m_s)
            clearance=float('inf')
            for i in range(int(round(HORIZON_S/SAMPLE_DT_S))+1):
                t=i*SAMPLE_DT_S
                p=propagate(state,proposal.turn_rad_s,t)
                spread=self.wind_bound_m_s*t
                margin=5+0.3*t
                d=min(p.x_m-MIN_XY-spread,MAX_XY-p.x_m-spread,
                      p.y_m-MIN_XY-spread,MAX_XY-p.y_m-spread)-margin
                clearance=min(clearance,d)
            if clearance<0:
                reasons.append('ROBUST_REACHABLE_SET_BREACH')
        if reasons:
            self.latched=True
        allowed=not reasons
        return Decision05(
            allowed, 'ALLOW_SIMULATION' if allowed else 'REQUEST_REVIEW',
            tuple(sorted(set(reasons))),
            round(clearance,3) if clearance is not None else None,
            baseline.forecast_xy,
            'TOY_PROPOSAL_PASSED' if allowed else 'SYMBOLIC_HOLD_AND_REVIEW')

class OfflineFallbackArbiter:
    """Symbolic offline handover: never issues controls or physical commands."""
    def __init__(self):
        self.state='PRIMARY_SIM'
        self.history=[]

    def observe(self,decision:Decision05):
        if self.state=='PRIMARY_SIM' and not decision.allowed:
            self.state='FALLBACK_REQUESTED'
        self.history.append(('observe',self.state))
        return self.state

    def acknowledge(self,reviewer_approved:bool,fallback_test_ok:bool):
        if type(reviewer_approved) is not bool or type(fallback_test_ok) is not bool:
            raise TypeError('explicit booleans required')
        if self.state!='FALLBACK_REQUESTED':
            raise ValueError('no pending fallback request')
        self.state=('FALLBACK_SIM' if reviewer_approved and fallback_test_ok
                    else 'HOLD_FOR_REVIEW')
        self.history.append(('acknowledge',self.state))
        return self.state
