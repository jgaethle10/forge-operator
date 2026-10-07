import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LiveWorldAuthoringSession,
  applyWorldEditTransaction,
  createWorldAssetManifest,
  semanticAssetManifestDigest,
  semanticWorldDigest,
  verifyWorldAssetManifest,
  verifyWorldEditReceipt,
  type WorldEditTransaction,
  type WorldAssetRecord
} from './studio-edit.js';
import {
  applyGeometryHotReload,
  geometryAssetDigest,
  type GeometryAsset
} from './webgpu.js';
import { worldDefinitionDigest, type WorldDefinition } from './engine.js';

const SHA_A='a'.repeat(64);
const SHA_B='b'.repeat(64);

function asset(sha256=SHA_A,revision=1):WorldAssetRecord{
  return {
    id:'geometry:hero',
    kind:'geometry',
    revision,
    sha256,
    uri:'evercraft://assets/geometry/hero',
    contentType:'application/vnd.evercraft.geometry+json',
    provenance:{
      sourceRef:'fallen:studio:hero-geometry',
      rightsState:'owned',
      license:'Evercraft-owned'
    }
  };
}

function geometry(scale=1):GeometryAsset{
  return {
    schema:'evercraft.world-engine.geometry.v1',
    id:'geometry:hero',
    primitive:'triangles',
    positions:[
      -scale,-scale,0,
      scale,-scale,0,
      0,scale,0
    ],
    normals:[
      0,0,1,
      0,0,1,
      0,0,1
    ]
  };
}

function world():WorldDefinition{
  return {
    schema:'evercraft.world-engine.world.v1',
    id:'live-edit-proof',
    version:1,
    tickRateHz:60,
    gravity:{x:0,y:0,z:0},
    visualScene:{
      schema:'evercraft.world-engine.visual-scene.v1',
      initialCameraEntityId:'camera',
      clearColor:{r:.01,g:.02,b:.03},
      materials:[
        {
          id:'hero-material',
          model:'pbr',
          baseColor:{r:.7,g:.8,b:.9,a:1},
          metallic:.1,
          roughness:.8
        }
      ]
    },
    entities:[
      {
        id:'camera',
        transform:{position:{x:0,y:1,z:5}},
        camera:{
          projection:{type:'perspective',fovYDeg:60},
          near:.1,
          far:100
        }
      },
      {
        id:'hero',
        transform:{position:{x:0,y:0,z:0}},
        renderable:{
          geometryRef:'geometry:hero',
          materialId:'hero-material'
        },
        assetRefs:['geometry:hero']
      }
    ]
  };
}

function transaction(
  source:WorldDefinition,
  manifest:ReturnType<typeof createWorldAssetManifest>,
  operations:WorldEditTransaction['operations']
):WorldEditTransaction{
  return {
    schema:'evercraft.world-engine.edit-transaction.v1',
    id:'edit-001',
    worldId:source.id,
    baseWorldDigest:worldDefinitionDigest(source),
    baseAssetManifestDigest:manifest.digest,
    actor:{kind:'human',id:'studio-user'},
    reason:'Live Studio adjustment',
    operations
  };
}

test('asset manifest is deterministic, sorted and digest verified',()=>{
  const other:WorldAssetRecord={
    id:'texture:hero',
    kind:'texture',
    revision:1,
    sha256:'c'.repeat(64),
    uri:'evercraft://assets/texture/hero',
    provenance:{
      sourceRef:'fallen:studio:hero-texture',
      rightsState:'licensed',
      license:'licensed-test'
    }
  };
  const first=createWorldAssetManifest('live-edit-proof',[other,asset()]);
  const second=createWorldAssetManifest('live-edit-proof',[asset(),other]);

  assert.equal(first.digest,second.digest);
  assert.deepEqual(first.assets.map(row=>row.id),['geometry:hero','texture:hero']);
  assert.equal(verifyWorldAssetManifest(first),true);

  const tampered=structuredClone(first);
  tampered.assets[0].sha256=SHA_B;
  assert.equal(verifyWorldAssetManifest(tampered),false);
});

test('one live edit can change world state, material and asset lineage deterministically',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const tx=transaction(source,manifest,[
    {
      id:'move-hero',
      kind:'set_transform',
      entityId:'hero',
      value:{position:{x:3,y:1,z:-2},rotationDeg:{x:0,y:45,z:0},scale:{x:1,y:1,z:1}}
    },
    {
      id:'annotate-hero',
      kind:'set_property',
      entityId:'hero',
      key:'studio_note',
      value:'hero moved'
    },
    {
      id:'material-hero',
      kind:'upsert_material',
      material:{
        id:'hero-material',
        model:'pbr',
        baseColor:{r:.2,g:.4,b:.9,a:1},
        metallic:.7,
        roughness:.25
      }
    },
    {
      id:'asset-hero',
      kind:'upsert_asset',
      asset:asset(SHA_B,2)
    }
  ]);

  const first=applyWorldEditTransaction(source,manifest,tx);
  const second=applyWorldEditTransaction(source,manifest,tx);

  assert.equal(first.receipt.digest,second.receipt.digest);
  assert.equal(first.receipt.afterWorldDigest,second.receipt.afterWorldDigest);
  assert.equal(first.assets.digest,second.assets.digest);
  assert.equal(first.world.version,2);
  assert.equal(first.assets.revision,2);
  assert.equal(first.world.entities.find(row=>row.id==='hero')!.transform.position.x,3);
  assert.equal(first.world.entities.find(row=>row.id==='hero')!.properties!.studio_note,'hero moved');
  assert.equal(first.world.visualScene!.materials[0].metallic,.7);
  assert.deepEqual(first.receipt.changedEntityIds,['hero']);
  assert.deepEqual(first.receipt.changedMaterialIds,['hero-material']);
  assert.deepEqual(first.receipt.changedAssetIds,['geometry:hero']);
  assert.deepEqual(first.receipt.hotReloadAssetIds,['geometry:hero']);
  assert.equal(verifyWorldEditReceipt(first.receipt),true);
});

test('inverse transaction restores semantic world and asset content while revisions remain monotonic',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const sourceWorldSemantic=semanticWorldDigest(source);
  const sourceAssetSemantic=semanticAssetManifestDigest(manifest);

  const applied=applyWorldEditTransaction(
    source,
    manifest,
    transaction(source,manifest,[
      {
        id:'move',
        kind:'set_transform',
        entityId:'hero',
        value:{position:{x:9,y:0,z:0}}
      },
      {
        id:'note',
        kind:'set_property',
        entityId:'hero',
        key:'temporary',
        value:true
      },
      {
        id:'asset',
        kind:'upsert_asset',
        asset:asset(SHA_B,2)
      }
    ])
  );

  const undone=applyWorldEditTransaction(
    applied.world,
    applied.assets,
    applied.receipt.inverseTransaction
  );

  assert.equal(semanticWorldDigest(undone.world),sourceWorldSemantic);
  assert.equal(semanticAssetManifestDigest(undone.assets),sourceAssetSemantic);
  assert.equal(undone.world.version,3);
  assert.equal(undone.assets.revision,3);
  assert.equal(undone.assets.assets[0].revision,3);
  assert.equal(undone.assets.assets[0].sha256,SHA_A);
  assert.equal(undone.world.entities.find(row=>row.id==='hero')!.properties,undefined);
});

test('live authoring session applies and undoes without losing receipt history',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const session=new LiveWorldAuthoringSession(source,manifest);
  const originalSemantic=semanticWorldDigest(source);

  const applied=session.apply(transaction(source,manifest,[
    {
      id:'move',
      kind:'set_transform',
      entityId:'hero',
      value:{position:{x:4,y:0,z:0}}
    }
  ]));
  assert.equal(session.history.length,1);
  assert.equal(applied.world.version,2);

  const undone=session.undoLast();
  assert.equal(session.history.length,2);
  assert.equal(semanticWorldDigest(undone.world),originalSemantic);
  assert.equal(undone.world.version,3);
});

test('stale base digests fail closed instead of editing a world the caller did not inspect',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const tx=transaction(source,manifest,[
    {
      id:'move',
      kind:'set_transform',
      entityId:'hero',
      value:{position:{x:1,y:0,z:0}}
    }
  ]);
  tx.baseWorldDigest='f'.repeat(64);

  assert.throws(
    ()=>applyWorldEditTransaction(source,manifest,tx),
    /world_edit_base_world_digest_mismatch/
  );
});

test('material removal fails while a renderable still references it',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const tx=transaction(source,manifest,[
    {
      id:'remove-material',
      kind:'remove_material',
      materialId:'hero-material'
    }
  ]);

  assert.throws(
    ()=>applyWorldEditTransaction(source,manifest,tx),
    /world_edit_material_still_referenced:hero-material/
  );
});

test('asset replacement requires monotonic revision when content changes',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const tx=transaction(source,manifest,[
    {
      id:'asset',
      kind:'upsert_asset',
      asset:asset(SHA_B,1)
    }
  ]);

  assert.throws(
    ()=>applyWorldEditTransaction(source,manifest,tx),
    /world_edit_asset_revision_not_advanced:geometry:hero/
  );
});

test('asset lineage changes require a revision advance even when bytes stay identical',()=>{
  const source=world();
  const manifest=createWorldAssetManifest(source.id,[asset()]);
  const changed=asset(SHA_A,1);
  changed.provenance.license='Different license';
  const tx=transaction(source,manifest,[
    {
      id:'asset-lineage',
      kind:'upsert_asset',
      asset:changed
    }
  ]);

  assert.throws(
    ()=>applyWorldEditTransaction(source,manifest,tx),
    /world_edit_asset_revision_not_advanced:geometry:hero/
  );
});

test('asset records require explicit rights and provenance instead of assuming permission',()=>{
  const source=world();
  const bad=asset();
  bad.provenance.rightsState='unknown';
  bad.provenance.license='';
  assert.throws(
    ()=>createWorldAssetManifest(source.id,[bad]),
    /world_edit_asset_license_missing:geometry:hero/
  );
});

test('geometry hot reload produces deterministic receipts and replaces the same asset id',()=>{
  const first=geometry(1);
  const next=geometry(2);
  const one=applyGeometryHotReload([first],next);
  const two=applyGeometryHotReload([first],next);

  assert.equal(one.receipt.digest,two.receipt.digest);
  assert.equal(one.receipt.replaced,true);
  assert.equal(one.receipt.previousDigest,geometryAssetDigest(first));
  assert.equal(one.receipt.nextDigest,geometryAssetDigest(next));
  assert.equal(one.geometries.length,1);
  assert.deepEqual(one.geometries[0].positions,next.positions);
});

test('geometry hot reload can admit a new geometry without pretending it replaced one',()=>{
  const added:GeometryAsset={
    ...geometry(1),
    id:'geometry:new'
  };
  const result=applyGeometryHotReload([geometry(1)],added);

  assert.equal(result.receipt.replaced,false);
  assert.equal(result.receipt.previousDigest,null);
  assert.deepEqual(result.geometries.map(row=>row.id),['geometry:hero','geometry:new']);
});
