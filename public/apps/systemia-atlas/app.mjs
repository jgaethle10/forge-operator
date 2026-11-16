import {
  createDemoWorkspace, evaluateLoad, getDashboard, addDemoLoad, setDemoCarrierReview,
  setDocument, setException, transitionLoad, LOAD_STAGES, DOCUMENT_TYPES
} from './atlas-core.mjs';

const state={workspace:createDemoWorkspace(),tab:'overview',selectedLoadId:'SIM-001',
  trainingRead:new Set()};
const page=document.querySelector('#page');
const nav=document.querySelector('nav.menu');
const toast=document.querySelector('#toast');
let toastHandle;
const tabs={
  overview:'Command center',loads:'Load desk',carriers:'Carrier desk',shippers:'Shipper CRM',
  driver:'Driver today',evidence:'Evidence & audit',training:'Training',routetwin:'RouteTwin',
};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
})[c]);
const label=key=>({
  draft:'Draft',quoted:'Quoted',booked:'Booked',in_transit:'In transit',delivered:'Delivered',closed:'Closed',
  rate_confirmation:'Rate confirmation',bill_of_lading:'Bill of lading',proof_of_delivery:'Proof of delivery'
})[key]||key.replaceAll('_',' ');
const badge=(text,kind='pending')=>'<span class="status '+esc(kind)+'">'+esc(text)+'</span>';
function title(eyebrow,heading,lead){
  return '<div class="eyebrow">'+esc(eyebrow)+'</div><h1>'+esc(heading)+'</h1><p class="lead">'+esc(lead)+'</p>';
}
function banner(){return '<div class="note"><b>SYNTHETIC TRAINING WORKSPACE</b> · All shippers, carriers, loads, margins and documents are fabricated examples. Do not enter real customer or driver information. No official authority, insurance, identity, road condition, certification, payment or dispatch integrations are connected.</div>';}
function getSelectedLoad(){return state.workspace.loads.find(l=>l.id===state.selectedLoadId)||state.workspace.loads[0];}
function shipperName(id){return state.workspace.shippers.find(x=>x.id===id)?.name||'Not selected';}
function carrierName(id){return state.workspace.carriers.find(x=>x.id===id)?.name||'Unassigned';}
function loadRows(loads){
 return '<div class="table-wrap"><table class="data-table"><thead><tr><th>Load</th><th>Lane</th><th>Customer</th><th>Carrier</th><th>Stage</th><th>Est. spread</th></tr></thead><tbody>'+
 loads.map(l=>{
  const estimate=evaluateLoad(state.workspace,l.id),status=estimate.issues.some(x=>x.severity==='stop')?'alert':l.stage==='closed'?'ok':'pending';
  return '<tr><td><button type="button" data-action="open-load" data-id="'+esc(l.id)+'">'+esc(l.id)+'</button></td>'+
  '<td>'+esc(l.origin)+' → '+esc(l.destination)+'</td>'+
  '<td>'+esc(shipperName(l.shipperId))+'</td><td>'+esc(carrierName(l.carrierId))+'</td>'+
  '<td>'+badge(label(l.stage),status)+'</td><td class="mono">'+money(estimate.estimatedGrossMargin)+'</td></tr>';
 }).join('')+'</tbody></table></div>';
}
function overview(){
 const d=getDashboard(state.workspace);
 const kpis=[
  ['Loads in rehearsal',d.loads,'Synthetic records'],
  ['Active movement',d.active,'Booked or in transit'],
  ['Exceptions open',d.openExceptions,'Sample review queue'],
  ['Estimated gross spread',money(d.estimatedGrossMargin),'Not booked revenue'],
 ];
 return title('THE FREIGHT OPERATION / ONE COMMAND CENTER','Every load. One clear picture.',
  'From shipper intake through carrier review, dispatch rehearsal, document evidence and closeout. RouteTwin is part of the same workflow.')+
 banner()+
 '<div class="grid">'+kpis.map(x=>'<div class="card"><div class="kpi-label">'+esc(x[0])+'</div><div class="kpi-num">'+esc(x[1])+'</div><div class="kpi-caption">'+esc(x[2])+'</div></div>').join('')+'</div>'+
 '<div class="twocol"><section class="card"><div class="feature"><div><h2>Load board</h2><p>Follow the full sample freight lifecycle.</p></div><button class="secondary" data-tab="loads">Open desk</button></div>'+
 loadRows(state.workspace.loads)+'</section>'+
 '<section class="card accent"><div class="eyebrow">RouteTwin inside Atlas</div><h2 style="font-size:26px;letter-spacing:-.03em;margin:10px 0">Drive it before you drive it.</h2>'+
 '<p class="muted">Explore a hypothetical 3D corridor, truck timeline and weather or closure scenarios without touching live dispatch.</p>'+
 '<button class="action" data-tab="routetwin">Explore RouteTwin</button><div class="divider"></div>'+
 '<h3>Workflow intelligence</h3><p class="tiny muted">There are '+d.alerts+' illustrative issue signals across the demo loads. Every exception is traceable to a load and a locally recorded sample action.</p>'+
 '</section></div>'+
 '<div class="section"><h2>How Atlas works</h2></div><div class="steps">'+[
  ['01','Plan','Qualify shipper, equipment, lane and sample price.'],
  ['02','Operate','Rehearse booking, driver updates and freight exceptions.'],
  ['03','Prove','Collect the document checklist and closeout evidence.'],
 ].map(x=>'<div class="step"><span class="eyebrow">'+x[0]+'</span><b>'+x[1]+'</b><p>'+x[2]+'</p></div>').join('')+'</div>';
}
function newLoadForm(){
 return '<form id="new-load" class="card"><h2>Add synthetic load</h2><p class="tiny muted">Use invented names and sample numbers only. Records stay in this browser tab and disappear on refresh.</p>'+
 '<div class="fields">'+
 '<div class="field"><label for="shipper">Demo shipper</label><select id="shipper" name="shipperId" required>'+state.workspace.shippers.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label for="carrier">Demo carrier</label><select id="carrier" name="carrierId"><option value="">Unassigned</option>'+state.workspace.carriers.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label for="origin">Origin</label><input id="origin" name="origin" maxlength="100" placeholder="Example City, WA" required></div>'+
 '<div class="field"><label for="destination">Destination</label><input id="destination" name="destination" maxlength="100" placeholder="Example City, WA" required></div>'+
 '<div class="field"><label for="equipment">Equipment</label><select id="equipment" name="equipment"><option>Dry van</option><option>Reefer</option><option>Flatbed</option><option>Box truck</option></select></div>'+
 '<div class="field"><label for="rate">Customer rate ($)</label><input id="rate" name="rate" type="number" min="0" max="1000000" step="0.01" value="1900" required></div>'+
 '<div class="field"><label for="cost">Carrier cost ($)</label><input id="cost" name="cost" type="number" min="0" max="1000000" step="0.01" value="1500" required></div>'+
 '</div><button class="action" type="submit">Create rehearsal load</button></form>';
}
function loads(){
 return title('FREIGHT LIFECYCLE','The load desk.','Take a load from intake to closeout in a bounded synthetic workflow. Every change creates an evidence-ledger entry.')+
 banner()+'<section class="card"><div class="feature"><div><h2>Active load register</h2><p>Records are illustrative and not connected to external systems.</p></div><button class="secondary" data-action="reset">Reset demo</button></div>'+
 loadRows(state.workspace.loads)+'</section>'+
 '<div class="twocol"><div>'+loadDetail(getSelectedLoad())+'</div><div>'+newLoadForm()+'</div></div>';
}
function loadDetail(load){
 if(!load)return '<section class="card">No demo load selected</section>';
 const review=evaluateLoad(state.workspace,load.id),carrier=state.workspace.carriers.find(c=>c.id===load.carrierId);
 const stageIdx=LOAD_STAGES.indexOf(load.stage);
 const next=LOAD_STAGES[stageIdx+1];
 return '<section class="card"><div class="feature"><div><div class="eyebrow">SELECTED LOAD · '+esc(load.id)+'</div><h2 style="font-size:22px;margin:5px 0">'+esc(load.origin)+' → '+esc(load.destination)+'</h2>'+
 '<p>'+esc(load.equipment)+' · '+esc(shipperName(load.shipperId))+' · '+esc(carrierName(load.carrierId))+'</p></div>'+badge(label(load.stage))+'</div>'+
 '<div class="strip">'+LOAD_STAGES.map((s,i)=>'<span class="'+(i<stageIdx?'passed':i===stageIdx?'current':'')+'">'+esc(label(s))+'</span>').join('')+'</div>'+
 '<div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:16px"><div class="card subtle"><div class="kpi-label">Sample customer quote</div><div class="kpi-num" style="font-size:25px">'+money(load.rate)+'</div></div>'+
 '<div class="card subtle"><div class="kpi-label">Estimated gross spread</div><div class="kpi-num" style="font-size:25px">'+money(review.estimatedGrossMargin)+'</div></div></div>'+
 '<h3>Document checklist</h3><p class="tiny muted">Checkboxes are user-reported mock statuses, not uploaded files.</p>'+
 DOCUMENT_TYPES.map(type=>'<div class="document"><div><b>'+label(type)+'</b><small>'+esc(load.documents[type]?'Mock presence recorded':'Not marked present')+'</small></div>'+
 '<button type="button" data-action="document" data-id="'+esc(load.id)+'" data-doc="'+esc(type)+'"'+(load.stage==='closed'?' disabled':'')+'>'+
 (load.documents[type]?'Mark missing':'Mark present')+'</button></div>').join('')+
 '<div class="section"><h3>Exceptions & source quality</h3></div>'+
 review.issues.map(x=>'<div class="issue">'+esc(x.text)+'</div>').join('')+
 (review.issues.length===0?'<p class="tiny muted">No sample issues recorded. Official verification is still unavailable.</p>':'')+
 load.exceptions.filter(e=>e.open).map(e=>'<button class="secondary" type="button" style="margin:4px 5px 5px 0" data-action="resolve" data-id="'+esc(load.id)+'" data-ex="'+esc(e.id)+'">Resolve '+esc(e.id)+'</button>').join('')+
 (load.stage==='closed'?'':'<form data-form="exception" data-id="'+esc(load.id)+'"><div class="field" style="margin-top:15px"><label>Log hypothetical exception</label><input name="reason" maxlength="100" placeholder="Example: late pickup" required></div><button class="secondary" type="submit">Record exception</button></form>')+
 '<div class="divider"></div><div class="actions">'+(next?'<button class="action" type="button" data-action="advance" data-id="'+esc(load.id)+'" data-stage="'+esc(next)+'">Advance to '+esc(label(next))+'</button>':'<span class="tiny muted">Closed in the synthetic workflow</span>')+
 '<button class="secondary" type="button" data-tab="driver">Driver view</button>'+
 '<button class="secondary" type="button" data-tab="routetwin">Rehearse route</button></div>'+
 '<p class="help">Carrier check: '+esc(carrier?.review||'not assigned')+'. This sample does not certify FMCSA registration, insurance, operating authority, driver eligibility or route legality.</p></section>';
}
function carriers(){
 return title('CARRIER READINESS','Know who is carrying the load.','Atlas brings carrier profiles, onboarding evidence and freight assignment under one desk.')+
 banner()+'<div class="twocol"><section class="card"><h2>Sample carrier roster</h2>'+
 state.workspace.carriers.map(c=>
 '<div class="document"><div><h3>'+esc(c.name)+'</h3><p class="tiny muted">ID '+esc(c.id)+' · '+esc(c.notes)+'</p>'+badge(c.review==='sample_attestation'?'Sample review noted':'Review missing',c.review==='sample_attestation'?'pending':'alert')+'</div>'+
 '<button class="secondary" data-action="carrier-review" data-id="'+esc(c.id)+'" data-review="'+(c.review==='sample_attestation'?'unchecked':'sample_attestation')+'">'+(c.review==='sample_attestation'?'Clear demo check':'Attest demo review')+'</button></div>').join('')+
 '</section><section class="card"><h2>Production carrier gate</h2><p class="muted">No live carrier vetting is integrated. A real brokerage must verify operating authority and appropriate insurance through authorized official sources, preserve evidence timestamps, check cargo-specific requirements and comply with applicable rules.</p>'+
 '<div class="note">The demo button records only an operator-entered sample attestation. It does not verify a real company.</div></section></div>';
}
function shippers(){
 return title('RELATIONSHIPS / SHIPPER CRM','Every shipper has a home.','The commercial front door for customer records, lanes, quotes and service history.')+
 banner()+'<div class="twocol"><section class="card"><h2>Demo accounts</h2>'+
 state.workspace.shippers.map(s=>'<div class="document"><div><h3>'+esc(s.name)+'</h3><p class="tiny muted">'+esc(s.region)+' · '+esc(s.id)+'</p></div>'+
 badge('Synthetic account')+'</div>').join('')+'</section>'+
 '<section class="card"><h2>Next production workflow</h2><p>Lead → Shipper → Quote → Load → Carrier assignment → Delivery → POD → Settlement reconciliation.</p>'+
 '<p class="muted">Customer identity, communications, pricing approvals, invoice processing and account persistence require authenticated tenancy and evidence-backed integrations before launch.</p></section></div>';
}
function driver(){
 const active=state.workspace.loads.filter(l=>['booked','in_transit','delivered'].includes(l.stage));
 return title('MOBILE OPERATOR','Driver today.','A simplified handoff view for pickup, en route updates, delivery documentation and exception reporting.')+
 banner()+'<div class="twocol">'+
 '<section class="card"><h2>Illustrative assignments</h2>'+(
 active.length?active.map(l=>
 '<div class="document"><div><b>'+esc(l.id)+' · '+esc(l.origin)+' → '+esc(l.destination)+'</b><small>'+esc(label(l.stage))+' · '+esc(l.equipment)+'</small></div>'+
 '<button class="secondary" type="button" data-action="open-load" data-id="'+esc(l.id)+'">Open</button></div>').join(''):
 '<p class="muted">No sample load is currently booked or moving.</p>')+
 '</section><section class="card"><h2>Driver safety boundary</h2><p class="muted">No GPS, ELD, hours-of-service, telematics, proof-of-delivery capture or driver authentication is connected. This view is an internal workflow rehearsal, not a working driver dispatch system.</p>'+
 '<button class="secondary" data-tab="loads">Open load desk</button></section></div>';
}
function evidence(){
 return title('EVIDENCE / AUDIT TRAIL','Every decision leaves a receipt.','This prototype records a chronological, session-memory activity log to illustrate future tenant-isolated evidence workflows.')+
 banner()+'<section class="card"><div class="feature"><div><h2>Local demonstration ledger</h2><p>No file content, immutable server receipts or customer records are stored.</p></div>'+
 '<button class="secondary" data-action="export">Export synthetic JSON</button></div>'+
 state.workspace.audit.map(a=>'<div class="audit"><time>SEQUENCE '+esc(a.sequence)+'</time><b>'+esc(label(a.type))+(a.loadId?' · '+esc(a.loadId):'')+'</b>'+
 '<p>'+esc(a.detail)+'</p><p>Source: '+esc(a.source)+'</p></div>').join('')+'</section>';
}
function training(){
 const modules=[
  ['carrier','Carrier vetting & risk','Review operating authority, insurance evidence, exclusions and who signs off.'],
  ['documents','Freight documents & proof','Distinguish rate confirmation, BOL, POD and authenticated evidence.'],
  ['exceptions','Route and load exceptions','Practice escalation, issue recording, customer communications and no-go holds.'],
  ['safety','Safety and multilingual SOPs','Plan driver-facing checklists, incident reports and verified jurisdiction-specific content.'],
 ];
 return title('WORKFORCE / KNOWLEDGE','Training belongs in the operation.','Contextual bilingual-ready learning pathways, eventually tied to real competency records and assignments.')+
 banner()+'<div class="training">'+modules.map(([id,name,description],i)=>
 '<article class="card"><div class="number">MODULE '+String(i+1).padStart(2,'0')+' · RESEARCH DEMO</div><h3>'+esc(name)+'</h3><p>'+esc(description)+'</p>'+
 '<button class="secondary" data-action="training" data-id="'+esc(id)+'">'+(state.trainingRead.has(id)?'✓ Viewed in this session':'Mark viewed in demo')+'</button></article>').join('')+
 '</div><p class="help">The original OSHA/industry handbook hub, language localization, certification expiry tracking, competency sign-off and jurisdiction packs are requirements for the production rebuild, not delivered certifications here.</p>';
}
function routetwin(){
 return title('SPATIAL REHEARSAL / ATLAS MODULE','RouteTwin. Drive tomorrow, today.','A 3D scenario module that supports freight decision rehearsal, not live navigation or safe-route certification.')+
 banner()+'<section class="route-feature"><div class="eyebrow">YAKIMA → SEATTLE · DEMONSTRATION CORRIDOR</div><h2>What happens if the pass closes?</h2>'+
 '<p>Drive a schematic world, adjust departure time, explore hypothetical snow and wind, and see the route hard-stop on a fictional closure.</p>'+
 '<a class="action" style="display:inline-block;margin:9px 0" href="../route-twin/">Open 3D RouteTwin rehearsal</a>'+
 '<p class="tiny">The RouteTwin renderer and this Atlas cockpit share an engineering branch ancestry. Neither route is verified publicly deployed, and the prototype does not transfer real Atlas load records or verified roadway data.</p></section>'+
 '<div class="section"><h2>Source-truth integration plan</h2></div><div class="steps">'+
 '<div class="step"><span class="eyebrow">01</span><b>Observed</b><p>WSDOT road events, commercial restrictions, timestamps and coverage, with owned server-side integration.</p></div>'+
 '<div class="step"><span class="eyebrow">02</span><b>Forecast</b><p>NWS issuance/validity windows, weather uncertainty and segment association.</p></div>'+
 '<div class="step"><span class="eyebrow">03</span><b>Hypothetical</b><p>Operators can inject a scenario without masquerading as observed conditions.</p></div></div>';
}
function render(){
 document.querySelector('#crumb').textContent=tabs[state.tab];
 nav.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tab));
 const bodies={overview,loads,carriers,shippers,driver,evidence,training,routetwin};
 page.innerHTML=bodies[state.tab]();
}
function inform(message){
 toast.textContent=message;toast.hidden=false;
 clearTimeout(toastHandle);toastHandle=setTimeout(()=>toast.hidden=true,4200);
}
function exportData(){
 const data={...state.workspace,exportedAt:new Date().toISOString(),
  exportWarning:'SYNTHETIC ONLY: no customer data, commercial authority, verified carrier or real audit evidence'};
 const json=JSON.stringify(data,null,2);
 const url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='systemia-atlas-synthetic-workspace.json';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
document.addEventListener('click',e=>{
 const button=e.target.closest('button[data-tab],button[data-action]');
 if(!button)return;
 try{
  if(button.dataset.tab){state.tab=button.dataset.tab;render();return}
  const a=button.dataset.action,id=button.dataset.id;
  if(a==='open-load'){state.selectedLoadId=id;state.tab='loads'}
  else if(a==='reset'){state.workspace=createDemoWorkspace();state.selectedLoadId='SIM-001';inform('Synthetic workspace reset')}
  else if(a==='carrier-review'){state.workspace=setDemoCarrierReview(state.workspace,id,button.dataset.review);inform('Recorded demo carrier status, not independent verification')}
  else if(a==='document'){const w=state.workspace,load=w.loads.find(l=>l.id===id);state.workspace=setDocument(w,id,button.dataset.doc,!load.documents[button.dataset.doc]);inform('Sample checklist updated')}
  else if(a==='advance'){state.workspace=transitionLoad(state.workspace,id,button.dataset.stage);inform('Synthetic load advanced. No external dispatch occurred.')}
  else if(a==='resolve'){state.workspace=setException(state.workspace,id,button.dataset.ex,false);inform('Sample exception resolved')}
  else if(a==='training'){state.trainingRead.add(id);inform('Viewed in this tab, not an earned certification')}
  else if(a==='export'){exportData();inform('Synthetic export created')}
  render();
 }catch(err){inform(err.message)}
});
document.addEventListener('submit',e=>{
 if(e.target.id==='new-load'){
  e.preventDefault();
  try{
   const form=new FormData(e.target),data=Object.fromEntries(form.entries());
   const r=addDemoLoad(state.workspace,data);state.workspace=r.workspace;state.selectedLoadId=r.loadId;
   inform('Created '+r.loadId+' in synthetic workspace. No live shipment created.');render();
  }catch(err){inform(err.message)}
 }
 if(e.target.dataset.form==='exception'){
  e.preventDefault();
  try{
   const id=e.target.dataset.id,reason=new FormData(e.target).get('reason');
   state.workspace=setException(state.workspace,id,reason,true);
   inform('Hypothetical exception recorded');render();
  }catch(err){inform(err.message)}
 }
});
render();
