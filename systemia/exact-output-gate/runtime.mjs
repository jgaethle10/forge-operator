import { randomUUID } from 'node:crypto';

const POLICY_BY_TYPE=Object.freeze({
  software:'release.live-software.strict.v1',
  document:'release.static-deliverable.strict.v1',
  generated_artifact:'release.static-deliverable.strict.v1',
  workflow:'release.workflow.strict.v1',
  content:'release.content.strict.v1',
  data_product:'release.data-product.strict.v1',
  other:'release.other.standard.v1'
});

function clean(value,max=12000){ return String(value??'').trim().slice(0,max); }
function uniq(values){ return [...new Set((values||[]).filter(Boolean))]; }
function isPassedState(value){
  return value==='passed'||value==='not_applicable'||value==='not_required';
}
function plusMinutes(iso,minutes){
  const base=new Date(iso);
  if(!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime()+Math.max(0,Number(minutes)||0)*60000).toISOString();
}

export class EvercraftExactOutputGate {
  constructor({
    entityStore,
    appKey='systemia-command-center',
    clock=()=>new Date()
  }={}){
    if(!entityStore) throw new Error('exact_output_entity_store_required');
    this.entityStore=entityStore;
    this.appKey=clean(appKey,127);
    if(!this.appKey) throw new Error('exact_output_app_key_required');
    this.clock=clock;
  }

  now(){ return this.clock().toISOString(); }

  findReceipt(receiptKey){
    return this.entityStore.filter(
      this.appKey,
      'SystemiaReleaseReceipt',
      {receipt_key:clean(receiptKey,1000)},
      {sort:'-created_at',limit:10}
    )[0]||null;
  }

  loadPolicy(receipt){
    const wanted=clean(receipt.policy_key,500)||
      POLICY_BY_TYPE[clean(receipt.release_type,80)]||
      POLICY_BY_TYPE.other;
    const found=this.entityStore.filter(
      this.appKey,
      'SystemiaReleasePolicy',
      {policy_key:wanted,status:'active'},
      {sort:'-updated_at',limit:10}
    )[0]||null;
    if(found) return found;
    return {
      policy_key:wanted,
      name:'Fail-closed fallback',
      version:'fallback',
      require_hash:false,
      require_revision:true,
      require_exact_output_locator:true,
      require_source_truth:true,
      require_visual:false,
      require_execution:true,
      require_stale_check:true,
      require_human_confirmation:false,
      max_verification_age_minutes:1440,
      dependency_policy:'block_on_any_upstream_hold',
      release_on_pass:'send_ready',
      status:'active'
    };
  }

  loadDependencies(downstreamReceiptKey){
    return this.entityStore.filter(
      this.appKey,
      'SystemiaReleaseDependency',
      {downstream_receipt_key:clean(downstreamReceiptKey,1000),state:'active'},
      {sort:'-created_at',limit:250}
    );
  }

  dependencyEvidence(receipt,policy){
    const failures=[],pending=[],details=[];
    if(clean(policy.dependency_policy)==='ignore'){
      return {failures,pending,details,state:'not_applicable'};
    }

    const deps=this.loadDependencies(clean(receipt.receipt_key,1000));
    if(!deps.length) return {failures,pending,details,state:'not_applicable'};

    for(const dep of deps){
      const upstream=this.findReceipt(clean(dep.upstream_receipt_key,1000));
      if(!upstream){
        failures.push('dependency_missing:'+clean(dep.upstream_receipt_key,1000));
        details.push({dependency_key:dep.dependency_key,state:'missing'});
        continue;
      }
      const upstreamState=clean(upstream.release_state,80);
      const currentHash=clean(upstream.observed_hash||upstream.intended_hash,500).toLowerCase();
      const currentRevision=clean(upstream.observed_revision||upstream.intended_revision,500);
      const expectedHash=clean(dep.expected_upstream_hash,500).toLowerCase();
      const expectedRevision=clean(dep.expected_upstream_revision,500);
      let state='passed';
      const reasons=[];

      if(['blocked','superseded'].includes(upstreamState)){
        state='failed';
        reasons.push('upstream_'+upstreamState);
      }else if(!['send_ready','live'].includes(upstreamState)){
        state='pending';
        reasons.push('upstream_not_release_ready');
      }
      if(expectedHash&&currentHash&&expectedHash!==currentHash){
        state=policy.dependency_policy==='verify_on_upstream_change'?'pending':'failed';
        reasons.push('upstream_hash_changed');
      }
      if(expectedRevision&&currentRevision&&expectedRevision!==currentRevision){
        state=policy.dependency_policy==='verify_on_upstream_change'?'pending':'failed';
        reasons.push('upstream_revision_changed');
      }

      if(state==='failed') failures.push('dependency_failed:'+clean(dep.upstream_receipt_key,1000));
      if(state==='pending') pending.push('dependency_verify:'+clean(dep.upstream_receipt_key,1000));
      details.push({
        dependency_key:dep.dependency_key,
        upstream_receipt_key:dep.upstream_receipt_key,
        upstream_release_state:upstreamState,
        expected_hash:expectedHash||null,
        current_hash:currentHash||null,
        expected_revision:expectedRevision||null,
        current_revision:currentRevision||null,
        state,
        reasons
      });
    }
    return {
      failures:uniq(failures),
      pending:uniq(pending),
      details,
      state:failures.length?'failed':pending.length?'pending':'passed'
    };
  }

  requiredCheck(receipt,field,required,failures,pending){
    const value=receipt[field];
    if(value==='failed'){
      failures.push(field);
      return;
    }
    if(required&&!isPassedState(value)) pending.push(field);
  }

  evaluateReceipt(receipt){
    const policy=this.loadPolicy(receipt);
    const failures=[],pending=[];

    this.requiredCheck(receipt,'source_truth_state',Boolean(policy.require_source_truth),failures,pending);
    this.requiredCheck(receipt,'visual_state',Boolean(policy.require_visual),failures,pending);
    this.requiredCheck(receipt,'execution_state',Boolean(policy.require_execution),failures,pending);
    this.requiredCheck(receipt,'stale_output_check',Boolean(policy.require_stale_check),failures,pending);

    const humanRequired=Boolean(policy.require_human_confirmation)||clean(receipt.risk_tier,80)==='critical';
    this.requiredCheck(receipt,'human_confirmation_state',humanRequired,failures,pending);

    const intendedHash=clean(receipt.intended_hash,500).toLowerCase();
    const observedHash=clean(receipt.observed_hash,500).toLowerCase();
    if(policy.require_hash){
      if(!intendedHash) pending.push('intended_hash');
      if(!observedHash) pending.push('observed_hash');
    }
    if(intendedHash&&observedHash&&intendedHash!==observedHash) failures.push('hash_mismatch');

    const intendedRevision=clean(receipt.intended_revision,500);
    const observedRevision=clean(receipt.observed_revision,500);
    if(policy.require_revision){
      if(!intendedRevision) pending.push('intended_revision');
      if(!observedRevision) pending.push('observed_revision');
    }
    if(intendedRevision&&observedRevision&&intendedRevision!==observedRevision){
      failures.push('revision_mismatch');
    }

    if(policy.require_exact_output_locator&&!clean(receipt.exact_output_locator,4000)){
      pending.push('exact_output_locator');
    }

    const deps=this.dependencyEvidence(receipt,policy);
    failures.push(...deps.failures);
    pending.push(...deps.pending);

    const priorVerifiedAt=clean(receipt.verified_at,100);
    const ttl=Number(policy.max_verification_age_minutes||0);
    if(priorVerifiedAt&&ttl>0&&['send_ready','live'].includes(clean(receipt.release_state,80))){
      const expiry=new Date(priorVerifiedAt).getTime()+ttl*60000;
      if(Number.isFinite(expiry)&&this.clock().getTime()>expiry){
        pending.push('verification_expired');
      }
    }

    const uniqueFailures=uniq(failures);
    const uniquePending=uniq(pending);
    const releaseState=uniqueFailures.length
      ?'blocked'
      :uniquePending.length
        ?'verify'
        :clean(policy.release_on_pass,80)==='live'
          ?'live'
          :'send_ready';

    return {
      release_state:releaseState,
      failures:uniqueFailures,
      pending:uniquePending,
      dependency_state:deps.state,
      dependency_details:deps.details,
      policy,
      pass:['send_ready','live'].includes(releaseState),
      invariant:'Internal success is not proof of external reality. Exact user-facing output must match the intended revision and evidence.'
    };
  }

  appendEvent(receipt,action,previousState,nextState,reason,actor,evidence={}){
    const stamp=this.now();
    return this.entityStore.create(this.appKey,'SystemiaReleaseGateEvent',{
      event_key:`${clean(receipt.receipt_key,1000)}:${this.clock().getTime()}:${randomUUID().slice(0,8)}`,
      receipt_key:clean(receipt.receipt_key,1000),
      product:clean(receipt.product,500),
      surface:clean(receipt.surface,500),
      action:clean(action,120),
      previous_release_state:clean(previousState,80),
      next_release_state:clean(nextState,80),
      reason:clean(reason,4000),
      evidence_json:JSON.stringify(evidence||{}),
      actor:clean(actor,500),
      created_at:stamp
    }).record;
  }

  updateFromVerdict(receipt,verdict,actor,action='evaluated'){
    const previous=clean(receipt.release_state||'verify',80);
    const blockingReason=verdict.failures.length
      ?'Exact Output Gate failed: '+verdict.failures.join(', ')+'.'
      :verdict.pending.length
        ?'Exact Output Gate awaiting: '+verdict.pending.join(', ')+'.'
        :'';
    const verifiedAt=verdict.pass?this.now():null;
    const ttl=Number(verdict.policy.max_verification_age_minutes||0);
    const expiresAt=verifiedAt&&ttl>0?plusMinutes(verifiedAt,ttl):null;
    const update={
      policy_key:verdict.policy.policy_key,
      policy_snapshot_json:JSON.stringify({
        policy_key:verdict.policy.policy_key,
        version:verdict.policy.version,
        release_on_pass:verdict.policy.release_on_pass,
        max_verification_age_minutes:ttl,
        requirements:{
          hash:Boolean(verdict.policy.require_hash),
          revision:Boolean(verdict.policy.require_revision),
          exact_output_locator:Boolean(verdict.policy.require_exact_output_locator),
          source_truth:Boolean(verdict.policy.require_source_truth),
          visual:Boolean(verdict.policy.require_visual),
          execution:Boolean(verdict.policy.require_execution),
          stale_check:Boolean(verdict.policy.require_stale_check),
          human_confirmation:Boolean(verdict.policy.require_human_confirmation)
        },
        dependency_policy:verdict.policy.dependency_policy
      }),
      dependency_state:verdict.dependency_state,
      release_state:verdict.release_state,
      blocking_reason:blockingReason,
      verified_at:verifiedAt,
      verification_expires_at:expiresAt
    };
    const updated=this.entityStore.update(
      this.appKey,'SystemiaReleaseReceipt',receipt.id,update
    ).record;
    const eventAction=verdict.release_state==='blocked'
      ?'blocked'
      :verdict.pending.includes('verification_expired')
        ?'expired'
        :verdict.pass&&previous!==verdict.release_state
          ?'cleared'
          :action;
    this.appendEvent(
      {...receipt,...update},
      eventAction,
      previous,
      verdict.release_state,
      blockingReason||'Exact output evidence evaluated under versioned release policy.',
      actor,
      {
        failures:verdict.failures,
        pending:verdict.pending,
        dependency_state:verdict.dependency_state,
        dependency_details:verdict.dependency_details,
        policy_key:verdict.policy.policy_key,
        policy_version:verdict.policy.version,
        intended_hash:receipt.intended_hash||null,
        observed_hash:receipt.observed_hash||null,
        intended_revision:receipt.intended_revision||null,
        observed_revision:receipt.observed_revision||null,
        verification_expires_at:expiresAt
      }
    );
    return {updated,update};
  }

  cascadeDownstream(upstream,actor,reason){
    const deps=this.entityStore.filter(
      this.appKey,
      'SystemiaReleaseDependency',
      {upstream_receipt_key:clean(upstream.receipt_key,1000),state:'active'},
      {sort:'-created_at',limit:250}
    );
    const affected=[];
    for(const dep of deps){
      const downstream=this.findReceipt(clean(dep.downstream_receipt_key,1000));
      if(!downstream||clean(downstream.release_state,80)==='superseded') continue;
      const previous=clean(downstream.release_state||'verify',80);
      const patch={
        dependency_state:'failed',
        release_state:'blocked',
        blocking_reason:
          'Upstream release dependency reopened: '+clean(upstream.receipt_key,1000)+'. '+reason,
        verified_at:null,
        verification_expires_at:null
      };
      this.entityStore.update(this.appKey,'SystemiaReleaseReceipt',downstream.id,patch);
      this.appendEvent(
        {...downstream,...patch},
        'dependency_reopen',
        previous,
        'blocked',
        patch.blocking_reason,
        actor,
        {
          dependency_key:dep.dependency_key,
          upstream_receipt_key:upstream.receipt_key,
          upstream_release_state:upstream.release_state,
          upstream_intended_hash:upstream.intended_hash||null,
          upstream_observed_hash:upstream.observed_hash||null
        }
      );
      affected.push(clean(downstream.receipt_key,1000));
    }
    return affected;
  }

  sweep({limit=100,actor='systemia-machine'}={}){
    const max=Math.min(250,Math.max(1,Number(limit)||100));
    const receipts=this.entityStore.list(
      this.appKey,'SystemiaReleaseReceipt',{sort:'-created_at',limit:max}
    );
    const results=[];
    for(const receipt of receipts){
      if(clean(receipt.release_state,80)==='superseded') continue;
      const verdict=this.evaluateReceipt(receipt);
      const {updated}=this.updateFromVerdict(receipt,verdict,actor,'sweep_evaluated');
      results.push({
        receipt_key:receipt.receipt_key,
        release_state:updated.release_state||verdict.release_state,
        failures:verdict.failures,
        pending:verdict.pending
      });
    }
    return {ok:true,action:'sweep',evaluated:results.length,results};
  }

  linkDependency({
    receipt_key,
    upstream_receipt_key,
    dependency_key='',
    notes=''
  }={},actor='systemia-machine'){
    const receiptKey=clean(receipt_key,1000);
    const receipt=this.findReceipt(receiptKey);
    if(!receipt) throw new Error('receipt_not_found');
    const upstreamKey=clean(upstream_receipt_key,1000);
    if(!upstreamKey) throw new Error('upstream_receipt_key_required');
    if(upstreamKey===receiptKey) throw new Error('self_dependency_not_allowed');
    const upstream=this.findReceipt(upstreamKey);
    if(!upstream) throw new Error('upstream_receipt_not_found');
    const depKey=clean(dependency_key,1500)||upstreamKey+'->'+receiptKey;
    const existing=this.entityStore.filter(
      this.appKey,'SystemiaReleaseDependency',
      {dependency_key:depKey,state:'active'},
      {sort:'-created_at',limit:10}
    );
    if(!existing.length){
      this.entityStore.create(this.appKey,'SystemiaReleaseDependency',{
        dependency_key:depKey,
        upstream_receipt_key:upstreamKey,
        downstream_receipt_key:receiptKey,
        upstream_product:clean(upstream.product,500),
        downstream_product:clean(receipt.product,500),
        expected_upstream_hash:clean(upstream.observed_hash||upstream.intended_hash,500),
        expected_upstream_revision:clean(upstream.observed_revision||upstream.intended_revision,500),
        state:'active',
        last_checked_at:this.now(),
        notes:clean(notes,4000),
        created_at:this.now()
      });
    }
    this.appendEvent(
      receipt,'dependency_linked',
      clean(receipt.release_state,80),
      clean(receipt.release_state,80),
      'Linked upstream release dependency '+upstreamKey+'.',
      actor,
      {upstream_receipt_key:upstreamKey,dependency_key:depKey}
    );
    const verdict=this.evaluateReceipt(receipt);
    const {updated}=this.updateFromVerdict(receipt,verdict,actor);
    return {ok:true,action:'link-dependency',dependency_key:depKey,verdict,receipt:updated};
  }

  reopen({
    receipt_key,
    reason='',
    stale_output_check='failed',
    visual_state,
    evidence=null
  }={},actor='systemia-machine'){
    const receipt=this.findReceipt(clean(receipt_key,1000));
    if(!receipt) throw new Error('receipt_not_found');
    const previous=clean(receipt.release_state||'verify',80);
    const patch={
      human_confirmation_state:'failed',
      stale_output_check:stale_output_check||'failed',
      visual_state:visual_state||receipt.visual_state||'failed',
      release_state:'blocked',
      blocking_reason:clean(reason,4000)||
        'A human-visible exact output contradicted internal success signals. Release gate reopened automatically.',
      verified_at:null,
      verification_expires_at:null
    };
    const updated=this.entityStore.update(
      this.appKey,'SystemiaReleaseReceipt',receipt.id,patch
    ).record;
    this.appendEvent(
      {...receipt,...patch},
      'human_override_reopen',
      previous,
      'blocked',
      patch.blocking_reason,
      actor,
      {reported_by_human:true,supplied:evidence}
    );
    const downstream=this.cascadeDownstream(
      {...receipt,...patch},
      actor,
      'Human-visible contradiction on upstream exact output.'
    );
    return {
      ok:true,
      action:'human_override_reopen',
      release_state:'blocked',
      receipt:updated,
      downstream_reopened:downstream,
      rule:'Human-visible contradiction reopens this release and its downstream dependents immediately.'
    };
  }

  supersede({
    receipt_key,
    reason='',
    successor_receipt_key=''
  }={},actor='systemia-machine'){
    const receipt=this.findReceipt(clean(receipt_key,1000));
    if(!receipt) throw new Error('receipt_not_found');
    const previous=clean(receipt.release_state||'verify',80);
    const patch={
      release_state:'superseded',
      blocking_reason:clean(reason,4000)||'Superseded by a newer release receipt.',
      verified_at:null,
      verification_expires_at:null
    };
    const updated=this.entityStore.update(
      this.appKey,'SystemiaReleaseReceipt',receipt.id,patch
    ).record;
    this.appendEvent(
      {...receipt,...patch},
      'superseded',
      previous,
      'superseded',
      patch.blocking_reason,
      actor,
      {successor_receipt_key:clean(successor_receipt_key,1000)||null}
    );
    const downstream=this.cascadeDownstream(
      {...receipt,...patch},
      actor,
      'Upstream receipt was superseded.'
    );
    return {ok:true,action:'supersede',receipt:updated,downstream_reopened:downstream};
  }

  evaluate(body={},actor='systemia-machine'){
    const receiptKey=clean(body.receipt_key,1000);
    if(!receiptKey) throw new Error('receipt_key_required');
    const receipt=this.findReceipt(receiptKey);
    if(!receipt) throw new Error('receipt_not_found');

    const allowedPatch=[
      'observed_revision','observed_hash','exact_output_locator',
      'source_truth_state','visual_state','execution_state',
      'stale_output_check','human_confirmation_state',
      'probe_state','last_probe_at','risk_tier',
      'policy_key','evidence_json'
    ];
    const patch={};
    for(const key of allowedPatch){
      if(body[key]!==undefined) patch[key]=body[key];
    }
    const merged={...receipt,...patch};
    const verdict=this.evaluateReceipt(merged);
    const previous=clean(receipt.release_state||'verify',80);
    const blockingReason=verdict.failures.length
      ?'Exact Output Gate failed: '+verdict.failures.join(', ')+'.'
      :verdict.pending.length
        ?'Exact Output Gate awaiting: '+verdict.pending.join(', ')+'.'
        :'';
    const verifiedAt=verdict.pass?this.now():null;
    const ttl=Number(verdict.policy.max_verification_age_minutes||0);
    const expiresAt=verifiedAt&&ttl>0?plusMinutes(verifiedAt,ttl):null;
    const update={
      ...patch,
      policy_key:verdict.policy.policy_key,
      policy_snapshot_json:JSON.stringify({
        policy_key:verdict.policy.policy_key,
        version:verdict.policy.version,
        max_verification_age_minutes:ttl,
        release_on_pass:verdict.policy.release_on_pass,
        dependency_policy:verdict.policy.dependency_policy
      }),
      dependency_state:verdict.dependency_state,
      release_state:verdict.release_state,
      blocking_reason:blockingReason,
      verified_at:verifiedAt,
      verification_expires_at:expiresAt
    };
    const updated=this.entityStore.update(
      this.appKey,'SystemiaReleaseReceipt',receipt.id,update
    ).record;
    const eventAction=verdict.release_state==='blocked'
      ?'blocked'
      :verdict.pass&&previous!==verdict.release_state
        ?'cleared'
        :'evaluated';
    this.appendEvent(
      {...merged,...update},
      eventAction,
      previous,
      verdict.release_state,
      blockingReason||'Exact output evidence evaluated under versioned release policy.',
      actor,
      {
        failures:verdict.failures,
        pending:verdict.pending,
        dependency_state:verdict.dependency_state,
        dependency_details:verdict.dependency_details,
        policy_key:verdict.policy.policy_key,
        policy_version:verdict.policy.version,
        intended_hash:merged.intended_hash||null,
        observed_hash:merged.observed_hash||null,
        intended_revision:merged.intended_revision||null,
        observed_revision:merged.observed_revision||null,
        verification_expires_at:expiresAt
      }
    );
    let downstream=[];
    if(verdict.release_state==='blocked'){
      downstream=this.cascadeDownstream(
        {...merged,...update},
        actor,
        blockingReason||'Upstream release failed Exact Output Gate.'
      );
    }
    return {ok:true,action:clean(body.action,80)||'evaluate',verdict,receipt:updated,downstream_reopened:downstream};
  }

  execute(body={},actor='systemia-machine'){
    const action=clean(body.action||'evaluate',80).toLowerCase();
    if(action==='sweep') return this.sweep({limit:body.limit,actor});
    if(action==='link-dependency') return this.linkDependency(body,actor);
    if(action==='human-mismatch'||action==='reopen') return this.reopen(body,actor);
    if(action==='supersede') return this.supersede(body,actor);
    if(action==='evaluate'||action==='attest') return this.evaluate(body,actor);
    throw new Error('unsupported_action');
  }

  health(){
    return {
      schema:'evercraft.exact-output-gate.health.v1',
      state:'healthy',
      owned_entity_store:true,
      human_visible_mismatch_reopens_release:true,
      downstream_dependency_cascade:true,
      verification_expiry:true,
      source_platform_dependency:false,
      automatic_external_release:false
    };
  }
}
