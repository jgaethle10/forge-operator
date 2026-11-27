// Synthetic repair-evidence role only. The trusted host supplies authority,
// never assignment input. No arbitrary prompts, remote routes or live actions.
import {runScopedSovereignProof} from './scoped-sovereign-proof.mjs';
export async function runAssignment({assignment,contract,executionContext={}}={}){
 const held=()=>({schema:'evercraft.leiland.saban-proof.v1',state:'held',
  inference_request_attempted:false,inference_completed:0,external_actions_authorized:false});
 if(contract?.software_id!=='leiland-sovereign-proof'||
    assignment?.role!=='synthetic_repair_evidence_review'||
    assignment?.work?.kind!=='synthetic_review'||assignment?.work?.key!=='findmypart'||
    Object.keys(assignment.work).sort().join(',')!=='key,kind'||
    assignment.item!==undefined||
    executionContext.leilandLocalProofEnabled!==true)return held();
 const b=executionContext.leilandLocalProofBinding;
 if(!b||b.expectedProvider!=='llama.cpp')return held();
 const result=await runScopedSovereignProof({
  identityStateDir:b.identityStateDir,passportStateDir:b.passportStateDir,
  sessionKeyring:b.sessionKeyring,sessionToken:b.sessionToken,
  origin:b.origin,token:b.token,expectedProvider:'llama.cpp',
  lane:'findmypart',allowInference:true,
  ...(b.fetchImpl?{fetchImpl:b.fetchImpl}:{})
 });
 return {...result,schema:'evercraft.leiland.saban-proof.v1',external_actions_authorized:false};
}
