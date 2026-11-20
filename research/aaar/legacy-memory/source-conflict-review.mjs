// AAAR / FindMyPart public-source documentary discrepancy detector.
// Does not fetch URLs, inspect source authenticity or authorize a sale.
// Usage: node source-conflict-review.mjs document-claims-2026-11-19.json
import {readFileSync} from "node:fs";
export const reviewEvidence = function reviewEvidence(bundle){
 if(!bundle||bundle.schema!=="evercraft.aaar.document-claim-ledger.v1"||!Array.isArray(bundle.claims))throw Error("unsupported_evidence_bundle");
 const problems=[],valid=[], groups=new Map();
 for(const c of bundle.claims){
  if(!c||typeof c.id!=="string"||!c.id.trim()||typeof c.product_scope!=="string"||!c.product_scope.trim()||typeof c.attribute!=="string"||!c.attribute.trim()||!["string","number"].includes(typeof c.value)||typeof c.source_url!=="string"||!/^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/i.test(c.source_url)||typeof c.source_kind!=="string"||typeof c.observed_date!=="string"||!/^20\d\d-\d\d-\d\d$/.test(c.observed_date)){
   problems.push({id:typeof c?.id==="string"?c.id:"INVALID",reason:"invalid_or_unsourced_claim"});continue;
  }
  const x={id:c.id,product_scope:c.product_scope,attribute:c.attribute,value:c.value,source_url:c.source_url,source_kind:c.source_kind,observed_date:c.observed_date,description:typeof c.description==="string"?c.description:""};
  valid.push(x);const key=c.product_scope+"\u0000"+c.attribute;const group=groups.get(key)||[];group.push(x);groups.set(key,group);
 }
 const conflicts=[];
 for(const [key,items] of groups){
  const normalized=new Set(items.map(x=>typeof x.value==="string"?x.value.trim().toLowerCase():String(x.value)));
  if(normalized.size>1){
   const [product_scope,attribute]=key.split("\u0000");
   conflicts.push({product_scope,attribute,status:"DOCUMENTARY_CONFLICT_REQUIRES_SUPPLIER_CONFIRMATION",claims:items.map(x=>({id:x.id,value:x.value,source_kind:x.source_kind,source_url:x.source_url,observed_date:x.observed_date})),application_to_specific_part:"NOT_ESTABLISHED"});
  }
 }
 return {schema:"evercraft.aaar.source-conflict-review.v1",valid_claim_count:valid.length,rejected_claims:problems,conflicts,disposition:conflicts.length||problems.length?"HOLD_CLARIFICATION":"NO_CONFLICT_FOUND_NOT_QUALIFIED",automatic_supplier_qualification:false,automatic_customer_quote_authorized:false,government_response_authorized:false,warning:"A source-document disagreement is not proof either warranty applies. A clean comparison does not prove compatibility, authenticity, stock or commercial terms."};
};
if (process.argv[1] && import.meta.url === new URL("file://"+process.argv[1]).href) {
 const f=process.argv[2]; if(!f){console.error("Usage: node source-conflict-review.mjs <claims.json>");process.exitCode=2;}
 else {try{console.log(JSON.stringify(reviewEvidence(JSON.parse(readFileSync(f,"utf8"))),null,2));}catch(e){console.error(String(e));process.exitCode=2;}}
}
