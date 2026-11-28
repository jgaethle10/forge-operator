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
// Exact source metadata contract, not an executable skill allowlist.
const TECHNOLOGY_ALLOWED=Object.freeze({
  "antigravity-adaptive-routing": [
    "model-routing",
    "https://antigravity.google/docs/models",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/1860",
    "architecture_only",
    "Compare local model escalation, accuracy, latency and cost on fixed tasks"
  ],
  "antigravity-workflows": [
    "model-routing",
    "https://antigravity.google/docs/dynamic-workflows/",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2260",
    "architecture_only",
    "Prove independent work isolation and conflict handling"
  ],
  "hermes-agent": [
    "model-routing",
    "https://github.com/NousResearch/hermes-agent",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/1860",
    "identity_unconfirmed",
    "Confirm clip identity; compare memory, tool routing and model swapping"
  ],
  "matt-pocock-skills": [
    "engineering",
    "https://github.com/mattpocock/skills",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2260",
    "license_review",
    "Compare spec-to-test and dependency decomposition against Saban"
  ],
  "addy-osmani-agent-skills": [
    "engineering",
    "https://github.com/addyosmani/agent-skills",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2192",
    "license_review",
    "Compare browser QA, accessibility and performance on owned fixture"
  ],
  "cloudflare-security-audit": [
    "engineering",
    "https://github.com/cloudflare/security-audit-skill",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2260",
    "license_review",
    "Benchmark independent validation against seeded defects"
  ],
  "obsidian-skills": [
    "engineering",
    "https://github.com/obsidianmd/obsidian-skills",
    "systemia-core",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/2192",
    "license_review",
    "Test portable graph roundtrip and provenance"
  ],
  "elephant-goldfish": [
    "engineering",
    "https://github.com/google/elephant-goldfish-model",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2260",
    "license_review",
    "Compare independent frozen-spec review with same-context review"
  ],
  "openai-plugins": [
    "plugin-ecosystem",
    "https://github.com/openai/plugins",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2192",
    "license_review",
    "Inventory manifests and compare tool contracts; no credential grants"
  ],
  "openai-skills": [
    "plugin-ecosystem",
    "https://github.com/openai/skills",
    "systemia-core",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/2192",
    "license_review",
    "Inventory individual skill rights and reusable instructions"
  ],
  "sam2": [
    "video-intelligence",
    "https://github.com/facebookresearch/sam2",
    "commercial-studio",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "license_review",
    "Measure temporal mask quality, runtime and RAM on owned footage"
  ],
  "robust-video-matting": [
    "video-intelligence",
    "https://github.com/PeterL1n/RobustVideoMatting",
    "commercial-studio",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "license_review",
    "Measure alpha stability and compute; review GPL and weights"
  ],
  "propainter": [
    "video-intelligence",
    "https://github.com/sczhou/ProPainter",
    "commercial-studio",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "noncommercial_hold",
    "Study inpainting methods; identify commercially permissible alternatives"
  ],
  "co-tracker": [
    "video-intelligence",
    "https://github.com/facebookresearch/co-tracker",
    "commercial-studio",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "noncommercial_hold",
    "Study tracking accuracy and alternative licensed components"
  ],
  "fxhoudini-mcp": [
    "video-intelligence",
    "https://github.com/healkeiser/fxhoudinimcp",
    "evercraft-graphics",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "identity_unconfirmed",
    "Compare procedural scene tool contracts; confirm clip identity and runtime rights"
  ],
  "mixamo-llm-mocap": [
    "video-intelligence",
    "https://github.com/squall01337/mixamo-llm-mocap",
    "evercraft-graphics",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "dependency_rights_hold",
    "Review dependency and asset rights; compare pose retargeting"
  ],
  "cinema4d-mcp": [
    "video-intelligence",
    "https://github.com/ttiimmaacc/cinema4d-mcp",
    "evercraft-graphics",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "architecture_only",
    "Compare scene control interface; no proprietary runtime purchase"
  ],
  "video-depth-anything": [
    "video-intelligence",
    "https://github.com/DepthAnything/Video-Depth-Anything",
    "commercial-studio",
    2,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "license_review",
    "Audit Small model rights; measure relative-depth stability and resource use"
  ],
  "explee-six-role": [
    "revenue-intelligence",
    "https://explee.com/",
    "revenue",
    1,
    "https://github.com/jgaethle10/forge-operator/issues/2251",
    "architecture_only",
    "Measure actual buyer progression and independent qualification across six roles"
  ],
  "owned-filament-preview": [
    "visualization",
    "https://github.com/jgaethle10/forge-operator/pull/2640",
    "evercraft-graphics",
    3,
    "https://github.com/jgaethle10/forge-operator/issues/1450",
    "owned_source_review",
    "Compare pixel evidence and frame budget with existing renderer"
  ]
});
function reviewTechnologyCandidates(registry, allowed, denial){
 const rows=registry.technology_candidates;
 if(!Array.isArray(rows)||rows.length!==Object.keys(allowed).length)return null;
 const seen=new Set(),review=[];
 for(const row of rows){
  if(!row||typeof row.id!=='string'||!Object.hasOwn(allowed,row.id)||seen.has(row.id))return null;
  const expected=allowed[row.id];
  if(JSON.stringify([row.category,row.source_url,row.lane_key,row.priority,row.mission_ref,row.restriction,row.benchmark])!==JSON.stringify(expected)||
     row.source_pin!==null||row.license_verified!==false||row.benchmark_verified!==false||
     row.decision!=='pending_review'||!Array.isArray(row.requested_scopes)||row.requested_scopes.length!==0)return null;
  seen.add(row.id);
  review.push({work_key:'external-tech:'+row.id+':review',technology_id:row.id,
   category:expected[0],source_url:expected[1],lane_key:expected[2],priority:expected[3],mission_ref:expected[4],
   state:'quarantined',restriction:expected[5],benchmark:expected[6],
   action:'review_source_identity_license_dependencies_and_compare_existing_capability',
   blockers:['source_revision_unreviewed','license_chain_unverified','comparative_benchmark_unverified',expected[5]],
   authority:'systemia_operator_review_required',dispatch_authorized:false,...denial});
 }
 return review.sort((a,b)=>a.priority-b.priority||a.work_key.localeCompare(b.work_key));
}
const hold=(reason,at)=>({
 schema:'evercraft.kaidance.external-skill-intake.v1',observed_at:at,
 status:'held',reason,candidate_count:0,eligible_for_admission:0,quarantined:0,
 source_fingerprint:null,technology_candidate_count:0,technology_quarantined:0,review_candidates:[],...DENIAL
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
  const technology=reviewTechnologyCandidates(registry,TECHNOLOGY_ALLOWED,DENIAL);
  if(!technology)return hold('technology_candidate_contract_mismatch',stamp);
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
   technology_candidate_count:technology.length,technology_quarantined:technology.length,
   technology_status:'quarantined',review_candidates:[...reviews,...technology],...DENIAL
  };
 }catch{
  return hold('source_unavailable_or_invalid',stamp);
 }
}
