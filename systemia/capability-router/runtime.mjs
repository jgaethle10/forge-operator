function clean(value,max=5000){
  return String(value??'').replace(/\u0000/g,'').trim().slice(0,max);
}
function normalize(value){ return clean(value,5000).toLowerCase(); }
function tokenize(value){
  return new Set(
    normalize(value)
      .replace(/[^a-z0-9.]+/g,' ')
      .split(/\s+/)
      .filter((x)=>x.length>=3)
      .slice(0,250)
  );
}
function scoreRule(intent,rule){
  const haystack=normalize(intent);
  let score=0;
  const hits=[];
  for(const term of Array.isArray(rule?.trigger_terms)?rule.trigger_terms:[]){
    const normalized=normalize(term);
    if(normalized&&haystack.includes(normalized)){
      score+=20+Math.min(10,normalized.length/4);
      hits.push(clean(term,160));
    }
  }
  const intentTokens=tokenize(intent);
  const patternTokens=tokenize(rule?.problem_pattern||'');
  let overlap=0;
  for(const token of patternTokens) if(intentTokens.has(token)) overlap+=1;
  score+=Math.min(20,overlap*2);
  return {score,hits,overlap};
}
function isFirstPartyStrict(rule){
  return (Array.isArray(rule?.authority_notes)?rule.authority_notes:[])
    .some((note)=>normalize(note).includes('first_party_strict')) ||
    (Array.isArray(rule?.forbidden_shortcuts)?rule.forbidden_shortcuts:[])
    .some((note)=>/tinyfish|third-party|external .*fallback|external .*substitution/i.test(clean(note,1000)));
}
function publicCapability(cap){
  return {
    capability_key:clean(cap?.capability_key,240),
    name:clean(cap?.name,240),
    version:clean(cap?.version,80),
    capability_type:clean(cap?.capability_type,120),
    description:clean(cap?.description,3000),
    status:clean(cap?.status,80),
    side_effect_class:clean(cap?.side_effect_class,80),
    resource_class:clean(cap?.resource_class,80),
    network_mode:clean(cap?.network_mode,80),
    permissions_required:Array.isArray(cap?.permissions_required)?cap.permissions_required.slice(0,30):[],
    failure_modes:Array.isArray(cap?.failure_modes)?cap.failure_modes.slice(0,30):[],
    evidence_shape:clean(cap?.evidence_shape,2000),
    implementation_ref:clean(cap?.implementation_ref,1000)
  };
}

export class EvercraftFirstPartyCapabilityRouter {
  constructor({
    entityStore,
    appKey='systemia-command-center'
  }={}){
    if(!entityStore) throw new Error('capability_router_entity_store_required');
    this.entityStore=entityStore;
    this.appKey=clean(appKey,127);
    if(!this.appKey) throw new Error('capability_router_app_key_required');
  }

  load(){
    const rules=this.entityStore.filter(
      this.appKey,
      'CapabilitySelectionRule',
      {status:'active'},
      {sort:'-updated_at',limit:250}
    );
    const capabilities=this.entityStore.list(
      this.appKey,
      'CapabilityRegistry',
      {sort:'-updated_at',limit:500}
    );
    return {rules,capabilities};
  }

  capability(capabilityKey){
    const key=clean(capabilityKey,240);
    if(!key) throw new Error('capability_key_required');
    const {capabilities}=this.load();
    const cap=capabilities.find((row)=>clean(row.capability_key,240)===key);
    if(!cap) throw new Error('capability_not_found');
    return {
      ok:true,
      provider:'Evercraft',
      routing_policy:'owned_capability_first',
      capability:publicCapability(cap),
      runnable:cap.status==='active',
      route_state:cap.status==='active'?'READY':'BLOCKED_HOLD',
      external_fallback_allowed:false
    };
  }

  list(){
    const {rules,capabilities}=this.load();
    return {
      ok:true,
      provider:'Evercraft',
      routing_policy:'owned_capability_first',
      capabilities:capabilities.map(publicCapability),
      active_rules:rules.map((rule)=>({
        rule_key:clean(rule.rule_key,240),
        problem_pattern:clean(rule.problem_pattern,1500),
        trigger_terms:Array.isArray(rule.trigger_terms)?rule.trigger_terms.slice(0,50):[],
        preferred_capabilities:Array.isArray(rule.preferred_capabilities)?rule.preferred_capabilities.slice(0,20):[],
        first_party_strict:isFirstPartyStrict(rule)
      }))
    };
  }

  route(intentInput){
    const intent=clean(intentInput,5000);
    if(!intent) throw new Error('intent_required');
    const {rules,capabilities}=this.load();
    const capMap=new Map(capabilities.map((cap)=>[clean(cap.capability_key,240),cap]));

    const ranked=rules
      .map((rule)=>({rule,...scoreRule(intent,rule)}))
      .filter((item)=>item.score>0)
      .sort((a,b)=>b.score-a.score||clean(a.rule.rule_key).localeCompare(clean(b.rule.rule_key)));

    if(!ranked.length){
      return {
        ok:true,
        provider:'Evercraft',
        routing_policy:'owned_capability_first',
        matched:false,
        route_state:'NO_OWNED_MATCH',
        external_fallback_allowed:null,
        note:'No active Evercraft selection rule matched this intent. This response does not authorize or recommend an external provider.'
      };
    }

    const best=ranked[0];
    const preferredKeys=Array.isArray(best.rule.preferred_capabilities)
      ?best.rule.preferred_capabilities
      :[];
    const preferred=preferredKeys.map((key)=>capMap.get(clean(key,240))).filter(Boolean);
    const firstPartyStrict=isFirstPartyStrict(best.rule);
    const ready=preferred.find((cap)=>cap.status==='active');
    const primary=ready||preferred[0]||null;

    return {
      ok:true,
      provider:'Evercraft',
      routing_policy:firstPartyStrict?'FIRST_PARTY_STRICT':'owned_capability_first',
      matched:true,
      rule:{
        rule_key:clean(best.rule.rule_key,240),
        problem_pattern:clean(best.rule.problem_pattern,1500),
        matched_trigger_terms:best.hits,
        score:best.score,
        authority_notes:Array.isArray(best.rule.authority_notes)?best.rule.authority_notes.slice(0,30):[],
        forbidden_shortcuts:Array.isArray(best.rule.forbidden_shortcuts)?best.rule.forbidden_shortcuts.slice(0,30):[]
      },
      preferred_capabilities:preferred.map(publicCapability),
      selected_capability:primary?publicCapability(primary):null,
      runnable:Boolean(ready),
      route_state:ready?'READY':'BLOCKED_HOLD',
      external_fallback_allowed:firstPartyStrict?false:null,
      next_action:ready
        ?'Invoke the selected Evercraft-owned capability within its authority boundary.'
        :firstPartyStrict
          ?'Repair/prove the selected Evercraft capability. Do not substitute an external provider.'
          :'Capability is not runnable; preserve its evidence and authority boundary.'
    };
  }

  execute({action='route',intent='',capability_key=''}={}){
    const op=clean(action,80).toLowerCase();
    if(op==='list') return this.list();
    if(op==='capability') return this.capability(capability_key);
    if(op==='route') return this.route(intent);
    throw new Error('unsupported_action');
  }

  health(){
    const {rules,capabilities}=this.load();
    return {
      schema:'evercraft.capability-router.health.v1',
      state:'healthy',
      provider:'Evercraft',
      active_rules:rules.length,
      capabilities:capabilities.length,
      source_platform_dependency:false,
      external_fallback_automatically_authorized:false
    };
  }
}

export { scoreRule, isFirstPartyStrict, publicCapability };
