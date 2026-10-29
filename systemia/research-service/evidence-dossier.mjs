// Evercraft Research | bounded, offline evidence dossier compiler.
// Receives source snapshots from a separately authorized collector.
// Never fetches, runs AI models, charges, approves, or delivers.
import {createHash} from "node:crypto";
export const DOSSIER_SCHEMA="evercraft.research.evidence-dossier.v1";
export const EVIDENCE_STATES=Object.freeze(["observed","public","user_supplied","inferred","modeled","unknown"]);
const hash=value=>createHash("sha256").update(value,"utf8").digest("hex");
const clean=(v,max,key,optional=false)=>{
 const s=String(v??"").normalize("NFKC").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,"").trim();
 if((!s&&!optional)||s.length>max)throw Error(key+"_invalid");
 return s;
};
const id=(v,key)=>{
 const s=clean(v,65,key);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(s))throw Error(key+"_invalid");
 return s;
};
const timestamp=(v,key)=>{
 const s=clean(v,40,key),d=new Date(s);
 if(!Number.isFinite(d.getTime())||!/^\d{4}-\d\d-\d\dT/.test(s)||d.getTime()>Date.now()+300000)throw Error(key+"_invalid");
 return d.toISOString();
};
const publicURL=v=>{
 let u;try{u=new URL(clean(v,1000,"source_url"))}catch{throw Error("source_url_invalid")}
 if(!["http:","https:"].includes(u.protocol)||u.username||u.password||!u.hostname)throw Error("source_url_invalid");
 const h=u.hostname.toLowerCase();
 if(h==="localhost"||h.endsWith(".localhost")||h.endsWith(".local")||h.endsWith(".internal")||h==="[::1]"||/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h))throw Error("source_private_address");
 return u.toString();
};
const md=v=>String(v).replace(/\\/g,"\\\\").replace(/([*_[\]<>|])/g,"\\$1").replace(/\r?\n/g," ");
const refIds=(a,map)=>{
 if(!Array.isArray(a))throw Error("claim_source_ids_invalid");
 const ids=a.map(x=>id(x,"source_ref"));
 if(new Set(ids).size!==ids.length)throw Error("claim_source_ids_duplicate");
 for(const key of ids)if(!map.has(key))throw Error("unknown_source_ref");
 return ids;
};
export function compileEvidenceDossier(job,{verifyCaptureReceipt}={}){
 if(!job||typeof job!=="object"||Array.isArray(job))throw Error("research_job_required");
 const jobId=id(job.job_id,"job_id");
 const question=clean(job.question,1000,"research_question");
 const asOf=timestamp(job.as_of,"as_of");
 if(!Array.isArray(job.sources)||job.sources.length>20)throw Error("source_limit");
 if(!Array.isArray(job.claims)||job.claims.length>35)throw Error("claim_limit");
 const sourceIds=new Set();
 const sources=job.sources.map(entry=>{
  if(!entry||typeof entry!=="object")throw Error("source_invalid");
  const sourceId=id(entry.id,"source_id");
  if(sourceIds.has(sourceId))throw Error("source_id_duplicate");
  sourceIds.add(sourceId);
  const url=publicURL(entry.url),title=clean(entry.title,220,"source_title");
  const capturedAt=timestamp(entry.captured_at,"source_captured_at");
  const snapshot=clean(entry.snapshot_text,100000,"source_snapshot_text");
  const actualHash=hash(snapshot);
  if(entry.snapshot_sha256&&String(entry.snapshot_sha256).replace(/^sha256:/,"").toLowerCase()!==actualHash)throw Error("source_hash_mismatch");
  // Source metadata, filenames and flags never establish capture authority.
  // An independently authorized collector must inject a real receipt verifier.
  let verified=false;
  if(entry.capture_receipt&&typeof verifyCaptureReceipt==="function"){
   try{verified=verifyCaptureReceipt(entry.capture_receipt,{url,sha256:actualHash,captured_at:capturedAt,source_id:sourceId})===true}catch{verified=false}
  }
  return Object.freeze({id:sourceId,title,url,captured_at:capturedAt,snapshot_sha256:actualHash,
   capture_state:verified?"collector_receipt_verified":"supplied_snapshot_unverified",
   excerpt:snapshot.slice(0,500),receipt_verified:verified});
 });
 const byId=new Map(sources.map(s=>[s.id,s]));
 const claimIds=new Set();
 const claims=job.claims.map(entry=>{
  if(!entry||typeof entry!=="object")throw Error("claim_invalid");
  const claimId=id(entry.id,"claim_id");
  if(claimIds.has(claimId))throw Error("claim_id_duplicate");
  claimIds.add(claimId);
  const statement=clean(entry.statement,1400,"claim_statement");
  const state=clean(entry.evidence_state,25,"evidence_state");
  if(!EVIDENCE_STATES.includes(state))throw Error("evidence_state_invalid");
  const basis=clean(entry.basis,1600,"claim_basis");
  const refs=refIds(entry.source_ids||[],byId);
  if(["observed","public"].includes(state)&&(!refs.length||refs.some(r=>!byId.get(r).receipt_verified)))throw Error("observed_public_claim_requires_verified_capture");
  const assumptions=clean(entry.assumptions,1200,"claim_assumptions",true)||null;
  if(["modeled","inferred"].includes(state)&&!assumptions)throw Error("interpretation_requires_assumptions");
  if(state!=="unknown"&&state!=="modeled"&&!refs.length)throw Error("unsupported_claim_without_source");
  const confidence=clean(entry.confidence||"not_assessed",30,"claim_confidence");
  if(!["not_assessed","low","medium","high"].includes(confidence))throw Error("claim_confidence_invalid");
  if(confidence==="high"&&(!refs.length||refs.some(r=>!byId.get(r).receipt_verified)))throw Error("high_confidence_requires_verified_capture");
  return Object.freeze({id:claimId,statement,evidence_state:state,basis,source_ids:refs,assumptions,confidence});
 });
 const conflicts=(Array.isArray(job.conflicts)?job.conflicts:[]).map(row=>{
  const left=id(row.left,"conflict_left"),right=id(row.right,"conflict_right");
  if(left===right||!claimIds.has(left)||!claimIds.has(right))throw Error("conflict_refs_invalid");
  return {left,right,reason:clean(row.reason,800,"conflict_reason")};
 });
 const nextSteps=Array.isArray(job.next_steps)?job.next_steps.map((v,i)=>clean(v,400,"next_step_"+i)):[];
 if(nextSteps.length>10)throw Error("next_step_limit");
 const lines=["# Evercraft Research | Evidence dossier","","**REVIEW DRAFT. NOT CUSTOMER APPROVED OR DELIVERED.**",
  "**Capture boundary:** sourced snapshots are externally supplied; receipt verification is separate.",
  "**Job:** "+md(jobId),"**Question:** "+md(question),"**As of:** "+asOf,"","## Findings",
  ...(claims.length?claims.flatMap(c=>["### "+md(c.id)+" | "+c.evidence_state.toUpperCase()+" | "+c.confidence,
    md(c.statement),"","**Basis:** "+md(c.basis),
    "**Sources:** "+(c.source_ids.length?c.source_ids.map(r=>"["+md(r)+"]").join(", "):"none"),
    ...(c.assumptions?["**Assumptions:** "+md(c.assumptions)]:[]),""]):["No findings admitted.",""]),
  "## Conflicting findings",
  ...(conflicts.length?conflicts.map(c=>"- ["+md(c.left)+"] versus ["+md(c.right)+"]: "+md(c.reason)):["No conflicts were supplied. This is not proof of agreement."]),
  "","## Source provenance",
  ...(sources.length?sources.flatMap(s=>["### ["+md(s.id)+"] "+md(s.title),
    "**URL:** "+md(s.url),"**Captured at:** "+s.captured_at,
    "**SHA-256 snapshot:** "+s.snapshot_sha256,"**Capture authority:** "+s.capture_state,
    "**Excerpt:** "+md(s.excerpt),""]):["No source snapshots supplied.",""]),
  "## Next steps",...(nextSteps.length?nextSteps.map(v=>"- "+md(v)):["- Obtain more evidence and complete human review."]),
  "","## Release boundaries",
  "A verified capture means a source snapshot is traceable; it does not certify truth.",
  "No independent research, model debate, payment, human approval or delivery is asserted by this compiler."
 ];
 const markdown=lines.join("\n")+"\n";
 const receipt=Object.freeze({schema:DOSSIER_SCHEMA,job_id:jobId,as_of:asOf,dossier_sha256:hash(markdown),
  report_status:"draft_needs_human_review",delivery_authorized:false,payment_verified:false,
  independent_research_execution_verified:false,source_count:sources.length,
  receipt_verified_source_count:sources.filter(s=>s.receipt_verified).length,
  claim_count:claims.length,conflict_count:conflicts.length});
 return Object.freeze({receipt,sources,claims,conflicts,markdown});
}
