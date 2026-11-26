import {createHash} from 'node:crypto';
const endpoint='https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv';
const lanes=[
 ['ev-planning',/electric vehicle charging|fleet electrification|ev charging|bornes? de recharge|infrastructure de recharge|électrification de flotte/i],
 ['media',/video production|video editing|videography|film production|production (?:de )?vidéo|production audiovisuelle|montage vidéo/i],
 ['software',/website (?:design|development|redesign)|software development|workflow automation|développement (?:de )?logiciels?|refonte (?:de )?site|création (?:de )?sites? web|automatisation des processus/i],
 ['research',/market research|feasibility stud(?:y|ies)|data analysis services|transcription services|études? de marché|études? de faisabilité|analyse de données|services de transcription/i]
];
// Strict bounded CSV parser handles quoted commas, doubled quotes and multiline cells.
export function parseCanadaCsv(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>32000000)throw Error('ca_csv_size');
 const rows=[];let row=[],field='',quoted=false,closed=false;
 const push=()=>{row.push(field);field='';closed=false;if(row.length>120)throw Error('ca_column_limit');};
 const end=()=>{push();if(row.some(Boolean))rows.push(row);row=[];if(rows.length>30000)throw Error('ca_row_limit');};
 const s=input.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;continue;}
  if(c===','){push();continue;}
  if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;end();continue;}
  if(closed)throw Error('ca_invalid_quote');
  if(c==='"'){if(field)throw Error('ca_invalid_quote');quoted=true;}else field+=c;
 }
 if(quoted)throw Error('ca_unclosed_quote');
 if(row.length||field||closed)end();
 const header=rows.shift();
 if(!header||new Set(header).size!==header.length)throw Error('ca_header_invalid');
 if(rows.some(r=>r.length!==header.length))throw Error('ca_row_width');
 return {header,rows};
}
export function normalizeCanada(input,{now=new Date()}={}){
 if(!Number.isFinite(+now))throw Error('ca_invalid_clock');
 const {header,rows}=parseCanadaCsv(input);
 const fields=['title-titre-eng','title-titre-fra','referenceNumber-numeroReference','tenderClosingDate-appelOffresDateCloture','tenderStatus-appelOffresStatut-eng','contractingEntityName-nomEntitContractante-eng','contractingEntityName-nomEntitContractante-fra','noticeURL-URLavis-eng','noticeURL-URLavis-fra','tenderDescription-descriptionAppelOffres-eng','tenderDescription-descriptionAppelOffres-fra'];
 if(fields.some(k=>!header.includes(k)))throw Error('ca_schema_changed');
 const ix=Object.fromEntries(fields.map(k=>[k,header.indexOf(k)]));
 const candidates=[],seen=new Set();
 const diagnostics={unique_notices:0,inactive_or_non_tender:0,expired_or_unverified_deadline:0,missing_buyer_or_title:0,unmatched_scope:0,invalid_notice_id:0};
 const observed=new Set();
 for(const row of rows){
  const [en,fr,ref,rawDue,status,buyerEn,buyerFr,urlEn,urlFr,descEn,descFr]=fields.map(k=>row[ix[k]]?.trim()||'');
  if(!ref){diagnostics.invalid_notice_id++;continue;}
  if(!observed.has(ref)){observed.add(ref);diagnostics.unique_notices++;}
  if(status.toLowerCase()!=='open'){diagnostics.inactive_or_non_tender++;continue;}
  if(!(en||fr)||!(buyerEn||buyerFr)){diagnostics.missing_buyer_or_title++;continue;}
  // Unzoned times deliberately remain unqualified and are not guessed.
  if(!/(Z|[+-]\d{2}:?\d{2})$/.test(rawDue)){diagnostics.expired_or_unverified_deadline++;continue;}
  const due=Date.parse(rawDue);if(!Number.isFinite(due)||due<=+now){diagnostics.expired_or_unverified_deadline++;continue;}
  const lane=lanes.find(([,p])=>p.test([en,fr,descEn.slice(0,20000),descFr.slice(0,20000)].join(' ')))?.[0];
  if(!lane){diagnostics.unmatched_scope++;continue;}
  let u;try{u=new URL(urlEn||urlFr);}catch{diagnostics.invalid_notice_id++;continue;}
  if(u.protocol!=='https:'||u.hostname!=='canadabuys.canada.ca'||u.username||u.password||u.port||!/^\/(en|fr)\/tender-opportunities\//.test(u.pathname)){diagnostics.invalid_notice_id++;continue;}
  const candidate_ref='ca:'+createHash('sha256').update(ref).digest('hex').slice(0,40);
  if(seen.has(candidate_ref))continue;seen.add(candidate_ref);
  candidates.push({candidate_ref,source_url:u.href,buyer:(buyerEn||buyerFr).slice(0,300),title:(en||fr).slice(0,300),deadline:new Date(due).toISOString(),deadline_timezone:null,suggested_lane:lane,stage:'research_required',qualified:false,contact_authorized:false});
 }
 return {schema:'evercraft.kaidance.buyer-source-receipt.v1',records_observed:rows.length,diagnostics,candidates:candidates.slice(0,500),coverage_complete:candidates.length<=500,qualified_count:0,send_performed:false};
}
export async function collectCanada({now=new Date(),fetchFn=fetch}={}){
 const response=await fetchFn(endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error('ca_http_'+response.status);
 const reader=response.body.getReader();let size=0;const chunks=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32000000)throw Error('ca_response_limit');chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
 return normalizeCanada(Buffer.concat(chunks).toString('utf8'),{now});
}
