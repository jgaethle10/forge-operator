"""Evercraft Flight Sentinel v0.4: **offline 2D point-mass research model**.

No aircraft I/O, flight bus access, communications, or actuation. All numerical
limits are invented demonstration values; this is NOT aircraft safety software.
"""
from dataclasses import dataclass
import math

MIN_XY = 100.0
MAX_XY = 900.0
HORIZON_S = 8.0
SAMPLE_DT_S = 0.25
MAX_TURN_RAD_S = 0.25
MAX_SPEED_M_S = 35.0
SENSOR_DELTA_M = 8.0
MAX_SENSOR_AGE_S = 0.5


def _number(value):
    return type(value) in (float, int) and math.isfinite(value)


@dataclass(frozen=True)
class State:
    x_m: float
    y_m: float
    heading_rad: float
    speed_m_s: float


@dataclass(frozen=True)
class Reading:
    source_id: str
    claimed_root: str
    x_m: float
    y_m: float
    timestamp_s: float


@dataclass(frozen=True)
class Proposal:
    sequence: int
    timestamp_s: float
    heading_rad: float
    speed_m_s: float
    turn_rad_s: float
    readings: tuple[Reading, Reading]


@dataclass(frozen=True)
class Decision:
    allowed: bool
    reasons: tuple[str, ...]
    min_clearance_m: float | None
    forecast_xy: tuple[tuple[float, float], ...]


def propagate(state: State, turn_rad_s: float, duration_s: float,
              wind_xy_m_s=(0.0, 0.0)) -> State:
    """Closed-form constant-speed planar turn; NOT fixed-wing flight physics."""
    h, w, v = state.heading_rad, turn_rad_s, state.speed_m_s
    if abs(w) < 1e-12:
        dx, dy = v * math.cos(h) * duration_s, v * math.sin(h) * duration_s
    else:
        dx = v / w * (math.sin(h + w * duration_s) - math.sin(h))
        dy = v / w * (math.cos(h) - math.cos(h + w * duration_s))
    return State(state.x_m + dx + wind_xy_m_s[0] * duration_s,
                 state.y_m + dy + wind_xy_m_s[1] * duration_s,
                 h + w * duration_s, v)


class FlightGate:
    """Only emits symbolic allow/deny. Latches permanently on any rejection.

    Sensor identities and claimed roots are user-supplied text, not attested.
    Two consistently spoofed sources are an intentional undetected weakness.
    """
    def __init__(self):
        self.latched = False
        self.last_sequence = None
        self.last_time_s = None
        self.last_xy = None

    def evaluate(self, proposal, now_s: float) -> Decision:
        reasons = []
        path = []
        clearance = None
        if not isinstance(proposal, Proposal) or not _number(now_s):
            reasons.append('INVALID_PROPOSAL')
        else:
            values = (proposal.timestamp_s, proposal.heading_rad,
                      proposal.speed_m_s, proposal.turn_rad_s)
            if type(proposal.sequence) is not int or proposal.sequence < 1 or not all(map(_number, values)):
                reasons.append('INVALID_NUMERIC_STATE')
            if not isinstance(proposal.readings, tuple) or len(proposal.readings) != 2 or not all(isinstance(r, Reading) for r in proposal.readings):
                reasons.append('INVALID_SENSOR_SET')
            if not reasons:
                a, b = proposal.readings
                if any(not _number(v) for r in (a,b) for v in (r.x_m,r.y_m,r.timestamp_s)):
                    reasons.append('INVALID_SENSOR_VALUES')
                if any(not isinstance(v, str) or not v.strip() for r in (a,b) for v in (r.source_id,r.claimed_root)):
                    reasons.append('INVALID_SENSOR_IDENTITY')
                if not reasons:
                    if a.source_id == b.source_id or a.claimed_root == b.claimed_root:
                        reasons.append('DUPLICATE_CLAIMED_PROVENANCE')
                    if math.hypot(a.x_m - b.x_m, a.y_m - b.y_m) > SENSOR_DELTA_M:
                        reasons.append('SENSOR_DISAGREEMENT')
                    if any(now_s - r.timestamp_s > MAX_SENSOR_AGE_S or r.timestamp_s > now_s + 0.05 for r in (a,b)):
                        reasons.append('SENSOR_FRESHNESS')
                    if now_s - proposal.timestamp_s > MAX_SENSOR_AGE_S or proposal.timestamp_s > now_s + 0.05:
                        reasons.append('PROPOSAL_FRESHNESS')
                    if self.last_sequence is not None:
                        dt = proposal.timestamp_s - self.last_time_s
                        if proposal.sequence <= self.last_sequence or dt <= 0 or dt > 2.0:
                            reasons.append('REPLAY_OR_GAP')
                        elif self.last_xy is not None:
                            xy = ((a.x_m + b.x_m)/2, (a.y_m + b.y_m)/2)
                            if math.dist(xy, self.last_xy) > MAX_SPEED_M_S * dt + 12:
                                reasons.append('IMPLAUSIBLE_TRANSLATION')
                    if not 0 <= proposal.speed_m_s <= MAX_SPEED_M_S or abs(proposal.turn_rad_s) > MAX_TURN_RAD_S:
                        reasons.append('COMMAND_ENVELOPE')
                    if not reasons:
                        fused = State((a.x_m+b.x_m)/2, (a.y_m+b.y_m)/2,
                                      proposal.heading_rad, proposal.speed_m_s)
                        # Include the initial state and all future sampling instants.
                        for step in range(int(round(HORIZON_S / SAMPLE_DT_S)) + 1):
                            t = step * SAMPLE_DT_S
                            predicted = propagate(fused, proposal.turn_rad_s, t)
                            # Invented conservative positional margin, not an error bound.
                            margin = 5 + 0.3 * t
                            d = min(predicted.x_m - MIN_XY, MAX_XY - predicted.x_m,
                                    predicted.y_m - MIN_XY, MAX_XY - predicted.y_m) - margin
                            clearance = d if clearance is None else min(clearance, d)
                            path.append((round(predicted.x_m,3), round(predicted.y_m,3)))
                        if clearance is not None and clearance < 0:
                            reasons.append('FORECAST_CORRIDOR_BREACH')
        if self.latched:
            reasons.append('INTERLOCK_LATCHED')
        if reasons:
            self.latched = True
        else:
            a, b = proposal.readings
            self.last_sequence = proposal.sequence
            self.last_time_s = proposal.timestamp_s
            self.last_xy = ((a.x_m+b.x_m)/2, (a.y_m+b.y_m)/2)
        return Decision(not reasons, tuple(sorted(set(reasons))),
                        round(clearance,3) if clearance is not None else None,
                        tuple(path))
