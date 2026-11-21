// Deterministic scene-node placement for real glTF authored mesh resources.
// Affine transforms are baked into canonical geometry to preserve hierarchy,
// even when composition introduces shear that World Engine Euler TRS cannot represent.
// No scene playback, animation, skinning or material claims.
import crypto from 'node:crypto';
import {geometryAssetDigest,validateGeometryAsset} from '../world-engine/webgpu.ts';
import {verifyGltfAssetPack} from './gltf-asset-pack.mjs';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function fail(reason){throw new Error('visual_gltf_placement_'+reason);}
function ok(condition,reason){if(!condition)fail(reason);}
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function matMul(a,b){
  const out=new Array(16).fill(0);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)
    for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k];
  return out;
}
function matForNode(n,index){
  if(n.matrix!==undefined){
    ok(n.translation===undefined&&n.rotation===undefined&&n.scale===undefined,
      'matrix_with_trs:'+index);
    ok(Array.isArray(n.matrix)&&n.matrix.length===16&&n.matrix.every(finite),
      'matrix_invalid:'+index);
    ok(Math.abs(n.matrix[3])<1e-9&&Math.abs(n.matrix[7])<1e-9&&
      Math.abs(n.matrix[11])<1e-9&&Math.abs(n.matrix[15]-1)<1e-9,
      'perspective_matrix_unsupported:'+index);
    return [...n.matrix];
  }
  const t=n.translation??[0,0,0],q=n.rotation??[0,0,0,1],s=n.scale??[1,1,1];
  ok(Array.isArray(t)&&t.length===3&&t.every(finite),'translation_invalid:'+index);
  ok(Array.isArray(q)&&q.length===4&&q.every(finite),'rotation_invalid:'+index);
  ok(Array.isArray(s)&&s.length===3&&s.every(finite),'scale_invalid:'+index);
  const len=Math.hypot(...q);
  ok(Math.abs(len-1)<1e-4,'rotation_quaternion_invalid:'+index);
  const [x,y,z,w]=q.map(v=>v/len),[sx,sy,sz]=s;
  const xx=x*x,yy=y*y,zz=z*z,xy=x*y,xz=x*z,yz=y*z,
    wx=w*x,wy=w*y,wz=w*z;
  return [
    (1-2*(yy+zz))*sx, (2*(xy+wz))*sx, (2*(xz-wy))*sx,0,
    (2*(xy-wz))*sy,(1-2*(xx+zz))*sy,(2*(yz+wx))*sy,0,
    (2*(xz+wy))*sz,(2*(yz-wx))*sz,(1-2*(xx+yy))*sz,0,
    ...t,1
  ];
}
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function norm(a){
  const l=Math.hypot(...a);
  ok(l>1e-10&&Number.isFinite(l),'transformed_normal_or_tangent_zero');
  return a.map(x=>x/l);
}
function bake(source,matrix,id){
  const a=[matrix[0],matrix[1],matrix[2]],
    b=[matrix[4],matrix[5],matrix[6]],
    c=[matrix[8],matrix[9],matrix[10]];
  const cb=cross(b,c),cc=cross(c,a),ca=cross(a,b),det=dot(a,cb);
  ok(Number.isFinite(det)&&Math.abs(det)>1e-10,'singular_transform:'+id);
  const point=(p)=>[
    matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],
    matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],
    matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]
  ];
  const forward=p=>[dot([matrix[0],matrix[4],matrix[8]],p),
    dot([matrix[1],matrix[5],matrix[9]],p),
    dot([matrix[2],matrix[6],matrix[10]],p)];
  const normal=p=>norm([
    (cb[0]*p[0]+cc[0]*p[1]+ca[0]*p[2])/det,
    (cb[1]*p[0]+cc[1]*p[1]+ca[1]*p[2])/det,
    (cb[2]*p[0]+cc[2]*p[1]+ca[2]*p[2])/det
  ]);
  const positions=[],normals=[],tangents=[];
  for(let i=0;i<source.positions.length/3;i++){
    const n=normal(source.normals.slice(i*3,i*3+3));
    positions.push(...point(source.positions.slice(i*3,i*3+3)));
    normals.push(...n);
    if(source.tangents){
      const v=forward(source.tangents.slice(i*4,i*4+3));
      const projected=dot(v,n),t=norm(v.map((x,j)=>x-projected*n[j]));
      tangents.push(...t,source.tangents[i*4+3]*(det<0?-1:1));
    }
  }
  const indices=source.indices?.length?[...source.indices]:
    Array.from({length:source.positions.length/3},(_,i)=>i);
  if(det<0)for(let i=0;i<indices.length;i+=3)
    [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  const result={schema:'evercraft.world-engine.geometry.v1',id,
    primitive:'triangles',positions,normals,
    ...(source.uvs?{uvs:[...source.uvs]}:{}),
    ...(source.tangents?{tangents}:{}),
    indices};
  validateGeometryAsset(result);
  return result;
}
export function compileGltfScenePlacements({
  gltf,assetPack,sceneIndex=gltf?.scene??0,
  maxNodes=1024,maxInstances=256
}={}){
  ok(verifyGltfAssetPack(assetPack),'asset_pack_receipt_invalid');
  ok(Array.isArray(gltf?.nodes)&&Array.isArray(gltf?.scenes),
    'scene_nodes_missing');
  ok(Number.isSafeInteger(sceneIndex)&&sceneIndex>=0&&sceneIndex<gltf.scenes.length,
    'scene_index_invalid');
  ok(Number.isSafeInteger(maxNodes)&&maxNodes>0&&gltf.nodes.length<=maxNodes,
    'node_budget_exceeded');
  ok(Number.isSafeInteger(maxInstances)&&maxInstances>0,'instance_budget_invalid');
  const scene=gltf.scenes[sceneIndex];
  ok(Array.isArray(scene?.nodes),'scene_roots_invalid');
  const geometries=[],entities=[],records=[],visited=new Set(),stack=new Set();
  const geometryById=new Map(assetPack.geometries.map(g=>[g.id,g]));
  function visit(index,parent,ancestor){
    ok(Number.isSafeInteger(index)&&index>=0&&index<gltf.nodes.length,
      'node_index_invalid');
    ok(!stack.has(index),'node_cycle_detected');
    ok(!visited.has(index),'node_multiple_parents_unsupported');
    stack.add(index);visited.add(index);
    const node=gltf.nodes[index],world=matMul(parent,matForNode(node,index));
    if(node.mesh!==undefined){
      ok(node.skin===undefined&&node.weights===undefined&&node.extensions===undefined,
        'node_skin_morph_extension_unsupported:'+index);
      ok(Number.isSafeInteger(node.mesh)&&node.mesh>=0&&node.mesh<gltf.meshes.length,
        'node_mesh_invalid:'+index);
      const primitives=gltf.meshes[node.mesh].primitives;
      for(let pi=0;pi<primitives.length;pi++){
        ok(entities.length<maxInstances,'instance_budget_exceeded');
        const originalId=assetPack.assetId+':mesh-'+node.mesh+'-primitive-'+pi;
        const original=geometryById.get(originalId);
        ok(Boolean(original),'mesh_geometry_missing:'+originalId);
        const id=originalId+':node-'+index;
        const baked=bake(original,world,id);
        const materialIndex=primitives[pi].material;
        const materialId=assetPack.assetId+':material-'+
          (materialIndex??-1);
        ok(assetPack.materialDefinitions.some(m=>m.id===materialId),
          'material_missing:'+materialId);
        geometries.push(baked);
        entities.push({
          id:'gltf:entity-'+index+'-'+pi,
          transform:{position:{x:0,y:0,z:0},rotationDeg:{x:0,y:0,z:0},
            scale:{x:1,y:1,z:1}},
          renderable:{geometryRef:id,materialId,layerMask:1}
        });
        records.push({node_index:index,node_name:String(node.name||''),
          mesh_index:node.mesh,primitive_index:pi,source_geometry_id:originalId,
          geometry_id:id,geometry_digest:geometryAssetDigest(baked),
          material_id:materialId,node_path:[...ancestor,index],
          world_matrix:world});
      }
    }
    ok(!node.children||Array.isArray(node.children),'node_children_invalid:'+index);
    for(const child of node.children||[])visit(child,world,[...ancestor,index]);
    stack.delete(index);
  }
  for(const root of scene.nodes)visit(root,I,[]);
  ok(entities.length>0,'scene_no_visible_meshes');
  const core={
    schema:'evercraft.visual-engine.gltf-scene-placement.v1',
    source_asset_pack_digest:assetPack.receipt.digest,
    source_scene_index:sceneIndex,
    node_count:visited.size,
    renderable_count:entities.length,
    geometry:records
  };
  const receipt={...core,digest:hash(core)};
  return {schema:core.schema,geometries,entities,receipt};
}
export function verifyGltfScenePlacements(output,assetPack){
  try{
    ok(output?.receipt?.schema==='evercraft.visual-engine.gltf-scene-placement.v1',
      'receipt_schema_invalid');
    ok(output.receipt.source_asset_pack_digest===assetPack.receipt.digest,
      'source_pack_changed');
    const {digest,...core}=output.receipt;
    ok(digest===hash(core),'receipt_digest_invalid');
    ok(output.entities.length===core.renderable_count&&
      output.geometries.length===core.renderable_count,'count_mismatch');
    const geometries=new Map(output.geometries.map(x=>[x.id,x]));
    for(const record of core.geometry){
      const geo=geometries.get(record.geometry_id);
      ok(Boolean(geo)&&geometryAssetDigest(geo)===record.geometry_digest,
        'geometry_tampered');
      const entity=output.entities.find(e=>e.renderable.geometryRef===record.geometry_id);
      ok(Boolean(entity)&&entity.renderable.materialId===record.material_id,
        'entity_binding_tampered');
    }
    return true;
  }catch{return false;}
}
