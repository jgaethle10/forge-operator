"""Evercraft Flight Sentinel Infrastructure Guardian v0.2.

Purely OFFLINE fictional dependency and intervention-impact laboratory.
No network access, live telemetry, device interfaces, actuator commands or
operator authority. No FAA equipment is modeled or inferred.
"""
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class Service:
    name: str
    routes: tuple[tuple[str, ...], ...]
    critical: bool = True


@dataclass(frozen=True)
class Topology:
    dependencies: Mapping[str, tuple[str, ...]]
    services: tuple[Service, ...]

    def validate(self) -> None:
        """Require an acyclic, fully named dependency graph and useful routes."""
        nodes = set(self.dependencies)
        if not nodes or any(not isinstance(k, str) or not k for k in nodes):
            raise ValueError('invalid node set')
        if any(not isinstance(v, tuple) or any(x not in nodes for x in v)
               for v in self.dependencies.values()):
            raise ValueError('unknown component dependency')
        seen, visiting = set(), set()

        def visit(node):
            if node in visiting:
                raise ValueError('dependency cycle')
            if node in seen:
                return
            visiting.add(node)
            for parent in self.dependencies[node]:
                visit(parent)
            visiting.remove(node)
            seen.add(node)

        for node in nodes:
            visit(node)
        names = set()
        for svc in self.services:
            if (not isinstance(svc, Service) or not isinstance(svc.name, str)
                or not svc.name or svc.name in names or type(svc.critical) is not bool
                or not svc.routes or any(not route or any(n not in nodes for n in route)
                                         for route in svc.routes)):
                raise ValueError('invalid service route')
            names.add(svc.name)

    def service_status(self, health: Mapping[str, bool], isolated=frozenset()) -> dict[str, bool]:
        if (set(health) != set(self.dependencies) or
            any(type(x) is not bool for x in health.values()) or
            any(x not in self.dependencies for x in isolated)):
            raise ValueError('invalid health/containment input')
        cache = {}
        def working(node):
            if node in cache:
                return cache[node]
            value = health[node] and node not in isolated and all(
                working(parent) for parent in self.dependencies[node])
            cache[node] = value
            return value
        return {svc.name: any(all(working(n) for n in route) for route in svc.routes)
                for svc in self.services}

    def roots_for(self, node):
        result = {node}
        for dep in self.dependencies[node]:
            result |= self.roots_for(dep)
        return result


@dataclass(frozen=True)
class Advisory:
    action: str
    target: str | None
    predicted_lost: tuple[str, ...]
    predicted_remaining: tuple[str, ...]
    reasons: tuple[str, ...]


def review_candidate(declared: Topology, observed_health: Mapping[str, bool],
                     candidate: str | None, *, fresh: bool = True,
                     explicit_human_review: bool = False) -> Advisory:
    """Advisory sees DECLARED topology only. Never sees hidden oracle truth.

    explicit_human_review is a fictional research acknowledgement, not
    authentication or permission to touch a real system.
    """
    declared.validate()
    if type(fresh) is not bool or type(explicit_human_review) is not bool:
        raise ValueError('invalid review flags')
    if not fresh:
        return Advisory('HOLD_FOR_REVIEW',candidate,(),(),('STALE_OR_UNTRUSTED_EVIDENCE',))
    before = declared.service_status(observed_health)
    if candidate is None:
        return Advisory('NO_ISOLATION',None,(),tuple(sorted(k for k,v in before.items() if v)),('NO_TARGET',))
    if candidate not in declared.dependencies:
        return Advisory('HOLD_FOR_REVIEW',candidate,(),(),('UNKNOWN_COMPONENT',))
    after = declared.service_status(observed_health,{candidate})
    lost = tuple(sorted(name for name in before if before[name] and not after[name]))
    remaining = tuple(sorted(name for name in after if after[name]))
    critical = {svc.name for svc in declared.services if svc.critical}
    if critical.intersection(lost):
        return Advisory('REJECT_UNSAFE_ISOLATION',candidate,lost,remaining,('DECLARED_CRITICAL_SERVICE_LOSS',))
    # Risk of inferred redundancy: for each critical service there may be
    # alternative routes that share one dependency despite distinct names.
    common = []
    for svc in declared.services:
        if not svc.critical:
            continue
        viable = [r for r in svc.routes if all(observed_health[n] for n in r)]
        if len(viable) >= 2:
            closures = [set().union(*(declared.roots_for(n) for n in r)) for r in viable]
            if set.intersection(*closures):
                common.append(svc.name)
    if common:
        return Advisory('HOLD_FOR_REVIEW',candidate,lost,remaining,
                        ('DECLARED_COMMON_DEPENDENCY',)+tuple(sorted(common)))
    if not explicit_human_review:
        return Advisory('HOLD_FOR_REVIEW',candidate,lost,remaining,('REQUIRES_EXPLICIT_SANDBOX_REVIEW',))
    return Advisory('PROPOSE_SANDBOX_ONLY',candidate,lost,remaining,
                    ('DECLARED_TOPOLOGY_ONLY', 'NO_REAL_AUTHORITY'))


def compare_with_hidden_truth(declared: Topology, hidden_truth: Topology,
                              observed_health: Mapping[str, bool],
                              actual_health: Mapping[str, bool],
                              candidate: str | None, *, fresh=True,
                              explicit_human_review=True) -> dict:
    """Independent oracle comparison. Does not alter health or infrastructure."""
    decision = review_candidate(declared,observed_health,candidate,
                                fresh=fresh,explicit_human_review=explicit_human_review)
    hidden_truth.validate()
    before = hidden_truth.service_status(actual_health)
    simulate = decision.action == 'PROPOSE_SANDBOX_ONLY'
    after = hidden_truth.service_status(actual_health,{candidate} if simulate else frozenset())
    actual_lost = sorted(s for s in before if before[s] and not after[s])
    predicted = set(decision.predicted_lost)
    return {
        'advisory':decision.action, 'reasons':list(decision.reasons),
        'target':candidate,'predicted_lost':list(decision.predicted_lost),
        'actual_lost':actual_lost,
        'unexpected_losses':sorted(set(actual_lost)-predicted),
        'actual_before':before,'actual_after':after,
        'hypothetical_intervention_applied':simulate,
        'critical_harmed':any(s in actual_lost for s in
                              (x.name for x in hidden_truth.services if x.critical)),
    }
