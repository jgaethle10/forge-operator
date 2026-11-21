// Source-backed PUBLIC civilian equipment compatibility guard. No fitment approval or supply action.
import {readFileSync} from "node:fs";
export const assessCncMemoryCase = function assessCncMemoryCase(caseData) {
 if (!caseData || caseData.schema !== "evercraft.findmypart.civilian-memory-case.v1") throw Error("invalid_case_schema");
 const ref=caseData.equipment_reference, items=caseData.public_candidates;
 if (!ref || ref.source_type!=="manufacturer_manual" || !/^https:\/\/[^\s]+$/i.test(ref.source_url||"") || !Number.isFinite(ref.published_capacity_ceiling_mb) || ref.published_capacity_ceiling_mb<=0 || !Array.isArray(items) || items.length===0) throw Error("missing_verified_reference_or_candidates");
 const result=items.map(c=>{
  if(!c || !/^https:\/\/[^\s]+$/i.test(c.public_catalog_url||"") || typeof c.name!=="string" || !c.name.trim())throw Error("invalid_candidate_public_source");
  if(c.capacity_mb != null && (!Number.isFinite(c.capacity_mb) || c.capacity_mb<=0))throw Error("invalid_candidate_capacity");
  const flags=[];
  if(c.capacity_mb==null) flags.push("CANDIDATE_CAPACITY_UNDOCUMENTED");
  else if(c.capacity_mb>ref.published_capacity_ceiling_mb) flags.push("EXCEEDS_EQUIPMENT_MANUAL_CAPACITY_CEILING");
  else flags.push("WITHIN_PUBLISHED_CAPACITY_CEILING_ONLY");
  if(c.form_factor!=="PCMCIA_TYPE_II_FLASH")flags.push("EXACT_INTERFACE_OR_FORM_FACTOR_NOT_ESTABLISHED");
  flags.push("NO_EQUIPMENT_SPECIFIC_COMPATIBILITY_PROOF");
  flags.push("OEM_APPROVED_REPLACEMENT_UNVERIFIED");
  return {name:c.name,public_catalog_url:c.public_catalog_url,capacity_mb:c.capacity_mb,flags,review_state:flags.includes("EXCEEDS_EQUIPMENT_MANUAL_CAPACITY_CEILING")?"PUBLISHED_LIMIT_EXCEEDED_HOLD":"FURTHER_EQUIPMENT_REVIEW_REQUIRED",approved_replacement:false,customer_quote_authorized:false};
 });
 return {schema:"evercraft.findmypart.civilian-memory-assessment.v1",case_id:caseData.case_id||"PUBLIC_REFERENCE_DEMO",equipment:ref.equipment,manufacturer_manual_url:ref.source_url,manufacturer_manual_page:ref.manual_page,manual_capacity_ceiling_mb:ref.published_capacity_ceiling_mb,candidates:result,all_candidate_replacements_unverified:true,stock_confirmed:false,purchasing_authorized:false,government_systems_or_qualification_in_scope:false,limitations:"Read-only public-evidence comparison. Manual product variant, revision, controller/firmware requirements and qualified technician review remain essential; capacity alone never proves compatibility."};
};
if(process.argv[1] && import.meta.url===new URL("file://"+process.argv[1]).href) {
 const file=process.argv[2]; if(!file){console.error("Usage: node civilian-cnc-memory-check.mjs <public-case.json>");process.exitCode=2;}
 else {try{console.log(JSON.stringify(assessCncMemoryCase(JSON.parse(readFileSync(file,"utf8"))),null,2));}catch(error){console.error(String(error));process.exitCode=2;}}
}
