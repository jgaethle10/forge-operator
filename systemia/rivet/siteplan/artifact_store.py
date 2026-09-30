#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, os, shutil, subprocess, sys, time
from pathlib import Path
from paths import (
    SOURCE_ROOT, COMPILER_ROOT, IDENTITY_ROOT, MODEL_ROOT, GEOMETRY_ROOT,
    RENDER_ROOT, RECEIPT_ROOT, ARTIFACT_ROOT
)

HERE=Path(__file__).resolve().parent

def sha256(path:Path)->str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def read_json(path:Path):
    return json.loads(path.read_text())

def require(condition,code):
    if not condition: raise RuntimeError(code)

def verify_lineage(site:int):
    cmd=[sys.executable,str(HERE/'lineage_guard.py'),'--site',str(site),'--require-complete']
    p=subprocess.run(cmd,cwd=HERE,text=True,capture_output=True,timeout=60)
    require(p.returncode==0,'LINEAGE_NOT_GREEN')
    try: return json.loads(p.stdout)
    except Exception: raise RuntimeError('LINEAGE_RECEIPT_INVALID')

def promote(site:int,revision:str):
    nn=f'{site:02d}'
    pair=RENDER_ROOT/f'RIVET_Site_{nn}_VDOT_Founder_Review_2pg.pdf'
    layout=RECEIPT_ROOT/f'site_{nn}_layout_qa.json'
    visual=RENDER_ROOT/f'site_{nn}_stall_label_visual_qa.json'
    source=SOURCE_ROOT/f'site_{nn}.json'
    identity=IDENTITY_ROOT/f'site_{nn}_identity.json'
    model=MODEL_ROOT/f'site_{nn}.json'
    geometry=GEOMETRY_ROOT/f'site_{nn}.json'

    for path,code in [
      (pair,'PAIR_PDF_MISSING'),(layout,'LAYOUT_QA_MISSING'),(visual,'VISUAL_QA_MISSING'),
      (source,'SOURCE_MISSING'),(identity,'IDENTITY_MISSING'),(model,'MODEL_MISSING'),(geometry,'GEOMETRY_MISSING')
    ]: require(path.exists(),code)

    lineage=verify_lineage(site)
    layout_q=read_json(layout); visual_q=read_json(visual)
    require(layout_q.get('layout_pass') is True,'LAYOUT_QA_NOT_PASSED')
    require(visual_q.get('pass') is True,'STALL_LABEL_QA_NOT_PASSED')

    artifact_sha=sha256(pair)
    source_sha=sha256(source)
    identity_doc=read_json(identity)
    identity_sha=str(identity_doc.get('identity_sha256') or '')
    require(bool(identity_sha),'IDENTITY_HASH_MISSING')
    model_sha=sha256(model); geometry_sha=sha256(geometry)

    version_dir=ARTIFACT_ROOT/f'site_{nn}'/artifact_sha
    version_dir.mkdir(parents=True,exist_ok=True)
    immutable_pdf=version_dir/pair.name
    if immutable_pdf.exists():
        require(sha256(immutable_pdf)==artifact_sha,'IMMUTABLE_ARTIFACT_HASH_CONFLICT')
    else:
        shutil.copyfile(pair,immutable_pdf)
        require(sha256(immutable_pdf)==artifact_sha,'IMMUTABLE_ARTIFACT_COPY_FAILED')

    manifest={
      'schema':'evercraft.rivet.siteplan.artifact.v1',
      'asset_key':f'rivet-site-{nn}:{artifact_sha}',
      'site_number':site,'revision':revision,
      'filename':pair.name,'mime_type':'application/pdf',
      'sha256':artifact_sha,'byte_size':immutable_pdf.stat().st_size,
      'source_sha256':source_sha,'identity_sha256':identity_sha,
      'model_sha256':model_sha,'geometry_sha256':geometry_sha,
      'layout_qa_sha256':sha256(layout),'visual_qa_sha256':sha256(visual),
      'lineage':lineage,'qa_state':'passed',
      'promotion_state':'promoted','current':True,
      'external_delivery_authorized':False,
      'promoted_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())
    }
    manifest_path=version_dir/'manifest.json'
    if manifest_path.exists():
        old=read_json(manifest_path)
        require(old.get('sha256')==artifact_sha,'IMMUTABLE_MANIFEST_CONFLICT')
    else:
        manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')

    site_root=ARTIFACT_ROOT/f'site_{nn}'
    pointer_tmp=site_root/'current.json.tmp'
    pointer=site_root/'current.json'
    pointer_tmp.write_text(json.dumps({
      'schema':'evercraft.rivet.siteplan.current-pointer.v1',
      'site_number':site,'asset_key':manifest['asset_key'],
      'sha256':artifact_sha,'manifest':str(manifest_path),
      'updated_at':manifest['promoted_at'],
      'external_delivery_authorized':False
    },indent=2)+'\n')
    os.replace(pointer_tmp,pointer)
    return manifest,manifest_path,pointer

def main():
    ap=argparse.ArgumentParser(description='Promote a QA-passed site-plan pair into owned immutable storage.')
    ap.add_argument('--site',type=int,required=True)
    ap.add_argument('--revision',required=True)
    args=ap.parse_args()
    try:
        manifest,manifest_path,pointer=promote(args.site,args.revision)
        print(json.dumps({
          'ok':True,'asset_key':manifest['asset_key'],'sha256':manifest['sha256'],
          'manifest':str(manifest_path),'current_pointer':str(pointer),
          'external_delivery_authorized':False
        },indent=2))
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e),'external_delivery_authorized':False},indent=2))
        raise SystemExit(2)

if __name__=='__main__':
    main()
