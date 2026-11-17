// Evercraft Worlds: offline, owner-reviewed GLB geometry admission.
// This strictly supports one static untextured triangle mesh, not a full glTF renderer.
export const MAX_GLB_BYTES=8*1024*1024;
const fail=reason=>{throw Error('worlds_asset_'+reason);};
const assert=(ok,reason)=>{if(!ok)fail(reason);};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const unit=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
const hex=/^[a-f0-9]{64}$/;
export function checkAssetRights(m){
 assert(m?.schema==='evercraft.worlds.asset-rights.v1','rights_schema');
 assert(/^[a-z0-9][a-z0-9-]{2,63}$/.test(m.id||''),'rights_id');
 assert(hex.test(m.sha256||''),'rights_digest');
 assert(['Evercraft-original','CC0-1.0','CC-BY-4.0','licensed-commercial'].includes(m.license),'rights_license');
 assert(typeof m.creator==='string'&&m.creator.trim().length>=2&&m.creator.length<=120,'rights_creator');
 assert(typeof m.source==='string'&&m.source.trim().length>=3&&m.source.length<=400,'rights_source');
 assert(m.review==='approved_for_worlds','rights_review');
 if(m.license==='CC-BY-4.0')assert(typeof m.attribution==='string'&&m.attribution.trim().length>4,'attribution_required');
 if(m.license==='licensed-commercial')assert(typeof m.license_evidence==='string'&&m.license_evidence.trim().length>4,'license_evidence_required');
 return {id:m.id,creator:m.creator,source:m.source,license:m.license,attribution:m.attribution||null,
  license_evidence:m.license_evidence||null,review:m.review};
}
function getBytes(source){
 const bytes=source instanceof Uint8Array?source:source instanceof ArrayBuffer?new Uint8Array(source):null;
 assert(bytes&&bytes.byteLength>=20&&bytes.byteLength<=MAX_GLB_BYTES,'size');
 return bytes;
}
export function parseOwnedGlb(source){
 const bytes=getBytes(source),dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 assert(dv.getUint32(0,true)===0x46546c67&&dv.getUint32(4,true)===2,'glb_header');
 assert(dv.getUint32(8,true)===bytes.byteLength,'glb_length');
 let at=12,json=null,bin=null,n=0;
 while(at<bytes.byteLength){
  assert(at+8<=bytes.byteLength,'chunk_header');
  const len=dv.getUint32(at,true),type=dv.getUint32(at+4,true);at+=8;
  assert(len%4===0&&at+len<=bytes.byteLength,'chunk_bounds');
  const chunk=bytes.subarray(at,at+len);at+=len;
  if(type===0x4e4f534a){assert(json===null&&n===0,'json_chunk');json=chunk;}
  else if(type===0x004e4942){assert(bin===null&&json!==null,'binary_chunk');bin=chunk;}
  else fail('chunk_type');
  n++;
 }
 assert(at===bytes.byteLength&&n===2&&json&&bin,'chunk_count');
 let model;
 try{model=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(json));}
 catch{fail('json');}
 assert(model.asset?.version==='2.0','version');
 assert(!model.extensionsRequired?.length&&!model.extensionsUsed?.length,'unsupported_extension');
 for(const name of ['images','textures','samplers','skins','animations'])assert(!model[name]?.length,'unsupported_feature');
 assert(Array.isArray(model.buffers)&&model.buffers.length===1&&
  !model.buffers[0].uri&&integer(model.buffers[0].byteLength)&&
  model.buffers[0].byteLength<=bin.byteLength,'binary_buffer');
 assert(Array.isArray(model.meshes)&&model.meshes.length===1&&
  model.meshes[0].primitives?.length===1,'mesh_count');
 const primitive=model.meshes[0].primitives[0];
 assert(primitive.mode===undefined||primitive.mode===4,'triangle_mode');
 const attrs=primitive.attributes||{};
 assert(Object.keys(attrs).length===2&&integer(attrs.POSITION)&&integer(attrs.NORMAL),'attributes');
 const bindata=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 function unpack(index,type,componentType,maxCount){
  assert(integer(index)&&index<(model.accessors?.length||0),'accessor_index');
  const a=model.accessors[index],view=model.bufferViews?.[a.bufferView];
  assert(a.type===type&&a.componentType===componentType&&!a.sparse&&!a.normalized&&view&&
   integer(a.count)&&a.count>0&&a.count<=maxCount&&view.buffer===0,'accessor_type');
  const size=componentType===5123?2:4,parts=type==='VEC3'?3:1,
   stride=view.byteStride??size*parts,viewAt=view.byteOffset??0,offset=a.byteOffset??0;
  assert(integer(stride)&&integer(viewAt)&&integer(offset)&&integer(view.byteLength)&&
   stride>=size*parts&&stride%size===0&&offset%size===0&&
   viewAt+view.byteLength<=model.buffers[0].byteLength&&
   offset+(a.count-1)*stride+size*parts<=view.byteLength,'accessor_bounds');
  const values=[];
  for(let i=0;i<a.count;i++)for(let j=0;j<parts;j++){
   const k=viewAt+offset+i*stride+j*size;
   values.push(componentType===5126?bindata.getFloat32(k,true):
    componentType===5125?bindata.getUint32(k,true):bindata.getUint16(k,true));
  }
  return {count:a.count,values};
 }
 const positions=unpack(attrs.POSITION,'VEC3',5126,100000);
 const normals=unpack(attrs.NORMAL,'VEC3',5126,100000);
 assert(positions.count===normals.count,'normal_count');
 let indices;
 if(primitive.indices===undefined)indices=Array.from({length:positions.count},(_,i)=>i);
 else{
  const accessor=model.accessors?.[primitive.indices];
  assert(accessor&&[5123,5125].includes(accessor.componentType),'index_type');
  indices=unpack(primitive.indices,'SCALAR',accessor.componentType,300000).values;
 }
 assert(indices.length>0&&indices.length%3===0&&indices.length<=300000,'triangle_count');
 const trianglePositions=[],triangleNormals=[];
 for(const i of indices){
  assert(integer(i)&&i<positions.count,'index_bounds');
  const xyz=positions.values.slice(i*3,i*3+3),n=normals.values.slice(i*3,i*3+3),mag=Math.hypot(...n);
  assert(xyz.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000),'vertex_range');
  assert(n.every(Number.isFinite)&&mag>.00001,'normal_range');
  trianglePositions.push(...xyz);triangleNormals.push(...n.map(v=>v/mag));
 }
 const m=primitive.material===undefined?{}:model.materials?.[primitive.material];
 assert(m,'material_missing');
 assert(!m.extensions&&!m.normalTexture&&!m.occlusionTexture&&!m.emissiveTexture&&!m.emissiveFactor&&
  (m.alphaMode===undefined||m.alphaMode==='OPAQUE'),'material_feature');
 const pbr=m.pbrMetallicRoughness||{};
 assert(!pbr.baseColorTexture&&!pbr.metallicRoughnessTexture,'material_texture');
 const color=pbr.baseColorFactor??[1,1,1,1];
 assert(Array.isArray(color)&&color.length===4&&color.every(unit),'material_color');
 const metallic=pbr.metallicFactor??1,roughness=pbr.roughnessFactor??1;
 assert(unit(metallic)&&unit(roughness),'material_range');
 return {schema:'evercraft.worlds.asset-mesh.v1',positions:trianglePositions,normals:triangleNormals,
  vertexCount:positions.count,triangleCount:indices.length/3,
  material:{model:'pbr',baseColor:{r:color[0],g:color[1],b:color[2],a:color[3]},
   metallic,roughness,doubleSided:m.doubleSided===true}};
}
export async function admitOwnedGlb(source,manifest){
 const rights=checkAssetRights(manifest),bytes=getBytes(source);
 assert(globalThis.crypto?.subtle?.digest,'crypto_missing');
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
 assert(hash===manifest.sha256,'sha256_mismatch');
 return {...parseOwnedGlb(bytes),rights:{...rights,sha256:hash,digest_verified:true,
  rights_operator_attested:true,independent_legal_review:false}};
}
