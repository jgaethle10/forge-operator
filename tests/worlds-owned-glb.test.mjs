import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseOwnedGlb,admitOwnedGlb,checkAssetRights,MAX_GLB_BYTES} from '../public/worlds/owned-glb.mjs';
function fixture(edit=doc=>doc){
 const data=Buffer.alloc(78);
 for(const [offset,values] of [[0,[0,0,0,1,0,0,0,1,0]],[36,[0,0,1,0,0,1,0,0,1]]])
  values.forEach((n,i)=>data.writeFloatLE(n,offset+i*4));
 for(let i=0;i<3;i++)data.writeUInt16LE(i,72+i*2);
 const doc=edit({asset:{version:'2.0'},buffers:[{byteLength:78}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:36},{buffer:0,byteOffset:72,byteLength:6}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},
   {bufferView:1,componentType:5126,count:3,type:'VEC3'},
   {bufferView:2,componentType:5123,count:3,type:'SCALAR'}],
  meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,material:0}]}],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.2,.5,.8,1],metallicFactor:.1,roughnessFactor:.7}}]});
 const json=Buffer.from(JSON.stringify(doc)),p=(4-json.length%4)%4;
 const chunk=Buffer.concat([json,Buffer.alloc(p,32)]),bin=Buffer.concat([data,Buffer.alloc(2)]);
 const result=Buffer.alloc(12+8+chunk.length+8+bin.length);
 result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(result.length,8);
 result.writeUInt32LE(chunk.length,12);result.writeUInt32LE(0x4e4f534a,16);chunk.copy(result,20);
 const b=20+chunk.length;result.writeUInt32LE(bin.length,b);result.writeUInt32LE(0x004e4942,b+4);bin.copy(result,b+8);
 return result;
}
const rights=bytes=>({schema:'evercraft.worlds.asset-rights.v1',id:'evercraft-original-test',
 sha256:createHash('sha256').update(bytes).digest('hex'),license:'Evercraft-original',
 creator:'Evercraft Studio',source:'original authored test model',review:'approved_for_worlds'});
test('admitted original GLB provides triangle arrays and canonical material shape',async()=>{
 const bytes=fixture(),asset=await admitOwnedGlb(bytes,rights(bytes));
 assert.equal(asset.vertexCount,3);assert.equal(asset.triangleCount,1);
 assert.deepEqual(asset.positions,[0,0,0,1,0,0,0,1,0]);
 assert.deepEqual(asset.normals,[0,0,1,0,0,1,0,0,1]);
 assert.equal(asset.material.model,'pbr');assert.equal(asset.material.roughness,.7);
 assert.equal(asset.rights.digest_verified,true);
});
test('rights fail closed for tampering, missing permissions or attribution',async()=>{
 const bytes=fixture();
 await assert.rejects(admitOwnedGlb(bytes,{...rights(bytes),sha256:'f'.repeat(64)}),/sha256_mismatch/);
 assert.throws(()=>checkAssetRights({...rights(bytes),review:'unreviewed'}),/rights_review/);
 assert.throws(()=>checkAssetRights({...rights(bytes),license:'CC-BY-4.0'}),/attribution_required/);
 assert.throws(()=>checkAssetRights({...rights(bytes),license:'licensed-commercial'}),/license_evidence_required/);
});
test('rejects external buffers, images, extensions, corrupt binary, invalid vertex views',()=>{
 assert.throws(()=>parseOwnedGlb(fixture(d=>({...d,buffers:[{uri:'https://other.org/a.bin',byteLength:78}]}))),/binary_buffer/);
 assert.throws(()=>parseOwnedGlb(fixture(d=>({...d,images:[{uri:'https://other.org/a.png'}]}))),/unsupported_feature/);
 assert.throws(()=>parseOwnedGlb(fixture(d=>({...d,extensionsRequired:['KHR_draco_mesh_compression']}))),/unsupported_extension/);
 assert.throws(()=>parseOwnedGlb(fixture(d=>({...d,accessors:[{...d.accessors[0],count:99999},...d.accessors.slice(1)]}))),/accessor_bounds/);
 const corrupt=fixture();corrupt.writeUInt32LE(777,0);
 assert.throws(()=>parseOwnedGlb(corrupt),/glb_header/);
 assert.throws(()=>parseOwnedGlb(Buffer.alloc(MAX_GLB_BYTES+1)),/size/);
});
