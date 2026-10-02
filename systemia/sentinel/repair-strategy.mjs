function clean(v){return String(v??'').trim();}
function tokens(v){return new Set(clean(v).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));}
function overlap(a,b){let n=0;for(const x of a)if(b.has(x))n++;return n;}
export function fingerprintFinding(f={}){
  const invariant=f.metadata?.invariant_id||f.invariant_id||null;
  return {key:[clean(f.code),clean(invariant),clean(f.metadata?.workflow_name),clean(f.metadata?.status),clean(f.metadata?.finding_code)].filter(Boolean).join('|'),
    code:clean(f.code),invariant_id:invariant,subject:clean(f.subject),severity:clean(f.severity||'medium'),
    features:[...tokens([f.code,f.subject,f.detail,invariant,f.metadata?.workflow_name,f.metadata?.finding_code].filter(Boolean).join(' '))].sort()};
}
export function scoreStrategy(fingerprint,recipe={},memory=[]){
  const codes=recipe.match?.finding_codes||[], invariants=recipe.match?.invariant_ids||[];
  let score=codes.includes(fingerprint.code)?100:0;
  if(fingerprint.invariant_id&&invariants.includes(fingerprint.invariant_id))score+=100;
  score+=Math.min(20,overlap(new Set(fingerprint.features),tokens([recipe.recipe_id,recipe.learned_from,recipe.action?.instructions].filter(Boolean).join(' '))));
  const history=memory.filter(x=>x.recipe_id===recipe.recipe_id&&x.fingerprint_key===fingerprint.key);
  score+=history.filter(x=>x.outcome==='verified_green').length*25;
  score-=history.filter(x=>x.outcome==='failed').length*15;
  return score;
}
export function selectRepairStrategies(finding,registry={},memory=[]){
  const fingerprint=fingerprintFinding(finding);
  return (registry.recipes||[]).map(recipe=>({recipe_id:recipe.recipe_id,authority:recipe.authority,action:recipe.action,verification:recipe.verification||[],rollback:recipe.rollback||null,score:scoreStrategy(fingerprint,recipe,memory),fingerprint}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.recipe_id.localeCompare(b.recipe_id));
}
export function recordTreatment(memory=[],entry={}){
  return [...memory,{fingerprint_key:entry.fingerprint_key,recipe_id:entry.recipe_id,outcome:entry.outcome,at:entry.at||new Date().toISOString(),evidence_refs:entry.evidence_refs||[]}].slice(-1000);
}
