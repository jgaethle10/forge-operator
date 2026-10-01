#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DurableEntityStore } from '../app-fabric/entity-store.mjs';
import { EvercraftFirstPartyCapabilityRouter, scoreRule } from './runtime.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-capability-router-proof-'));
const appKey='systemia-command-center';

try{
  const store=new DurableEntityStore({stateDir:path.join(root,'entities')});

  store.create(appKey,'CapabilityRegistry',{
    id:'cap-browser',
    capability_key:'evercraft.browser.read',
    name:'Evercraft Browser',
    version:'1.0',
    capability_type:'browser',
    description:'Read public web pages with evidence.',
    status:'active',
    side_effect_class:'read_only',
    resource_class:'browser',
    network_mode:'public',
    permissions_required:[],
    failure_modes:['target_unavailable'],
    evidence_shape:'snapshot receipt',
    implementation_ref:'systemia/evercraft-web/browser-worker/public-adapter.mjs'
  });
  store.create(appKey,'CapabilityRegistry',{
    id:'cap-private-search',
    capability_key:'evercraft.private.search',
    name:'Evercraft Private Search',
    version:'1.0',
    capability_type:'search',
    description:'Owned private search path.',
    status:'held',
    side_effect_class:'read_only',
    resource_class:'search',
    network_mode:'private',
    permissions_required:[],
    failure_modes:['runtime_held'],
    evidence_shape:'search receipt',
    implementation_ref:'systemia/private-search/runtime.mjs'
  });
  store.create(appKey,'CapabilityRegistry',{
    id:'cap-research',
    capability_key:'evercraft.research',
    name:'Evercraft Research',
    version:'2.0',
    capability_type:'research',
    description:'Owned research synthesis.',
    status:'active',
    side_effect_class:'read_only',
    resource_class:'reasoning',
    network_mode:'mixed',
    permissions_required:[],
    failure_modes:[],
    evidence_shape:'evidence bundle',
    implementation_ref:'systemia/research/runtime.mjs'
  });

  store.create(appKey,'CapabilitySelectionRule',{
    id:'rule-web',
    rule_key:'route.web.research',
    status:'active',
    problem_pattern:'research a public website and collect evidence',
    trigger_terms:['public website','web research','browse the web'],
    preferred_capabilities:['evercraft.browser.read','evercraft.research'],
    authority_notes:['owned capability first'],
    forbidden_shortcuts:[],
    updated_at:'2026-10-01T17:00:00.000Z'
  });
  store.create(appKey,'CapabilitySelectionRule',{
    id:'rule-private',
    rule_key:'route.private.search',
    status:'active',
    problem_pattern:'search private internal material',
    trigger_terms:['private search','internal search'],
    preferred_capabilities:['evercraft.private.search'],
    authority_notes:['FIRST_PARTY_STRICT'],
    forbidden_shortcuts:['No third-party fallback or external substitution.'],
    updated_at:'2026-10-01T17:01:00.000Z'
  });
  store.create(appKey,'CapabilitySelectionRule',{
    id:'rule-inactive',
    rule_key:'route.inactive',
    status:'inactive',
    problem_pattern:'never route this',
    trigger_terms:['forbidden inactive trigger'],
    preferred_capabilities:['evercraft.research'],
    updated_at:'2026-10-01T17:02:00.000Z'
  });

  const router=new EvercraftFirstPartyCapabilityRouter({entityStore:store,appKey});
  const health=router.health();
  assert.equal(health.state,'healthy');
  assert.equal(health.active_rules,2);
  assert.equal(health.capabilities,3);
  assert.equal(health.source_platform_dependency,false);
  assert.equal(health.external_fallback_automatically_authorized,false);

  const list=router.execute({action:'list'});
  assert.equal(list.capabilities.length,3);
  assert.equal(list.active_rules.length,2);
  assert.equal(list.active_rules.some((row)=>row.rule_key==='route.inactive'),false);
  assert.equal(
    list.active_rules.find((row)=>row.rule_key==='route.private.search').first_party_strict,
    true
  );

  const capability=router.execute({
    action:'capability',
    capability_key:'evercraft.browser.read'
  });
  assert.equal(capability.runnable,true);
  assert.equal(capability.route_state,'READY');
  assert.equal(capability.external_fallback_allowed,false);
  assert.equal(capability.capability.implementation_ref,'systemia/evercraft-web/browser-worker/public-adapter.mjs');

  const routed=router.execute({
    action:'route',
    intent:'Please browse the web and research a public website with evidence.'
  });
  assert.equal(routed.matched,true);
  assert.equal(routed.rule.rule_key,'route.web.research');
  assert.equal(routed.selected_capability.capability_key,'evercraft.browser.read');
  assert.equal(routed.runnable,true);
  assert.equal(routed.route_state,'READY');
  assert.ok(routed.rule.score>0);
  assert.ok(routed.rule.matched_trigger_terms.includes('public website'));

  const strict=router.execute({
    action:'route',
    intent:'I need an internal search through private material.'
  });
  assert.equal(strict.matched,true);
  assert.equal(strict.routing_policy,'FIRST_PARTY_STRICT');
  assert.equal(strict.selected_capability.capability_key,'evercraft.private.search');
  assert.equal(strict.runnable,false);
  assert.equal(strict.route_state,'BLOCKED_HOLD');
  assert.equal(strict.external_fallback_allowed,false);
  assert.match(strict.next_action,/Do not substitute an external provider/);

  const miss=router.execute({
    action:'route',
    intent:'compose orchestral music for a lighthouse'
  });
  assert.equal(miss.matched,false);
  assert.equal(miss.route_state,'NO_OWNED_MATCH');
  assert.equal(miss.external_fallback_allowed,null);
  assert.match(miss.note,/does not authorize or recommend an external provider/);

  assert.throws(
    ()=>router.execute({action:'capability',capability_key:'missing.capability'}),
    /capability_not_found/
  );

  const exactScore=scoreRule('public website evidence',{
    trigger_terms:['public website'],
    problem_pattern:'website evidence'
  });
  assert.ok(exactScore.score>=20);
  assert.deepEqual(exactScore.hits,['public website']);
  assert.ok(exactScore.overlap>=1);

  console.log(JSON.stringify({
    schema:'evercraft.capability-router.runtime-proof.v1',
    status:'pass',
    active_rules_only:true,
    source_scoring_semantics_preserved:true,
    active_preferred_capability_selected:true,
    held_owned_capability_blocks:true,
    first_party_strict_forbids_external_substitution:true,
    no_match_does_not_authorize_external_provider:true,
    public_capability_shape_preserved:true,
    source_platform_dependency:false
  }));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
