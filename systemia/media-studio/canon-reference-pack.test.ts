import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCanonReferencePack,
  environmentReferencesFromCanon,
  identityReferencesFromCanon,
  type CanonReferencePackInput,
} from './canon-reference-pack.js';
import type { VisualReference } from './model-fabric.js';

function ref(id:string,role:'identity'|'environment',digestChar:string,assetId:string):VisualReference{
  return {
    id,
    kind:'image',
    role,
    digest:digestChar.repeat(64),
    sourceRefs:['source:'+id],
    locators:[
      {kind:'url',value:'https://assets.example/'+id+'.png'},
      {kind:'provider_asset',providerId:'elevenlabs',value:assetId}
    ]
  };
}

function input():CanonReferencePackInput{
  return {
    schema:'evercraft.fallen.canon-reference-pack-input.v1',
    id:'golden-bridge-canon',
    sourceRefs:['book:watcher-mask','benchmark:golden-bridge'],
    entities:[
      {
        entityId:'eli',kind:'character',displayName:'Eli',
        immutableTraits:{hair:'dark',mask:'Watcher mask',coat:'weathered dark coat'},
        references:[{
          id:'eli-front',entityId:'eli',reference:ref('eli-front','identity','a','asset-eli-front'),
          rights:'owned',approvalState:'approved',sourceRefs:['user-approved:eli-front']
        }]
      },
      {
        entityId:'fox',kind:'character',displayName:'Fox',
        immutableTraits:{coat:'ember-red',tail:'white tip'},
        references:[{
          id:'fox-side',entityId:'fox',reference:ref('fox-side','identity','b','asset-fox-side'),
          rights:'owned',approvalState:'approved',sourceRefs:['user-approved:fox-side']
        }]
      },
      {
        entityId:'bridge',kind:'location',displayName:'Amber Bridge',
        immutableTraits:{damage:'fractured right rail',weather:'storm night'},
        references:[{
          id:'bridge-wide',entityId:'bridge',reference:ref('bridge-wide','environment','c','asset-bridge-wide'),
          rights:'owned',approvalState:'approved',sourceRefs:['user-approved:bridge-wide']
        }]
      }
    ]
  };
}

test('builds one immutable canon digest plus a separate provider-materialization digest',()=>{
  const pack=buildCanonReferencePack(input());
  assert.equal(pack.entities.length,3);
  assert.equal(pack.canonDigest.length,64);
  assert.equal(pack.materializationDigest.length,64);
  assert.ok(pack.providerCoverage.includes('elevenlabs'));
  assert.ok(pack.providerCoverage.includes('portable:url'));
  assert.equal(pack.boundaries.canonDigestExcludesProviderLocatorValues,true);
});

test('changing only a provider asset id does not redefine canon, but does change materialization state',()=>{
  const a=buildCanonReferencePack(input());
  const changed=input();
  const target=changed.entities[0].references[0].reference.locators?.find(
    locator=>locator.kind==='provider_asset'
  );
  if(target&&target.kind==='provider_asset') target.value='new-provider-asset-id';
  const b=buildCanonReferencePack(changed);
  assert.equal(a.canonDigest,b.canonDigest);
  assert.notEqual(a.materializationDigest,b.materializationDigest);
});

test('changing approved visual bytes changes canon digest',()=>{
  const a=buildCanonReferencePack(input());
  const changed=input();
  changed.entities[0].references[0].reference.digest='9'.repeat(64);
  const b=buildCanonReferencePack(changed);
  assert.notEqual(a.canonDigest,b.canonDigest);
});

test('cinematic identity and environment maps are derived without changing canonical digests',()=>{
  const pack=buildCanonReferencePack(input());
  const identity=identityReferencesFromCanon(pack);
  const environment=environmentReferencesFromCanon(pack);
  assert.deepEqual(Object.keys(identity).sort(),['eli','fox']);
  assert.deepEqual(Object.keys(environment),['bridge']);
  assert.equal(identity.eli[0].digest,'a'.repeat(64));
  assert.equal(environment.bridge[0].digest,'c'.repeat(64));
});

test('unapproved, untraceable or unmaterialized assets fail closed',()=>{
  const unapproved=input();
  (unapproved.entities[0].references[0] as any).approvalState='pending';
  assert.throws(()=>buildCanonReferencePack(unapproved),/canon_reference_asset_not_approved/);

  const noSource=input();
  noSource.entities[0].references[0].sourceRefs=[];
  assert.throws(()=>buildCanonReferencePack(noSource),/canon_reference_source_refs_missing/);

  const noLocator=input();
  noLocator.entities[0].references[0].reference.locators=[];
  assert.throws(()=>buildCanonReferencePack(noLocator),/canon_reference_materialization_missing/);
});
