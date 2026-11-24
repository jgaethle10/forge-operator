import { IDEAS, PLACES, createQuickSuggestion } from './quick-idea.mjs';
/* REIGNITE local-first planning client. No external runtime, cookies or persistent credentials. */
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy=v=>JSON.parse(JSON.stringify(v));
const categories={performance:'#f38c64',visual_art:'#baa6e7',heritage:'#dbbc75',quiet:'#7dbfaf',participation:'#80b7df',food:'#e7bd74',circulation:'#aeb8bb',operations:'#a6c78f',protected:'#e9a4ab'};
const frame={interior:{x:74,y:94,w:852,h:235},campus:{x:36,y:48,w:928,h:355}};
const state={base:null,draft:null,selected:null,view:'interior',token:null,csrf:null,authMode:null,role:null,actor:null,drag:null,overlay:null,opacity:.45,reviews:[],quickPending:null,evidenceRevision:null};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const find=id=>state.draft?.zones.find(z=>z.id===id);
const msg=text=>$('submissionResult').textContent=text;
function changed(){
 if(!state.base||!state.draft)return [];
 const old=new Map(state.base.zones.map(z=>[z.id,z]));const now=new Map(state.draft.zones.map(z=>[z.id,z]));
 const result=[];
 for(const z of state.draft.zones){
  const prev=old.get(z.id);
  if(!prev){result.push({id:z.id,name:z.name,kind:'Added'});continue}
  const fields=Object.keys(z).filter(k=>JSON.stringify(z[k])!==JSON.stringify(prev[k]));
  if(fields.length)result.push({id:z.id,name:z.name,kind:'Changed',fields});
 }
 for(const z of state.base.zones)if(!now.has(z.id))result.push({id:z.id,name:z.name,kind:'Removed'});
 return result;
}
function displayStatus(){
 const connected=Boolean(state.role&&(state.token||state.authMode==='cookie'));
 $('connectionStatus').textContent=connected?'Connected: '+state.actor+' ('+state.role+') · planning only':'Local concept mode · no live submission';
 $('connectionStatus').classList.toggle('connected',connected);
 $('ownerPanel').hidden=state.role!=='owner';
 $('ownerReadinessPanel').hidden=state.role!=='owner';
 if(state.role!=='owner'){
   state.evidenceRevision=null;
   $('ownerReadinessActions').textContent='';
   $('ownerReadinessSummary').textContent='Organizer evidence is private.';
   $('ownerEvidenceResult').textContent='';
 }
 $('myIdeasPanel').hidden=!connected;
 if(!connected)$('myIdeasList').textContent='Connect with a private invitation to see your suggestions.';
 if(state.role==='owner')showAdvanced(true);
 $('revisionTag').textContent='Revision '+(state.base?.revision||0)+(connected?' · owner workspace':' · local preview');
 $('connectBtn').disabled=connected;$('disconnectBtn').disabled=!connected;
}
function zoneGeometry(z){
 const f=frame[z.map];return {x:f.x+z.x*f.w,y:f.y+z.y*f.h,w:z.w*f.w,h:z.h*f.h};
}
function mapDraw(){
 const inside=state.view==='interior',f=frame[state.view];
 let out='<rect x="0" y="0" width="1000" height="440" fill="#0a1419"/>';
 out+='<defs><pattern id="lines" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0 L0 0 0 20" fill="none" stroke="#536775" stroke-opacity=".15" stroke-width="1"/></pattern></defs>';
 out+='<rect x="10" y="10" width="980" height="420" fill="url(#lines)"/>';
 if(inside){
  out+='<text x="74" y="58" font-size="18" font-weight="900" fill="#f2c58e">HANGAR B · HISTORIC ENVELOPE</text>';
  out+='<rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" fill="#26363c" stroke="#bbd2da" stroke-width="2" stroke-dasharray="9 5"/>';
  for(let i=0;i<51;i++){const x=f.x+(i+.5)*f.w/51;out+='<line x1="'+x+'" y1="'+f.y+'" x2="'+x+'" y2="'+(f.y+f.h)+'" stroke="#aec9d2" opacity=".13"/>'}
  out+='<text x="500" y="82" text-anchor="middle" fill="#b3cbd3" font-size="13">Approx. 1,072 ft historic length</text>';
  out+='<text x="45" y="220" text-anchor="middle" transform="rotate(-90 45 220)" fill="#c6d8dc" font-size="12">296 ft historic width</text>';
  out+='<text x="76" y="365" fill="#aec2c8" font-size="11">51 historical ribs shown schematically · exact positions and present condition unknown</text>';
 }else{
  out+='<text x="40" y="30" fill="#eec18c" font-size="18" font-weight="900">OUTSIDE · RELATIONSHIPS ONLY, NOT A SURVEY</text>';
  out+='<rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" rx="12" fill="#213138" stroke="#819ba5" stroke-dasharray="8 8"/>';
  out+='<rect x="329" y="178" width="346" height="96" fill="#43545c" stroke="#cedde0" stroke-width="2"/>';
  out+='<text x="502" y="227" text-anchor="middle" fill="white" font-size="22" font-weight="900">HANGAR B</text><text x="502" y="246" text-anchor="middle" fill="#cfdbde" font-size="11">Symbolic position, no known site boundaries</text>';
 }
 if(state.overlay&&inside)out+='<image href="'+esc(state.overlay)+'" x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" preserveAspectRatio="none" opacity="'+state.opacity+'"/>';
 for(const z of state.draft.zones.filter(z=>z.map===state.view)){
  const a=zoneGeometry(z),sel=state.selected===z.id,color=categories[z.category]||'#aaa';
  const label=z.name.length>28?z.name.slice(0,26)+'…':z.name;
  out+='<g class="zone '+(sel?'zone-selected':'')+'" data-id="'+esc(z.id)+'" tabindex="0" role="button" aria-label="Select '+esc(z.name)+'">';
  out+='<rect class="zone-box" x="'+a.x+'" y="'+a.y+'" width="'+a.w+'" height="'+a.h+'" rx="6" fill="'+color+'" fill-opacity="'+(sel?'.55':'.38')+'" stroke="'+color+'" '+(z.stage==='blocked'?'stroke-dasharray="6 4"':'')+'/>';
  out+='<text x="'+(a.x+8)+'" y="'+(a.y+21)+'" class="zone-label">'+esc(label)+'</text>';
  if(a.h>45)out+='<text x="'+(a.x+8)+'" y="'+(a.y+37)+'" class="zone-meta">'+esc(z.stage.replaceAll('_',' '))+'</text>';
  if(sel)out+='<rect data-resize="1" class="resize-handle" x="'+(a.x+a.w-13)+'" y="'+(a.y+a.h-13)+'" width="12" height="12" rx="2"/>';
  out+='</g>';
 }
 out+='<text x="21" y="422" fill="#b5c7cf" font-size="11">Proposed zones only · NOT a verified venue, emergency, construction, or visitor map</text>';
 $('mapWorld').innerHTML=out;
}
function listDraw(){
 const zones=state.draft.zones.filter(z=>z.map===state.view);
 $('zoneCount').textContent=zones.length+' proposal zones';
 $('zoneList').innerHTML=zones.length?zones.map(z=>
  '<button type="button" class="zone-item '+(z.id===state.selected?'active':'')+'" data-zone="'+esc(z.id)+'"><span class="swatch" style="background:'+categories[z.category]+'"></span><span><strong>'+esc(z.name)+'</strong><small>'+esc(z.category.replaceAll('_',' '))+' · '+esc(z.stage.replaceAll('_',' '))+'</small></span></button>'
 ).join(''):'<p class="sub">No zones in this view.</p>';
}
function editorDraw(){
 const z=find(state.selected),form=$('zoneForm');
 $('zoneHint').textContent=z?'Editing '+z.id+'. All changes remain proposals.':'Select a zone to edit its proposed name, footprint, and constraints.';
 form.querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!z);
 $('removeZone').disabled=!z;
 if(!z){form.reset();return}
 for(const key of ['name','category','map','stage','owner','source_ref','notes'])form.elements[key].value=z[key]||'';
 form.elements.capacity.value=z.capacity??'';
 for(const key of ['x','y','w','h'])form.elements[key].value=(z[key]*100).toFixed(1);
}
function diffDraw(){
 const c=changed();
 $('diffBox').innerHTML=c.length?'<strong>'+c.length+' proposed change(s)</strong><ul>'+c.map(x=>'<li>'+esc(x.kind)+': '+esc(x.name)+(x.fields?' ('+esc(x.fields.join(', '))+')':'')+'</li>').join('')+'</ul>':'No draft changes.';
 $('submitProposal').disabled=!c.length;
}
function render(){
 if(!state.draft)return;
 if(state.selected&&!find(state.selected))state.selected=null;
 $('interiorTab').classList.toggle('active',state.view==='interior');
 $('campusTab').classList.toggle('active',state.view==='campus');
 $('interiorTab').setAttribute('aria-pressed',String(state.view==='interior'));
 $('campusTab').setAttribute('aria-pressed',String(state.view==='campus'));
 mapDraw();listDraw();editorDraw();diffDraw();
}
function select(id){const z=find(id);if(z){state.view=z.map;state.selected=id;render()}}
function view(v){state.view=v;state.selected=null;render()}
$('interiorTab').addEventListener('click',()=>view('interior'));
$('campusTab').addEventListener('click',()=>view('campus'));
$('zoneList').addEventListener('click',e=>{const b=e.target.closest('[data-zone]');if(b)select(b.dataset.zone)});
$('planSvg').addEventListener('pointerdown',e=>{
 const g=e.target.closest('.zone');if(!g)return;
 const z=find(g.dataset.id);if(!z)return;
 state.selected=z.id;render();
 const mode=e.target.dataset.resize==='1'?'resize':'move';
 state.drag={id:z.id,mode,clientX:e.clientX,clientY:e.clientY,original:copy(z)};
 $('planSvg').setPointerCapture(e.pointerId);
});
$('planSvg').addEventListener('pointermove',e=>{
 if(!state.drag)return;
 const d=state.drag,z=find(d.id),f=frame[z.map],rect=$('planSvg').getBoundingClientRect();
 const dx=(e.clientX-d.clientX)*1000/rect.width/f.w,dy=(e.clientY-d.clientY)*440/rect.height/f.h;
 if(d.mode==='move'){z.x=clamp(d.original.x+dx,0,1-z.w);z.y=clamp(d.original.y+dy,0,1-z.h)}
 else{z.w=clamp(d.original.w+dx,.03,1-z.x);z.h=clamp(d.original.h+dy,.04,1-z.y)}
 for(const k of ['x','y','w','h'])z[k]=Math.round(z[k]*1000)/1000;
 mapDraw();diffDraw();
});
function endDrag(){if(state.drag){state.drag=null;editorDraw();listDraw();msg('Zone footprint changed in local draft; not submitted.')}}
$('planSvg').addEventListener('pointerup',endDrag);
$('planSvg').addEventListener('pointercancel',endDrag);
$('planSvg').addEventListener('click',e=>{const g=e.target.closest('.zone');if(g)select(g.dataset.id)});
$('planSvg').addEventListener('keydown',e=>{
 const g=e.target.closest('.zone');
 if(g&&['Enter',' '].includes(e.key)){e.preventDefault();select(g.dataset.id);return}
 if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)||!state.selected)return;
 e.preventDefault();const z=find(state.selected),amount=e.shiftKey?.02:.005;
 if(e.key==='ArrowLeft')z.x=clamp(z.x-amount,0,1-z.w);
 if(e.key==='ArrowRight')z.x=clamp(z.x+amount,0,1-z.w);
 if(e.key==='ArrowUp')z.y=clamp(z.y-amount,0,1-z.h);
 if(e.key==='ArrowDown')z.y=clamp(z.y+amount,0,1-z.h);
 render();
});
$('addZone').addEventListener('click',()=>{
 const id='zone-'+(globalThis.crypto?.randomUUID?.()||String(Date.now())).replaceAll('-','').slice(0,24);
 state.draft.zones.push({id,name:'New proposed activity',map:state.view,category:'visual_art',x:.27,y:.22,w:.19,h:.25,stage:'idea',owner:'',capacity:null,source_ref:'',notes:'New idea. Actual location and venue approval unknown.'});
 select(id);msg('Zone created as a local draft. Submit for owner review when ready.');
});
$('resetDraft').addEventListener('click',()=>{
 if(changed().length&&!confirm('Discard your current local changes?'))return;
 state.draft=copy(state.base);state.quickPending=null;state.selected=null;
 $('quickSend').textContent='Suggest this experience';$('quickExport').disabled=true;
 render();msg('Draft reset to the current planning revision.');
});
$('zoneForm').addEventListener('submit',e=>{
 e.preventDefault();const z=find(state.selected);if(!z)return;
 const form=$('zoneForm'),name=form.elements.name.value.trim();
 if(name.length<3){msg('Enter a name with at least 3 characters.');return}
 for(const k of ['name','category','map','stage','owner','source_ref','notes'])z[k]=form.elements[k].value.trim();
 z.capacity=form.elements.capacity.value===''?null:Number(form.elements.capacity.value);
 for(const k of ['x','y','w','h'])z[k]=Number(form.elements[k].value)/100;
 z.w=clamp(z.w,.03,1);z.h=clamp(z.h,.04,1);
 z.x=clamp(z.x,0,1-z.w);z.y=clamp(z.y,0,1-z.h);
 if(z.stage==='reviewed_for_planning'&&!z.source_ref){z.stage='needs_site_survey';msg('A planning review claim requires a source reference. Marked Needs survey.')}
 else msg('Local zone draft updated. Submit a proposal when ready.');
 state.view=z.map;render();
});
$('removeZone').addEventListener('click',()=>{
 const z=find(state.selected);if(!z||!confirm('Remove '+z.name+' from this DRAFT?'))return;
 state.draft.zones=state.draft.zones.filter(v=>v.id!==z.id);
 state.selected=null;render();
});
async function api(url,method='GET',payload){
 if(!state.token&&state.authMode!=='cookie')
   throw Error('Private contributor workspace is not connected.');
 const endpoint=url.startsWith('/api/')?'.'+url:url;
 const headers={...(payload?{'content-type':'application/json'}:{})};
 if(state.token)headers['x-reignite-key']=state.token;
 if(state.authMode==='cookie'&&method!=='GET')headers['x-reignite-csrf']=state.csrf;
 const res=await fetch(endpoint,{
   method,headers,credentials:'same-origin',cache:'no-store',
   ...(payload?{body:JSON.stringify(payload)}:{})
 });
 const data=await res.json();
 if(!res.ok)throw Error(data.error||'HTTP '+res.status);
 return data;
}
async function restoreCookieSession(){
 try{
  const response=await fetch('./api/session',{credentials:'same-origin',cache:'no-store'});
  if(!response.ok)return false;
  const session=await response.json();
  if(!session.authenticated||session.role!=='editor'||session.auth_mode!=='cookie'||
     typeof session.csrf_token!=='string')return false;
  state.authMode='cookie';state.csrf=session.csrf_token;state.token=null;
  const data=await api('/api/plan');
  if(data.role!=='editor')throw Error('Expected editor-only invitation');
  state.role=data.role;state.actor=data.actor;state.base=data.plan;
  state.draft=copy(data.plan);state.selected=null;state.view='interior';
  displayStatus();render();await loadMyIdeas();
  quickMessage('Welcome back, '+state.actor+'. Your private ideas and review status are ready.');
  return true;
 }catch{
  state.authMode=null;state.csrf=null;state.role=null;state.actor=null;
  displayStatus();return false;
 }
}
$('connectBtn').addEventListener('click',async()=>{
 const key=$('accessKey').value.trim();if(!key){msg('Enter an owner or invited editor key.');return}
 state.token=key;state.authMode='key';state.csrf=null;
 try{
  const oldDraft=state.draft&&copy(state.draft);
  const oldRevision=state.base?.revision;
  const unsent=changed().length>0;
  const data=await api('/api/plan');
  if(unsent&&oldRevision!==data.plan.revision)
    throw Error('The master map changed since your draft. Download your suggestion before resetting and reconnecting.');
  state.role=data.role;state.actor=data.actor;state.base=data.plan;
  state.draft=unsent?oldDraft:copy(data.plan);
  state.selected=null;state.view='interior';$('accessKey').value='';
  $('quickExport').disabled=!unsent;
  displayStatus();render();msg('Connected to owner-operated review service. Your edits still require review.');
  await loadMyIdeas();
  if(state.role==='owner'){await loadReviews();await loadOwnerReadiness();}
 }catch(e){state.token=null;state.authMode=null;state.csrf=null;state.role=null;state.actor=null;displayStatus();msg('Connection HOLD: '+e.message+'. Local editing and JSON export remain available.')}
});
$('disconnectBtn').addEventListener('click',async()=>{
 let warning='';
 if(state.authMode==='cookie'){
   try{await api('/api/session/logout','POST',{})}
   catch(err){warning='The server could not confirm sign-out: '+err.message+
     '. Close the tab and ask the owner to revoke the invitation if needed. '}
 }
 state.token=null;state.csrf=null;state.authMode=null;state.role=null;
 state.actor=null;state.reviews=[];
 displayStatus();msg(warning||'Signed out of this workspace. Local draft still visible.');
});
$('submitProposal').addEventListener('click',async()=>{
 if(!changed().length){msg('No edits to submit.');return}
 const reason=$('reason').value.trim();
 if(reason.length<12){msg('Explain your changes (minimum 12 characters).');return}
 if(!state.token){msg('No review service connected. Export JSON and transfer through a trusted private channel.');return}
 try{
  const data=await api('/api/proposals','POST',{base_revision:state.base.revision,candidate:state.draft,reason});
  msg('Submitted '+data.proposal_id+' for owner review. NOT approved or applied.');
  state.draft=copy(state.base);state.selected=null;$('reason').value='';render();
  await loadMyIdeas();
  if(state.role==='owner')await loadReviews();
 }catch(e){msg('Submission HOLD: '+e.message+'. No successful submission confirmed.')}
});
$('downloadDraft').addEventListener('click',()=>{
 if(!state.draft)return;
 const payload={schema:'evercraft.reignite.layout-export.v1',base_revision:state.base.revision,candidate:state.draft,reason:$('reason').value,note:'Proposed layout only. Not a permit, safety plan or as-built drawing.'};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='reignite-proposal-revision-'+state.base.revision+'.json';
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 msg('Exported draft JSON. Nothing has been submitted.');
});
$('importProposal').addEventListener('change',async e=>{
 const file=e.target.files?.[0];if(!file)return;
 try{
  if(file.size>128*1024)throw Error('File too large');
  const value=JSON.parse(await file.text());
  if(value.schema!=='evercraft.reignite.layout-export.v1'||value.candidate?.site_id!==state.base.site_id||value.candidate.schema!==state.base.schema)throw Error('Not a matching REIGNITE layout draft.');
  if(value.base_revision!==state.base.revision)throw Error('Base revision stale. Compare against current map before sending.');
  if(!Array.isArray(value.candidate.zones)||value.candidate.zones.length>80)throw Error('Invalid zones');
  state.draft=copy(value.candidate);
  $('reason').value=String(value.reason||'').slice(0,900);
  state.selected=null;render();msg('Imported locally. Review the changes before submitting.');
 }catch(err){msg('Import HOLD: '+err.message)}
 e.target.value='';
});
$('localOverlay').addEventListener('change',e=>{
 const f=e.target.files?.[0];if(!f)return;
 if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>8*1024*1024){msg('Image must be PNG/JPEG/WebP up to 8 MB.');return}
 if(state.overlay)URL.revokeObjectURL(state.overlay);
 state.overlay=URL.createObjectURL(f);state.view='interior';state.selected=null;render();
 msg('Local reference overlay loaded in this tab only. Its alignment and scale are NOT validated.');
});
$('overlayOpacity').addEventListener('input',e=>{state.opacity=Number(e.target.value)/100;mapDraw()});
$('clearOverlay').addEventListener('click',()=>{
 if(state.overlay)URL.revokeObjectURL(state.overlay);state.overlay=null;
 $('localOverlay').value='';mapDraw();
});

function renderMyIdeas(items){
 const list=$('myIdeasList');
 if(!items.length){
   list.innerHTML='<p class="sub">No submissions yet. Share an idea above and we will track its review here.</p>';
   return;
 }
 const labels={
   pending:'Waiting for review',merged_for_planning:'Added to planning draft',rejected:'Reviewed: changes requested'
 };
 list.innerHTML=items.map(item=>{
   const status=labels[item.status]||'Unknown status';
   const note=item.status==='rejected'&&item.review_note?
      '<p class="my-review"><strong>Reviewer note:</strong> '+esc(item.review_note)+'</p>':'';
   const when=item.submitted_at?esc(item.submitted_at.slice(0,10)):'Date unavailable';
   return '<article class="idea-status"><div><h3>'+esc(item.title)+'</h3><p>Submitted '+when+
     ' · <span class="proposal-id">'+esc(item.proposal_id)+'</span></p></div>'+
     '<strong class="idea-state '+esc(item.status)+'">'+esc(status)+'</strong>'+
     '<p class="idea-action">'+esc(item.next_action)+'</p>'+note+'</article>';
 }).join('');
}
async function loadMyIdeas(){
 if(!state.token||!state.role)return;
 try{
  const result=await api('/api/mine');
  renderMyIdeas(result.items);
 }catch(err){
  $('myIdeasList').textContent='Status unavailable: '+err.message+'. No change to your submitted proposals has been assumed.';
 }
}
$('refreshMyIdeas').addEventListener('click',loadMyIdeas);


function showOwnerReadiness(data){
 state.evidenceRevision=data.desk_revision;
 const summary=data.summary;
 $('ownerReadinessSummary').textContent=summary.requirements+' requirements · '+
   summary.missing+' missing references · '+summary.submitted_unverified+
   ' source references pending independent review · '+summary.reported_holds+
   ' reported holds · ZERO independently approved by this desk.';
 const actions=data.next;
 $('ownerReadinessActions').innerHTML=actions.length?actions.map(x=>
   '<li><strong>'+esc(x.requirement.replaceAll('_',' '))+'</strong>'+
   '<p>'+esc(x.question)+'</p><small>Review: '+esc(x.owner)+
   (x.priority==='stop_and_review'?' · REPORTED HOLD, STOP':' · Obtain source evidence')+
   '</small></li>'
 ).join(''):'<li>No source requests listed. External venue, engineering and permit approval are still REQUIRED.</li>';
 const select=$('ownerEvidenceGate'),chosen=select.value;
 select.innerHTML=data.gates.map(x=>'<option value="'+esc(x.gate_id)+'">'+
   esc(x.gate_id.replaceAll('_',' '))+' · '+esc(x.status.replaceAll('_',' '))+
   '</option>').join('');
 if(data.gates.some(x=>x.gate_id===chosen))select.value=chosen;
 else if(actions.length)select.value=actions[0].requirement;
}
async function loadOwnerReadiness(){
 if(state.role!=='owner')return;
 try{showOwnerReadiness(await api('/api/owner/readiness'))}
 catch(err){
   $('ownerReadinessSummary').textContent='READINESS HOLD: '+err.message+
     '. No current evidence status can be assumed.';
   state.evidenceRevision=null;
   $('ownerEvidenceGate').innerHTML='';
 }
}
$('refreshOwnerReadiness').addEventListener('click',loadOwnerReadiness);
$('ownerEvidenceForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(state.role!=='owner'||state.evidenceRevision===null)return;
 const form=$('ownerEvidenceForm'),button=$('ownerEvidenceSubmit');
 button.disabled=true;
 try{
  const result=await api('/api/owner/evidence','POST',{
    base_revision:state.evidenceRevision,
    gate_id:form.elements.gate_id.value,
    source_ref:form.elements.source_ref.value.trim(),
    finding:form.elements.finding.value,
    note:form.elements.note.value.trim()
  });
  showOwnerReadiness(result.readiness);
  form.elements.source_ref.value='';
  form.elements.note.value='';
  form.elements.finding.value='submitted';
  $('ownerEvidenceResult').textContent='Source reference received: '+
    result.receipt.id+'. This is NOT an approval. Independent review is still required.';
 }catch(err){
  $('ownerEvidenceResult').textContent='RECORD HOLD: '+err.message+
    '. Nothing was confirmed. Your unsent form remains available.';
  if(/revision_conflict/.test(err.message))await loadOwnerReadiness();
 }finally{button.disabled=false}
});

async function loadReviews(){
 if(state.role!=='owner')return;
 try{state.reviews=(await api('/api/reviews')).proposals;renderReviews()}
 catch(e){$('reviews').textContent='Review inbox HOLD: '+e.message}
}
function renderReviews(){
 const pending=state.reviews.filter(p=>p.status==='pending');
 $('reviews').innerHTML=pending.length?pending.map(p=>
  '<article class="review-card" data-proposal="'+esc(p.id)+'"><h3>'+esc(p.actor_ref)+' · '+esc(p.id.slice(0,14))+'</h3><p>Base revision '+p.base_revision+' · '+esc(p.submitted_at)+'</p><p>'+esc(p.reason)+'</p><p><strong>'+p.changes.length+' changes:</strong> '+esc(p.changes.map(c=>c.kind+' '+c.name+(c.fields?' ['+c.fields.join(', ')+']':'')).join('; '))+'</p><div class="control-row"><button type="button" data-review="preview" class="secondary">Preview proposed map</button></div><label class="review-note">Decision note<textarea data-note rows="2" placeholder="Why approve or reject for planning?"></textarea></label><div class="control-row"><button type="button" data-review="approve_for_planning">Merge for planning</button><button type="button" class="secondary danger" data-review="reject">Reject</button></div></article>'
 ).join(''):'<p class="sub">No pending proposals.</p>';
}
$('refreshReviews').addEventListener('click',loadReviews);
$('reviews').addEventListener('click',async e=>{
 const btn=e.target.closest('[data-review]');if(!btn)return;
 const card=btn.closest('[data-proposal]'),p=state.reviews.find(p=>p.id===card.dataset.proposal);
 if(!p)return;
 const action=btn.dataset.review;
 if(action==='preview'){
  if(!p.candidate){msg('Cannot preview missing candidate; do not merge.');return}
  state.draft=copy(p.candidate);state.selected=null;state.view='interior';render();
  msg('Previewing '+p.id+'. Reset draft to leave preview. No merge performed.');
  return;
 }
 const note=card.querySelector('[data-note]').value.trim();
 if(note.length<6){msg('Enter a reason (6+ characters) for the review decision.');return}
 if(!confirm(action==='approve_for_planning'?'Merge this proposal for PLANNING only, without event or venue authority?':'Reject this proposal?'))return;
 try{
  const result=await api('/api/review/'+encodeURIComponent(p.id),'POST',{decision:action,review_note:note});
  const latest=await api('/api/plan');state.base=latest.plan;state.draft=copy(latest.plan);state.selected=null;
  displayStatus();render();await loadReviews();await loadMyIdeas();
  msg('Decision recorded: '+result.receipt.action+'. Current revision '+result.new_revision+'. Venue/event approval remains denied.');
 }catch(err){msg('Review HOLD: '+err.message)}
});

function showAdvanced(enabled) {
 document.body.classList.toggle('advanced-open',enabled);
 $('advancedToggle').setAttribute('aria-expanded',String(enabled));
 $('advancedToggle').textContent=enabled?'Hide advanced tools':'Show advanced layout tools';
}
$('advancedToggle').addEventListener('click',()=>showAdvanced(!document.body.classList.contains('advanced-open')));
function quickMessage(text){$('quickFeedback').textContent=text}
$('quickExport').addEventListener('click',()=>$('downloadDraft').click());
async function submitQuickCandidate(candidate,reason){
 const result=await api('/api/proposals','POST',{
  base_revision:state.base.revision,candidate,reason
 });
 state.quickPending=null;state.draft=copy(state.base);state.selected=null;
 $('quickExport').disabled=true;
 $('quickSend').textContent='Suggest this experience';
 $('reason').value='';
 render();
 quickMessage('Your idea was received for owner review! Reference '+result.proposal_id+'. This does NOT reserve or approve a space.');
 msg('Proposal submitted for owner review. The planning map is unchanged until it is reviewed.');
 await loadMyIdeas();
 if(state.role==='owner')await loadReviews();
}
$('quickIdeaForm').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!state.base){quickMessage('The map is not loaded. Try again after the planning canvas appears.');return}
 const hasPending=Boolean(state.quickPending&&changed().length);
 if(changed().length&&!hasPending){
   quickMessage('There is an existing unsent advanced draft. Download it or reset the draft before starting another idea.');
   return;
 }
 const button=$('quickSend');
 button.disabled=true;
 try{
  if(hasPending){
   if(!state.token){
    quickMessage('Your preview is saved in this tab. Connect with your invitation to send it, or download your draft.');
    return;
   }
   await submitQuickCandidate(state.draft,state.quickPending.reason);
   return;
  }
  const form=$('quickIdeaForm');
  const fields={
   kind:form.elements.kind.value,
   name:form.elements.name.value,
   place:form.elements.place.value,
   description:form.elements.description.value
  };
  const id='zone-'+(globalThis.crypto?.randomUUID?.()||String(Date.now())+'00000000').replaceAll('-','').slice(0,24);
  const result=createQuickSuggestion(state.base,fields,id);
  if(state.token){
   await submitQuickCandidate(result.candidate,result.reason);
  }else{
   state.draft=result.candidate;
   state.quickPending={id:result.zone.id,reason:result.reason};
   state.view=result.zone.map;state.selected=result.zone.id;render();
   $('reason').value=result.reason;
   $('quickExport').disabled=false;
   button.textContent='Send my preview for review';
   quickMessage('Idea previewed! Connect with a team invitation to send it for review, or download the draft. Nothing has been submitted yet.');
   msg('Local draft ready. No submission to Evercraft occurred.');
  }
 }catch(err){
   quickMessage('Could not submit: '+err.message+'. No receipt was confirmed; your local draft remains available if one was created.');
 }finally{button.disabled=false}
});


function takeInviteFromFragment(){
 const fragment=window.location.hash.slice(1);
 if(!fragment.startsWith('join='))return null;
 // Strip before any data fetch or user action. Fragments are not sent to the server,
 // but they should also not remain in the address bar or copied URLs.
 window.history.replaceState(null,'',window.location.pathname+window.location.search);
 const grant=fragment.slice(5);
 return /^[A-Za-z0-9_-]{43}$/.test(grant)?grant:'invalid';
}
async function joinViaOneUseLink(grant){
 if(grant==='invalid'){
  quickMessage('This invitation link is malformed. Ask the organizer for a new private link.');
  return;
 }
 quickMessage('Opening your private contributor workspace...');
 try{
  const response=await fetch('./api/invite/redeem',{
   method:'POST',cache:'no-store',credentials:'same-origin',
   headers:{'content-type':'application/json'},body:JSON.stringify({grant})
  });
  const result=await response.json();
  if(!response.ok)throw Error(result.error||'The one-use invitation could not be redeemed.');
  if(result.scope!=='propose_and_read_own'||result.session_mode!=='cookie'||
     typeof result.csrf_token!=='string')
    throw Error('Invitation did not grant a valid protected editor session.');
  state.token=null;state.authMode='cookie';state.csrf=result.csrf_token;
  const workspace=await api('/api/plan');
  if(workspace.role!=='editor')throw Error('One-tap invitation cannot grant owner access.');
  state.role=workspace.role;state.actor=workspace.actor;state.base=workspace.plan;
  state.draft=copy(workspace.plan);state.selected=null;state.view='interior';
  displayStatus();render();await loadMyIdeas();
  quickMessage('You are connected as '+state.actor+'. You can return to this tab or refresh without losing your session.');
 }catch(err){
  state.token=null;state.authMode=null;state.csrf=null;state.role=null;state.actor=null;
  displayStatus();
  quickMessage('Invitation unavailable: '+err.message+' A fresh private link may be needed. You can still explore the map.');
 }
}

async function start(){
 const inviteGrant=takeInviteFromFragment();
 for(const [key,idea] of Object.entries(IDEAS)){
  const option=document.createElement('option');option.value=key;option.textContent=idea.label;
  $('quickKind').append(option);
 }
 for(const [key,place] of Object.entries(PLACES)){
  const option=document.createElement('option');option.value=key;option.textContent=place.label;
  $('quickPlace').append(option);
 }
 $('quickKind').value='art';$('quickPlace').value='unsure';
 showAdvanced(false);
 for(const [key] of Object.entries(categories)){
  const opt=document.createElement('option');opt.value=key;opt.textContent=key.replaceAll('_',' ');
  $('zoneForm').elements.category.append(opt);
 }
 try{
  const response=await fetch('./seed.json',{cache:'no-store'});
  if(!response.ok)throw Error('seed map unavailable');
  state.base=await response.json();state.draft=copy(state.base);render();displayStatus();
  $('missingList').innerHTML=state.base.survey_missing.map(x=>'<div class="missing-item">'+esc(x)+'</div>').join('');
  if(inviteGrant)await joinViaOneUseLink(inviteGrant);
  else await restoreCookieSession();
 }catch(e){msg('Unable to load source map: '+e.message)}
}
start();
