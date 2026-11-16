// Systemia Atlas v0.1: synthetic, in-memory freight operations contract.
// No network, payment, real shipment, official carrier verification, or automatic dispatch authority.
export const ATLAS_SCHEMA = 'evercraft.systemia-atlas.freight-workspace.v0.1';
export const AUTHORITY = 'synthetic_training_only';
export const LOAD_STAGES = Object.freeze(['draft','quoted','booked','in_transit','delivered','closed']);
export const DOCUMENT_TYPES = Object.freeze(['rate_confirmation','bill_of_lading','proof_of_delivery']);
const TRANSITIONS = Object.freeze({
  draft:['quoted'], quoted:['booked'], booked:['in_transit'],
  in_transit:['delivered'], delivered:['closed'], closed:[],
});
const MONEY_MAX=1000000;
const clone=(o)=>JSON.parse(JSON.stringify(o));
function required(value,label) {
  if(typeof value!=='string'||!value.trim()||value.length>100)throw new Error(label+' must be 1–100 characters');
  return value.trim();
}
function amount(n,label) {
  if(!Number.isFinite(n)||n<0||n>MONEY_MAX)throw new Error(label+' must be a finite amount between 0 and 1,000,000');
  return Math.round(n*100)/100;
}
function invariant(w) {
  if(!w||w.schema!==ATLAS_SCHEMA||w.authority!==AUTHORITY) throw new Error('Not an Atlas synthetic workspace');
}
function getLoad(w,id){
  invariant(w);const load=w.loads.find(x=>x.id===id);
  if(!load)throw new Error('Unknown load');
  return load;
}
function record(w,type,loadId,detail) {
  w.sequence+=1;
  w.audit.unshift({sequence:w.sequence,type,loadId,detail,source:'operator_synthetic_input'});
  return w;
}
export function createDemoWorkspace(){
  return {
    schema:ATLAS_SCHEMA, authority:AUTHORITY, sequence:3, label:'Cascade Freight · DEMONSTRATION',
    shippers:[
      {id:'S-01',name:'Demo Cascade Foods',region:'Yakima, WA'},
      {id:'S-02',name:'Demo Summit Supply',region:'Seattle, WA'}
    ],
    carriers:[
      {id:'C-01',name:'Demo Northline Transport',review:'sample_attestation',insurance:'sample_entered',notes:'NOT checked with FMCSA or insurer'},
      {id:'C-02',name:'Demo Evergreen Haulage',review:'unchecked',insurance:'unknown',notes:'Requires independent verification'}
    ],
    loads:[
      {id:'SIM-001',shipperId:'S-01',carrierId:'C-01',origin:'Yakima, WA',destination:'Seattle, WA',equipment:'Dry van',rate:1850,cost:1480,stage:'booked',documents:{rate_confirmation:true,bill_of_lading:false,proof_of_delivery:false},exceptions:[],statusNote:'Awaiting sample pickup'},
      {id:'SIM-002',shipperId:'S-02',carrierId:'C-02',origin:'Seattle, WA',destination:'Spokane, WA',equipment:'Reefer',rate:2700,cost:2300,stage:'draft',documents:{rate_confirmation:false,bill_of_lading:false,proof_of_delivery:false},exceptions:[{id:'X-01',reason:'Carrier verification not recorded',open:true}],statusNote:'Illustrative bid intake'}
    ],
    audit:[
      {sequence:3,type:'demo_seed',loadId:'SIM-002',detail:'Synthetic load created with an open exception',source:'synthetic_fixture'},
      {sequence:2,type:'demo_seed',loadId:'SIM-001',detail:'Synthetic booked load and sample rate confirmation',source:'synthetic_fixture'},
      {sequence:1,type:'workspace_seed',loadId:null,detail:'Illustrative demo, no customers or carrier verification',source:'synthetic_fixture'},
    ]
  };
}
export function evaluateLoad(w,id){
  const load=getLoad(w,id);
  const issues=[];
  const shipper=w.shippers.find(x=>x.id===load.shipperId);
  const carrier=w.carriers.find(x=>x.id===load.carrierId);
  if(!shipper)issues.push({code:'missing_shipper',severity:'stop',text:'Shipper not selected'});
  if(!carrier)issues.push({code:'missing_carrier',severity:'stop',text:'Carrier not selected'});
  else if(carrier.review!=='sample_attestation')issues.push({code:'carrier_review',severity:'stop',text:'Carrier review absent (official verification unavailable)'});
  if(!load.documents.rate_confirmation&&['booked','in_transit','delivered','closed'].includes(load.stage))issues.push({code:'rate_confirmation',severity:'stop',text:'Rate confirmation not recorded'});
  if(!load.documents.bill_of_lading&&['in_transit','delivered','closed'].includes(load.stage))issues.push({code:'bill_of_lading',severity:'stop',text:'Bill of lading not recorded'});
  if(!load.documents.proof_of_delivery&&['delivered','closed'].includes(load.stage))issues.push({code:'proof_of_delivery',severity:'review',text:'POD not recorded'});
  for(const x of load.exceptions.filter(x=>x.open))issues.push({code:'exception:'+x.id,severity:'review',text:x.reason});
  return {loadId:id,stage:load.stage,issues,openExceptions:load.exceptions.filter(x=>x.open).length,
    estimatedGrossMargin:Math.round((load.rate-load.cost)*100)/100,
    modeledMarginPct:load.rate>0?Math.round((load.rate-load.cost)/load.rate*1000)/10:null,
    source:'synthetic_operator_inputs',isVerified:false};
}
export function addDemoLoad(w,{shipperId,carrierId,origin,destination,equipment='Dry van',rate,cost}){
  invariant(w);
  if(!w.shippers.some(x=>x.id===shipperId))throw new Error('Choose a demo shipper');
  if(carrierId&&!w.carriers.some(x=>x.id===carrierId))throw new Error('Unknown demo carrier');
  const from=required(origin,'Origin'),to=required(destination,'Destination');
  if(from===to)throw new Error('Origin and destination must differ');
  required(equipment,'Equipment');
  const r=amount(Number(rate),'Customer rate'),c=amount(Number(cost),'Carrier cost');
  const next=clone(w),id='SIM-'+String(Math.max(...next.loads.map(l=>Number(l.id.replace('SIM-',''))||0),0)+1).padStart(3,'0');
  next.loads.push({id,shipperId,carrierId:carrierId||null,origin:from,destination:to,
    equipment:equipment.trim(),rate:r,cost:c,stage:'draft',documents:{
      rate_confirmation:false,bill_of_lading:false,proof_of_delivery:false
    },exceptions:[],statusNote:'Demo intake'});
  record(next,'create_load',id,'Synthetic load intake recorded');
  return {workspace:next,loadId:id};
}
export function setDemoCarrierReview(w,carrierId,review){
  invariant(w);
  if(!['unchecked','sample_attestation'].includes(review))throw new Error('Invalid review state');
  const next=clone(w),carrier=next.carriers.find(x=>x.id===carrierId);
  if(!carrier)throw new Error('Unknown carrier');
  carrier.review=review;
  record(next,'carrier_sample_review',null,carrierId+' marked '+review+'; not verified against an official registry');
  return next;
}
export function setDocument(w,id,type,present){
  getLoad(w,id);
  if(!DOCUMENT_TYPES.includes(type)||typeof present!=='boolean')throw new Error('Invalid document status');
  const next=clone(w),load=next.loads.find(x=>x.id===id);
  if(load.stage==='closed')throw new Error('Closed demo loads are immutable');
  load.documents[type]=present;
  record(next,'document_checklist',id,type+': '+(present?'operator marked present':'operator marked missing')+' (no file uploaded or verified)');
  return next;
}
export function setException(w,id,reason,open=true){
  getLoad(w,id);if(typeof open!=='boolean')throw new Error('Invalid exception status');
  const next=clone(w),load=next.loads.find(x=>x.id===id);
  if(load.stage==='closed')throw new Error('Closed demo loads are immutable');
  const note=required(reason,'Exception reason');
  if(open){
    const xid='X-'+String(next.sequence+1).padStart(3,'0');
    load.exceptions.push({id:xid,reason:note,open:true});
    record(next,'exception_opened',id,note);
  }else{
    const item=load.exceptions.find(x=>x.id===note);
    if(!item||!item.open)throw new Error('Open exception not found');
    item.open=false;record(next,'exception_resolved',id,item.reason);
  }
  return next;
}
export function transitionLoad(w,id,target){
  const load=getLoad(w,id);
  if(!TRANSITIONS[load.stage]?.includes(target))throw new Error('Illegal load transition: '+load.stage+' → '+target);
  const review=evaluateLoad(w,id),carrier=w.carriers.find(x=>x.id===load.carrierId);
  if(target==='booked'&&(!carrier||carrier.review!=='sample_attestation'))throw new Error('Sample carrier-review attestation required before booking');
  if(target==='in_transit'&&(!load.documents.rate_confirmation||!load.documents.bill_of_lading))throw new Error('Rate confirmation and BOL demo checkboxes required before transit');
  if(target==='closed'&&(!load.documents.proof_of_delivery||review.openExceptions))throw new Error('Sample POD and resolved exceptions required before closing');
  const next=clone(w);next.loads.find(x=>x.id===id).stage=target;
  record(next,'stage_transition',id,load.stage+' → '+target+' (synthetic rehearsal, no real dispatch)');
  return next;
}
export function getDashboard(w){
  invariant(w);let alerts=0,openExceptions=0,estimatedGrossMargin=0;
  for(const l of w.loads) {
    const info=evaluateLoad(w,l.id);
    alerts+=info.issues.length;openExceptions+=info.openExceptions;
    estimatedGrossMargin+=info.estimatedGrossMargin;
  }
  return {loads:w.loads.length,active:w.loads.filter(x=>['booked','in_transit'].includes(x.stage)).length,
    delivered:w.loads.filter(x=>['delivered','closed'].includes(x.stage)).length,
    carriers:w.carriers.length,alerts,openExceptions,
    estimatedGrossMargin:Math.round(estimatedGrossMargin*100)/100,
    scope:'synthetic_demo_only',notAccountingOrRevenue:true};
}
export function validateWorkspace(w){
  invariant(w);
  if(!Array.isArray(w.loads)||!Array.isArray(w.carriers)||!Array.isArray(w.shippers))throw new Error('Invalid workspace shape');
  if(new Set(w.loads.map(x=>x.id)).size!==w.loads.length)throw new Error('Duplicate loads');
  for(const l of w.loads){
    if(!LOAD_STAGES.includes(l.stage))throw new Error('Invalid load stage');
    if(!w.shippers.some(x=>x.id===l.shipperId))throw new Error('Invalid shipper relation');
    if(l.carrierId&&!w.carriers.some(x=>x.id===l.carrierId))throw new Error('Invalid carrier relation');
    amount(l.rate,'Customer rate');amount(l.cost,'Carrier cost');
  }
  return true;
}
