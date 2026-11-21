"""Evercraft Flight Sentinel: Infrastructure Guardian v0.1 (OFFLINE ONLY).

Model of a *fictional* communications backbone. The simulator never connects to,
queries, controls, or describes actual FAA systems or operational equipment.
All decisions are ADVISORIES; a separately authorized simulation can model
what hypothetical containment might do. Not aviation safety software.
"""
from dataclasses import dataclass
from typing import Mapping
import math

SOURCES = ('node-a', 'node-b', 'node-c')


@dataclass(frozen=True)
class Policy:
    shared_capacity: float = 240.0
    high_source_rate: float = 170.0
    consecutive_samples: int = 2
    mismatch_fraction: float = .20
    mismatch_floor: float = 15.0


@dataclass(frozen=True)
class Snapshot:
    tick: int
    actual_rates: Mapping[str, float]
    edge_rates: Mapping[str, float]
    core_rates: Mapping[str, float]
    telemetry_fresh: bool = True
    backup_operational: bool = True
    backup_independent: bool = True
    shared_failure: bool = False
    maintenance_window: bool = False


@dataclass(frozen=True)
class Advisory:
    tick: int
    action: str
    isolation_candidate: str | None
    reasons: tuple[str, ...]
    input_valid: bool


def rates_valid(rates: object) -> bool:
    return (isinstance(rates, dict)
            and set(rates) == set(SOURCES)
            and all(type(value) in (int, float)
                    and math.isfinite(value) and value >= 0
                    for value in rates.values()))


class Guardian:
    """Stateful anomaly detector with an explicit conservative uncertainty mode.

    A matched edge/core report is still NOT authenticated. Coordinated spoofing
    across both observations remains a known unmitigated failure mode.
    """
    def __init__(self, policy: Policy | None = None):
        self.policy = policy or Policy()
        self.last_tick: int | None = None
        self.streak = {key: 0 for key in SOURCES}
        self.latched: set[str] = set()

    def inspect(self, s: Snapshot) -> Advisory:
        if (not isinstance(s, Snapshot)
            or type(s.tick) is not int or s.tick < 0
            or not rates_valid(s.edge_rates)
            or not rates_valid(s.core_rates)
            or any(type(v) is not bool for v in (
                s.telemetry_fresh, s.backup_operational,
                s.backup_independent, s.shared_failure, s.maintenance_window))):
            return Advisory(-1, 'CONSERVATIVE_HOLD', None,
                            ('INVALID_OBSERVATION',), False)
        if self.last_tick is not None and s.tick != self.last_tick + 1:
            return Advisory(s.tick, 'CONSERVATIVE_HOLD', None,
                            ('MISSING_OR_REPLAYED_SAMPLE',), False)
        self.last_tick = s.tick
        if not s.telemetry_fresh:
            self.streak = {key: 0 for key in SOURCES}
            return Advisory(s.tick, 'CONSERVATIVE_HOLD', None,
                            ('STALE_TELEMETRY',), True)
        for key in SOURCES:
            a, b = s.edge_rates[key], s.core_rates[key]
            if abs(a-b) > max(self.policy.mismatch_floor,
                              self.policy.mismatch_fraction * max(a, b)):
                self.streak = {key: 0 for key in SOURCES}
                return Advisory(s.tick, 'CONSERVATIVE_HOLD', None,
                                ('EVIDENCE_CONFLICT', key), True)
        if s.shared_failure or not s.backup_independent:
            self.streak = {key: 0 for key in SOURCES}
            return Advisory(s.tick, 'CONSERVATIVE_HOLD', None,
                            ('BACKUP_COMMON_MODE_UNTRUSTED',), True)
        for key in SOURCES:
            if s.edge_rates[key] >= self.policy.high_source_rate:
                self.streak[key] += 1
            else:
                self.streak[key] = 0
        candidates = [k for k in SOURCES
                      if self.streak[k] >= self.policy.consecutive_samples]
        shared_load = sum(s.edge_rates.values())
        if candidates and shared_load > self.policy.shared_capacity:
            if s.maintenance_window:
                return Advisory(s.tick, 'MANUAL_CHANGE_REVIEW', None,
                                ('HIGH_RATE_DURING_MAINTENANCE',), True)
            candidate = max(candidates, key=lambda k: (s.edge_rates[k], k))
            self.latched.add(candidate)
            return Advisory(s.tick, 'PROPOSE_ISOLATION', candidate,
                            ('SUSTAINED_SOURCE_OVERLOAD',), True)
        if shared_load > self.policy.shared_capacity:
            return Advisory(s.tick, 'DEGRADE_AND_REVIEW', None,
                            ('SHARED_LINK_OVER_CAPACITY',), True)
        return Advisory(s.tick, 'OBSERVE', None, (), True)


def service_state(s: Snapshot, isolated: set[str], policy: Policy) -> dict:
    """Hypothetical topology only; independent backup is a Boolean assumption."""
    if not rates_valid(s.actual_rates):
        raise ValueError("invalid synthetic ground truth")
    load = sum(rate for src, rate in s.actual_rates.items() if src not in isolated)
    primary_ok = load <= policy.shared_capacity and not s.shared_failure
    backup_ok = s.backup_operational and s.backup_independent and not s.shared_failure
    reliable_path = primary_ok or backup_ok
    return {'load': load, 'primary_ok': primary_ok,
            'backup_ok': backup_ok, 'reliable_path': reliable_path}


def run_trace(snaps: list[Snapshot], hypothetical_containment: bool = False,
              authorization: bool = False, policy: Policy | None = None) -> dict:
    """Pure local thought experiment. 'Authorization' is a test Boolean only.

    Containment applies one tick *after* a proposal and never issues network
    commands. An actual operator/ATC system would require entirely different
    authority, testing, and regulatory processes.
    """
    p = policy or Policy()
    g = Guardian(p)
    quarantined: set[str] = set()
    rows = []
    for snap in snaps:
        advice = g.inspect(snap)
        state = service_state(snap, quarantined, p)
        mode = ('CONSERVATIVE_HOLD' if advice.action == 'CONSERVATIVE_HOLD'
                or not state['reliable_path'] else 'NORMAL_OR_DEGRADED')
        rows.append({'tick': snap.tick, 'actual_load': state['load'],
                     'primary_ok': state['primary_ok'],
                     'backup_ok': state['backup_ok'],
                     'mode': mode, 'advisory': advice.action,
                     'candidate': advice.isolation_candidate,
                     'reasons': list(advice.reasons),
                     'hypothetically_isolated': sorted(quarantined)})
        if (hypothetical_containment and authorization
                and advice.action == 'PROPOSE_ISOLATION'
                and advice.isolation_candidate):
            quarantined.add(advice.isolation_candidate)
    return {'ticks': len(rows),
            'primary_overload_ticks': sum(not r['primary_ok'] for r in rows),
            'conservative_hold_ticks': sum(r['mode'] == 'CONSERVATIVE_HOLD' for r in rows),
            'final_isolated': sorted(quarantined), 'timeline': rows}
