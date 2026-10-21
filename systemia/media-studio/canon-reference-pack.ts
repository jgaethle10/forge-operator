import crypto from 'node:crypto';
import type { VisualReference, VisualReferenceLocator } from './model-fabric.js';

export type CanonEntityKind='character'|'location'|'prop'|'style'|'voice';
export type CanonRights='owned'|'licensed';
export type CanonApprovalState='approved';

export interface CanonReferenceAsset {
  id:string;
  entityId:string;
  reference:VisualReference;
  rights:CanonRights;
  approvalState:CanonApprovalState;
  sourceRefs:string[];
  notes?:string;
}

export interface CanonReferenceEntityInput {
  entityId:string;
  kind:CanonEntityKind;
  displayName:string;
  immutableTraits?:Record<string,string>;
  references:CanonReferenceAsset[];
}

export interface CanonReferencePackInput {
  schema:'evercraft.fallen.canon-reference-pack-input.v1';
  id:string;
  entities:CanonReferenceEntityInput[];
  sourceRefs:string[];
}

export interface CanonReferenceEntity {
  entityId:string;
  kind:CanonEntityKind;
  displayName:string;
  immutableTraits:Record<string,string>;
  references:Array<{
    id:string;
    role:VisualReference['role'];
    kind:VisualReference['kind'];
    digest:string;
    rights:CanonRights;
    sourceRefs:string[];
    locators:VisualReferenceLocator[];
    notes?:string;
  }>;
}

export interface CanonReferencePack {
  schema:'evercraft.fallen.canon-reference-pack.v1';
  id:string;
  entities:CanonReferenceEntity[];
  sourceRefs:string[];
  canonDigest:string;
  materializationDigest:string;
  providerCoverage:string[];
  boundaries:{
    canonDigestExcludesProviderLocatorValues:true;
    materializationDigestIncludesProviderLocators:true;
    onlyApprovedOwnedOrLicensedAssets:true;
    exactAssetDigestsRequired:true;
    sourceLineageRequired:true;
    publicationAuthorityGranted:false;
  };
  createdAt:string;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normalizeDigest(value:string|undefined,label:string){
  const clean=(value??'').replace(/^sha256:/,'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(clean)) throw new Error('canon_reference_digest_invalid:'+label);
  return clean;
}

function locators(ref:VisualReference){
  const values=[
    ...(ref.locator?[ref.locator]:[]),
    ...(ref.locators??[]),
  ];
  const seen=new Set<string>();
  return values.filter(locator=>{
    const key=JSON.stringify(locator);
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function expectedRole(kind:CanonEntityKind){
  if(kind==='character') return 'identity';
  if(kind==='location') return 'environment';
  if(kind==='prop') return 'product';
  if(kind==='voice') return 'dialogue_audio';
  return 'style';
}

function providerCoverageForLocator(locator:VisualReferenceLocator){
  if(locator.kind==='provider_asset'||locator.kind==='provider_generation'){
    return locator.providerId;
  }
  return 'portable:'+locator.kind;
}

export function buildCanonReferencePack(
  input:CanonReferencePackInput,
):CanonReferencePack{
  if(input.schema!=='evercraft.fallen.canon-reference-pack-input.v1'){
    throw new Error('canon_reference_pack_schema_invalid');
  }
  if(!input.id?.trim()) throw new Error('canon_reference_pack_id_missing');
  if(!input.entities.length) throw new Error('canon_reference_pack_entities_missing');
  if(!input.sourceRefs?.length) throw new Error('canon_reference_pack_source_refs_missing');

  const entityIds=new Set<string>();
  const assetIds=new Set<string>();
  const entities:CanonReferenceEntity[]=[];

  for(const entity of input.entities){
    if(!entity.entityId?.trim()) throw new Error('canon_reference_entity_id_missing');
    if(entityIds.has(entity.entityId)) throw new Error('canon_reference_duplicate_entity:'+entity.entityId);
    entityIds.add(entity.entityId);
    if(!entity.displayName?.trim()) throw new Error('canon_reference_display_name_missing:'+entity.entityId);
    if(!entity.references.length) throw new Error('canon_reference_entity_assets_missing:'+entity.entityId);

    const role=expectedRole(entity.kind);
    const refs=entity.references.map(asset=>{
      if(asset.entityId!==entity.entityId){
        throw new Error('canon_reference_asset_entity_mismatch:'+asset.id);
      }
      if(assetIds.has(asset.id)) throw new Error('canon_reference_duplicate_asset:'+asset.id);
      assetIds.add(asset.id);
      if(asset.approvalState!=='approved') throw new Error('canon_reference_asset_not_approved:'+asset.id);
      if(asset.rights!=='owned'&&asset.rights!=='licensed'){
        throw new Error('canon_reference_rights_invalid:'+asset.id);
      }
      if(!asset.sourceRefs?.length||!asset.reference.sourceRefs?.length){
        throw new Error('canon_reference_source_refs_missing:'+asset.id);
      }
      if(asset.reference.role!==role){
        throw new Error('canon_reference_role_invalid:'+asset.id+':expected_'+role);
      }
      if(
        (entity.kind==='character'||entity.kind==='location')&&
        asset.reference.kind!=='image'&&asset.reference.kind!=='video'
      ){
        throw new Error('canon_reference_media_kind_invalid:'+asset.id);
      }
      if(entity.kind==='voice'&&asset.reference.kind!=='audio'){
        throw new Error('canon_reference_media_kind_invalid:'+asset.id);
      }
      const referenceLocators=locators(asset.reference);
      if(!referenceLocators.length){
        throw new Error('canon_reference_materialization_missing:'+asset.id);
      }
      return {
        id:asset.id,
        role:asset.reference.role,
        kind:asset.reference.kind,
        digest:normalizeDigest(asset.reference.digest,asset.id),
        rights:asset.rights,
        sourceRefs:[...new Set([...asset.sourceRefs,...asset.reference.sourceRefs])].sort(),
        locators:referenceLocators,
        notes:asset.notes,
      };
    }).sort((a,b)=>a.id.localeCompare(b.id));

    entities.push({
      entityId:entity.entityId,
      kind:entity.kind,
      displayName:entity.displayName.trim(),
      immutableTraits:Object.fromEntries(
        Object.entries(entity.immutableTraits??{}).sort(([a],[b])=>a.localeCompare(b))
      ),
      references:refs,
    });
  }

  entities.sort((a,b)=>a.entityId.localeCompare(b.entityId));

  const canonCore=entities.map(entity=>({
    entityId:entity.entityId,
    kind:entity.kind,
    displayName:entity.displayName,
    immutableTraits:entity.immutableTraits,
    references:entity.references.map(ref=>({
      id:ref.id,
      role:ref.role,
      kind:ref.kind,
      digest:ref.digest,
      rights:ref.rights,
      sourceRefs:ref.sourceRefs,
      notes:ref.notes,
    })),
  }));

  const materializationCore=entities.map(entity=>({
    entityId:entity.entityId,
    references:entity.references.map(ref=>({
      id:ref.id,
      digest:ref.digest,
      locators:ref.locators,
    })),
  }));

  const providerCoverage=[...new Set(
    entities.flatMap(entity=>
      entity.references.flatMap(ref=>ref.locators.map(providerCoverageForLocator))
    )
  )].sort();

  return {
    schema:'evercraft.fallen.canon-reference-pack.v1',
    id:input.id,
    entities,
    sourceRefs:[...new Set(input.sourceRefs)].sort(),
    canonDigest:digest(canonCore),
    materializationDigest:digest(materializationCore),
    providerCoverage,
    boundaries:{
      canonDigestExcludesProviderLocatorValues:true,
      materializationDigestIncludesProviderLocators:true,
      onlyApprovedOwnedOrLicensedAssets:true,
      exactAssetDigestsRequired:true,
      sourceLineageRequired:true,
      publicationAuthorityGranted:false,
    },
    createdAt:new Date().toISOString(),
  };
}

export function identityReferencesFromCanon(
  pack:CanonReferencePack,
):Record<string,VisualReference[]>{
  const out:Record<string,VisualReference[]>={};
  for(const entity of pack.entities.filter(entity=>entity.kind==='character')){
    out[entity.entityId]=entity.references.map(ref=>({
      id:ref.id,
      kind:ref.kind,
      role:'identity',
      digest:ref.digest,
      sourceRefs:ref.sourceRefs,
      locators:ref.locators,
    }));
  }
  return out;
}

export function environmentReferencesFromCanon(
  pack:CanonReferencePack,
):Record<string,VisualReference[]>{
  const out:Record<string,VisualReference[]>={};
  for(const entity of pack.entities.filter(entity=>entity.kind==='location')){
    out[entity.entityId]=entity.references.map(ref=>({
      id:ref.id,
      kind:ref.kind,
      role:'environment',
      digest:ref.digest,
      sourceRefs:ref.sourceRefs,
      locators:ref.locators,
    }));
  }
  return out;
}


export function dialogueAudioReferencesFromCanon(
  pack:CanonReferencePack,
):Record<string,VisualReference[]>{
  const out:Record<string,VisualReference[]>={};
  for(const entity of pack.entities.filter(entity=>entity.kind==='voice')){
    out[entity.entityId]=entity.references.map(ref=>({
      id:ref.id,
      kind:'audio',
      role:'dialogue_audio',
      digest:ref.digest,
      sourceRefs:ref.sourceRefs,
      locators:ref.locators,
    }));
  }
  return out;
}
