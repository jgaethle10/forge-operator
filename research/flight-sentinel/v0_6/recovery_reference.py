"""Evercraft Flight Sentinel v0.6: OFFLINE point-mass recovery laboratory.

No real aircraft I/O, dynamics, sensors, control authority or recovery claim.
The imaginary policy searches five planar turn rates using potentially wrong
reported position. The hidden toy truth state is kept separate.
"""
import math
import sys
from pathlib import Path
from dataclasses import dataclass
for _v in ("v0_5", "v0_4"):
    _p=Path(__file__).resolve().parents[1]/_v
    if _p.is_dir(): sys.path.insert(0,str(_p))

from robust_guard import RobustGuardian, OfflineFallbackArbiter
from campaign_v05 import cases_v05, make_anchor
from benchmark_v04 import proposal_for
from virtual_airframe import State, propagate, MIN_XY, MAX_XY

DT=.1
HORIZON=8.0
CANDIDATES=(-.25,-.125,0.,.125,.25)

def clearance(s):
    return min(s.x_m-MIN_XY,MAX_XY-s.x_m,s.y_m-MIN_XY,MAX_XY-s.y_m)

def fallback_turn(estimated,remaining_s):
    horizon=min(5.0,remaining_s)
    best=None
    for turn in CANDIDATES:
        min_clear=float('inf')
        end=estimated
        for k in range(1,21):
            end=propagate(estimated,turn,horizon*k/20)
            min_clear=min(min_clear,clearance(end))
        score=(min_clear,-math.hypot(end.x_m-500,end.y_m-500),-abs(turn))
        if best is None or score>best[0]:
            best=(score,turn)
    return best[1]

@dataclass(frozen=True)
class Rollout:
    crossed: bool
    first_crossing_s: float | None
    min_clearance_m: float
    points: tuple[tuple[float,float,float], ...]
    switch_s: float | None

def rollout(case,mode="primary",delay_s=1.0):
    if mode not in ("primary","fallback"): raise ValueError("invalid mode")
    if type(delay_s) not in (int,float) or not math.isfinite(delay_s) or delay_s<0:
        raise ValueError("invalid delay")
    x,y,h,v=case["ground"]
    actual=State(x,y,h,v)
    rx,ry=case.get("reported",(x,y))
    estimated=State(rx,ry,h,v)
    wind=tuple(case.get("wind",(0,0)))
    turn=case.get("turn",0)
    low=clearance(actual)
    first=0.0 if low<0 else None
    points=[(0,round(x,2),round(y,2))]
    switched=None
    for step in range(1,round(HORIZON/DT)+1):
        t0=(step-1)*DT
        if mode=="fallback" and t0+1e-9>=delay_s:
            control=fallback_turn(estimated,HORIZON-t0)
            if switched is None: switched=round(t0,2)
        else:
            control=turn
        actual=propagate(actual,control,DT,wind)
        estimated=propagate(estimated,control,DT)
        t=round(step*DT,2)
        d=clearance(actual)
        low=min(low,d)
        if d<0 and first is None: first=t
        if step%5==0 or first==t:
            points.append((t,round(actual.x_m,2),round(actual.y_m,2)))
    return Rollout(first is not None,first,round(low,2),tuple(points),switched)

def experiment(delay_s=1.0,ack=True):
    if type(ack) is not bool: raise TypeError("ack must be bool")
    wrong_pose=dict(name="false_alert_wrong_pose_can_hurt",
        ground=[556.4519382701712,241.94427285014513,
                -2.9637510969579473,29.085437739588585],
        turn=-.15,anchor_missing=True,
        reported=[279.68072880180654,663.9754471137999])
    rows=[]
    for item in cases_v05()+[wrong_pose]:
        c=dict(item)
        c.setdefault("turn",0)
        decision=RobustGuardian().check(proposal_for(c),1000,make_anchor(c))
        arbiter=OfflineFallbackArbiter()
        status=arbiter.observe(decision)
        if status=="FALLBACK_REQUESTED":
            status=arbiter.acknowledge(ack,ack)
        before=rollout(c)
        after=rollout(c,"fallback" if status=="FALLBACK_SIM" else "primary",delay_s)
        outcome=("prevented" if before.crossed and not after.crossed else
                 "unprevented" if before.crossed and after.crossed else
                 "introduced" if not before.crossed and after.crossed else
                 "both_safe")
        rows.append(dict(name=c["name"],alert=not decision.allowed,
                         reasons=list(decision.reasons),handoff=status,
                         outcome=outcome,
                         ground_start=c["ground"][:2],
                         reported_start=c.get("reported",c["ground"][:2]),
                         before=before.__dict__,after=after.__dict__))
    return dict(case_count=len(rows),delay_s=delay_s,ack=ack,
                counts={k:sum(x["outcome"]==k for x in rows)
                        for k in ("prevented","unprevented","introduced","both_safe")},
                cases=rows,
                warning="Constructed fictional cases; NOT aviation safety metrics.")
