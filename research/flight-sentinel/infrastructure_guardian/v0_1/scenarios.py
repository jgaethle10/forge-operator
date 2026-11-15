"""Fictional fault-injection scenarios, loosely motivated by generic failures."""
from model import SOURCES, Snapshot, run_trace


def snapshots(name: str) -> list[Snapshot]:
    base = {'node-a': 35., 'node-b': 35., 'node-c': 35.}
    rows = []
    for tick in range(8):
        actual = dict(base)
        edge = dict(actual)
        core = dict(actual)
        options = {}
        if name in ('flood', 'flood_without_permission', 'stale_during_flood') and 2 <= tick <= 6:
            actual['node-a'] = edge['node-a'] = core['node-a'] = 500.
        elif name == 'one_tick_spike' and tick == 3:
            actual['node-a'] = edge['node-a'] = core['node-a'] = 500.
        elif name == 'maintenance_burst' and 2 <= tick <= 6:
            actual['node-a'] = edge['node-a'] = core['node-a'] = 500.
            options['maintenance_window'] = True
        elif name == 'split_evidence' and 2 <= tick <= 6:
            actual['node-a'] = edge['node-a'] = 500.
            core['node-a'] = 35.
        elif name == 'coherent_spoof' and 2 <= tick <= 6:
            actual['node-a'] = 500.
            edge['node-a'] = core['node-a'] = 35.
        elif name == 'common_backup_fault' and 2 <= tick <= 6:
            actual['node-a'] = edge['node-a'] = core['node-a'] = 500.
            options['shared_failure'] = True
        elif name == 'distributed_burst' and 2 <= tick <= 6:
            for k in SOURCES:
                actual[k] = edge[k] = core[k] = 110.
        if name == 'stale_during_flood' and tick == 3:
            options['telemetry_fresh'] = False
        rows.append(Snapshot(tick, actual, edge, core, **options))
    return rows


def campaign():
    names = ['normal','flood','flood_without_permission','one_tick_spike',
             'maintenance_burst','split_evidence','coherent_spoof',
             'common_backup_fault','distributed_burst','stale_during_flood']
    result = []
    for name in names:
        sequence = snapshots(name)
        baseline = run_trace(sequence)
        managed = run_trace(sequence, hypothetical_containment=True,
                            authorization=name != 'flood_without_permission')
        result.append({'name': name,
                       'baseline_overload_ticks': baseline['primary_overload_ticks'],
                       'simulation_overload_ticks': managed['primary_overload_ticks'],
                       'baseline_hold_ticks': baseline['conservative_hold_ticks'],
                       'simulation_hold_ticks': managed['conservative_hold_ticks'],
                       'hypothetical_isolation': managed['final_isolated'],
                       'baseline': baseline, 'managed': managed})
    return result
