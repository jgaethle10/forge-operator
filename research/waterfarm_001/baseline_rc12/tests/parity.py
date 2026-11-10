from pathlib import Path
import csv,json,subprocess,sys
from datetime import date,timedelta
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'research'))
from single_meter import audit,Hold,FIELDS

def sample(unit,step,energy,days=15):
    import io
    o=io.StringIO();w=csv.DictWriter(o,fieldnames=FIELDS,lineterminator='\n');w.writeheader()
    for i in range(days):w.writerow({'date':(date(2025,3,1)+timedelta(days=i)).isoformat(),
       'meter_id':'SITE_SOURCE_A','cumulative_reading':str(1100+i*step),
       'units':unit,'pump_kwh_since_previous':'' if i==0 or energy is None else str(energy),
       'observation_kind':'OPERATOR_SUPPLIED_READING'})
    return o.getvalue()

cases=[('liters',sample('L',1000,5)),('gallons',sample('US_GAL',200,0)),('m3',sample('M3',1,None))]
for name,raw in cases:
    py=audit(raw)
    node=subprocess.check_output(['node','--input-type=module','-e',"import {analyzeSingleMeter} from './app/core.mjs';let raw='';for await(const chunk of process.stdin)raw+=chunk;const x=analyzeSingleMeter(raw);console.log(JSON.stringify(x))"],input=raw.encode(),cwd=root)
    js=json.loads(node)
    for key in ('source_integrity_sha256','total_source_withdrawal_l','mean_daily_withdrawal_l',
                'pump_energy_kwh','energy_kwh_per_m3','interval_count','energy_intervals_missing','water_savings_verified','leak_verified','physically_verified'):
        assert py[key]==js[key],(name,key,py[key],js[key])
    print(name,'PASS',py['total_source_withdrawal_l'],'L',py['pump_energy_kwh'],'kWh')
for name,bad in [('missing_date',sample('L',1000,5).replace('2025-03-09','2025-03-08')),
                 ('demo',sample('L',1000,5).replace('SITE_SOURCE_A','SYNTH_TEST_SOURCE')),
                 ('blank_energy',sample('L',1000,None,14))]:
    try:audit(bad);raise AssertionError('admitted '+name)
    except Hold:print(name,'HOLD PASS')
print('PYTHON/JS PARITY PASS')
