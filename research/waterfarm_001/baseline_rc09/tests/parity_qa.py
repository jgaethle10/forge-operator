"""Numerical parity of the offline browser core with RC08 Python baseline.
Input is SYNTHETIC and should never be reused as real site records.
"""
import json, tempfile, subprocess, sys
from pathlib import Path
from datetime import date,timedelta
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src/aqua_rc08/field'))
from field_audit import audit_meter_baseline
cols=('date,source_meter_id,source_open_l,source_close_l,irrigation_meter_id,irrigation_open_l,irrigation_close_l,source_uncertainty_l,irrigation_uncertainty_l,pump_kwh,calibration_ref,observation_kind')
lines=[cols]
for i in range(14):
    lines.append(f'{(date(2025,1,1)+timedelta(days=i)).isoformat()},SOURCE_A,{i*1000},{(i+1)*1000},IRR_B,{i*950},{(i+1)*950},15,15,6,FICTIONAL_CALIBRATION,ACTUAL_RECORDED_METER')
csv='\n'.join(lines)+'\n'
p=audit_meter_baseline(csv)
with tempfile.TemporaryDirectory() as d:
    f=Path(d)/'trial.csv';f.write_text(csv)
    result=subprocess.check_output(['node','--input-type=module','-e', 'import{auditCSV}from '+json.dumps((ROOT/'app/core.mjs').as_uri())+';import fs from "node:fs";console.log(JSON.stringify(auditCSV(fs.readFileSync(process.argv[1],"utf8"))))',str(f)],text=True)
    j=json.loads(result)
for k in ['days','period_start','period_end','source_inlet_l','irrigation_meter_l','pump_energy_kwh','energy_kwh_per_source_m3','reported_meter_uncertainty_max_l']:
    target='uncertainty_envelope_l' if k=='reported_meter_uncertainty_max_l' else k
    assert p[k]==j[target],(k,p[k],j[target])
assert j['authorized_to_claim_savings'] is False
assert p['ready_for_savings_or_leak_claim'] is False
print('PASS: Python RC08 / Browser RC09 numerical parity on synthetic 14-day fixture')