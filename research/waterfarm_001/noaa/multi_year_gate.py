"""RC08: batch QC for NOAA Access API Daily Summaries PRCP (2022-2024).

Read-only offline by default. CSV must be independently downloaded from the
official NCEI daily-summaries API in *metric* units with includeAttributes=true.
No missing or rejected day may be replaced by synthetic weather.

This script emits one combined READY result ONLY when every requested year is
complete. A source fingerprint is byte integrity, not independent provenance.
"""
from __future__ import annotations
from dataclasses import asdict
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from hashlib import sha256
import json, os, tempfile, argparse
from api_daily_summaries import parse_csv

STATION='USW00024243'
HOST='https://www.ncei.noaa.gov/access/services/data/v1'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,hdrs,newurl):
        raise ValueError('NOAA redirect: independent validation required')


def official_url(year:int)->str:
    if type(year) is not int or not 1900<=year<=2100:raise ValueError('invalid year')
    return HOST+'?'+urlencode(dict(dataset='daily-summaries',stations=STATION,
        startDate=f'{year}-01-01',endDate=f'{year}-12-31',dataTypes='PRCP',
        units='metric',format='csv',includeAttributes='true'))


def fetch_official(year:int)->tuple[str,dict]:
    url=official_url(year)
    opener=build_opener(NoRedirect())
    req=Request(url,headers={'User-Agent':'Evercraft-Aqua-Research/0.8 (read-only NOAA climate research)',
                             'Accept':'text/csv,text/plain'})
    try:
        with opener.open(req,timeout=30) as resp:
            if resp.status!=200 or resp.url!=url:raise ValueError('NOAA source URL/status mismatch')
            data=resp.read(250001)
            if len(data)>250000:raise ValueError('NOAA response exceeds bounded limit')
            etag=resp.headers.get('ETag')
            modified=resp.headers.get('Last-Modified')
    except (HTTPError,URLError) as exc:
        raise ValueError('NOAA unavailable: HOLD') from exc
    try:text=data.decode('utf-8-sig')
    except UnicodeError:raise ValueError('unsupported NOAA character encoding') from None
    return text,{'retrieval':'HTTP_TLS_OFFICIAL_HOST_NOT_INDEPENDENTLY_VERIFIED',
                 'url':url,'etag':etag,'last_modified':modified,
                 'fetched_at_utc':datetime.now(timezone.utc).isoformat(),
                 'sha256':sha256(data).hexdigest(),'bytes':len(data)}


def batch_screen(year_sources:dict[int,str])->dict:
    if not year_sources:raise ValueError('no years')
    years=sorted(year_sources)
    if len(years)!=len(set(years)) or any(b!=a+1 for a,b in zip(years,years[1:])):
        raise ValueError('nonconsecutive years: HOLD')
    reports=[];all_ok=True
    for year in years:
        audit=parse_csv(year_sources[year],year=year,station=STATION)
        ok=not audit.status.startswith('HOLD')
        all_ok &= ok
        reports.append({'year':year,'status':audit.status,'days':audit.expected_days,
            'observed_days':audit.received_days,'trace_days':audit.trace_days,
            'missing_dates':list(audit.missing_days),'bad_quality_dates':list(audit.bad_quality_days),
            'precip_mm_lower_bound':audit.total_precip_mm_lower_bound,
            'input_sha256':audit.source_sha256})
    return {'state':'SCREEN_COMPLETE_ALL_YEARS' if all_ok else 'HOLD_INCOMPLETE_MULTIYEAR',
        'years':reports,'source_authenticity':'UNVERIFIED_IF_OFFLINE_COPIES',
        'water_yield_l':None,'can_run_observed_multiyear_scenario':bool(all_ok),
        'notes':['Trace means positive but below measurement resolution: treated as zero collectable lower bound only',
                 'No automatic replacement of any missing year/day or quality-flagged observation',
                 'Station rainfall does not certify snow/roof capture, water quality, farm weather or water rights']}


def observed_scenario(year_sources:dict[int,str], *, config=None, opening_tank_l=0.0)->dict:
    """Chronological real-calendar simulation, only after all audited years pass.

    Even complete station observations do NOT prove rooftop availability,
    actual delivery, crop-water savings, installed equipment or safe reuse.
    """
    from seasonal_screen import Configuration
    from carryover_model import simulate_observed_years
    report=batch_screen(year_sources)
    if not report['can_run_observed_multiyear_scenario']:
        raise ValueError('HOLD: incomplete year(s), scenario not computed')
    if config is None:config=Configuration(capacity_l=1000,demand_months=(5,6,7,8,9))
    if not isinstance(config,Configuration):raise ValueError('invalid scenario configuration')
    year_audits=[parse_csv(year_sources[year],year=year) for year in sorted(year_sources)]
    results=simulate_observed_years(year_audits,config,opening_tank_l)
    outputs=[]
    for row in results:
        outputs.append({'weather_year':row.source_year,'weather_source_sha256':row.source_sha256,
         'opening_tank_l':row.opening_tank_l,'modeled_input_l':row.admitted_l,
         'modeled_delivery_l':row.delivered_l,'modeled_overflow_l':row.overflow_l,
         'modeled_tank_loss_l':row.tank_losses_l,'ending_tank_l':row.ending_tank_l,
         'model_mass_error_l':row.mass_balance_error_l,'mode':row.mode})
    return {'evidence':'OBSERVED_STATION_WEATHER_WITH_HYPOTHETICAL_WATER_SYSTEM',
        'qc':report,'assumptions':asdict(config),'cases':outputs,
        'never_claim':'No observed farm-system yield, withdrawals, water savings, irrigation permission or water quality'}


def run(source_dir:Path, years:tuple[int,...], *, fetch:bool=False)->dict:
    source_dir.mkdir(parents=True,exist_ok=True)
    sources={};receipts={}
    for year in years:
        f=source_dir/f'Yakima_{year}_attributed_PRCP.csv'
        if fetch:
            data,receipt=fetch_official(year)
            # Do NOT overwrite an earlier source until retrieval and parsing both finish.
            audit=parse_csv(data,year=year)
            # Retain source even if a year has missing rainfall; report explicit HOLD.
            with tempfile.NamedTemporaryFile(mode='w',encoding='utf-8',dir=source_dir,delete=False) as temp:
                temp.write(data);temp_name=temp.name
            os.replace(temp_name,f)
            receipts[year]=receipt
        else:
            if not f.is_file():raise ValueError(f'missing local NOAA input {f.name}: HOLD')
            data=f.read_text(encoding='utf-8')
            receipts[year]={'retrieval':'OFFLINE_CSV_ORIGIN_NOT_AUTHENTICATED',
              'url':official_url(year),'sha256':sha256(data.encode('utf-8')).hexdigest()}
        sources[year]=data
    report=batch_screen(sources)
    report['retrieval_receipts']=receipts
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--dir',type=Path,required=True)
    p.add_argument('--years',nargs='+',type=int,default=[2022,2023,2024])
    p.add_argument('--fetch',action='store_true',help='Opt in to read-only official NOAA HTTPS retrieval')
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    result=run(args.dir,tuple(args.years),fetch=args.fetch)
    args.output.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print('state:',result['state'])

if __name__=='__main__':main()