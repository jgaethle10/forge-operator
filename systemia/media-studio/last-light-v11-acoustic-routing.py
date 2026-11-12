#!/usr/bin/env python3
"""Evercraft Orchestra V11: source-custody-aware routing and editable control room.

Catalogue coverage is NOT source-byte verification, audio, performed legato, or
human approval. Never swap absent section samples for General MIDI instruments.
"""
from __future__ import annotations
import argparse, hashlib, html, importlib.util, json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXPECTED_PIANO = '630efc0e8206ec7a6f4f0dac41634ab2a34da7f518f9f90be0b339b4e5a2015e'

def _v9():
    spec=importlib.util.spec_from_file_location('last_light_v9',HERE/'last-light-v9-conductor.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def validate_bank(bank):
    if bank.get('schema')!='evercraft.instrument-foundry.v10.source-bank.v1':
        raise ValueError('unknown_recorded_bank')
    if (bank.get('status')!='research_not_human_accepted' or
        bank.get('source_owned_by_evercraft') is not False or
        bank.get('actual_performed_legato') is not False or
        bank.get('license')!='CC0-1.0'):
        raise ValueError('bank_rights_or_performance_misrepresented')
    files=bank.get('files',[])
    if len(files)!=12:raise ValueError('unexpected_sample_count')
    observed=set()
    for item in files:
        key=(item.get('instrument'),item.get('pitch'),item.get('dynamic'))
        if key in observed:raise ValueError('duplicate_original_source')
        if not re.fullmatch(r'[0-9a-f]{64}',item.get('sha256','')) or not re.fullmatch(r'[0-9a-f]{40}',item.get('git_blob_sha1','')):
            raise ValueError('missing_source_custody')
        observed.add(key)
    for instrument,notes in bank.get('notes',{}).items():
        for pitch in notes:
            for layer in ('soft','strong'):
                if (instrument,pitch,layer) not in observed:raise ValueError('declared_note_missing_verified_source_manifest')
    if len(observed)!=12:raise ValueError('source_manifest_incomplete')
    return {name:set(values) for name,values in bank['notes'].items()}

def instrument_role(section_id):
    if section_id in ('violin_I','violin_II'):
        return 'violin','solo_note_cannot_prove_real_section_ensemble'
    if section_id=='cello':return 'cello','individual_section_note_not_legato'
    return None,'no_source_library_registered'

def audit(score,bank):
    if score.get('protected_piano_sha256')!=EXPECTED_PIANO:raise ValueError('piano_sha_mismatch')
    _v9().check_score(score)
    available=validate_bank(bank)
    rows=[];covered=0;total=0
    for part in score['sections']:
        family,limit=instrument_role(part['id'])
        notes=[];hits=0
        for t,pitch,length,velocity,shape in part['notes']:
            exact=bool(family and pitch in available.get(family,set()))
            hits+=int(exact)
            notes.append({'at':t,'pitch':pitch,'seconds':length,'velocity':velocity,'shape':shape,
                          'catalogued_exact_root':exact,
                          'audio_admission':'BLOCKED_UNAPPROVED_ACOUSTIC_SOURCE' if exact else 'BLOCKED_NO_EXACT_RECORDED_NOTE'})
        total+=len(notes);covered+=hits
        rows.append({'id':part['id'],'family':part['family'],'channel':part['channel'],
                     'notes_total':len(notes),'catalogued_exact_root_notes':hits,
                     'uncovered_notes':len(notes)-hits,'source_family':family,
                     'instrument_limitation':limit,
                     'production_stem_approved':False,'recorded_legato_approved':False,
                     'audio_status':'BLOCKED','notes':notes})
    return {'schema':'evercraft.music.orchestra-source-audit.v11',
            'status':'REHEARSAL_SCORE_ONLY_NOT_AN_AUDIO_RENDER',
            'protected_piano_sha256':EXPECTED_PIANO,
            'piano_audio_imported':False,'piano_audio_mutated':False,
            'source_bytes_verified_this_run':False,
            'genuine_performed_legato_captured':False,
            'founder_listening_approval':False,'commercial_release_approved':False,
            'midi_synthesis_used':False,
            'sections_total':len(rows),'score_notes_total':total,
            'catalogued_exact_root_notes':covered,'uncovered_score_notes':total-covered,
            'approved_audio_sections':0,
            'why_not_audio':'No proven legato/section realism or approved recorded assets; catalogue entries alone cannot authorize a mix.',
            'sections':rows}

def control_room(report):
    # Static timeline remains legible if JavaScript is disabled.
    families={'strings':'#7aa9f9','woodwinds':'#6bd9ae','brass':'#f2bf77','plucked':'#c5a5f8','percussion':'#f58f9c'}
    rows=[]
    for part in report['sections']:
        color=families.get(part['family'],'#a0b4c9')
        notes=''.join('<span class="note '+('covered' if n['catalogued_exact_root'] else 'missing')+'" '
                +'style="left:'+f"{100*n['at']/35:.3f}"+'%;width:'+f"{max(.24,100*n['seconds']/35):.3f}"+'%;" '
                +'title="'+html.escape(f"{n['pitch']} @ {n['at']}s | "+('recorded root catalogued, unapproved' if n['catalogued_exact_root'] else 'no exact recorded root'),quote=True)+'"></span>'
                for n in part['notes'])
        rows.append(f'''<article class="track" data-family="{html.escape(part['family'])}" data-id="{html.escape(part['id'])}">
          <div class="track-heading"><strong>{html.escape(part['id'].replace('_',' '))}</strong><span>{part['catalogued_exact_root_notes']}/{part['notes_total']} notes catalogued</span></div>
          <div class="timeline" style="--section-color:{color}">{notes}</div>
          <div class="track-controls"><label><input type="checkbox" class="mute" checked> Include in score export</label>
          <label>Expression <input class="expression" type="range" min="0" max="140" value="100"><output>100%</output></label>
          <small>Audio: blocked</small></div>
          </article>''')
    serialized=json.dumps({'report':report,'adjustments':{}},separators=(',',':')).replace('<','\\u003c')
    return '''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Evercraft | Orchestra Control Room V11</title>
<style>
:root{font-family:system-ui,Arial,sans-serif;color:#e9f2ff;background:#09121e;font-synthesis:none}*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at top left,#193151,#09121e 60%)}main{max-width:1160px;margin:auto;padding:30px 18px 70px}h1{font-size:clamp(28px,6vw,44px);letter-spacing:-.03em;margin:12px 0}h2{font-size:18px}
.eyebrow{letter-spacing:.17em;text-transform:uppercase;color:#93bde8;font-size:11px;font-weight:800}
p{color:#a9b9c9;line-height:1.6}.lead{max-width:700px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:24px 0}.stat,.track,.panel{border:1px solid #29415a;background:#0f2031cc;border-radius:13px}.stat{padding:18px}.stat b{font-size:clamp(22px,5vw,34px);display:block}.stat small{color:#9aacbc}
.toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:22px 0}.toolbar label{font-size:13px;color:#b9c8d8}select,button{background:#152c42;color:#eff6ff;border:1px solid #436584;border-radius:8px;padding:10px 13px;cursor:pointer}button:hover{background:#214563}.tracks{display:grid;gap:10px}.track{padding:14px}.track-heading{display:flex;justify-content:space-between;gap:8px;font-size:14px}.track-heading span{color:#8fa7ba;font-size:12px}.timeline{height:28px;position:relative;border-radius:7px;margin:12px 0;background:repeating-linear-gradient(90deg,#30465b88 0 1px,transparent 1px 20%),#0a1727}.note{height:70%;top:15%;border-radius:4px;position:absolute;min-width:3px;background:var(--section-color);opacity:.35}.note.covered{opacity:1;box-shadow:0 0 10px #6bd9ae44}.track-controls{display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:12px;color:#a5b9c9}.track-controls label{display:flex;align-items:center;gap:6px}.track-controls small{margin-left:auto;color:#ecb0b0}.track input[type=range]{width:130px;accent-color:#7aa9f9}.track output{width:42px}.legend{display:flex;gap:16px;flex-wrap:wrap;margin:12px 0;color:#b7c9d9;font-size:12px}.dot{height:9px;width:9px;display:inline-block;border-radius:2px;background:#7aa9f9}.dot.dim{opacity:.3}.panel{padding:17px;margin-top:20px}.notice{color:#ffdfaa;border-left:2px solid #d8ad5b;padding-left:12px}.footer{font-size:12px;color:#91a8bb}a{color:#9cc4f5}
@media(max-width:600px){.stats{grid-template-columns:repeat(3,minmax(0,1fr))}.stat{padding:10px}.track-heading{font-size:12px}.track-controls small{width:100%}}
</style>
<main><div class="eyebrow">Evercraft Fallen Studios · Music Engineering</div><h1>ORCHESTRA / CONTROL ROOM</h1><p class="lead">A real score is not the same as a real performance. Inspect the 14-section conductor and find every note where our verified recording catalogue still falls short.</p>
<div class="stats"><div class="stat"><b>14</b><small>Scored sections</small></div><div class="stat"><b>''' + str(report['catalogued_exact_root_notes']) + ''' / 47</b><small>Exact recorded pitches catalogued</small></div><div class="stat"><b>0</b><small>Approved audio sections</small></div></div>
<div class="legend"><span><i class="dot"></i> Exact recorded note in catalogue, still unapproved</span><span><i class="dot dim"></i> No exact recorded note</span></div>
<div class="toolbar"><label for="family">Show</label><select id="family"><option value="all">All sections</option><option value="strings">Strings</option><option value="woodwinds">Woodwinds</option><option value="brass">Brass</option><option value="plucked">Harp</option><option value="percussion">Percussion</option></select><button id="export">Export proposed score controls (JSON)</button></div>
<div class="tracks">''' + ''.join(rows) + '''</div><section class="panel"><h2>Production gate</h2><p class="notice">This is an interactive rehearsal-score inspector, NOT an acoustic playback system. There is no synthesizer or sampled-orchestra audio hidden here. Exact recorded pitches still require byte verification, human listening approval, and performed transition coverage before use.</p><p>Protected 35-second piano: <code>630efc0e…e5a2015e</code>. The piano is never uploaded, rendered, or changed. Exporting score adjustments cannot authorize audio production.</p><p class="footer">No external fonts, JS services, telemetry, or third-party runtime. Browser interactions remain local.</p></section></main>
<script id="dataset" type="application/json">''' +serialized+'''</script>
<script>
'use strict';
const data=JSON.parse(document.getElementById('dataset').textContent);
document.getElementById('family').addEventListener('change',e=>{document.querySelectorAll('.track').forEach(t=>t.hidden=e.target.value!=='all'&&t.dataset.family!==e.target.value)});
document.querySelectorAll('.track').forEach(track=>{const slider=track.querySelector('.expression');slider.addEventListener('input',()=>{track.querySelector('output').textContent=slider.value+'%';track.style.opacity=slider.value==='0'?'0.55':'1';});});
document.getElementById('export').addEventListener('click',()=>{
 const settings=[...document.querySelectorAll('.track')].map(t=>({section:t.dataset.id,included_in_proposed_score:t.querySelector('.mute').checked,expression_percent:Number(t.querySelector('.expression').value)}));
 const payload={schema:'evercraft.music.proposed-controls.v11',protected_piano_sha256:data.report.protected_piano_sha256,approval:false,audio_render_authorized:false,changes:settings};
 const blob=new Blob([JSON.stringify(payload,null,2)+'\\n'],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='evercraft-orchestra-proposed-controls.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);
});
</script></html>'''

def render(score_path,bank_path,out):
    score_path=Path(score_path);bank_path=Path(bank_path);out=Path(out)
    raw_score=score_path.read_bytes();raw_bank=bank_path.read_bytes()
    report=audit(json.loads(raw_score),json.loads(raw_bank))
    report['score_sha256']=hashlib.sha256(raw_score).hexdigest()
    report['bank_manifest_sha256']=hashlib.sha256(raw_bank).hexdigest()
    out.mkdir(parents=True,exist_ok=True)
    (out/'orchestra-source-coverage.json').write_text(json.dumps(report,indent=2)+'\n')
    (out/'orchestra-control-room.html').write_text(control_room(report))
    (out/'README.txt').write_text('Evercraft Orchestra V11 coverage and visual score console. Not audio.\nNo approved orchestral sections, no live orchestra, no synthesized audio.\nFor real samples, use separately verified V10 source-audition workflows.\n')
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--score',type=Path,default=HERE/'last-light-v9-conductor-score.json')
    p.add_argument('--bank',type=Path,default=HERE/'instrument-foundry-v10-source-bank.json')
    p.add_argument('--out',type=Path,required=True)
    args=p.parse_args()
    result=render(args.score,args.bank,args.out)
    print(f"Catalogued exact pitches {result['catalogued_exact_root_notes']}/{result['score_notes_total']}; approved audio sections {result['approved_audio_sections']}")
