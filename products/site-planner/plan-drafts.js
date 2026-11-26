/* Evercraft Kennedy Drawing Studio: source-bound, offline project save / restore.
 * No network calls, no source imagery in JSON, no automatic engineering approval.
 */
(function(){
'use strict';
const SCHEMA='evercraft.site-planner.draft.v1';
const HASH=/^[a-f0-9]{64}$/;
const TYPES=new Set(['charger','pad','route','access','note']);
const sample = (v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
function validateMarks(rows){
 if(!Array.isArray(rows)||rows.length>200)throw Error('Draft contains too many placements');
 return rows.map((mark)=>{
  if(!mark||typeof mark!=='object'||!TYPES.has(mark.type)||!sample(mark.x,40,845)||!sample(mark.y,75,665))throw Error('Invalid drawing placement');
  const clean={type:mark.type,x:mark.x,y:mark.y};
  if(mark.angle!==undefined){if(!sample(mark.angle,-180,180))throw Error('Invalid rotation');clean.angle=mark.angle}
  if(mark.type==='route'){
   if(!sample(mark.x2,40,845)||!sample(mark.y2,75,665))throw Error('Invalid conduit endpoint');
   clean.x2=mark.x2;clean.y2=mark.y2;
  }
  if(typeof mark.label==='string')clean.label=mark.label.slice(0,72);
  return clean;
 });
}
function hashes(){
 const site=(state.siteHash||'').toLowerCase(),context=(state.contextHash||'').toLowerCase();
 if(!state.siteImage||!HASH.test(site))throw Error('Upload a real site image and allow SHA-256 fingerprinting before saving or loading a draft');
 if(state.contextImage&&!HASH.test(context))throw Error('Wait for vicinity image fingerprinting before saving or loading');
 return {site_sha256:site,context_sha256:state.contextImage?context:null};
}
function makeDraft(){
 const binding=hashes();
 return {
  schema:SCHEMA,created_at:new Date().toISOString(),
  source_binding:binding,
  image_names:{site:state.siteSource||'',context:state.contextSource||''},
  project:{name:($('siteName').value||'').slice(0,90),address:($('address').value||'').slice(0,160),revision:($('rev').value||'').slice(0,90),imagery_rights_note:($('sourceText').value||'').slice(0,160)},
  marks:validateMarks(state.marks),
  calibration:state.calibration?{
   a:state.calibration.a,b:state.calibration.b,knownFeet:state.calibration.knownFeet,sourceName:state.siteSource
  }:null,
  evidence_state:'operator_entered_not_surveyed',engineering_approved:false,payment_verified:false
 };
}
function restoreDraft(d){
 if(!d||typeof d!=='object'||d.schema!==SCHEMA||d.evidence_state!=='operator_entered_not_surveyed'||d.engineering_approved!==false||d.payment_verified!==false)throw Error('Unsupported or unsafe draft');
 const binding=hashes(),original=d.source_binding;
 if(!original||original.site_sha256!==binding.site_sha256||original.context_sha256!==binding.context_sha256)throw Error('Source fingerprint mismatch: re-upload the exact images used for this draft');
 if(d.image_names?.site!==state.siteSource||String(d.image_names?.context||'')!==String(state.contextSource||''))throw Error('Image filenames do not match the saved draft');
 const marks=validateMarks(d.marks);
 const p=d.project||{};
 for(const [key,max] of [['name',90],['address',160],['revision',90],['imagery_rights_note',160]])if(typeof p[key]!=='string'||p[key].length>max)throw Error('Invalid project details');
 let calibration=null;
 if(d.calibration!==null){
  const c=d.calibration;
  if(!c||!c.a||!c.b||!sample(c.a.x,40,845)||!sample(c.a.y,75,665)||!sample(c.b.x,40,845)||!sample(c.b.y,75,665)||c.sourceName!==state.siteSource)throw Error('Invalid source calibration');
  calibration=calibrateFromPoints(c.a,c.b,c.knownFeet,state.siteSource);
  if(!calibration)throw Error('Invalid reference baseline');
 }
 // Validate ALL fields and image bindings before changing the active drawing.
 state.marks=marks;state.history=[];state.selectedMarkIndex=null;state.calibration=calibration;state.calibrationPending=null;state.pending=null;
 $('siteName').value=p.name;$('address').value=p.address;$('rev').value=p.revision;$('sourceText').value=p.imagery_rights_note;
 draw();return marks.length;
}
function save(){
 try{
  const doc=JSON.stringify(makeDraft(),null,2)+'\n';
  dl('Evercraft-Kennedy-Site-Draft.json',new Blob([doc],{type:'application/json'}));
  $('messages').textContent='Project draft saved without image pixels. Keep the source images so it can be reopened.';
 }catch(e){$('messages').textContent=e.message}
}
function load(ev){
 const f=ev.target.files?.[0];if(!f)return;
 if(f.size>1024*1024||!(/\.json$/i).test(f.name)){$('messages').textContent='Choose a project JSON file under 1 MB';ev.target.value='';return}
 const reader=new FileReader();
 reader.onload=()=>{
  try{const count=restoreDraft(JSON.parse(String(reader.result)));$('messages').textContent='Restored '+count+' placements. All measurements remain operator estimates, not surveyed.'}
  catch(e){$('messages').textContent='Draft not restored: '+e.message}
  ev.target.value='';
 };
 reader.readAsText(f);
}
$('draftSave').addEventListener('click',save);
$('draftLoad').addEventListener('change',load);
// Exposed only for isolated regression testing. No external network or persistence.
window.__evercraftDraft={makeDraft,restoreDraft,validateMarks};
})();
