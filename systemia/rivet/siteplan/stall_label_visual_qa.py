#!/usr/bin/env python3
from __future__ import annotations
import argparse, importlib.util, json, math, os
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT
import fitz
from shapely.geometry import shape

HERE=Path(__file__).resolve().parent
ROOT=DATA_ROOT
DEFAULT_SRC=Path(os.getenv('KSS_SITE_SRC', str(SOURCE_ROOT)))

def loadmod(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

gold=loadmod('gold',HERE/'render_golden.py')

def center(b):
    return ((b[0]+b[2])/2,(b[1]+b[3])/2)

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--site',type=int,required=True)
    ap.add_argument('--render-dir',required=True)
    ap.add_argument('--source-dir',default=str(DEFAULT_SRC))
    ap.add_argument('--tolerance-pt',type=float,default=11.0)
    ap.add_argument('--receipt',default='')
    a=ap.parse_args()

    site=a.site
    src=Path(a.source_dir)/f'site_{site:02d}.json'
    pdf=Path(a.render_dir)/f'RIVET_Site_{site:02d}_VDOT_S0_Site_Plan.pdf'
    if not src.exists(): raise SystemExit(f'MISSING_SOURCE:{src}')
    if not pdf.exists(): raise SystemExit(f'MISSING_PDF:{pdf}')
    d=json.loads(src.read_text())

    stalls=gold.validate_stall_placement(d)
    px,py,pw,ph=24,58,762,706
    _,_,_,tx,_=gold.plan_transform(d,px+6,py+6,pw-12,ph-12,.12)

    doc=fitz.open(pdf); page=doc[0]
    spans=[]
    for block in page.get_text('dict').get('blocks',[]):
        for line in block.get('lines',[]):
            for sp in line.get('spans',[]):
                t=' '.join(str(sp.get('text','')).split())
                if t:
                    spans.append({'text':t,'bbox':sp['bbox'],'center':center(sp['bbox'])})

    failures=[]; checks=[]; used=set()
    for i,stall in enumerate(stalls,1):
        q=stall.representative_point(); ex=tx(q.x,q.y)
        candidates=[]
        for idx,sp in enumerate(spans):
            if idx in used or sp['text']!=str(i): continue
            sx,sy=sp['center']
            if not (px <= sx <= px+pw and py <= sy <= py+ph): continue
            dist=math.hypot(sx-ex[0],sy-ex[1])
            candidates.append((dist,idx,sp))
        if not candidates:
            failures.append(f'STALL_{i}_NUMBER_MISSING')
            checks.append({'stall':i,'expected_pt':[round(ex[0],2),round(ex[1],2)],'found':None})
            continue
        dist,idx,sp=min(candidates,key=lambda x:x[0]); used.add(idx)
        checks.append({'stall':i,'expected_pt':[round(ex[0],2),round(ex[1],2)],'actual_pt':[round(sp['center'][0],2),round(sp['center'][1],2)],'distance_pt':round(dist,3),'bbox':[round(x,2) for x in sp['bbox']]})
        if dist>a.tolerance_pt:
            failures.append(f'STALL_{i}_NUMBER_DISPLACED:{dist:.2f}pt')

    receipt={
      'qa_version':'KSS-STALL-LABEL-VISUAL-QA-v1',
      'site':site,
      'source':str(src),
      'pdf':str(pdf),
      'tolerance_pt':a.tolerance_pt,
      'checks':checks,
      'failures':failures,
      'pass':not failures
    }
    out=Path(a.receipt) if a.receipt else Path(a.render_dir)/f'site_{site:02d}_stall_label_visual_qa.json'
    out.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
    if failures: raise SystemExit(2)

if __name__=='__main__': main()
