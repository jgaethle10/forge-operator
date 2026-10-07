const clean=(value)=>String(value??'').trim();
const clone=(value)=>structuredClone(value||{});

export const PEOPLE_LEGACY_ENTITIES=new Set([
  'PeopleBrain',
  'PeopleMemory',
  'PeopleRelationship',
  'PeopleOpportunity',
  'PeopleConsentEvent',
  'PeopleShareReceipt',
  'PeopleDataRequest',
  'PeopleInvite',
  'PeopleIdentityChallenge',
  'PeopleIdentityDeliveryReceipt',
]);

function lineage(entity,row,index){
  return {
    schema:'evercraft.people.legacy-lineage.v1',
    source_platform:'base44',
    source_entity:entity,
    source_record_id:clean(row?.id)||null,
    record_key:`legacy:${entity}:${clean(row?.id)||String(index)}`,
  };
}

function stripProviderFields(row){
  const out=clone(row);
  for(const key of ['id','created_date','updated_date','created_by_id','is_sample']) delete out[key];
  return out;
}

function safeRow(entity,row,index){
  const out=stripProviderFields(row);
  const migration_lineage=lineage(entity,row,index);

  if(entity==='PeopleBrain'){
    return {
      brain_key:clean(out.brain_key),
      display_name:clean(out.display_name),
      person_type:clean(out.person_type)||'other',
      sport_or_domain:clean(out.sport_or_domain),
      anchor_organization:clean(out.anchor_organization),
      ownership_model:'person_sovereign',
      portability_state:clean(out.portability_state)||'portable',
      consent_state:clean(out.consent_state)||'not_invited',
      identity_assurance:clean(out.identity_assurance)||'unverified',
      domains_enabled:Array.isArray(out.domains_enabled)?out.domains_enabled.map(clean).filter(Boolean):[],
      lifecycle_state:clean(out.lifecycle_state)||'pilot',
      goals:Array.isArray(out.goals)?out.goals.map(clean).filter(Boolean):[],
      owner_identity_ref:clean(out.owner_identity_ref),
      private_summary:clean(out.private_summary),
      mission_key:clean(out.mission_key),
      created_at:clean(out.created_at)||null,
      updated_at:clean(out.updated_at)||null,
      migration_lineage,
    };
  }

  if(entity==='PeopleInvite'){
    return {
      invite_key:clean(out.invite_key),
      brain_key:clean(out.brain_key),
      token_hash:clean(out.token_hash),
      scopes:Array.isArray(out.scopes)?out.scopes.map(clean).filter(Boolean):[],
      policy_version:clean(out.policy_version)||'people-layer-consent-v1',
      status:clean(out.status)||'expired',
      expires_at:clean(out.expires_at)||null,
      accepted_at:clean(out.accepted_at)||null,
      created_at:clean(out.created_at)||null,
      migration_lineage,
    };
  }

  if(entity==='PeopleIdentityChallenge'){
    return {
      challenge_key:clean(out.challenge_key),
      brain_key:clean(out.brain_key),
      token_hash:clean(out.token_hash),
      email_hash:clean(out.email_hash),
      email_hint:clean(out.email_hint),
      status:clean(out.status)||'expired',
      delivery_state:clean(out.delivery_state)||'not_sent',
      expires_at:clean(out.expires_at)||null,
      verified_at:clean(out.verified_at)||null,
      created_at:clean(out.created_at)||null,
      migration_lineage,
    };
  }

  return {
    ...out,
    migration_lineage,
  };
}

function exclusionReason(entity,record,{excludeArchived=true}={}){
  if(entity==='PeopleBrain'){
    if(!record.brain_key||!record.display_name)return 'brain_identity_missing';
    if(excludeArchived&&record.lifecycle_state==='archived')return 'archived_brain';
  }
  if(entity==='PeopleInvite'&&(!record.invite_key||!record.brain_key||!record.token_hash))return 'invite_identity_or_hash_missing';
  if(entity==='PeopleIdentityChallenge'&&(!record.challenge_key||!record.brain_key||!record.token_hash||!record.email_hash))return 'identity_challenge_hash_boundary_missing';
  return '';
}

export function adaptLegacyPeopleEntity({entityName,rows=[],excludeArchived=true}={}){
  if(!PEOPLE_LEGACY_ENTITIES.has(entityName))throw new Error('unsupported_people_legacy_entity:'+clean(entityName));
  if(!Array.isArray(rows))throw new Error('rows_must_be_array');

  const records=[];
  const exclusions=[];
  rows.forEach((row,index)=>{
    if(!row||typeof row!=='object'){
      exclusions.push({index,reason:'invalid_row'});
      return;
    }
    const record=safeRow(entityName,row,index);
    const reason=exclusionReason(entityName,record,{excludeArchived});
    if(reason){
      exclusions.push({
        source_record_id:clean(row.id)||null,
        record_key:record.migration_lineage.record_key,
        reason,
      });
      return;
    }
    records.push(record);
  });

  return {
    schema:'evercraft.people.legacy-domain-adapter.v1',
    source_entity:entityName,
    submitted:rows.length,
    accepted:records.length,
    excluded:exclusions.length,
    records,
    exclusions,
    semantics:'One-shot extraction adapter only. Base44 is never runtime authority. Raw invite tokens and raw email addresses are not accepted because the owned People state requires hash-only identity material.',
  };
}

export function summarizePeopleMigration(snapshot={}){
  const entities={};
  let submitted=0;
  let accepted=0;
  let excluded=0;

  for(const entityName of PEOPLE_LEGACY_ENTITIES){
    const result=adaptLegacyPeopleEntity({
      entityName,
      rows:Array.isArray(snapshot[entityName])?snapshot[entityName]:[],
      excludeArchived:true,
    });
    entities[entityName]={
      submitted:result.submitted,
      accepted:result.accepted,
      excluded:result.excluded,
      exclusions:result.exclusions,
    };
    submitted+=result.submitted;
    accepted+=result.accepted;
    excluded+=result.excluded;
  }

  return {
    schema:'evercraft.people.legacy-migration-summary.v1',
    submitted,
    accepted,
    excluded,
    real_person_migration_required:accepted>0,
    entities,
    runtime_authority:'forge-operator/systemia',
    source_platform_role:'retired_extraction_source_only',
  };
}
