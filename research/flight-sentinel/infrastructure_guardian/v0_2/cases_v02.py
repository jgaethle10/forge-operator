"""Fictional dependency/telemetry counterexamples, not FAA reconstruction."""
from dependency_lab import Service, Topology, compare_with_hidden_truth


def topology(hidden_shared_power=False, declared_shared_core=False):
    nodes = {
        'relay-a': ('power-a',), 'relay-b': ('power-b',),
        'relay-c': ('power-c',), 'power-a': (), 'power-b': (),
        'power-c': (), 'shared-power': (), 'shared-core': ()
    }
    if hidden_shared_power:
        nodes['relay-b'] = ('power-b', 'shared-power')
        nodes['relay-c'] = ('power-c', 'shared-power')
    if declared_shared_core:
        nodes['relay-a'] = ('power-a','shared-core')
        nodes['relay-b'] = ('power-b','shared-core')
    services = (
        Service('voice',(('relay-a',),('relay-b',)),True),
        Service('tracking',(('relay-a',),('relay-b',)),True),
        Service('dispatch',(('relay-c',),),True),
        Service('status-page',(('relay-b',),),False),
    )
    return Topology(nodes,services)


def fixtures():
    base={k:True for k in topology().dependencies}
    def case(name, target='relay-a', reported=None, actual=None,
             hidden=False, shared=False, fresh=True, reviewed=True):
        return dict(name=name, target=target, observed=reported or base.copy(),
                    actual=actual or base.copy(), hidden_shared=hidden,
                    declared_shared=shared, fresh=fresh, reviewed=reviewed)
    normal=case('normal_sandbox_isolation')
    hidden=base.copy();hidden['shared-power']=False
    shared_fault=case('unmodeled_backup_power_failure',actual=hidden,hidden=True)
    known_down=base.copy();known_down['relay-b']=False
    single_route=case('backup_outage_visible',reported=known_down,actual=known_down)
    unreviewed=case('no_explicit_review',reviewed=False)
    stale=case('stale_telemetry',fresh=False)
    disclosed=case('declared_common_core',shared=True)
    critical=case('single_path_critical_service',target='relay-c')
    unknown=case('unknown_component',target='unlisted-relay')
    spoof=case('all_telemetry_consistently_wrong',actual=known_down,hidden=False)
    # In the hidden-power case, the declared topology omits a dependency.
    # In the coherent-telemetry case, the second relay is actually down.
    # Both can make the simulated isolation harmful despite benign advisories.
    return [normal,shared_fault,single_route,unreviewed,stale,disclosed,
            critical,unknown,spoof]


def campaign():
    results=[]
    for c in fixtures():
        declared=topology(declared_shared_core=c['declared_shared'])
        oracle=topology(hidden_shared_power=c['hidden_shared'])
        r=compare_with_hidden_truth(declared,oracle,c['observed'],c['actual'],
                                    c['target'],fresh=c['fresh'],
                                    explicit_human_review=c['reviewed'])
        results.append({'case':c['name'],**r})
    return {'schema':'evercraft.flight_sentinel.infrastructure_dependency.v0.2',
            'scope':'Fictional graphs, booleans and hand-built examples; no network I/O',
            'scenario_count':len(results),
            'cases':results}
