#!/usr/bin/env python3
from __future__ import annotations
import argparse, json, subprocess, sys, time
from pathlib import Path
from paths import SOURCE_ROOT, CORRECTION_ROOT

HERE=Path(__file__).resolve().parent

def run_stage(name, cmd, remaining):
    started=time.monotonic()
    try:
        p=subprocess.run(cmd,cwd=HERE,text=True,capture_output=True,timeout=max(1,remaining))
        elapsed=time.monotonic()-started
        return {
            'name':name,'ok':p.returncode==0,'returncode':p.returncode,
            'seconds':round(elapsed,3),'stdout':p.stdout[-12000:],'stderr':p.stderr[-12000:]
        }
    except subprocess.TimeoutExpired as e:
        elapsed=time.monotonic()-started
        return {
            'name':name,'ok':False,'returncode':124,'seconds':round(elapsed,3),
            'stdout':str(e.stdout or '')[-12000:],'stderr':str(e.stderr or '')[-12000:],
            'blocker':'STAGE_TIMEOUT'
        }

def main():
    ap=argparse.ArgumentParser(description='Owned RIVET site-plan correction pipeline.')
    ap.add_argument('--site',type=int,required=True)
    ap.add_argument('--offline',action='store_true')
    ap.add_argument('--refresh-aerial',action='store_true')
    ap.add_argument('--budget-seconds',type=int,default=300)
    ap.add_argument('--revision',default='')
    args=ap.parse_args()

    site=args.site
    revision=args.revision or time.strftime('%Y%m%dT%H%M%SZ',time.gmtime())
    job_dir=CORRECTION_ROOT/f'site_{site:02d}'/revision
    job_dir.mkdir(parents=True,exist_ok=True)
    receipt_path=job_dir/'correction_receipt.json'
    started=time.monotonic()
    stages=[]

    source=SOURCE_ROOT/f'site_{site:02d}.json'
    if not source.exists():
        receipt={'ok':False,'site':site,'revision':revision,'blocker':'SOURCE_MISSING','source':str(source),'stages':[]}
        receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
        raise SystemExit(2)

    commands=[
      ('identity',[sys.executable,str(HERE/'identity.py'),'--sites',str(site),'--source-root',str(SOURCE_ROOT)]),
      ('compile',[sys.executable,str(HERE/'compile.py'),'--sites',str(site)]),
      ('geometry',[sys.executable,str(HERE/'geometry.py'),'--sites',str(site)]),
      ('lineage',[sys.executable,str(HERE/'lineage_guard.py'),'--site',str(site),'--require-complete'])
    ]
    if args.offline: commands[1][1].append('--offline')
    if args.refresh_aerial: commands[1][1].append('--refresh-aerial')

    blocker=''
    for name,cmd in commands:
        elapsed=time.monotonic()-started
        remaining=args.budget_seconds-elapsed
        if remaining<=0:
            blocker='CORRECTION_BUDGET_BREACHED'
            stages.append({'name':name,'ok':False,'returncode':124,'seconds':0,'blocker':blocker})
            break
        result=run_stage(name,cmd,remaining)
        stages.append(result)
        if not result['ok']:
            blocker=result.get('blocker') or f'{name.upper()}_FAILED'
            break

    total=round(time.monotonic()-started,3)
    ok=not blocker and len(stages)==len(commands) and all(x.get('ok') for x in stages)
    receipt={
      'schema':'evercraft.rivet.siteplan.correction-receipt.v1',
      'ok':ok,'site':site,'revision':revision,
      'budget_seconds':args.budget_seconds,'elapsed_seconds':total,
      'budget_state':'within_budget' if total<=args.budget_seconds else 'breached',
      'source':str(source),'offline':bool(args.offline),
      'refresh_aerial':bool(args.refresh_aerial),
      'blocker':blocker or None,'stages':stages,
      'external_delivery_authorized':False
    }
    receipt_path.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'ok':ok,'site':site,'revision':revision,'elapsed_seconds':total,'blocker':blocker or None,'receipt':str(receipt_path)},indent=2))
    if not ok: raise SystemExit(2)

if __name__=='__main__':
    main()
