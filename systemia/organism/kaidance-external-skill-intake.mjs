// Same KAIDANCE heartbeat source check for public skill candidates.
// Does not fetch upstream code, run dependencies, promote skills or dispatch work.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateExternalSkillRegistry} from '../saban/external-skill-intake.mjs';

const REL='systemia/saban/external-skill-candidates.json';
const PRODUCT='audit-center-website-audit-machine-v1';
const ALLOWED=new Map([
 ['vercel-web-design-guidelines',['https://github.com/vercel-labs/agent-skills','skills/web-design-guidelines/SKILL.md']],
 ['vercel-react-best-practices',['https://github.com/vercel-labs/agent-skills','skills/react-best-practices/SKILL.md']],
 ['anthropic-webapp-testing',['https://github.com/anthropics/skills','skills/webapp-testing/SKILL.md']]
]);
const DENIAL={execution_authorized:false,install_authorized:false,code_write_authorized:false,
 outreach_authorized:false,payment_authorized:false,publication_authorized:false,
 customer_data_authorized:false,worker_dispatched:false,verified_customer_delivery:false};
const hold=(reason,at)=>({
 schema:'evercraft.kaidance.external-skill-intake.v1',observed_at:at,
 status:'held',reason,candidate_count:0,eligible_for_admission:0,quarantined:0,
 source_fingerprint:null,review_candidates:[],...DENIAL
});
export function reviewKaidanceExternalSkills({root=process.cwd(),now=new Date()}={}){
 const at=new Date(now);
 if(!Number.isFinite(at.getTime()))return hold('invalid_clock',null);
 const stamp=at.toISOString();
 try{
  const base=fs.realpathSync(root);
  const file=path.join(base,REL);
  if(fs.realpathSync(path.dirname(file))!==path.dirname(file))return hold('unsafe_source_path',stamp);
  const info=fs.lstatSync(file);
  if(info.isSymbolicLink()||!info.isFile()||info.size<10||info.size>64*1024)
   return hold('unsafe_source_file',stamp);
  const raw=fs.readFileSync(file,'utf8');
  const registry=JSON.parse(raw);
  if(registry?.schema!=='evercraft.external-skill-candidates.v1'||
     registry.owned_product!==PRODUCT||
     !Array.isArray(registry.candidates)||registry.candidates.length!==3)
   return hold('invalid_candidate_registry',stamp);
  const seen=new Set();
  for(const c of registry.candidates){
   const allowed=ALLOWED.get(c?.id);
   if(!allowed||seen.has(c.id)||c.product_key!==PRODUCT||
      c.source?.repository!==allowed[0]||c.source?.path!==allowed[1]||
      !Array.isArray(c.requested_scopes))
    return hold('candidate_contract_mismatch',stamp);
   seen.add(c.id);
  }
  const assessment=evaluateExternalSkillRegistry(registry);
  const reviews=assessment.results.map(row=>({
   work_key:'external-skill:'+row.id+':review',
   lane_key:'revenue',priority:2,
   action:row.state==='quarantined'?'review_pinned_source_license_and_sandbox':
    'review_separate_systemia_capability_contract_admission',
   skill_id:row.id,product_key:PRODUCT,
   state:row.state,blockers:row.blockers.slice(0,20),
   authority:'systemia_operator_review_required',
   execution_authorized:false,install_authorized:false,code_write_authorized:false,
   outreach_authorized:false,payment_authorized:false
  }));
  return {
   schema:'evercraft.kaidance.external-skill-intake.v1',observed_at:stamp,
   status:assessment.eligible===3?'eligible_for_separate_contract_review':'quarantined',
   reason:null,candidate_count:assessment.count,eligible_for_admission:assessment.eligible,
   quarantined:assessment.count-assessment.eligible,
   source_fingerprint:'sha256:'+createHash('sha256').update(raw).digest('hex'),
   review_candidates:reviews,...DENIAL
  };
 }catch{
  return hold('source_unavailable_or_invalid',stamp);
 }
}
