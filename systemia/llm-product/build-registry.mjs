import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.EVERCRAFT_ROOT ? path.resolve(process.env.EVERCRAFT_ROOT) : path.resolve(MODULE_DIR,'../..');
const UNIVERSAL_FABRIC = 'https://fabric.systemiacommandcenters.com/mcp';

function exists(p){ return fs.existsSync(path.join(ROOT,p)); }
function readJson(p,fallback=null){
  try { return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8')); }
  catch (error) { if (fallback !== null) return fallback; throw error; }
}
function readText(p){ return fs.readFileSync(path.join(ROOT,p),'utf8'); }
function slugify(value){
  return String(value||'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,120);
}
function norm(value){ return slugify(value).replace(/-/g,''); }
function unique(values){ return [...new Set((values||[]).filter(Boolean))]; }
function listDirs(p){
  const full=path.join(ROOT,p);
  if(!fs.existsSync(full)) return [];
  return fs.readdirSync(full,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
}
function listFiles(p){
  const full=path.join(ROOT,p);
  if(!fs.existsSync(full)) return [];
  return fs.readdirSync(full,{withFileTypes:true}).filter(x=>x.isFile()).map(x=>x.name).sort();
}
function walkFiles(rel,accept,out=[]){
  const full=path.join(ROOT,rel);
  if(!fs.existsSync(full)) return out;
  for(const entry of fs.readdirSync(full,{withFileTypes:true})){
    const child=path.posix.join(rel,entry.name);
    if(entry.isDirectory()) walkFiles(child,accept,out);
    else if(entry.isFile() && accept(child)) out.push(child);
  }
  return out;
}
function bulletsUnderUseWhen(text){
  const lines=String(text||'').split(/\r?\n/);
  const out=[]; let active=false;
  for(const line of lines){
    const trimmed=line.trim();
    if(/^##\s+Use this capability when/i.test(trimmed)){ active=true; continue; }
    if(active && /^##\s+/.test(trimmed)) break;
    if(active && /^[-*]\s+/.test(trimmed)) out.push(trimmed.replace(/^[-*]\s+/,'').trim());
  }
  return unique(out).slice(0,32);
}
function extractUrls(value,out=[]){
  if(typeof value==='string'){
    if(/^https:\/\//i.test(value)) out.push(value);
  } else if(Array.isArray(value)) value.forEach(v=>extractUrls(v,out));
  else if(value && typeof value==='object') Object.values(value).forEach(v=>extractUrls(v,out));
  return unique(out);
}
function relSourceMatches(sourceRef, needle){
  return String(sourceRef||'').toLowerCase().includes(String(needle||'').toLowerCase());
}

const publicProducts=readJson('registry/public-products.json',{products:[]});
const estate=readJson('systemia/saban/estate-inventory.snapshot.json',{apps:[]});
const directDoors=readJson('public/.well-known/evercraft-direct-door-readiness.json',{products:[]});
const contracts=readJson('systemia/capability-mesh/contracts.json',{contracts:[]});
const chum=readJson('public/chum/capabilities.json',{capabilities:[],universal_mcp:UNIVERSAL_FABRIC});
const seeds=readJson('systemia/llm-product/historical-seeds.json',{entries:[]});
const baseline=readJson('systemia/llm-product/ratchet-baseline.json',{public_product_keys:[]});

const directBySlug=new Map((directDoors.products||[]).map(x=>[x.slug,x]));
const contractByKey=new Map((contracts.contracts||[]).map(x=>[x.product_key,x]));
const productByName=new Map();
for(const p of publicProducts.products||[]){
  productByName.set(norm(p.name),p.product_key);
  productByName.set(norm(p.product_key),p.product_key);
}
for(const seed of seeds.entries||[]){
  for(const alias of [seed.name,...(seed.aliases||[])]) if(alias) productByName.set(norm(alias),seed.stable_id);
}

const workflowFiles=listFiles('.github/workflows').map(x=>'.github/workflows/'+x);
const testFiles=walkFiles('tests',p=>/\.(mjs|js|ts|tsx)$/.test(p));
const providerObs=walkFiles('conformance/provider-observations',p=>p.endsWith('.json'));
const runtimeObs=walkFiles('conformance/runtime-observations',p=>p.endsWith('.json'));

const records=new Map();
function add(input){
  if(!input?.stable_id) throw new Error('stable_id_required');
  const prev=records.get(input.stable_id)||{};
  const merged={
    ...prev,...input,
    aliases:unique([...(prev.aliases||[]),...(input.aliases||[])]),
    problem_language:unique([...(prev.problem_language||[]),...(input.problem_language||[])]),
    source_refs:unique([...(prev.source_refs||[]),...(input.source_refs||[])]),
    blockers:unique([...(prev.blockers||[]),...(input.blockers||[])]),
    linked_capabilities:unique([...(prev.linked_capabilities||[]),...(input.linked_capabilities||[])]),
    test_refs:unique([...(prev.test_refs||[]),...(input.test_refs||[])]),
    provider_observation_refs:unique([...(prev.provider_observation_refs||[]),...(input.provider_observation_refs||[])]),
    runtime_observation_refs:unique([...(prev.runtime_observation_refs||[]),...(input.runtime_observation_refs||[])]),
  };
  records.set(input.stable_id,merged);
}

for(const seed of seeds.entries||[]) add({...seed,origin:'historical_seed'});

for(const product of publicProducts.products||[]){
  const key=product.product_key;
  const llmsPath='public/chum/products/'+key+'/llms.txt';
  const problemLanguage=exists(llmsPath)?bulletsUnderUseWhen(readText(llmsPath)):[];
  const direct=directBySlug.get(key)||null;
  const contract=contractByKey.get(key)||null;
  const linked=(chum.capabilities||[]).filter(c=>{
    const id=String(c.public_id||'').toLowerCase();
    const name=norm(c.name);
    const pnorm=norm(product.name);
    return id.startsWith(key+'-') || id.includes('-'+key+'-') || (pnorm.length>4 && name.includes(pnorm));
  });
  const machineEndpoint=direct?.preferred_route?.remote_mcp || null;
  const universalDeclared=(chum.universal_mcp||UNIVERSAL_FABRIC);
  const sourceRefs=[
    'registry/public-products.json',
    product.github_record?('public/chum/products/'+key+'/'+String(product.github_record).replace(/^\.\//,'')):null,
    exists(llmsPath)?llmsPath:null,
    direct?'public/.well-known/evercraft-direct-door-readiness.json':null,
    contract?'systemia/capability-mesh/contracts.json':null,
    ...linked.map(c=>'public/chum/capabilities/'+c.public_id+'/capability.json').filter(exists),
  ].filter(Boolean);
  const needles=unique([key,slugify(product.name)]);
  const matchedTests=testFiles.filter(p=>needles.some(n=>n.length>3&&relSourceMatches(p,n)));
  const matchedWorkflows=workflowFiles.filter(p=>needles.some(n=>n.length>3&&relSourceMatches(p,n)));
  const matchedProvider=providerObs.filter(p=>needles.some(n=>n.length>3&&relSourceMatches(p,n)));
  const matchedRuntime=runtimeObs.filter(p=>needles.some(n=>n.length>3&&relSourceMatches(p,n)));

  const blockers=[];
  if(problemLanguage.length===0) blockers.push('problem_language_not_verified');
  if(!product.canonical_url) blockers.push('human_url_missing');
  if(!machineEndpoint) blockers.push('specialist_machine_endpoint_missing');
  if(!contract) blockers.push('capability_mesh_contract_missing');
  if(linked.length===0) blockers.push('structured_output_or_commercial_contract_not_linked');
  if(matchedTests.length===0 && matchedWorkflows.length===0) blockers.push('machine_test_surface_not_found');
  if(matchedProvider.length===0) blockers.push('independent_llm_discovery_not_observed');
  if(machineEndpoint && /base44\.app/i.test(machineEndpoint)) blockers.push('legacy_base44_machine_endpoint_dependency');

  const releaseClaim=String(product.ship_state||product.release_state||'').toLowerCase();
  add({
    stable_id:'product:'+key,
    kind:'product',
    name:product.name,
    aliases:[key],
    product_key:key,
    class:product.class||null,
    origin:'public_product_index',
    public_safe:true,
    problem_language:problemLanguage,
    human_url:product.canonical_url||null,
    machine_endpoint:machineEndpoint||universalDeclared||null,
    machine_endpoint_state:machineEndpoint
      ? (direct?.direct_callable===true?'direct_declared_reachable':'direct_declared_unverified')
      : 'universal_fallback_declared_unverified',
    authentication:contract?.authority ? {
      state:'declared',
      passport_product:contract.authority.passport_product||null,
      scopes:contract.authority.scopes||[],
    } : {state:'not_declared',passport_product:null,scopes:[]},
    structured_output:linked.length?linked.map(c=>({public_id:c.public_id,outputs:c.outputs||null,evidence_state:c.evidence_state||null})):[],
    evidence_provenance:{
      source_refs:sourceRefs,
      contract_truth_boundary:contracts.truth_boundary||null,
    },
    commercial_path:linked.map(c=>({
      public_id:c.public_id,
      commercial_state:c.commercial_state||null,
      pricing:c.pricing||null,
      start_url_state:c.start_url_state||null,
      human_confirmation:c.human_ui_required===true || /confirm/i.test(String(c.confirmation||'')),
    })),
    llm_discovery_state:{
      repository_surface:exists(llmsPath),
      mcp_registry_published:direct?.registry_published===true,
      independent_provider_observation_present:matchedProvider.length>0,
      independently_discoverable_proven:false,
    },
    invocation_state:direct?.direct_callable===true?'direct_specialist_declared':'discovery_or_universal_fallback',
    test_state:{
      declared_test_surface:matchedTests.length>0||matchedWorkflows.length>0,
      runtime_observation_present:matchedRuntime.length>0,
      passing_external_invocation_proven:false,
    },
    lifecycle:{
      planned:true,
      implemented:sourceRefs.length>0,
      tested:matchedRuntime.length>0,
      deployed:direct?.registry_published===true,
      externally_reachable:direct?.direct_callable===true,
      independently_discoverable:false,
    },
    human_handoff:{
      state:product.canonical_url?'available':'missing',
      url:product.canonical_url||null,
    },
    release_claim:releaseClaim||null,
    linked_capabilities:linked.map(c=>c.public_id),
    source_refs:sourceRefs,
    test_refs:unique([...matchedTests,...matchedWorkflows]),
    provider_observation_refs:matchedProvider,
    runtime_observation_refs:matchedRuntime,
    blockers,
  });
}

for(const app of estate.apps||[]){
  const name=String(app.name||'').trim();
  if(!name || /^untitled$/i.test(name)) continue;
  const mapped=productByName.get(norm(name));
  if(mapped && String(mapped).includes(':')){
    add({stable_id:mapped,aliases:[name],source_refs:['systemia/saban/estate-inventory.snapshot.json']});
    continue;
  }
  if(mapped){
    add({stable_id:'product:'+mapped,aliases:[name],source_refs:['systemia/saban/estate-inventory.snapshot.json']});
    continue;
  }
  add({
    stable_id:'historical:'+slugify(name),
    kind:'historical_project',
    name,
    aliases:[],
    origin:'estate_archaeology',
    public_safe:false,
    problem_language:[],
    source_refs:['systemia/saban/estate-inventory.snapshot.json'],
    machine_endpoint:null,
    machine_endpoint_state:'unknown',
    authentication:{state:'unknown',scopes:[]},
    structured_output:[],
    commercial_path:[],
    llm_discovery_state:{repository_surface:false,mcp_registry_published:false,independent_provider_observation_present:false,independently_discoverable_proven:false},
    invocation_state:'unknown',
    test_state:{declared_test_surface:false,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:false,tested:false,deployed:false,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'unknown',url:null},
    blockers:['problem_language_not_verified','capability_state_not_verified','machine_route_not_verified','human_route_not_verified'],
  });
}

for(const name of listDirs('systemia')){
  const stable='internal:systemia:'+slugify(name);
  const existing=[...records.values()].find(r=>(r.source_refs||[]).some(ref=>ref==='systemia/'+name+'/' || ref.startsWith('systemia/'+name+'/')));
  if(existing) continue;
  add({
    stable_id:stable,kind:'internal_system',name:'Systemia '+name.replace(/[-_]/g,' '),
    aliases:[name],origin:'repository_module',public_safe:false,problem_language:[],
    source_refs:['systemia/'+name+'/'],machine_endpoint:null,machine_endpoint_state:'internal_or_unknown',
    authentication:{state:'unknown',scopes:[]},structured_output:[],commercial_path:[],
    llm_discovery_state:{repository_surface:false,mcp_registry_published:false,independent_provider_observation_present:false,independently_discoverable_proven:false},
    invocation_state:'internal_or_unknown',
    test_state:{declared_test_surface:false,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:true,tested:false,deployed:false,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'not_assessed',url:null},
    blockers:['problem_language_not_verified','machine_contract_not_assessed','test_state_not_assessed'],
  });
}

for(const slug of listDirs('plugins')){
  const pluginJson='plugins/'+slug+'/plugin.json';
  const data=exists(pluginJson)?readJson(pluginJson,{}):{};
  const urls=extractUrls(data);
  add({
    stable_id:'plugin:'+slug,kind:'plugin',name:data.name||slug,aliases:[slug],origin:'plugin_package',
    public_safe:true,problem_language:[],source_refs:[pluginJson].filter(exists),
    machine_endpoint:urls.find(u=>/\/mcp|functions\//i.test(u))||null,
    machine_endpoint_state:urls.length?'declared_from_plugin_package':'not_verified',
    authentication:{state:'package_declared_unverified',scopes:[]},
    structured_output:[],commercial_path:[],invocation_state:'plugin_package_present',
    llm_discovery_state:{repository_surface:true,mcp_registry_published:false,independent_provider_observation_present:false,independently_discoverable_proven:false},
    test_state:{declared_test_surface:false,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:true,tested:false,deployed:false,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'not_assessed',url:null},
    blockers:['problem_language_not_linked_at_plugin_level','runtime_reachability_not_proven'],
  });
}

for(const file of listFiles('mcp-registry').filter(x=>x.endsWith('.json'))){
  const rel='mcp-registry/'+file;
  const data=readJson(rel,{});
  const slug=file.replace(/\.json$/,'');
  const urls=extractUrls(data);
  add({
    stable_id:'mcp:'+slug,kind:'mcp_registration',name:data.name||data.title||slug,aliases:[slug],origin:'mcp_registry',
    public_safe:true,problem_language:[],source_refs:[rel],machine_endpoint:urls.find(u=>/\/mcp|functions\//i.test(u))||urls[0]||null,
    machine_endpoint_state:'registry_record_present',authentication:{state:'registry_declared_unverified',scopes:[]},
    structured_output:[],commercial_path:[],invocation_state:'registry_record_present',
    llm_discovery_state:{repository_surface:true,mcp_registry_published:true,independent_provider_observation_present:false,independently_discoverable_proven:false},
    test_state:{declared_test_surface:false,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:true,tested:false,deployed:true,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'not_applicable_or_unassessed',url:null},blockers:['runtime_reachability_not_proven'],
  });
}

for(const rel of workflowFiles){
  const slug=path.basename(rel).replace(/\.ya?ml$/,'');
  add({
    stable_id:'workflow:'+slug,kind:'workflow',name:slug.replace(/[-_]/g,' '),aliases:[slug],origin:'github_workflow',
    public_safe:false,problem_language:[],source_refs:[rel],machine_endpoint:null,machine_endpoint_state:'workflow_internal',
    authentication:{state:'github_actions_policy',scopes:[]},structured_output:[],commercial_path:[],invocation_state:'automation_internal',
    llm_discovery_state:{repository_surface:false,mcp_registry_published:false,independent_provider_observation_present:false,independently_discoverable_proven:false},
    test_state:{declared_test_surface:true,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:true,tested:false,deployed:true,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'not_applicable',url:null},blockers:['problem_language_not_verified','agent_invocation_contract_not_assessed'],
  });
}

const dataCandidates=unique([
  ...walkFiles('registry',p=>/\.(json|jsonl|csv)$/i.test(p)),
  ...walkFiles('systemia',p=>/(registry|dataset|catalog|ledger|snapshot|index)[^/]*\.(json|jsonl|csv)$/i.test(path.basename(p))),
]);
for(const rel of dataCandidates){
  const slug=slugify(rel.replace(/\.(json|jsonl|csv)$/i,''));
  add({
    stable_id:'dataset:'+slug,kind:'dataset_or_registry',name:path.basename(rel),aliases:[],origin:'repository_dataset',
    public_safe:false,problem_language:[],source_refs:[rel],machine_endpoint:null,machine_endpoint_state:'not_assessed',
    authentication:{state:'not_assessed',scopes:[]},structured_output:[],commercial_path:[],invocation_state:'data_surface_only',
    llm_discovery_state:{repository_surface:false,mcp_registry_published:false,independent_provider_observation_present:false,independently_discoverable_proven:false},
    test_state:{declared_test_surface:false,runtime_observation_present:false,passing_external_invocation_proven:false},
    lifecycle:{planned:true,implemented:true,tested:false,deployed:false,externally_reachable:false,independently_discoverable:false},
    human_handoff:{state:'not_applicable',url:null},blockers:['dataset_machine_contract_not_assessed','provenance_contract_not_assessed'],
  });
}

const rows=[...records.values()].sort((a,b)=>a.stable_id.localeCompare(b.stable_id));

for(const row of rows){
  row.problem_language=unique(row.problem_language);
  row.source_refs=unique(row.source_refs);
  row.blockers=unique(row.blockers);
  if(row.public_safe===true && row.problem_language.length===0 && !row.blockers.includes('problem_language_not_verified')){
    row.blockers.push('problem_language_not_verified');
  }
}

const publicKeys=new Set((publicProducts.products||[]).map(p=>p.product_key));
const baselineKeys=new Set(baseline.public_product_keys||[]);
const newPublic=[...publicKeys].filter(k=>!baselineKeys.has(k)).sort();

function minimumAdmissionViolations(row){
  const v=[];
  if(!row.problem_language?.length) v.push('problem_language_missing');
  if(!row.human_url) v.push('human_url_missing');
  if(!row.machine_endpoint) v.push('machine_endpoint_missing');
  if(!row.test_state?.declared_test_surface) v.push('machine_test_surface_missing');
  if(!row.evidence_provenance?.source_refs?.length) v.push('evidence_provenance_missing');
  return v;
}
function fullShipViolations(row){
  const v=minimumAdmissionViolations(row);
  if(row.authentication?.state!=='declared') v.push('authorization_contract_not_declared');
  if(!row.structured_output?.length) v.push('structured_output_contract_missing');
  if(!row.human_handoff || row.human_handoff.state==='missing' || row.human_handoff.state==='unknown') v.push('human_handoff_missing');
  if(row.lifecycle?.externally_reachable!==true) v.push('external_reachability_not_proven');
  if(row.lifecycle?.tested!==true) v.push('runtime_test_not_proven');
  if(row.llm_discovery_state?.independently_discoverable_proven!==true) v.push('independent_discoverability_not_proven');
  return unique(v);
}

const newPublicViolations=newPublic.map(key=>{
  const row=records.get('product:'+key);
  return {product_key:key,violations:row?minimumAdmissionViolations(row):['registry_row_missing']};
}).filter(x=>x.violations.length);

const shippedViolations=rows.filter(r=>['shipped','production','released','live'].includes(String(r.release_claim||'').toLowerCase()))
  .map(r=>({stable_id:r.stable_id,violations:fullShipViolations(r)}))
  .filter(x=>x.violations.length);

const debt=rows.filter(r=>r.blockers?.length).map(r=>({
  stable_id:r.stable_id,name:r.name,kind:r.kind,public_safe:r.public_safe===true,
  blocker_count:r.blockers.length,blockers:r.blockers,
  priority:
    r.stable_id==='platform:evercraft-fabric'?'P0_SHARED_INFRA':
    r.kind==='product'&&r.public_safe===true?'P1_PUBLIC_PRODUCT':
    r.kind==='plugin'||r.kind==='mcp_registration'?'P1_MACHINE_DOOR':
    r.kind==='internal_system'||r.kind==='agent_system'?'P2_INTERNAL_CAPABILITY':
    'P3_ARCHAEOLOGY',
}));

const matrix=rows.filter(r=>r.kind==='product'||r.kind==='historical_project').map(r=>({
  stable_id:r.stable_id,
  product:r.name,
  problem_language:r.problem_language||[],
  verified_capabilities:(r.structured_output||[]).filter(x=>x.outputs).map(x=>x.public_id),
  human_url:r.human_url||null,
  machine_endpoint:r.machine_endpoint||null,
  authentication:r.authentication||{state:'unknown'},
  structured_output:r.structured_output||[],
  evidence_provenance:r.evidence_provenance||{source_refs:r.source_refs||[]},
  commercial_path:r.commercial_path||[],
  llm_discovery_state:r.llm_discovery_state||{},
  invocation_state:r.invocation_state||'unknown',
  test_state:r.test_state||{},
  blockers:r.blockers||[],
}));

const output={
  schema:'evercraft.capability-registry.v2',
  generated_at:new Date().toISOString(),
  standard:'docs/LLM_PRODUCT_STANDARD.md',
  truth_boundary:{
    documentation_is_not_runtime_proof:true,
    planned_is_not_implemented:true,
    implemented_is_not_tested:true,
    tested_is_not_deployed:true,
    deployed_is_not_externally_reachable:true,
    registry_publication_is_not_independent_discoverability:true,
    missing_is_not_zero:true,
    modeled_is_not_observed:true,
  },
  sources:{
    public_product_count:(publicProducts.products||[]).length,
    estate_snapshot_count:estate.count||((estate.apps||[]).length),
    estate_snapshot_complete_claim:estate?.coverage?.complete_estate_claim===true,
    historical_seed_count:(seeds.entries||[]).length,
    systemia_module_count:listDirs('systemia').length,
    plugin_package_count:listDirs('plugins').length,
    mcp_registry_count:listFiles('mcp-registry').filter(x=>x.endsWith('.json')).length,
    workflow_count:workflowFiles.length,
    dataset_registry_candidate_count:dataCandidates.length,
  },
  summary:{
    registry_entry_count:rows.length,
    public_safe_entry_count:rows.filter(r=>r.public_safe===true).length,
    product_matrix_count:matrix.length,
    conversion_debt_count:debt.length,
    public_product_count:publicKeys.size,
    baseline_public_product_count:baselineKeys.size,
    new_public_product_count:newPublic.length,
    new_public_product_admission_violation_count:newPublicViolations.length,
    explicit_ship_gate_violation_count:shippedViolations.length,
    capability_mesh_contract_count:(contracts.contracts||[]).length,
    direct_specialist_door_count:(directDoors.products||[]).length,
  },
  release_gate:{
    state:(newPublicViolations.length||shippedViolations.length)?'blocked':'pass',
    new_public_product_violations:newPublicViolations,
    explicit_ship_claim_violations:shippedViolations,
    doctrine:'No explicit shipped/production/live release claim may pass without dual human/machine discovery, appropriate access, runtime verification, provenance, authorization and human handoff.',
  },
  debt_queue:debt,
  portfolio_matrix:matrix,
  entries:rows,
};

function emit(){
  const outDir=path.join(ROOT,'artifacts','llm-product');
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'capability-registry.json'),JSON.stringify(output,null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'portfolio-matrix.json'),JSON.stringify({
    schema:'evercraft.llm-product.portfolio-matrix.v1',
    generated_at:output.generated_at,
    rows:matrix,
  },null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'conversion-debt.json'),JSON.stringify({
    schema:'evercraft.llm-product.conversion-debt.v1',
    generated_at:output.generated_at,
    queue:debt,
  },null,2)+'\n');
  fs.writeFileSync(path.join(outDir,'release-gate.json'),JSON.stringify(output.release_gate,null,2)+'\n');
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if(isCli && process.argv.includes('--emit')) emit();

if(isCli && process.argv.includes('--check')){
  if(publicProducts.schema!=='evercraft.saban.public-product-index.v1') throw new Error('public_product_schema_invalid');
  if(!String(estate.schema||'').startsWith('evercraft.private-estate-name-snapshot.')) throw new Error('estate_snapshot_schema_invalid');
  if(seeds.schema!=='evercraft.llm-product.historical-seeds.v1') throw new Error('historical_seed_schema_invalid');
  if(baseline.schema!=='evercraft.llm-product.ratchet-baseline.v1') throw new Error('llm_product_baseline_schema_invalid');
  const dupes=rows.map(r=>r.stable_id).filter((id,i,a)=>a.indexOf(id)!==i);
  if(dupes.length) throw new Error('duplicate_stable_ids:'+dupes.join(','));
  if(output.release_gate.state!=='pass') throw new Error('llm_product_release_gate_blocked');
  process.stdout.write(JSON.stringify({state:'LLM_PRODUCT_GATE_CURRENT',summary:output.summary,release_gate:output.release_gate},null,2)+'\n');
} else if(isCli) {
  process.stdout.write(JSON.stringify(output,null,2)+'\n');
}

export { output, emit, minimumAdmissionViolations, fullShipViolations };
