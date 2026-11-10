import {API,normalizePublicActivity,publicUrl} from './work-source.mjs';
import {LANES,classifyPublicEvidence,parseOperatorSnapshot} from './mission-source.mjs';

const byId=id=>document.getElementById(id);
const state={publicData:null,operator:null,checking:false,localBusy:false,manualOverride:false};
const LOCAL_ONLY=['127.0.0.1','localhost'].includes(window.location.hostname);
const laneEmpty={
  revenue:'No recent eligible public revenue development records. Checkout and actual sales remain unknown.',
  infrastructure:'No recent eligible public infrastructure reviews. Node health remains unknown.',
  execution:'No recent public build checks. CI is not proof of an executed Systemia mission.',
  approvals:'No current eligible public review records. A PR review is not an execution authorization.'
};
const kindLabel={
  revenue:'PUBLIC PR',infrastructure:'PUBLIC PR',
  execution:'GITHUB ACTION',approvals:'PUBLIC REVIEW'
};

function element(tag,className,value){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(value!==undefined)el.textContent=String(value);
  return el;
}
function fmtTime(input){
  const date=new Date(input);
  return Number.isFinite(date.valueOf())?date.toLocaleString():'TIME UNKNOWN';
}
function drawPublicLane(lane,items){
  const host=byId('public-'+lane);
  host.replaceChildren();
  if(!items.length){host.append(element('p','empty',laneEmpty[lane]));return;}
  for(const item of items){
    const url=publicUrl(item.url);
    if(!url)continue;
    const a=element('a','evidence');
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    const top=element('div','evidence-meta');
    top.append(element('span','',kindLabel[lane]),element('span','state',item.state));
    a.append(top,element('div','evidence-title',item.title),
      element('div','evidence-foot',item.detail+' · '+fmtTime(item.time)));
    host.append(a);
  }
  if(!host.children.length)host.append(element('p','empty',laneEmpty[lane]));
}
function drawPublic(){
  const d=state.publicData;
  const groups=classifyPublicEvidence(d?.items||[]);
  for(const lane of LANES)drawPublicLane(lane,groups[lane]);
  byId('publicSummary').textContent=d
    ? d.stats.pr+' eligible PRs · '+d.stats.run+' CI runs · development evidence only'
    :'No current public GitHub evidence. Runtime and revenue status unknown.';
}
function drawOperator(){
  const node=byId('reportedLanes');
  node.replaceChildren();
  if(!state.operator){
    node.append(element('p','empty','No local mission export loaded. All internal mission statuses are unknown.'));
    return;
  }
  for(const lane of LANES){
    const container=element('section','reported-lane');
    container.append(element('h3','',lane));
    const items=state.operator.missions.filter(m=>m.lane===lane);
    if(!items.length)container.append(element('p','empty','No operator-reported missions in this lane.'));
    for(const m of items){
      const card=element('div','reported-card');
      card.append(element('strong','',m.title),
        element('small','reported-state','REPORTED '+m.status.toUpperCase()+' · UNVERIFIED'),
        element('small','',m.id+' · observed '+fmtTime(m.observed_at)));
      if(m.owner)card.append(element('small','','Owner: '+m.owner));
      if(m.note)card.append(element('small','',m.note));
      if(m.public_receipt_url){
        const a=element('a','evidence-foot','Public GitHub source ↗');
        a.href=m.public_receipt_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);
      }
      container.append(card);
    }
    node.append(container);
  }
}
function drawLocalNodes(){
  const host=byId('localNodeCards');
  host.replaceChildren();
  const reports=state.operator?.nodes||[];
  for(const key of ['node001','node002']){
    const report=reports.find(n=>n.node_key===key);
    const card=element('section','reported-lane');
    card.append(element('h3','',key==='node001'?'Penguin / Node001':'NextGen / Node002'));
    if(!report){
      card.append(element('p','empty','NO LOCAL WATCH IMPORTED · CURRENT HEALTH UNKNOWN'));
    }else{
      const status=(Date.now()-Date.parse(report.observed_at)>180000)?'stale':report.status;
      const title=status==='reported_healthy'?'RECENT LOCAL PROBE · SELF REPORTED':
        status==='reported_degraded'?'DEGRADED · SELF REPORTED':
        status==='bootstrapping'?'BOOTSTRAPPING · SELF REPORTED':
        status==='stale'?'STALE RECORD · CURRENT STATE UNKNOWN':'LOCAL STATE UNKNOWN';
      card.append(element('strong','node-observation-state',title));
      card.append(element('small','node-observation-detail','Observed '+fmtTime(report.observed_at)));
      card.append(element('small','node-observation-detail',report.note));
      card.append(element('small','node-observation-detail','Local hash check ≠ device authentication, external route or execution proof'));
    }
    host.append(card);
  }
}
function sourceStatus(label,type){
  const pill=byId('sourceState');
  pill.textContent=label;
  pill.className='state-pill '+(type||'');
}
async function request(path){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),11000);
  try{
    const response=await fetch(API+path,{headers:{Accept:'application/vnd.github+json'},cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw new Error('GitHub source is unavailable.');
    return await response.json();
  }finally{clearTimeout(timeout);}
}
async function refresh(){
  if(state.checking)return;
  state.checking=true;
  sourceStatus('CHECKING PUBLIC GITHUB','');
  const settled=await Promise.allSettled([
    request('/pulls?state=all&sort=updated&direction=desc&per_page=75'),
    request('/actions/runs?per_page=75')
  ]);
  const raw={pulls:[],runs:[],commits:[]};
  let success=0;
  if(settled[0].status==='fulfilled'&&Array.isArray(settled[0].value)){
    raw.pulls=settled[0].value;success++;
  }
  if(settled[1].status==='fulfilled'&&Array.isArray(settled[1].value?.workflow_runs)){
    raw.runs=settled[1].value.workflow_runs;success++;
  }
  state.checking=false;
  byId('checkedAt').textContent='Checked '+fmtTime(Date.now());
  if(success===0){
    state.publicData=null;
    sourceStatus('PUBLIC SOURCE UNAVAILABLE','held');
    drawPublic();
    return;
  }
  const current=normalizePublicActivity(raw);
  state.publicData=current;
  sourceStatus(success===2?'PUBLIC GITHUB SOURCE':'PARTIAL GITHUB SOURCE',success===2?'good':'held');
  drawPublic();
}
byId('refresh').addEventListener('click',refresh);
byId('snapshotFile').addEventListener('change',async event=>{
  const file=event.target.files?.[0];
  state.operator=null;drawOperator();drawLocalNodes();
  if(!file)return;
  const status=byId('snapshotStatus');
  try{
    if(file.size>250000)throw new Error('Snapshot exceeds the 250 KB import limit.');
    const text=await file.text();
    if(text.length>250000)throw new Error('Snapshot exceeds the import limit.');
    state.operator=parseOperatorSnapshot(JSON.parse(text));
    state.manualOverride=true;
    status.className='snapshot-status';
    status.textContent='Operator-imported: '+state.operator.missions.length+
      ' reported missions, '+state.operator.nodes.length+' local node watches · exported '+fmtTime(state.operator.exported_at)+
      ' · NOT AUTHENTICATED · kept only in this browser tab';
  }catch(err){
    status.className='snapshot-status error';
    status.textContent='Import held: '+(err instanceof SyntaxError?'Invalid JSON.':err.message||'Invalid snapshot.');
  }
  drawOperator();
  drawLocalNodes();
});
byId('clearSnapshot').addEventListener('click',()=>{
  state.operator=null;
  state.manualOverride=false;
  byId('snapshotFile').value='';
  byId('snapshotStatus').className='snapshot-status';
  byId('snapshotStatus').textContent='Local import cleared. Internal mission status unknown.';
  drawOperator();
  drawLocalNodes();
  refreshLocal();
});
drawOperator();
drawLocalNodes();
drawPublic();
refresh();
setInterval(()=>{if(!document.hidden)refresh();},600000);

// A loopback viewer can read an explicitly selected, sanitized local snapshot.
// Public GitHub Pages never attempts private local import or node discovery.
async function refreshLocal(){
  if(!LOCAL_ONLY||state.localBusy||state.manualOverride)return;
  state.localBusy=true;
  try{
    const response=await fetch('/v1/snapshot',{
      method:'GET',cache:'no-store',credentials:'same-origin',
      headers:{Accept:'application/json'}
    });
    if(!response.ok)throw Error('Local read-only source not available');
    const raw=await response.json();
    state.operator=parseOperatorSnapshot(raw);
    const status=byId('snapshotStatus');
    status.className='snapshot-status';
    status.textContent='LOCAL READ-ONLY OBSERVER · '+state.operator.missions.length+
      ' goals · '+state.operator.nodes.length+' node watches · checked '+fmtTime(Date.now())+
      ' · SELF REPORTED / UNVERIFIED · no remote execution or payment attested';
  }catch{
    state.operator=null;
    const status=byId('snapshotStatus');
    status.className='snapshot-status error';
    status.textContent='LOCAL OBSERVER HELD · source missing, invalid or unavailable · current status unknown';
  }finally{
    state.localBusy=false;
    drawOperator();
    drawLocalNodes();
  }
}
if(LOCAL_ONLY){
  refreshLocal();
  setInterval(()=>{if(!document.hidden)refreshLocal();},30000);
}
setInterval(drawLocalNodes,60000); // Expire previously imported health reports in-place.
