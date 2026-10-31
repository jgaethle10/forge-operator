"""Aqua RC08: non-actuating, no-PII, read-only meter baseline assessment.

This computes observed meter withdrawals and apparent boundary imbalance,
NEVER 'leaks', 'water saved', irrigation efficiency, plant health or financial ROI.
No hardware or network integrations. Data are supplied by an operator and are
NOT authenticated by a CSV boolean field or by the program itself.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from datetime import date, timedelta
from math import isfinite
from pathlib import Path
from hashlib import sha256
import csv, io, json

class EvidenceHold(ValueError):
    pass

COLUMNS = (
    'date','source_meter_id','source_open_l','source_close_l',
    'irrigation_meter_id','irrigation_open_l','irrigation_close_l',
    'source_uncertainty_l','irrigation_uncertainty_l',
    'pump_kwh','calibration_ref','observation_kind'
)


def finite(name, raw):
    try:
        if isinstance(raw, bool) or str(raw).strip()=='':raise ValueError()
        num=float(raw)
    except (ValueError, TypeError):
        raise EvidenceHold(f'{name}: missing or nonnumeric; not zero') from None
    if not isfinite(num) or num < 0:
        raise EvidenceHold(f'{name}: must be finite and nonnegative')
    return num


@dataclass(frozen=True)
class MeterDay:
    date: date
    source_meter_id: str
    irrigation_meter_id: str
    source_open_l: float
    source_close_l: float
    irrigation_open_l: float
    irrigation_close_l: float
    source_uncertainty_l: float
    irrigation_uncertainty_l: float
    pump_kwh: float
    calibration_ref: str
    observation_kind: str

    @property
    def source_l(self): return self.source_close_l-self.source_open_l

    @property
    def irrigation_l(self): return self.irrigation_close_l-self.irrigation_open_l


@dataclass(frozen=True)
class BoundaryAttestation:
    """Supplied assertions, not proof. Operator must have independent diagram review."""
    diagram_reviewed: bool = False
    exactly_one_inlet: bool = False
    irrigation_outlet_meter_covers_all_outflow: bool = False
    no_storage_or_side_flows: bool = False

    def complete(self):
        return all(type(x) is bool and x for x in asdict(self).values())


def parse_meter_csv(text: str) -> tuple[MeterDay,...]:
    if not isinstance(text,str) or not text.strip():
        raise EvidenceHold('blank input: HOLD')
    reader=csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or tuple(reader.fieldnames)!=COLUMNS:
        raise EvidenceHold('CSV columns differ from mandatory contract: HOLD')
    out=[]
    previous=None
    for row in reader:
        if None in row or any(v is None for v in row.values()):
            raise EvidenceHold('malformed CSV: HOLD')
        try: d=date.fromisoformat(row['date'])
        except (ValueError,TypeError):raise EvidenceHold('date must be YYYY-MM-DD') from None
        if previous and d!=previous.date+timedelta(days=1):
            raise EvidenceHold('missing, duplicate or out-of-order daily meter records: HOLD')
        for name in ('source_meter_id','irrigation_meter_id','calibration_ref'):
            if not row[name].strip():raise EvidenceHold(name+' is missing: HOLD')
        if row['source_meter_id']==row['irrigation_meter_id']:
            raise EvidenceHold('inlet and irrigation meters cannot be same meter: HOLD')
        if row['observation_kind']!='ACTUAL_RECORDED_METER':
            raise EvidenceHold('unobserved meter source: HOLD')
        kv={key:finite(key,row[key]) for key in (
            'source_open_l','source_close_l','irrigation_open_l','irrigation_close_l',
            'source_uncertainty_l','irrigation_uncertainty_l','pump_kwh')}
        if kv['source_close_l']<kv['source_open_l'] or kv['irrigation_close_l']<kv['irrigation_open_l']:
            raise EvidenceHold('totalizer reset, rollover or negative meter delta: HOLD')
        if previous and (previous.source_meter_id!=row['source_meter_id'] or previous.irrigation_meter_id!=row['irrigation_meter_id']):
            raise EvidenceHold('unexpected meter identity change: HOLD')
        if previous and (abs(previous.source_close_l-kv['source_open_l'])>1e-6 or
                         abs(previous.irrigation_close_l-kv['irrigation_open_l'])>1e-6):
            raise EvidenceHold('meter continuity broken between days: HOLD')
        entry=MeterDay(d,row['source_meter_id'],row['irrigation_meter_id'],
            kv['source_open_l'],kv['source_close_l'],kv['irrigation_open_l'],
            kv['irrigation_close_l'],kv['source_uncertainty_l'],kv['irrigation_uncertainty_l'],
            kv['pump_kwh'],row['calibration_ref'],row['observation_kind'])
        out.append(entry)
        previous=entry
    if len(out)<14:raise EvidenceHold('less than 14 consecutive days: HOLD')
    return tuple(out)


def audit_meter_baseline(text: str, *, boundary: BoundaryAttestation|None=None) -> dict:
    days=parse_meter_csv(text)
    inlet=sum(x.source_l for x in days)
    irrigation=sum(x.irrigation_l for x in days)
    kwh=sum(x.pump_kwh for x in days)
    unc=sum(x.source_uncertainty_l+x.irrigation_uncertainty_l for x in days)
    boundary=boundary or BoundaryAttestation()
    if type(boundary) is not BoundaryAttestation:
        raise EvidenceHold('boundary attestation must be explicit typed data')
    scope='NOT_EVALUATED_BOUNDARY_UNVERIFIED'
    residual=None
    if boundary.complete():
        residual=inlet-irrigation
        scope='APPARENT_IMBALANCE_REQUIRES_INDEPENDENT_METER_AND_TOPOLOGY_REVIEW'
        if residual< -unc:
            scope='HOLD_MASS_BALANCE_NEGATIVE_OUTSIDE_MEASUREMENT_ERROR'
    result={
        'evidence_state':'OPERATOR_SUPPLIED_METER_CSV_UNAUTHENTICATED',
        'ready_for_savings_or_leak_claim':False,
        'days':len(days),'period_start':days[0].date.isoformat(),
        'period_end':days[-1].date.isoformat(),
        'source_meter_id':days[0].source_meter_id,
        'irrigation_meter_id':days[0].irrigation_meter_id,
        'source_inlet_l':round(inlet,4),'irrigation_meter_l':round(irrigation,4),
        'pump_energy_kwh':round(kwh,4),
        'energy_kwh_per_source_m3':round(kwh/(inlet/1000),4) if inlet else None,
        'reported_meter_uncertainty_max_l':round(unc,4),
        'imbalance_status':scope,'apparent_imbalance_l':round(residual,4) if residual is not None else None,
        'unexplained_above_error_envelope_l':round(max(0,abs(residual)-unc),4) if residual is not None else None,
        'source_sha256':sha256(text.encode('utf-8')).hexdigest(),
        'known_limits':[
            'Every meter reading and calibration reference is unverified operator-supplied input',
            'Source and irrigation meter readings do not establish crop ET, root-zone application or actual savings',
            'Positive imbalance could be normal consumption, storage, returns, other outlets, telemetry or meter error',
            'Even with a boundary attestation imbalance is NOT a proven leak',
            'No energy comparison against controls, crop outcomes, tariffs or authorized end use',
            'No automated actuation, routing to hardware, or water distribution authorization',
        ]}
    return result


def main():
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--csv',type=Path,required=True)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--boundary-reviewed',action='store_true')
    args=p.parse_args()
    text=args.csv.read_text(encoding='utf-8')
    # CLI flag ALONE cannot supply all topology assertions, so always leave unreviewed.
    result=audit_meter_baseline(text)
    args.out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('WROTE BASELINE (not water savings or leak detection):',args.out)

if __name__=='__main__':main()