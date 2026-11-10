"""Offline fault-injection campaign with independently stepped toy-world oracle.

The oracle receives deliberately hidden ground truth and wind; the gate sees
only invented sensor readings. No empirical probability claims are supported.
"""
import json
import math
from pathlib import Path
from virtual_airframe import FlightGate, Proposal, Reading, State, MIN_XY, MAX_XY

NOW = 1000.0


def independent_truth_hazard(state, turn_rate, wind=(0,0), horizon=8, delta=0.01):
    """Midpoint numerical integration, separate from the gate's closed form."""
    x, y, heading = state.x_m, state.y_m, state.heading_rad
    if not (MIN_XY <= x <= MAX_XY and MIN_XY <= y <= MAX_XY):
        return True, 0.0
    steps = int(round(horizon/delta))
    for i in range(steps):
        x += (state.speed_m_s * math.cos(heading + turn_rate*delta/2) + wind[0])*delta
        y += (state.speed_m_s * math.sin(heading + turn_rate*delta/2) + wind[1])*delta
        heading += turn_rate*delta
        if not (MIN_XY <= x <= MAX_XY and MIN_XY <= y <= MAX_XY):
            return True, round((i+1)*delta, 2)
    return False, None


def cases():
    return [
        dict(name='safe_straight', ground=[500,500,0,20], turn=0),
        dict(name='safe_curving', ground=[500,500,0,20], turn=.12),
        dict(name='east_edge', ground=[835,500,0,20], turn=0),
        dict(name='north_edge', ground=[500,835,math.pi/2,20], turn=0),
        dict(name='right_turn_edge', ground=[850,500,math.pi/2,20], turn=-.2),
        dict(name='turn_away_from_edge', ground=[780,500,math.pi/2,20], turn=.15),
        dict(name='sensor_disagreement', ground=[500,500,0,20], turn=0, b_offset=[30,0]),
        dict(name='stale_both_sensors', ground=[500,500,0,20], turn=0, age=1.5),
        dict(name='shared_claimed_root', ground=[500,500,0,20], turn=0, shared_root=True),
        dict(name='single_sensor_not_available', ground=[500,500,0,20], turn=0, dropout=True),
        dict(name='near_margin_conservative', ground=[745,500,0,20], turn=0),
        dict(name='two_consistent_spoofed_sources', ground=[845,500,0,20], turn=0, reported=[500,500], blind_spot=True),
        dict(name='unmodeled_strong_wind', ground=[730,500,0,20], turn=0, wind=[6,0], blind_spot=True),
        dict(name='two_sources_spoofed_near_edge', ground=[845,600,0,20], turn=0, reported=[550,600], blind_spot=True),
    ]


def independent_truth_path(state, turn_rate, wind=(0,0), horizon=8, delta=.05):
    """Midpoint-stepped independent *toy* truth path for visual inspection."""
    x, y, heading = state.x_m, state.y_m, state.heading_rad
    out=[[round(x,2),round(y,2)]]
    for i in range(int(round(horizon/delta))):
        x += (state.speed_m_s * math.cos(heading + turn_rate*delta/2) + wind[0])*delta
        y += (state.speed_m_s * math.sin(heading + turn_rate*delta/2) + wind[1])*delta
        heading += turn_rate*delta
        if (i+1)%5==0: out.append([round(x,2),round(y,2)])
    return out


def proposal_for(row, seq=1, at=NOW):
    x, y, h, v = row['ground']
    axy = row.get('reported',[x,y])
    off = row.get('b_offset',[0,0])
    age = row.get('age',0)
    a = Reading('gps', 'navigation-root', axy[0], axy[1], at-age)
    b = Reading('vision', 'vision-root' if not row.get('shared_root') else 'navigation-root',
                axy[0]+off[0], axy[1]+off[1], at-age)
    readings = (a,) if row.get('dropout') else (a,b)
    return Proposal(seq, at, h, v, row['turn'], readings)


def run():
    results=[]
    for row in cases():
        ground=State(*row['ground'])
        hazard, crossing_time = independent_truth_hazard(ground, row['turn'], row.get('wind',(0,0)))
        d=FlightGate().evaluate(proposal_for(row), NOW)
        outcome = ('TP' if hazard and not d.allowed else 'FN' if hazard and d.allowed else
                   'FP' if not hazard and not d.allowed else 'TN')
        results.append(dict(name=row['name'], ground_truth_hazard=hazard,
                            truth_boundary_time_s=crossing_time, guardian_allow=d.allowed,
                            outcome=outcome, known_blind_spot=row.get('blind_spot',False),
                            symbolic_reasons=list(d.reasons), min_clearance_m=d.min_clearance_m,
                            forecast_xy=list(d.forecast_xy), truth_path=independent_truth_path(ground,row['turn'],row.get('wind',(0,0))),
                            reported_xy=row.get('reported', row['ground'][:2])))
    counts={key:sum(r['outcome']==key for r in results) for key in ('TP','TN','FP','FN')}
    # Example of an idealized straight-line advance-warning measurement, not a
    # claim of response-time adequacy or evidence of a safe fallback.
    advance=[]
    for second in range(11):
        x=700+20*second
        p=proposal_for(dict(ground=[x,500,0,20],turn=0),at=NOW+second)
        d=FlightGate().evaluate(p, NOW+second)
        advance.append(dict(t_s=second, x_m=x, blocked=not d.allowed))
    first=next((v['t_s'] for v in advance if v['blocked']),None)
    lead=round(10-first,2) if first is not None else None
    return dict(version='0.4', experiment='fictional 2D point-mass, no actual airframe',
                counts=counts, n=len(results), cases=results, advance_warning=dict(
                    truth_boundary_s=10, first_symbolic_block_s=first,
                    simulated_lead_time_s=lead, trace=advance),
                critical_note='Misses are deliberate: claimed independent sensors can be spoofed together; unmodeled wind can defeat the forecast. No safety effectiveness inference.')


if __name__ == '__main__':
    output=run()
    location=Path(__file__).with_name('benchmark_results_v04.json')
    location.write_text(json.dumps(output,indent=2,allow_nan=False)+'\n')
    print(json.dumps({k:output[k] for k in ('version','n','counts','advance_warning')},indent=2))
    print('Saved:',location)
