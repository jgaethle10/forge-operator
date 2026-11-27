// Internal source proof only. Trusted operator supplies the existing gateway
// binding; products never receive it. No API, live admission or scheduler.
import {createHash} from 'node:crypto';
import {EvercraftPassport} from '../passport/passport.mjs';
import {EvercraftIdentity} from '../identity/identity.mjs';
import {verifyEvercraftSession} from '../evercraft-home/identity.mjs';
import {runSovereignCapabilityProof} from './sovereign-capability-proof.mjs';
const schema='evercraft.leiland.scoped-sovereign-proof.v1';
const scope='leiland.synthetic-review';
const products=Object.freeze({findmypart:'findmypart',atlas:'systemia-atlas'});
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const boundary={synthetic_input:true,external_actions_authorized:false,
 publication_authorized:false,purchase_authorized:false,worker_dispatched:false};
export async function runScopedSovereignProof({
 identityStateDir,passportStateDir,sessionKeyring,sessionToken,lane,
 origin,token,fetchImpl=globalThis.fetch,allowInference=false,expectedProvider='ollama',qualityProfile=null
}={}){
 let attempted=false,completed=null;
 const held=()=>({schema,state:'held',inference_request_attempted:attempted,
  inference_completed:attempted?completed:0,result_released:false,...boundary});
 if(!Object.hasOwn(products,lane)||!identityStateDir||!passportStateDir||
    !sessionKeyring||typeof sessionKeyring!=='object'||Array.isArray(sessionKeyring))return held();
 const product=products[lane],resource='synthetic-leiland:'+lane;
 let identity,passport;
 function access(){
  const session=verifyEvercraftSession(sessionToken,sessionKeyring);
  identity.assertSessionActive(session);
  const at=new Date().toISOString();
  const decision=passport.authorize({subject_ref:session.subject_ref,product,scope,
   resource_ref:resource,at});
  if(decision.decision!=='allow')throw Error('leiland_access_denied');
  const grant=passport.getGrantState(decision.grant_id,{at});
  if(!grant.active||!grant.scopes.includes(scope)||!grant.resource_refs.includes(resource))
   throw Error('leiland_exact_grant_required');
  return decision;
 }
 try{
  identity=new EvercraftIdentity({stateDir:identityStateDir});
  passport=new EvercraftPassport({stateDir:passportStateDir});
  const initial=access();
  let final=null;
  const report=await runSovereignCapabilityProof({lane,origin,token,allowInference,expectedProvider,qualityProfile,
   fetchImpl:(url,opts)=>{
    const decision=access();
    if(decision.grant_id!==initial.grant_id)throw Error('leiland_grant_changed');
    if(new URL(url).pathname==='/v1/infer'){final=decision;attempted=true;}
    return fetchImpl(url,opts);
   }});
  completed=report.state==='held'&&attempted?null:report.inference_completed;
  const end=access();
  if(end.grant_id!==initial.grant_id)return held();
  if(report.state==='held')return held();
  if(report.inference_completed>0&&!final)return held();
  return {schema,state:report.state,lane,authorization_digest:hash(initial),
   inference_request_attempted:attempted,inference_completed:report.inference_completed,receipts:report.receipts,
   result_released:true,...boundary};
 }catch{return held()}
}
