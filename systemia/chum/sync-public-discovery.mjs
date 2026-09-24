import fs from 'node:fs';
import path from 'node:path';

const LIVE_CATALOG_URL = process.env.EVERCRAFT_MACHINE_CATALOG_URL || 'https://systemiacommandcenters.com/api/functions/machineCommerceCatalog';
const OUTPUT = 'public/.well-known/evercraft-machine-catalog.json';
const TIMEOUT_MS = 20000;
function stable(value){ if(Array.isArray(value)) return value.map(stable); if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])); return value; }
function semanticSnapshot(snapshot){ if(!snapshot||typeof snapshot!=='object') return snapshot; const {generated_at,source_generated_at,...rest}=snapshot; return stable(rest); }
function publicOffer(offer){ return { public_id:String(offer.public_id||offer.id||''), name:String(offer.name||''), intent_terms:Array.isArray(offer.intent_terms)?offer.intent_terms.map(String):[], problem:String(offer.problem||''), inputs:String(offer.inputs||''), outputs:String(offer.outputs||''), commercial_state:String(offer.commercial_state||''), machine_state:String(offer.machine_state||''), pricing:String(offer.pricing||''), offers:Array.isArray(offer.offers)?offer.offers:[], human_ui_required:Boolean(offer.human_ui_required), confirmation:String(offer.confirmation||''), public_url:String(offer.public_url||''), payment_authority:String(offer.payment_authority||''), invocation_status:String(offer.invocation_status||''), catalog_version:String(offer.catalog_version||''), updated_at:String(offer.updated_at||'') }; }

const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS); let response;
try { response=await fetch(LIVE_CATALOG_URL,{headers:{accept:'application/json','user-agent':'Evercraft-CHUM/0.4 (+public-catalog-sync)'},signal:controller.signal}); } finally { clearTimeout(timer); }
if(!response.ok) throw new Error(`Live catalog returned HTTP ${response.status}`);
const live=await response.json();
const rows=Array.isArray(live?.capabilities)?live.capabilities:Array.isArray(live?.offers)?live.offers:null;
if(live?.ok!==true||!rows) throw new Error('Live catalog response is not a valid Evercraft public catalog.');
const offers=rows.map(publicOffer).filter((x)=>x.public_id&&x.name&&x.commercial_state!=='superseded').sort((a,b)=>a.public_id.localeCompare(b.public_id));
const next={ schema:'evercraft.machine-catalog.snapshot.v2', provider:'Evercraft LLC', purpose:'Public-safe snapshot of the canonical Systemia machine-commerce catalog for AI/search/agent discovery. This file grants no private access and creates no payment authority.', source_url:LIVE_CATALOG_URL, source_service:String(live.service||''), source_schema_version:String(live.schema_version||''), source_generated_at:String(live.generated_at||''), generated_at:new Date().toISOString(), offer_count:offers.length, sell_now_count:offers.filter((x)=>x.commercial_state==='sell_now').length, discovery_count:offers.filter((x)=>x.commercial_state!=='sell_now').length, safety:{discovery_creates_obligation:false,human_confirmation_required_for_checkout:true,checkout_is_payment_proof:false,provider_verification_required_for_paid_state:true,private_topology_exposed:false,...(live.rules&&typeof live.rules==='object'?live.rules:{})}, offers };
let current=null; if(fs.existsSync(OUTPUT)){try{current=JSON.parse(fs.readFileSync(OUTPUT,'utf8'));}catch{}}
if(current&&JSON.stringify(semanticSnapshot(current))===JSON.stringify(semanticSnapshot(next))){ console.log(JSON.stringify({changed:false,offer_count:offers.length,sell_now_count:next.sell_now_count,output:OUTPUT})); }
else { fs.mkdirSync(path.dirname(OUTPUT),{recursive:true}); fs.writeFileSync(OUTPUT,JSON.stringify(next,null,2)+'\n'); console.log(JSON.stringify({changed:true,offer_count:offers.length,sell_now_count:next.sell_now_count,output:OUTPUT})); }
