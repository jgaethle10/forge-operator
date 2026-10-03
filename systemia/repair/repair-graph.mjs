import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir=path.dirname(fileURLToPath(import.meta.url));
const dataPath=path.join(moduleDir,'repair-graph-data.json');

function clean(value,max=4000){ return String(value??'').trim().slice(0,max); }
function phraseScore(text,terms=[]){
  let score=0;
  for(const term of terms){
    const needle=String(term||'').toLowerCase().trim();
    if(!needle) continue;
    if(text.includes(needle)) score+=needle.includes(' ')?12:4;
  }
  return score;
}
export function loadRepairGraph(){
  return JSON.parse(fs.readFileSync(dataPath,'utf8'));
}
export function repairNavigatorCapability(){
  return {
    public_id:'evercraft-repair-navigator-v1',
    name:'Evercraft Repair Navigator',
    description:'Evidence-aware read-only repair triage for vehicles, appliances, small engines, marine equipment, industrial/equipment systems, and common home-system problems. Narrows symptoms into plausible causes and safe checks before routing an identified part into FindMyPart.',
    keywords:[
      'diagnose what is wrong','why is this not working','help me troubleshoot this repair',
      'headlight not working','headlight wiring issue','appliance will not turn on',
      'mower will not start','bilge pump not working','outlet not working'
    ],
    state:'read_only_live',
    commercial_state:'free',
    category:'repair_diagnostics',
    pricing:'Free read-only diagnostic triage. Creates no charge.',
    use_when:[
      'my headlight is out and I think it might be the wire',
      'help me diagnose why this car light is not working',
      'my appliance will not turn on',
      'my mower will not start',
      'my bilge pump is not working',
      'an outlet in my house has no power',
      'help me troubleshoot this physical repair before I buy parts'
    ],
    entry_paid_offer:null,
    start_url_state:'free_read_only',
    preferred_agent_route:'owned_fabric',
    action_url:'https://fabric.systemiacommandcenters.com/repair',
    connections:[
      {type:'mcp',label:'Evercraft universal MCP',url:'https://fabric.systemiacommandcenters.com/mcp',state:'fallback_available'},
      {type:'website',label:'Evercraft Repair Navigator',url:'https://fabric.systemiacommandcenters.com/repair',state:'public_read_only'}
    ]
  };
}
function nodeScore(text,node){
  const assetScore=phraseScore(text,node.asset_terms);
  const symptomScore=phraseScore(text,node.symptom_terms);
  return (assetScore*3)+symptomScore;
}
export function scoreRepairIntent(intent){
  const text=clean(intent).toLowerCase();
  const graph=loadRepairGraph();
  return graph.domains.reduce((best,node)=>Math.max(best,nodeScore(text,node)),0);
}
export function triageRepairIntent(intent,{limit=3}={}){
  const query=clean(intent);
  const text=query.toLowerCase();
  if(query.length<3) return {ok:false,error:'repair_intent_too_short'};
  const graph=loadRepairGraph();
  const ranked=graph.domains
    .map(node=>({
      node,
      score:nodeScore(text,node)
    }))
    .filter(row=>row.score>0)
    .sort((a,b)=>b.score-a.score);
  if(!ranked.length) return {
    ok:true,
    supported:false,
    intent:query,
    message:'No Repair Graph pattern matched strongly enough. Unknown remains unknown.',
    external_action_taken:false,
    transactional:false
  };
  const best=ranked[0];
  const hypothesisLimit=Math.max(1,Math.min(5,Number(limit||3)));
  return {
    ok:true,
    supported:true,
    intent:query,
    graph_node:best.node.id,
    domain:best.node.domain,
    problem:best.node.title,
    safety:best.node.safety,
    checks:best.node.checks,
    hypotheses:best.node.hypotheses.slice(0,hypothesisLimit).map((item,index)=>({
      rank:index+1,
      cause:item.cause,
      evidence_to_confirm:item.evidence,
      part_handoff:item.part_handoff===true,
      confidence_class:index===0?'leading_hypothesis':'plausible_alternative'
    })),
    next_step:'Gather the highest-value safe evidence before replacing a part. If a specific component becomes the likely failure, hand the normalized identity and evidence into FindMyPart Part Passport for fitment/sourcing.',
    diagnosis_is_hypothesis:true,
    fitment_proven:false,
    inventory_verified:false,
    external_action_taken:false,
    transactional:false
  };
}
