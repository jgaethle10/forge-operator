// AAAR public-only supply-chain documentation preflight. Does NOT verify documents or authorize response.
import {readFileSync} from "node:fs";
export const assess = function assess(ledger){
 if(!ledger || ledger.schema!=="evercraft.aaar.legacy-memory-supplier-candidates.v1") throw Error("Unsupported schema");
 if(!Array.isArray(ledger.candidates)) throw Error("Missing candidates");
 const keys=["oem_ocm","part_revision_capacity_interface_form_factor_firmware","lot_date_codes","component_countries_final_assembly","serial_ranges_or_not_applicable","chain_of_custody","counterfeit_plan_and_incoming_inspection","unit_price_written_quote","datasheet_and_compliance_matrix","formatting_fat16_if_applicable","temperature_range","delivery_lead_time","minimum_order_quantity","end_of_life","product_change_last_time_buy_policy","warranty"];
 const checkdoc=e=>e && e.status==="documented_pending_independent_review" && typeof e.source_url==="string" && /^https:\/\//.test(e.source_url) && typeof e.document_description==="string" && e.document_description.trim().length>=10;
 const company=ledger.eligibility||{};
 const company_gates={official_pdf:ledger.market_notice?.official_pdf_independently_reviewed===true,sam:company.evercraft_sam_registration==="verified_active",uei:company.evercraft_uei_status==="verified",cage:company.evercraft_cage_status==="verified",domestic_ownership:company.domestic_ownership_verified===true,contract_review:company.contracting_reviewer_signoff===true};
 return {schema:"evercraft.aaar.legacy-memory-preflight.v1",notice_id:ledger.market_notice?.identifier,candidate_count:ledger.candidates.length,company_gates,requirement_keys:keys, candidates:ledger.candidates.map(c=>{
  const docs=c.response_evidence||{},complete=keys.filter(k=>checkdoc(docs[k])),blocks=[];
  if(c.verification_status==="public_lead_only")blocks.push("PUBLIC_LEAD_ONLY");
  if(c.authorized_relationship!==true)blocks.push("NO_AUTHORIZED_SUPPLIER_RELATIONSHIP");
  if(c.verified_traceability!==true)blocks.push("NO_VERIFIED_CHAIN_OF_CUSTODY");
  if(c.confirmed_quote!==true)blocks.push("NO_WRITTEN_SUPPLIER_QUOTE");
  if(complete.length!==16)blocks.push("INCOMPLETE_16_POINT_EVIDENCE");
  if(Object.values(company_gates).some(v=>!v))blocks.push("OFFICIAL_OR_COMPANY_REVIEW_INCOMPLETE");
  return {id:c.id,company:c.company,documentary_fields_present:complete.length,missing_fields:keys.filter(k=>!complete.includes(k)),state:blocks.length?"RESEARCH_HOLD":"DOSSIER_PRESENT_REQUIRES_INDEPENDENT_HUMAN_REVIEW",blockers:blocks,ready_for_f22_supply:false,response_authorized:false};
 }),automatic_submission_permitted:false,warning:"Document pointers are not authenticated evidence. Never claim F-22 qualification, purchase, or respond based on this preflight. Independent review and explicit authorization remain mandatory."};
};
if (process.argv[1] && import.meta.url === new URL("file://"+process.argv[1]).href) {
 const file=process.argv[2]; if(!file) {console.error("Usage: node supplier-preflight.mjs <ledger.json>");process.exitCode=2;}
 else {try {console.log(JSON.stringify(assess(JSON.parse(readFileSync(file,"utf8"))),null,2));}catch(error){console.error(String(error));process.exitCode=2;}}
}
