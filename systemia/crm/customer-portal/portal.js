'use strict';
const API='/v1/relationship-command/workspace';
const el=id=>document.getElementById(id);
const make=(tag,className,text)=>{
 const n=document.createElement(tag);
 if(className)n.className=className;
 if(text!==undefined)n.textContent=String(text);
 return n;
};
const readableDate=value=>{
 if(!value)return 'Unscheduled';
 const d=new Date(value);
 return Number.isFinite(d.getTime())?d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Unknown date';
};
let workspace=null,selection=null;
function status(message,error=false){
 const n=el('state');n.textContent=message;n.classList.toggle('error',error);
}
function metric(value,title){
 const n=make('div','metric');
 n.append(make('strong',null,value),make('span',null,title));return n;
}
function renderMetrics(){
 const c=workspace.counts,target=el('metrics');target.replaceChildren();
 target.append(metric(c.relationships,'Relationships in your scope'),
  metric(c.review_due,'Human reviews due'),metric(c.contact_held,'Contact holds'));
 el('tenant').textContent='Private tenant workspace';
 el('role').textContent=workspace.actor_role+' · '+workspace.division_ids.length+' division(s)';
}
function contactMessage(item){
 switch(item.contact_state){
  case 'no_contact_hold':return 'A no-contact request is on record. No outbound action is authorized.';
  case 'paused':return 'Contact is paused. Human authorization and policy review are required.';
  case 'human_review_required':return 'Review the relationship context before considering contact.';
  default:return 'This relationship may enter independent purpose, consent, Passport and exact-message preflight. This console cannot send messages.';
 }
}
function showDetail(){
 const target=el('detail'),record=workspace.entries.find(x=>x.relationship_ref===selection);
 target.replaceChildren();
 if(!record){target.append(make('p','empty','Select a relationship to see its evidence.'));return;}
 const intro=make('div');
 intro.append(make('div','sub',record.division_id+' · '+record.kind),
  make('h2',null,record.display_name));
 const flag=make('span','flag'+(record.contact_state==='independent_preflight_required'?' ok':''),record.contact_state.replaceAll('_',' '));
 intro.append(flag);target.append(intro);
 const facts=make('div','facts');
 for(const [name,value] of [
  ['Status',record.stage],
  ['Next review',readableDate(record.next_review_at)],
  ['Evidence',record.evidence_state],
  ['Source reference',record.source_ref]
 ]){
  const f=make('div','fact');f.append(make('small',null,name),make('strong',null,value));facts.append(f);
 }
 target.append(facts,make('div','explain',contactMessage(record)));
 target.append(make('h3','title-sm','Evidence timeline'));
 const timeline=make('div','timeline');
 const events=[...(record.timeline||[])].sort((a,b)=>b.occurred_at.localeCompare(a.occurred_at));
 if(!events.length)timeline.append(make('p','empty','No events have been imported.'));
 for(const event of events){
  const e=make('div','event');
  e.append(make('strong',null,event.type.replaceAll('_',' ')));
  if(typeof event.context==='string')e.append(make('p',null,event.context));
  e.append(make('small',null,readableDate(event.occurred_at)+' · '+event.evidence_ref));
  timeline.append(e);
 }
 target.append(timeline);
}
function filterItems(){
 const text=el('search').value.trim().toLocaleLowerCase(),view=el('filter').value;
 return workspace.entries.filter(r=>
  (!text||(r.display_name+' '+r.division_id+' '+r.stage).toLocaleLowerCase().includes(text))&&
  (view==='all'||view==='due'&&r.review_state==='due'||
   view==='held'&&r.contact_state!=='independent_preflight_required'));
}
function renderList(){
 const target=el('list'),items=filterItems();target.replaceChildren();
 el('total').textContent=items.length+' visible';
 if(!items.length)target.append(make('p','empty','No relationships match this view.'));
 for(const entry of items){
  const b=make('button','entry');
  b.type='button';b.setAttribute('aria-pressed',String(entry.relationship_ref===selection));
  b.append(make('strong',null,entry.display_name),make('span',null,entry.division_id+' · '+entry.stage),
   make('span',null,entry.review_state==='due'?'Review due':'No review due'));
  b.addEventListener('click',()=>{selection=entry.relationship_ref;renderList();showDetail();});
  target.append(b);
 }
}
function renderReviews(){
 const target=el('reviews');target.replaceChildren();
 const due=workspace.entries.filter(r=>r.review_state==='due');
 if(!due.length)target.append(make('p','empty','No reviews currently due in your authorized scope.'));
 for(const r of due){
  const item=make('div','review-row');
  item.append(make('strong',null,r.display_name),
   make('span',null,readableDate(r.next_review_at)+' · '+r.contact_state.replaceAll('_',' ')));
  target.append(item);
 }
}
async function initialize(){
 status('Checking your session and authorized relationship sources…');
 try{
  const response=await fetch(API,{method:'GET',credentials:'same-origin',cache:'no-store',
   headers:{accept:'application/json'}});
  if(!response.ok)throw Error(response.status===401?'Session required or expired.':'This workspace is unavailable or access was denied.');
  const data=await response.json();
  if(data?.schema!=='evercraft.crm.customer-workspace.v1'||!Array.isArray(data.entries)||
    data.action_authority!=='none')throw Error('Workspace response was not admitted.');
  workspace=data;selection=data.entries[0]?.relationship_ref||null;
  renderMetrics();renderList();showDetail();renderReviews();
  el('workspace').hidden=false;
  status('Read-only workspace · contact and payment actions are unavailable.');
 }catch(e){
  el('workspace').hidden=true;
  status(e.message||'Unable to load the private workspace.',true);
 }
}
el('search').addEventListener('input',()=>{if(workspace)renderList();});
el('filter').addEventListener('change',()=>{if(workspace)renderList();});
initialize();
