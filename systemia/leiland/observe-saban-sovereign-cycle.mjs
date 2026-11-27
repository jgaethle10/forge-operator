// Read-only private heartbeat observation. A local checksum is integrity
// evidence, not independent attestation of a model, worker or remote node.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=x=>'sha256:'+createHash('sha256').update(JSON.stringify(x)).digest('hex');
const digest=x=>typeof x==='string'&&/^sha256:[a-f0-9]{64}$/.test(x);
const base={synthetic_only:true,live_worker_verified:false,remote_dispatch_authorized:false,
 execution_authorized:false,publication_authorized:false,quality_reviewed:false};
export function observeLeilandSabanCycle({root,now=new Date()}={}){
 const report=(state,extra={})=>({state,...base,...extra});
 if(!root)return report('not_admitted');
 try{
  if(typeof root!=='string'||!path.isAbsolute(root)||fs.realpathSync(root)!==path.resolve(root))
   return report('held_source_unsafe');
  const dir=fs.lstatSync(root);
  if(!dir.isDirectory()||dir.isSymbolicLink()||(dir.mode&0o077)!==0||dir.uid!==process.getuid())
   return report('held_source_unsafe');
  const file=path.join(root,'leiland-sovereign-cycle.json');
  if(!fs.existsSync(file))return report('no_receipt');
  const s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077)!==0||s.uid!==process.getuid()||s.size>16000)
   return report('held_source_unsafe');
  const {state_hash,...r}=JSON.parse(fs.readFileSync(file,'utf8'));
  const tick=Math.floor(+new Date(now)/300000);
  if(!Number.isSafeInteger(tick)||!Number.isSafeInteger(r.tick)||r.tick<0||r.tick>tick||
    state_hash!==hash(r)||r.schema!=='evercraft.leiland.saban-cycle.v1'||
    r.lane!=='findmypart'||r.assignment_key!=='leiland:findmypart:'+r.tick||
    r.synthetic_input!==true||r.external_actions_authorized!==false||
    r.remote_dispatch_authorized!==false||r.production_worker_verified!==false)
   return report('held_receipt_invalid');
  if(['pending','held'].includes(r.state))return report('held_reconciliation_required',{source_tick:r.tick});
  if(r.state!=='completed'||r.assignment_attempted!==true||r.inference_completed!==1||
    r.quality_reviewed!==false||!digest(r.provider_receipt)||!digest(r.output_digest)||!digest(r.authorization_digest))
   return report('held_receipt_invalid');
  const extractionQualified=r.quality_profile==='findmypart-extraction-fixture-v1'&&r.synthetic_extraction_validated===true;
 if((r.quality_profile!==undefined||r.synthetic_extraction_validated!==undefined)&&!extractionQualified)
   return report('held_receipt_invalid');
 if(tick-r.tick>=12)return report('stale_receipt',{source_tick:r.tick});
  // Do not return raw prompts, response, identities, model metadata or provider digests.
  return report('reported_synthetic_completion',{source_tick:r.tick,
   source_receipt_ref:state_hash,reported_inference_count:1,reported_synthetic_extraction_validated:extractionQualified,observed_this_tick:r.tick===tick});
 }catch{return report('held_source_unavailable')}
}
