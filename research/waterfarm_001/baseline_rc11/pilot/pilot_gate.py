"""Evercraft Aqua RC11: offline, non-actuating field evidence preflight.

Checks whether the supplied private meter CSV is internally consistent and bound
by hash to explicit (UNAUTHENTICATED) documentary assertions. It cannot verify
consent, documents, real instrument calibration, water rights, field conditions,
leaks, recovered water or savings. No network, file writes, or hardware controls.
"""
from __future__ import annotations
from datetime import date
from hashlib import sha256
import json, re, sys
from pathlib import Path

# Local source package keeps a copy under ../python; GitHub research branch
# reuses the canonical shared ../field module without duplicating code.
root = Path(__file__).resolve().parents[1]
for candidate in (root / 'python', root.parent / 'field'):
    if (candidate / 'field_audit.py').is_file():
        sys.path.insert(0, str(candidate))
        break
else:
    raise ImportError('Canonical Aqua field_audit.py unavailable: HOLD')
from field_audit import audit_meter_baseline, EvidenceHold

SCHEMA='evercraft.aqua.pilot-preflight.v1'
HEX64=re.compile(r'^[a-fA-F0-9]{64}$')
SITE=re.compile(r'^[A-Z0-9_-]{3,32}$')


def hold(message):
    raise EvidenceHold(message + ': HOLD')


def required_date(value,name):
    if not isinstance(value,str) or not re.fullmatch(r'\d{4}-\d\d-\d\d',value):hold(name+' needs ISO date')
    try:d=date.fromisoformat(value)
    except ValueError:hold(name+' has invalid calendar date')
    if not 1900 <= d.year <= 2100:hold(name+' out of range')
    return d


def require_hash(value,name):
    if not isinstance(value,str) or not HEX64.fullmatch(value):hold(name+' needs SHA256 hex')
    return value.lower()


def require_obj(container,key):
    item=container.get(key) if isinstance(container,dict) else None
    if not isinstance(item,dict):hold(key+' missing document metadata')
    return item


def preflight(manifest:dict,meter_csv:str,*,as_of:date|None=None)->dict:
    """Returns review-ready *metadata only*, never source readings or permits."""
    if not isinstance(manifest,dict):hold('manifest must be object')
    if manifest.get('schema')!=SCHEMA:hold('unexpected manifest schema')
    if not isinstance(meter_csv,str) or len(meter_csv)>2_000_000:hold('meter text oversized or invalid')
    if type(as_of) is not date and as_of is not None:hold('invalid reference date')
    as_of=as_of or date.today()
    if not isinstance(manifest.get('site_alias'),str) or not SITE.fullmatch(manifest['site_alias']):hold('site alias must be non-identifying code')
    if manifest.get('purpose')!='passive_water_energy_baseline_only':hold('purpose outside authorized passive study')
    permission=require_obj(manifest,'permission')
    if permission.get('operator_consent_attested') is not True:hold('explicit operator consent assertion required')
    consent_hash=require_hash(permission.get('consent_document_sha256'),'consent_document_sha256')
    if required_date(permission.get('expires_on'),'permission expiry')<as_of:hold('permission expired')
    records=require_obj(manifest,'records')
    provided_hash=require_hash(records.get('meter_csv_sha256'),'meter_csv_sha256')
    actual_hash=sha256(meter_csv.encode('utf-8')).hexdigest()
    if provided_hash!=actual_hash:hold('meter CSV mutated / hash mismatch')
    observed=audit_meter_baseline(meter_csv)
    if records.get('start')!=observed['period_start'] or records.get('end')!=observed['period_end']:
        hold('record dates not bound to audit')
    end=required_date(records.get('end'),'record end')
    if end>as_of:hold('future meter observations not permissible')
    boundary=require_obj(manifest,'boundary')
    diagram=require_hash(boundary.get('diagram_sha256'),'boundary diagram hash')
    if boundary.get('all_known_uses_declared') is not True:hold('known water uses and flow paths need declaration')
    if boundary.get('independent_review_receipt_sha256') is None:hold('topology review receipt required')
    review_hash=require_hash(boundary.get('independent_review_receipt_sha256'),'topology review receipt')
    instruments=require_obj(manifest,'instruments')
    for role,id_key in [('source','source_meter_id'),('irrigation','irrigation_meter_id')]:
        item=require_obj(instruments,role)
        if item.get('meter_id')!=observed[id_key]:hold(role+' meter identity mismatch')
        require_hash(item.get('calibration_document_sha256'),role+' calibration document')
        if required_date(item.get('calibration_valid_through'),role+' calibration expiry')<end:
            hold(role+' meter calibration expired during observations')
    pump=require_obj(instruments,'pump_energy')
    if not isinstance(pump.get('meter_id'),str) or not pump['meter_id'].strip():hold('pump energy meter id missing')
    require_hash(pump.get('calibration_document_sha256'),'pump energy calibration')
    if required_date(pump.get('calibration_valid_through'),'pump energy expiry')<end:
        hold('pump energy meter calibration expired during observations')
    return {
        'schema':SCHEMA,
        'state':'DOCUMENTARY_PRECHECK_COMPLETE_UNAUTHENTICATED',
        'site_alias':manifest['site_alias'],
        'period_start':observed['period_start'],'period_end':observed['period_end'],
        'observed_days':observed['days'],
        'meter_csv_sha256':actual_hash,
        'receipt_sha256':sha256(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
        'consent_receipt_present':bool(consent_hash),
        'boundary_diagram_and_review_receipts_present':bool(diagram and review_hash),
        'calibration_receipts_present':True,
        'operator_permission_authenticated':False,
        'calibration_authenticated':False,
        'topology_independently_authenticated':False,
        'water_savings_verified':False,
        'leak_verified':False,
        'authorized_for_physical_work':False,
        'permitted_as':'private expert review candidate only',
        'next_review':'Physically inspect diagram, signed consent, instrument logs, crop context, end-use safety and alternative explanations before any field decision',
    }


def main():
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('manifest',type=Path)
    p.add_argument('meter_csv',type=Path)
    p.add_argument('--out',type=Path)
    args=p.parse_args()
    report=preflight(json.loads(args.manifest.read_text()),args.meter_csv.read_text(encoding='utf-8'))
    payload=json.dumps(report,indent=2)+'\n'
    if args.out:args.out.write_text(payload)
    else:print(payload)


if __name__=='__main__':main()