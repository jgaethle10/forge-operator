// Private owner-only, read-only review projection. Never mount on a public
// route, pass the intake key to Raven, or treat contact consent as AI consent.
import {createRecoveryCase,summarizeRecovery} from './recovery-engine.mjs';
import {readFindMyPartPrivateInquiry} from '../mcp/findmypart-public-inquiry.mjs';

export function reviewPrivateInquiry({storeDir,key,reference}={}){
 const record=readFindMyPartPrivateInquiry({storeDir,key,reference});
 if(record.consent!==true||record.state!=='NEW_HUMAN_REVIEW_REQUIRED'||
    record.agent_execution_authorized!==false||record.payment_created!==false)
   throw Error('review_state_required');
 if(typeof record.part_description!=='string'||record.part_description.length<10||
    record.part_description.length>1200||typeof record.equipment_context!=='string'||
    record.equipment_context.length<4||record.equipment_context.length>240)
   throw Error('invalid_private_review_fields');
 // Unstructured customer text stays in this operator process. Never create
 // artificial photo/manual references from a customer description.
 const recovery=createRecoveryCase({description:record.part_description,equipment:record.equipment_context});
 const summary=summarizeRecovery(recovery);
 return {schema:'evercraft.findmypart.owner-review-projection.v1',
   status:'held_for_human_review',reason:'no_authorized_evidence_processing_scope',
   source_count:summary.source_count,tracks:summary.tracks,
   safety_review_required:summary.safety_review_required,
   attachment_count:recovery.references.length,contains_buyer_pii:false,
   inference_performed:false,agent_execution_authorized:false,payment_created:false,
   fulfillment:recovery.fulfillment};
}
