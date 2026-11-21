// Public-only source-scoped civilian CNC memory research preflight.
// Every result is for further review, never fitment, purchasing or safety certification.
import { readFileSync } from 'node:fs';
export function checkControllerSubsystem(data) {
  if (!data || data.schema !== 'evercraft.findmypart.controller-subsystem-public-case.v1') throw Error('invalid_case_schema');
  const refs=data.references, requests=data.requests;
  if (!Array.isArray(refs)||!Array.isArray(requests)||refs.length<2||requests.length<1) throw Error('missing_evidence_or_requests');
  const byId=new Map();
  for (const r of refs) {
    if(!r||typeof r.subsystem_id!=='string'||byId.has(r.subsystem_id)||!/^https:\/\/[^\s]+$/i.test(r.official_manual_url||'')) throw Error('invalid_official_reference');
    if(!['CCU_TYPE_II_FLASH','PCU20_CF_ADAPTER'].includes(r.reference_kind))throw Error('unsupported_subsystem_kind');
    if(r.reference_kind==='CCU_TYPE_II_FLASH'&&(!Number.isFinite(r.documented_capacity_ceiling_mb)||r.documented_capacity_ceiling_mb<=0)) throw Error('invalid_ccu_ceiling');
    if(r.reference_kind==='PCU20_CF_ADAPTER'&&(!Number.isFinite(r.cf_minimum_mb_for_8mb_image)||!Number.isFinite(r.cf_minimum_mb_for_16mb_image)||r.cf_minimum_mb_for_8mb_image<=0||r.cf_minimum_mb_for_16mb_image<=0||r.require_adapter!==true))throw Error('invalid_pcu20_minimums');
    byId.set(r.subsystem_id,r);
  }
  const checks=requests.map(q=>{
    if(!q||typeof q.id!=='string'||!q.id||typeof q.subsystem_id!=='string'||!Number.isFinite(q.card_capacity_mb)||q.card_capacity_mb<=0)throw Error('invalid_request');
    const ref=byId.get(q.subsystem_id); const flags=[];
    if(!ref)flags.push('SUBSYSTEM_NOT_IDENTIFIED_IN_SOURCE');
    else if(ref.reference_kind==='CCU_TYPE_II_FLASH'){
      if(q.media_kind!=='PCMCIA_TYPE_II_FLASH') flags.push('MEDIUM_NOT_DOCUMENTED_FOR_CCU');
      if(q.card_capacity_mb>ref.documented_capacity_ceiling_mb) flags.push('ABOVE_CCU_PUBLISHED_CAPACITY_LIMIT');
    } else {
      if(q.media_kind!=='COMPACTFLASH')flags.push('MEDIUM_NOT_DOCUMENTED_FOR_PCU20_USE_CASE');
      if(q.adapter_present!==true)flags.push('PCU20_CF_PCMCIA_ADAPTER_NOT_CONFIRMED');
      const min=q.image_size_mb===8?ref.cf_minimum_mb_for_8mb_image:q.image_size_mb===16?ref.cf_minimum_mb_for_16mb_image:null;
      if(min===null)flags.push('PCU20_IMAGE_VERSION_NOT_ESTABLISHED');
      else if(q.card_capacity_mb<min)flags.push('BELOW_PCU20_PUBLISHED_MINIMUM_FOR_IMAGE');
      // These minimums are NOT maximums or guarantees. 256MB is NOT disqualified just for exceeding the minimum.
      flags.push('PCU20_MAXIMUM_SUPPORTED_CAPACITY_NOT_ESTABLISHED_BY_THIS_SOURCE');
    }
    flags.push('EQUIPMENT_REVISION_FIRMWARE_AND_USE_CASE_NOT_TESTED');
    flags.push('SUPPLIER_OR_OEM_APPROVAL_NOT_VERIFIED');
    return {request_id:q.id,subsystem_id:q.subsystem_id,manual_url:ref?.official_manual_url||null,hold_flags:flags,state:flags.some(f=>['SUBSYSTEM_NOT_IDENTIFIED_IN_SOURCE','MEDIUM_NOT_DOCUMENTED_FOR_CCU','ABOVE_CCU_PUBLISHED_CAPACITY_LIMIT','MEDIUM_NOT_DOCUMENTED_FOR_PCU20_USE_CASE','BELOW_PCU20_PUBLISHED_MINIMUM_FOR_IMAGE'].includes(f))?'PUBLIC_MANUAL_CONSTRAINT_HOLD':'EVIDENCE_AND_SPECIALIST_REVIEW_HOLD',compatible:false,quoted:false,purchase_authorized:false};
  });
  return {schema:'evercraft.findmypart.controller-subsystem-assessment.v1',case_type:'PUBLIC_CIVILIAN_REFERENCE_ONLY',checks,subsystem_distinction_enforced:true,automatic_fitment_approval:false,automatic_sourcing_order:false,notice:'CCU Type II maximum and PCU 20 CF adapter minimum are DIFFERENT published constraints. Neither by itself establishes real-world compatibility; exact hardware/firmware and responsible technician review are required.'};
}
if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
 const path=process.argv[2];
 if(!path){console.error('Usage: node controller-subsystem-check.mjs <case.json>');process.exitCode=2;}
 else{try{console.log(JSON.stringify(checkControllerSubsystem(JSON.parse(readFileSync(path,'utf8'))),null,2));}catch(e){console.error(String(e));process.exitCode=2;}}
}
