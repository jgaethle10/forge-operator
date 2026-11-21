"""Independent Python verification for Aqua RC12 one-meter withdrawal baseline.

For provenance-aware research comparison only. No field data authenticity or
instrument certification; not a replacement for meter/engineer review.
"""
from __future__ import annotations
from csv import DictReader
from datetime import date,timedelta
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from io import StringIO

FIELDS=['date','meter_id','cumulative_reading','units','pump_kwh_since_previous','observation_kind']
FACTORS={'L':Decimal(1),'US_GAL':Decimal('3.785411784'),'M3':Decimal(1000)}

class Hold(ValueError): pass

def numeric(raw,what,optional=False):
    if raw=='' and optional:return None
    if not isinstance(raw,str) or not raw or raw.strip()!=raw or raw.startswith(('+','-')):
        raise Hold(f'{what}: invalid decimal')
    import re
    if not re.fullmatch(r'(?:0|[1-9][0-9]*)(?:\.[0-9]+)?',raw):raise Hold(f'{what}: invalid decimal')
    try: n=Decimal(raw)
    except InvalidOperation:raise Hold(f'{what}: invalid decimal') from None
    if not n.is_finite() or n<0 or n>Decimal(9007199254740991):raise Hold(f'{what}: invalid range')
    return n

def r3(n):return float(n.quantize(Decimal('0.001')))
def r4(n):return float(n.quantize(Decimal('0.0001')))

def audit(text):
    if not isinstance(text,str) or not text.strip() or len(text)>1000000:raise Hold('blank or oversized')
    if text.startswith('\ufeff'):text_reader=text[1:]
    else:text_reader=text
    reader=DictReader(StringIO(text_reader, newline=''), strict=True)
    if reader.fieldnames!=FIELDS:raise Hold('bad headers')
    rows=list(reader)
    if not 15<=len(rows)<=370:raise Hold('requires 15 to 370 readings')
    lastdate=lastmeter=lastunit=lastreading=lastkind=None
    total_kwh=Decimal(0);missing=0
    intervals=[]
    for i,row in enumerate(rows):
        if None in row or any(v is None for v in row.values()):raise Hold('bad column count')
        try:dt=date.fromisoformat(row['date'])
        except ValueError:raise Hold('invalid date') from None
        if dt.isoformat()!=row['date']:raise Hold('invalid ISO date')
        meter=row['meter_id'];unit=row['units'];kind=row['observation_kind']
        if not meter.strip() or len(meter)>60 or unit not in FACTORS:raise Hold('bad meter/unit')
        if kind!='OPERATOR_SUPPLIED_READING' or any(x in meter.upper() for x in ('DEMO','SYNTH','TEST','FICTION')):raise Hold('unverified synthetic/unknown source')
        value=numeric(row['cumulative_reading'],'meter')
        kwh=numeric(row['pump_kwh_since_previous'],'kwh',optional=True)
        if i==0:
            if kwh is not None:raise Hold('first interval kwh must be blank')
            firstdate=dt;firstvalue=value
        else:
            if dt!=lastdate+timedelta(days=1):raise Hold('missing/duplicate readings')
            if meter!=lastmeter or unit!=lastunit or kind!=lastkind:raise Hold('meter or units changed')
            if value<lastreading:raise Hold('rollover/reset')
            withdrawal=(value-lastreading)*FACTORS[unit]
            if withdrawal>Decimal(9007199254740991):raise Hold('unsafe converted value')
            if kwh is None:missing+=1
            else:total_kwh+=kwh
            intervals.append({'ending_date':dt.isoformat(),'source_withdrawal_l':r3(withdrawal),'pump_kwh':None if kwh is None else float(kwh)})
        lastdate,lastmeter,lastunit,lastreading,lastkind=dt,meter,unit,value,kind
    total=(lastreading-firstvalue)*FACTORS[lastunit]
    if total>Decimal(9007199254740991):raise Hold('unsafe total value')
    return {'source_integrity_sha256':sha256(text.encode('utf-8')).hexdigest(),
       'total_source_withdrawal_l':r3(total),
       'mean_daily_withdrawal_l':r3(total/len(intervals)),
       'pump_energy_kwh':None if missing else r3(total_kwh),
       'energy_kwh_per_m3':None if missing or total==0 else r4(total_kwh*1000/total),
       'interval_count':len(intervals),'energy_intervals_missing':missing,
       'water_savings_verified':False,'leak_verified':False,'physically_verified':False,
       'origin':'OPERATOR_SUPPLIED_UNVERIFIED'}
