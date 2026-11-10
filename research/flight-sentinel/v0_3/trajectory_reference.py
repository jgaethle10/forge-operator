"""Standalone v0.3 trajectory gate. OFFLINE SYNTHETIC REFERENCE ONLY.

This compact reference is mirrored to GitHub for review. The full laboratory
package has a separate integrated static+temporal engine (temporal.py).
This module has no aircraft I/O, network, actuator interface or real limits.
"""
from dataclasses import dataclass
import math


@dataclass(frozen=True)
class Sample:
    sequence: int
    time_ms: int
    lateral_m: float
    velocity_mps: float
    acceleration_mps2: float
    uncertainty_m: float = 1.0


class ReferenceGuard:
    """Deterministic 1-D corridor check, latches on any ambiguity."""
    def __init__(self):
        self.last = None
        self.latched = False

    def assess(self, s):
        faults = []
        peak = None
        if type(s) is not Sample:
            faults.append("INVALID_SAMPLE")
        else:
            if type(s.sequence) is not int or type(s.time_ms) is not int:
                faults.append("INVALID_CLOCK")
            for name in ("lateral_m", "velocity_mps", "acceleration_mps2", "uncertainty_m"):
                val = getattr(s, name)
                if type(val) not in (int, float) or not math.isfinite(val):
                    faults.append("INVALID_NUMBER")
                    break
            if not faults:
                if s.sequence < 1 or s.time_ms < 0:
                    faults.append("INVALID_CLOCK")
                if not 0 <= s.uncertainty_m <= 5:
                    faults.append("INVALID_UNCERTAINTY")
                if abs(s.velocity_mps) > 12 or abs(s.acceleration_mps2) > 2:
                    faults.append("INSTANTANEOUS_LIMIT")
                if abs(s.lateral_m) + s.uncertainty_m > 40:
                    faults.append("CURRENT_CORRIDOR_BREACH")
                if self.last is not None:
                    prev = self.last
                    dt = (s.time_ms - prev.time_ms) / 1000
                    if s.sequence <= prev.sequence or dt <= 0 or dt > 2:
                        faults.append("REPLAY_OR_GAP")
                    else:
                        px = prev.lateral_m + prev.velocity_mps * dt + .5 * prev.acceleration_mps2 * dt * dt
                        pv = prev.velocity_mps + prev.acceleration_mps2 * dt
                        if abs(s.lateral_m - px) > 3 or abs(s.velocity_mps - pv) > 1.5:
                            faults.append("MODEL_RESIDUAL")
                # The maximum absolute value of a quadratic occurs at a time
                # endpoint or its stationary point. This is toy geometry only.
                times = [0., 6.]
                if s.acceleration_mps2 != 0:
                    vertex = -s.velocity_mps / s.acceleration_mps2
                    if 0 < vertex < 6:
                        times.append(vertex)
                peak = max(abs(s.lateral_m + s.velocity_mps*t + .5*s.acceleration_mps2*t*t)
                           + s.uncertainty_m for t in times)
                if peak > 40:
                    faults.append("PREDICTED_CORRIDOR_BREACH")
        if self.latched:
            faults.append("INTERLOCK_LATCHED")
        if faults:
            self.latched = True
        else:
            self.last = s
        return {"allow": not faults, "reasons": sorted(set(faults)), "peak_m": peak,
                "advisory": "REVIEW_FALLBACK" if faults else "PROPOSAL_PASSES_TOY_GATE"}
