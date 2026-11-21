// Evercraft Visual Engine: bounded, rights-gated glTF 2.0 resource import.
// No network fetches, hidden coordinate conversion, or scene transform guessing.
// Detailed triangle meshes pass through the EXISTING Fallen -> World Engine importer.
import crypto from 'node:crypto';
import {
  geometryFromFallenAsset,
  verifyFallenGeometryImportReceipt
} from '../world-engine/fallen-geometry.ts';
import {geometryAssetDigest} from '../world-engine/webgpu.ts';
import {textureAssetDigest,validateTextureAsset} from '../world-engine/texture.ts';
import {validateMaterial} from '../world-engine/visual.ts';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?
  Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,stable(v)])):x;
const digest=x=>sha(JSON.stringify(stable(x)));
const rights=new Set(['owned','licensed','public_domain']);
const componentSizes={5121:1,5123:2,5125:4,5126:4};
const typeWidths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
function check(condition,code){if(!condition)throw new Error('visual_gltf_'+code);}
function uint(x){return Number.isSafeInteger(x)&&x>=0;}
function safeId(id){check(typeof id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,100}$/.test(id),'asset_id_invalid');}
function asBytes(x,label){
  check(x instanceof Uint8Array||Buffer.isBuffer(x),label+'_bytes_required');
  return Buffer.from(x.buffer,x.byteOffset,x.byteLength);
}
export function parseGlbV2(bytes){
  const b=asBytes(bytes,'glb');
  check(b.length>=20&&b.readUInt32LE(0)===0x46546c67,'glb_magic_invalid');
  check(b.readUInt32LE(4)===2,'glb_version_unsupported');
  check(b.readUInt32LE(8)===b.length,'glb_length_mismatch');
  let off=12,json=null,bin=null,parts=0;
  while(off<b.length){
    check(off+8<=b.length,'glb_chunk_header_truncated');
    const length=b.readUInt32LE(off),type=b.readUInt32LE(off+4);
    off+=8;
    check(length%4===0&&off+length<=b.length,'glb_chunk_bounds_invalid');
    if(type===0x4e4f534a){
      check(parts===0&&json===null,'glb_json_chunk_order_invalid');
      try{json=JSON.parse(b.subarray(off,off+length).toString('utf8').trim());}
      catch{throw new Error('visual_gltf_glb_json_invalid');}
    }else if(type===0x004e4942){
      check(json!==null&&bin===null,'glb_bin_chunk_order_invalid');
      bin=Buffer.from(b.subarray(off,off+length));
    }else{
      throw new Error('visual_gltf_glb_chunk_unsupported');
    }
    parts++;off+=length;
  }
  check(json&&typeof json==='object','glb_json_missing');
  check(bin!==null,'glb_bin_missing');
  return {gltf:json,buffers:[bin],container_sha256:'sha256:'+sha(b)};
}
function bytesFromUri(uri){
  const m=/^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(uri||'');
  check(Boolean(m&&m[2]),'external_uri_forbidden');
  check(/^[A-Za-z0-9+/]*={0,2}$/.test(m[3])&&m[3].length%4===0,'data_uri_base64_invalid');
  return Buffer.from(m[3],'base64');
}
function resolveBuffers(gltf,supplied){
  check(Array.isArray(gltf.buffers)&&gltf.buffers.length>0,'buffers_missing');
  check(gltf.buffers.length===supplied.length,'buffer_count_mismatch');
  return gltf.buffers.map((def,i)=>{
    const b=asBytes(supplied[i],'buffer');
    check(uint(def.byteLength)&&b.length>=def.byteLength&&b.length-def.byteLength<=3,
      'buffer_length_mismatch:'+i);
    if(def.uri!==undefined)check(bytesFromUri(def.uri).equals(b),'buffer_uri_data_mismatch:'+i);
    return b;
  });
}
function viewBytes(gltf,buffers,index){
  const view=gltf.bufferViews?.[index];
  check(view&&uint(view.buffer)&&uint(view.byteLength),'buffer_view_invalid:'+index);
  const data=buffers[view.buffer];
  check(Boolean(data),'buffer_view_buffer_missing:'+index);
  const start=view.byteOffset??0;
  check(uint(start)&&start+view.byteLength<=gltf.buffers[view.buffer].byteLength,
    'buffer_view_bounds:'+index);
  return data.subarray(start,start+view.byteLength);
}
function readAccessor(gltf,buffers,index,expectedType,componentType){
  const a=gltf.accessors?.[index];
  check(a&&a.type===expectedType&&a.componentType===componentType,
    'accessor_type_unsupported:'+index);
  check(a.sparse===undefined&&a.normalized!==true,'accessor_sparse_or_normalized_unsupported:'+index);
  check(uint(a.count)&&a.count>0&&a.count<=750000,'accessor_count_invalid:'+index);
  check(uint(a.bufferView),'accessor_view_missing:'+index);
  const view=gltf.bufferViews[a.bufferView];
  const b=viewBytes(gltf,buffers,a.bufferView);
  const n=typeWidths[expectedType],size=componentSizes[componentType],width=n*size;
  const stride=view.byteStride??width,offset=a.byteOffset??0;
  check(uint(stride)&&stride>=width&&stride%size===0&&uint(offset)&&offset%size===0,
    'accessor_alignment_invalid:'+index);
  check(offset+(a.count-1)*stride+width<=b.length,'accessor_bounds:'+index);
  const data=new DataView(b.buffer,b.byteOffset,b.byteLength),out=[];
  for(let k=0;k<a.count;k++)for(let component=0;component<n;component++){
    const o=offset+k*stride+component*size;
    const value=componentType===5126?data.getFloat32(o,true):
      componentType===5125?data.getUint32(o,true):
      componentType===5123?data.getUint16(o,true):data.getUint8(o);
    check(Number.isFinite(value),'accessor_non_finite:'+index);
    out.push(value);
  }
  return out;
}
function indices(gltf,buffers,index){
  const type=gltf.accessors?.[index]?.componentType;
  check([5121,5123,5125].includes(type),'indices_component_unsupported');
  return readAccessor(gltf,buffers,index,'SCALAR',type);
}
function imageSource(gltf,buffers,index){
  const def=gltf.images?.[index];
  check(Boolean(def),'image_missing:'+index);
  let bytes;
  if(def.bufferView!==undefined){
    check(['image/png','image/jpeg'].includes(def.mimeType),'image_mime_unsupported:'+index);
    bytes=Buffer.from(viewBytes(gltf,buffers,def.bufferView));
  }else if(typeof def.uri==='string'){
    check(def.uri.startsWith('data:'),'image_external_uri_forbidden:'+index);
    const mime=/^data:([^;,]+)/.exec(def.uri)?.[1];
    check(['image/png','image/jpeg'].includes(mime),'image_mime_unsupported:'+index);
    bytes=bytesFromUri(def.uri);
  }else throw new Error('visual_gltf_image_source_missing:'+index);
  const mimeType=def.bufferView!==undefined?def.mimeType:/^data:([^;,]+)/.exec(def.uri)?.[1];
  return {sha256:'sha256:'+sha(bytes),bytes,mimeType};
}
export function extractGltfEmbeddedImages(gltf,buffers,{maxImages=32,maxEncodedBytes=16*1024*1024}={}){
  check(uint(maxImages)&&maxImages>0&&uint(maxEncodedBytes)&&maxEncodedBytes>0,
    'image_intake_limits_invalid');
  const binary=resolveBuffers(gltf,buffers);
  const count=gltf.images?.length||0;
  check(count<=maxImages,'image_count_budget_exceeded');
  let total=0;
  return Array.from({length:count},(_,index)=>{
    const {sha256,bytes,mimeType}=imageSource(gltf,binary,index);
    total+=bytes.length;
    check(total<=maxEncodedBytes,'image_encoded_budget_exceeded');
    return {index,mimeType,sourceSha256:sha256,encodedBase64:bytes.toString('base64')};
  });
}
function importTextureFactory(gltf,buffers,decodedImages,assetId,maxTextureBytes,
  allowBaseLevelMipmapSampling=false){
  const cache=new Map(),textures=[],imageEvidence=new Map(),samplerDowngrades=new Map();
  let total=0;
  function raster(texIndex,role){
    const tex=gltf.textures?.[texIndex];
    check(tex&&uint(tex.source),'texture_missing:'+texIndex);
    if(tex.sampler!==undefined)check(uint(tex.sampler)&&
      gltf.samplers?.[tex.sampler]!==undefined,'texture_sampler_missing:'+texIndex);
    const info=imageSource(gltf,buffers,tex.source);
    const provided=decodedImages?.[tex.source];
    check(provided&&provided.sourceSha256===info.sha256,
      'decoded_image_source_mismatch:'+tex.source);
    const data=provided.rgba;
    const width=provided.width,height=provided.height;
    const format=role==='baseColor'||role==='emissive'?'rgba8unorm-srgb':'rgba8unorm';
    const id=assetId+':texture-'+texIndex+'-'+role;
    const texture={schema:'evercraft.world-engine.texture.v1',id,width,height,format,data:[...(data||[])]};
    validateTextureAsset(texture);
    const key=tex.source+'-'+role;
    if(!cache.has(key)){
      total+=width*height*4;
      check(total<=maxTextureBytes,'texture_budget_exceeded');
      cache.set(key,texture);textures.push(texture);
    }
    imageEvidence.set(tex.source,{image_index:tex.source,compressed_sha256:info.sha256,
      decoded_rgba_sha256:'sha256:'+sha(Buffer.from(texture.data)),width,height});
    return cache.get(key);
  }
  function orm(mat,index){
    const metal=mat.pbrMetallicRoughness?.metallicRoughnessTexture;
    const occ=mat.occlusionTexture;
    if(!metal&&!occ) return null;
    const mr=metal?raster(metal.index,'ormSource'):null;
    const ao=occ?raster(occ.index,'ormSource'):null;
    if(mr&&ao)check(mr.width===ao.width&&mr.height===ao.height,
      'orm_image_dimensions_mismatch:'+index);
    const src=mr||ao,id=assetId+':material-'+index+'-orm';
    const data=[];
    for(let i=0;i<src.width*src.height;i++){
      data.push(ao?ao.data[4*i]:255,mr?mr.data[4*i+1]:255,mr?mr.data[4*i+2]:255,255);
    }
    // The source images are NOT resident textures. They only feed packed output.
    for(const source of [mr,ao])if(source) {
      const idx=textures.findIndex(t=>t.id===source.id);
      if(idx>=0){total-=source.width*source.height*4;textures.splice(idx,1);}
      cache.delete((source.id.match(/texture-(\d+)-/)||[])[1]+'-ormSource');
    }
    const out={schema:'evercraft.world-engine.texture.v1',id,width:src.width,
      height:src.height,format:'rgba8unorm',data};
    validateTextureAsset(out);
    total+=src.width*src.height*4;check(total<=maxTextureBytes,'texture_budget_exceeded');
    textures.push(out);
    return id;
  }
  function sampler(info){
    const tex=gltf.textures?.[info.index];
    check(Boolean(tex),'texture_missing:'+info.index);
    const raw=tex.sampler===undefined?{}:gltf.samplers?.[tex.sampler];
    check(raw&&typeof raw==='object','texture_sampler_missing:'+info.index);
    const mode=(v)=>v===undefined||v===10497?'repeat':v===33071?'clamp-to-edge':
      v===33648?'mirror-repeat':(check(false,'sampler_address_unsupported'),null);
    const filter=(v)=>v===undefined||v===9729?'linear':v===9728?'nearest':
      (check(false,'sampler_filter_unsupported'),null);
    let minFilter;
    if([9984,9985,9986,9987].includes(raw.minFilter)){
      check(allowBaseLevelMipmapSampling,'sampler_mipmaps_require_explicit_preview_downgrade');
      minFilter=[9984,9986].includes(raw.minFilter)?'nearest':'linear';
      samplerDowngrades.set(info.index,{
        texture_index:info.index,source_min_filter:raw.minFilter,
        applied_min_filter:minFilter,policy:'mipmap_base_level_only_preview'
      });
    }else minFilter=filter(raw.minFilter);
    return {addressModeU:mode(raw.wrapS),addressModeV:mode(raw.wrapT),
      magFilter:filter(raw.magFilter),minFilter};
  }
  return {
    sampler,
    texture(info,role){
      if(!info)return null;
      check(uint(info.index)&&[undefined,0].includes(info.texCoord)&&!info.extensions,
        'texture_coordinate_or_extension_unsupported');
      return raster(info.index,role).id;
    },
    orm,
    result:()=>({textures,imageEvidence:[...imageEvidence.values()].sort((a,b)=>a.image_index-b.image_index),
      samplerDowngrades:[...samplerDowngrades.values()].sort((a,b)=>a.texture_index-b.texture_index),
      totalTextureBytes:total})
  };
}
function makeMaterial(gltf,i,assetId,tex){
  const m=gltf.materials?.[i]||{};
  check(!m.extensions,'material_extensions_unsupported:'+i);
  check(!m.pbrMetallicRoughness?.baseColorTexture?.extensions,'texture_transform_unsupported');
  const p=m.pbrMetallicRoughness||{},factor=p.baseColorFactor||[1,1,1,1];
  check(Array.isArray(factor)&&factor.length===4,'base_color_factor_invalid');
  const out={id:assetId+':material-'+i,model:'pbr',
    baseColor:{r:factor[0],g:factor[1],b:factor[2],a:factor[3]},
    metallic:p.metallicFactor??1,roughness:p.roughnessFactor??1,
    alphaMode:(m.alphaMode||'OPAQUE').toLowerCase(),
    doubleSided:Boolean(m.doubleSided),textureRefs:{}};
  if(out.alphaMode==='mask') out.alphaCutoff=m.alphaCutoff??.5;
  if(m.emissiveFactor){
    check(Array.isArray(m.emissiveFactor)&&m.emissiveFactor.length===3,
      'emissive_factor_invalid');
    out.emissive={r:m.emissiveFactor[0],g:m.emissiveFactor[1],b:m.emissiveFactor[2]};
  }
  const entries=[
    ['baseColor',p.baseColorTexture],['normal',m.normalTexture],['emissive',m.emissiveTexture]
  ];
  const textureInfos=[...entries.map(x=>x[1]),p.metallicRoughnessTexture,m.occlusionTexture]
    .filter(Boolean);
  const samplers=textureInfos.map(info=>tex.sampler(info));
  if(samplers.length){
    const first=JSON.stringify(samplers[0]);
    check(samplers.every(x=>JSON.stringify(x)===first),'material_sampler_mismatch:'+i);
    out.sampler=samplers[0];
  }
  for(const [role,info] of entries){
    if(!info)continue;
    if(role==='normal')check([undefined,1].includes(info.scale),'normal_scale_unsupported');
    out.textureRefs[role]=tex.texture(info,role);
  }
  for(const ti of [p.metallicRoughnessTexture,m.occlusionTexture]){
    if(ti)check(uint(ti.index)&&[undefined,0].includes(ti.texCoord)&&!ti.extensions,
      'orm_coordinate_or_extension_unsupported');
  }
  if(m.occlusionTexture)check([undefined,1].includes(m.occlusionTexture.strength),
    'occlusion_strength_unsupported');
  const ormId=tex.orm(m,i);
  if(ormId)out.textureRefs.orm=ormId;
  validateMaterial(out);
  return out;
}
function uvDegenerateTriangleCount(uvs,indices,vertexCount){
  const order=indices||Array.from({length:vertexCount},(_,i)=>i);
  let degenerate=0;
  for(let i=0;i<order.length;i+=3){
    const a=order[i]*2,b=order[i+1]*2,c=order[i+2]*2;
    const u1=uvs[b]-uvs[a],v1=uvs[b+1]-uvs[a+1],
      u2=uvs[c]-uvs[a],v2=uvs[c+1]-uvs[a+1];
    if(Math.abs(u1*v2-u2*v1)<=1e-12)degenerate++;
  }
  return degenerate;
}
function geometryOnlyTangents(normals){
  const out=[];
  for(let i=0;i<normals.length;i+=3){
    const [nx,ny,nz]=normals.slice(i,i+3),l=Math.hypot(nx,ny,nz);
    check(Number.isFinite(l)&&l>1e-12,'preview_normal_invalid');
    const n=[nx/l,ny/l,nz/l],basis=Math.abs(n[0])<.9?[1,0,0]:[0,1,0];
    const dot=n[0]*basis[0]+n[1]*basis[1]+n[2]*basis[2];
    const t=basis.map((x,k)=>x-dot*n[k]),length=Math.hypot(...t);
    check(length>1e-12,'preview_tangent_invalid');
    out.push(...t.map(x=>x/length),1);
  }
  return out;
}
export function importGltfAssetPack({
  gltf,buffers,decodedImages={},assetId,provenance,lods=null,
  maxVertices=750000,maxTextureBytes=128*1024*1024,
  allowBaseLevelMipmapSampling=false,
  allowDegenerateUvNoNormalMapPreview=false
}){
  safeId(assetId);
  check(gltf?.asset?.version==='2.0','version_unsupported');
  check(!gltf.extensionsUsed?.length&&!gltf.extensionsRequired?.length,
    'extensions_unsupported');
  check(provenance&&rights.has(provenance.rightsState)&&
    typeof provenance.sourceRef==='string'&&provenance.sourceRef.trim()&&
    typeof provenance.license==='string'&&provenance.license.trim(),
    'rights_or_provenance_unverified');
  check(uint(maxVertices)&&maxVertices>0&&uint(maxTextureBytes),
    'budget_invalid');
  check(Array.isArray(buffers),'supplied_buffers_missing');
  const binary=resolveBuffers(gltf,buffers);
  check(Array.isArray(gltf.meshes)&&gltf.meshes.length>0,'meshes_missing');
  const tex=importTextureFactory(gltf,binary,decodedImages,assetId,maxTextureBytes,
    allowBaseLevelMipmapSampling);
  const materialCount=gltf.materials?.length||0;
  const materials=Array.from({length:materialCount+1},
    (_,i)=>makeMaterial(gltf,i===materialCount?-1:i,assetId,tex));
  const fallbackId=materials.at(-1).id;
  const geometry=[],primitiveBindings=[],imports=[],tangentFallbacks=[];
  let totalVertices=0,totalTriangles=0;
  for(let mi=0;mi<gltf.meshes.length;mi++){
    const mesh=gltf.meshes[mi];
    check(Array.isArray(mesh.primitives)&&mesh.primitives.length>0,
      'mesh_primitives_missing:'+mi);
    for(let pi=0;pi<mesh.primitives.length;pi++){
      const p=mesh.primitives[pi];
      check([undefined,4].includes(p.mode),'primitive_mode_unsupported:'+mi+':'+pi);
      check(p.attributes&&uint(p.attributes.POSITION)&&uint(p.attributes.NORMAL)&&
        uint(p.attributes.TEXCOORD_0),'required_attributes_missing:'+mi+':'+pi);
      check(!p.targets&&!p.extensions,'morph_or_extension_unsupported:'+mi+':'+pi);
      check(Object.keys(p.attributes).every(k=>
        ['POSITION','NORMAL','TEXCOORD_0','TANGENT'].includes(k)),
        'vertex_attribute_unsupported:'+mi+':'+pi);
      const id=assetId+':mesh-'+mi+'-primitive-'+pi;
      const positions=readAccessor(gltf,binary,p.attributes.POSITION,'VEC3',5126);
      const normals=readAccessor(gltf,binary,p.attributes.NORMAL,'VEC3',5126);
      const uvs=readAccessor(gltf,binary,p.attributes.TEXCOORD_0,'VEC2',5126);
      const tangents=p.attributes.TANGENT!==undefined?
        readAccessor(gltf,binary,p.attributes.TANGENT,'VEC4',5126):undefined;
      const idx=p.indices!==undefined?indices(gltf,binary,p.indices):undefined;
      const v=positions.length/3;totalVertices+=v;
      check(totalVertices<=maxVertices,'vertex_budget_exceeded');
      const degenerateUvTriangles=uvDegenerateTriangleCount(uvs,idx,v);
      const requiresNormalTexture=Boolean(gltf.materials?.[p.material]?.normalTexture);
      let previewTangents=tangents;
      if(degenerateUvTriangles>0&&!tangents&&allowDegenerateUvNoNormalMapPreview){
        check(!requiresNormalTexture,'degenerate_uv_normal_map_preview_unsupported:'+id);
        previewTangents=geometryOnlyTangents(normals);
        tangentFallbacks.push({geometry_id:id,
          degenerate_uv_triangles:degenerateUvTriangles,
          policy:'geometric_tangent_basis_base_color_only_preview'});
      }
      const imported=geometryFromFallenAsset({
        schema:'evercraft.fallen.geometry.v1',id,primitive:'triangles',
        coordinateSystem:'right_handed_y_up',units:'meters',
        positions,normals,uvs,...(previewTangents?{tangents:previewTangents}:{}),
        ...(idx?{indices:idx}:{}),provenance
      });
      check(verifyFallenGeometryImportReceipt(imported.receipt),'fallen_receipt_invalid');
      const materialId=p.material===undefined?fallbackId:
        (check(uint(p.material)&&p.material<materialCount,'primitive_material_invalid'),materials[p.material].id);
      totalTriangles+=imported.receipt.triangleCount;
      geometry.push(imported.geometry);imports.push(imported.receipt);
      primitiveBindings.push({meshIndex:mi,primitiveIndex:pi,geometryId:id,materialId,
        vertexCount:v,triangleCount:imported.receipt.triangleCount});
    }
  }
  let lodList=lods||[{level:0,meshIndex:0,minDistance:0}];
  check(Array.isArray(lodList)&&lodList.length>0,'lods_missing');
  lodList=lodList.map((row,i)=>{
    check(row.level===i&&uint(row.meshIndex)&&row.meshIndex<gltf.meshes.length&&
      Number.isFinite(row.minDistance)&&row.minDistance>=0,
      'lod_invalid:'+i);
    if(i===0)check(row.minDistance===0,'lod_zero_distance_required');
    else check(row.minDistance>lodList[i-1].minDistance,'lod_distance_order_invalid');
    return {level:i,meshIndex:row.meshIndex,minDistance:row.minDistance};
  });
  check(new Set(lodList.map(x=>x.meshIndex)).size===lodList.length,'lod_mesh_reuse_invalid');
  const renderLods=lodList.map(l=>({...l,
    primitives:primitiveBindings.filter(b=>b.meshIndex===l.meshIndex)
      .map(b=>({geometryId:b.geometryId,materialId:b.materialId}))}));
  const rendered=tex.result();
  check(rendered.totalTextureBytes<=maxTextureBytes,'texture_budget_exceeded');
  const core={
    schema:'evercraft.visual-engine.gltf-asset-pack.v1',assetId,
    provenance:structuredClone(provenance),sourceDocumentSha256:'sha256:'+digest(gltf),
    buffers:binary.map((b,i)=>({index:i,sha256:'sha256:'+sha(b),bytes:b.length})),
    images:rendered.imageEvidence,
    samplerDowngrades:rendered.samplerDowngrades,
    tangentFallbacks,
    qualityStatus:(rendered.samplerDowngrades.length||tangentFallbacks.length)?'preview_degraded':'source_sampling_preserved',
    geometry:geometry.map(g=>({id:g.id,digest:geometryAssetDigest(g),
      vertices:g.positions.length/3,triangles:(g.indices?.length||g.positions.length/3)/3})),
    materials:materials.map(m=>({id:m.id,digest:digest(m)})),
    textures:rendered.textures.map(t=>({id:t.id,digest:textureAssetDigest(t),
      bytes:t.width*t.height*4})).sort((a,b)=>a.id.localeCompare(b.id)),
    imports:imports.map(r=>r.digest),lods:renderLods,
    totalVertices,totalTriangles,totalTextureBytes:rendered.totalTextureBytes,
    limits:{maxVertices,maxTextureBytes},
    limitations:['mesh_resources_only','no_scene_node_transform_baking',
      'decoded_image_pixels_supplied_by_trusted_caller','no_unsupported_gltf_extensions']
  };
  return {
    ...core,
    geometries:geometry,materialDefinitions:materials,textureAssets:rendered.textures,
    receipt:{...core,digest:digest(core)}
  };
}
export function selectGltfLod(bundle,distance){
  check(Number.isFinite(distance)&&distance>=0,'lod_select_distance_invalid');
  check(bundle?.receipt?.digest===digest(Object.fromEntries(
    Object.entries(bundle.receipt).filter(([k])=>k!=='digest')))&&
    JSON.stringify(bundle.lods)===JSON.stringify(bundle.receipt.lods),
    'lod_receipt_invalid');
  let selected=bundle.lods[0];
  for(const row of bundle.lods){if(distance>=row.minDistance)selected=row;}
  return structuredClone(selected);
}
export function verifyGltfAssetPack(bundle){
  try{
    check(bundle?.schema==='evercraft.visual-engine.gltf-asset-pack.v1','schema_invalid');
    const {digest:claim,...core}=bundle.receipt;
    check(claim===digest(core),'receipt_invalid');
    check(bundle.geometry.length===bundle.geometries.length,'geometry_count_invalid');
    for(const row of bundle.geometry){
      check(bundle.geometries.some(g=>g.id===row.id&&geometryAssetDigest(g)===row.digest),
        'geometry_digest_invalid');
    }
    for(const row of bundle.materials){
      check(bundle.materialDefinitions.some(m=>m.id===row.id&&digest(m)===row.digest),
        'material_digest_invalid');
    }
    for(const row of bundle.textures){
      check(bundle.textureAssets.some(t=>t.id===row.id&&textureAssetDigest(t)===row.digest),
        'texture_digest_invalid');
    }
    check(JSON.stringify(bundle.lods)===JSON.stringify(bundle.receipt.lods),'lods_changed');
    check(bundle.materials.length===bundle.materialDefinitions.length,'materials_count_invalid');
    check(bundle.textures.length===bundle.textureAssets.length,'textures_count_invalid');
    return true;
  }catch{return false;}
}
