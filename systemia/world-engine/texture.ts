import crypto from 'node:crypto';

export type TextureFormat='rgba8unorm'|'rgba8unorm-srgb';
export type TextureAddressMode='clamp-to-edge'|'repeat'|'mirror-repeat';
export type TextureFilterMode='nearest'|'linear';

export interface TextureSamplerDefinition {
  addressModeU?:TextureAddressMode;
  addressModeV?:TextureAddressMode;
  magFilter?:TextureFilterMode;
  minFilter?:TextureFilterMode;
}

export interface NormalizedTextureSampler {
  addressModeU:TextureAddressMode;
  addressModeV:TextureAddressMode;
  magFilter:TextureFilterMode;
  minFilter:TextureFilterMode;
}

export interface TextureAsset {
  schema:'evercraft.world-engine.texture.v1';
  id:string;
  width:number;
  height:number;
  format:TextureFormat;
  data:number[];
}

export interface TextureHotReloadReceipt {
  schema:'evercraft.world-engine.texture-hot-reload.v1';
  textureId:string;
  previousDigest:string|null;
  nextDigest:string;
  replaced:boolean;
  digest:string;
}

export interface TextureHotReloadResult {
  textures:TextureAsset[];
  receipt:TextureHotReloadReceipt;
}

export interface TextureResidencyPlan {
  schema:'evercraft.world-engine.texture-residency.v1';
  budgetBytes:number;
  requiredTextureIds:string[];
  retainedTextureIds:string[];
  loadTextureIds:string[];
  evictTextureIds:string[];
  totalResidentBytes:number;
  textureDigests:Array<{
    id:string;
    digest:string;
    bytes:number;
  }>;
  digest:string;
}

function clone<T>(value:T):T{
  return structuredClone(value);
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,val])=>[key,stable(val)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function safeId(value:string,label:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(id)){
    throw new Error(`texture_${label}_invalid`);
  }
  return id;
}

export function textureByteLength(texture:TextureAsset){
  return texture.width*texture.height*4;
}

export function validateTextureAsset(texture:TextureAsset){
  if(texture?.schema!=='evercraft.world-engine.texture.v1'){
    throw new Error('texture_schema_invalid');
  }
  safeId(texture.id,'id');
  if(!Number.isInteger(texture.width) || texture.width<1 || texture.width>16384){
    throw new Error(`texture_width_invalid:${texture.id}`);
  }
  if(!Number.isInteger(texture.height) || texture.height<1 || texture.height>16384){
    throw new Error(`texture_height_invalid:${texture.id}`);
  }
  if(texture.format!=='rgba8unorm' && texture.format!=='rgba8unorm-srgb'){
    throw new Error(`texture_format_invalid:${texture.id}`);
  }
  const expected=textureByteLength(texture);
  if(!Array.isArray(texture.data) || texture.data.length!==expected){
    throw new Error(`texture_data_length_invalid:${texture.id}:${expected}`);
  }
  for(const value of texture.data){
    if(!Number.isInteger(value) || value<0 || value>255){
      throw new Error(`texture_data_byte_invalid:${texture.id}`);
    }
  }
  return true;
}

export function textureAssetDigest(texture:TextureAsset){
  validateTextureAsset(texture);
  return digest(texture);
}

export function normalizeTextureSampler(
  sampler:TextureSamplerDefinition|undefined
):NormalizedTextureSampler{
  const normalized:NormalizedTextureSampler={
    addressModeU:sampler?.addressModeU || 'repeat',
    addressModeV:sampler?.addressModeV || 'repeat',
    magFilter:sampler?.magFilter || 'linear',
    minFilter:sampler?.minFilter || 'linear'
  };
  if(!['clamp-to-edge','repeat','mirror-repeat'].includes(normalized.addressModeU)){
    throw new Error('texture_sampler_address_u_invalid');
  }
  if(!['clamp-to-edge','repeat','mirror-repeat'].includes(normalized.addressModeV)){
    throw new Error('texture_sampler_address_v_invalid');
  }
  if(!['nearest','linear'].includes(normalized.magFilter)){
    throw new Error('texture_sampler_mag_filter_invalid');
  }
  if(!['nearest','linear'].includes(normalized.minFilter)){
    throw new Error('texture_sampler_min_filter_invalid');
  }
  return normalized;
}

export function textureSamplerKey(
  sampler:TextureSamplerDefinition|undefined
){
  const normalized=normalizeTextureSampler(sampler);
  return [
    normalized.addressModeU,
    normalized.addressModeV,
    normalized.magFilter,
    normalized.minFilter
  ].join(':');
}

export function applyTextureHotReload(
  current:TextureAsset[],
  next:TextureAsset
):TextureHotReloadResult{
  validateTextureAsset(next);
  const seen=new Set<string>();
  for(const texture of current){
    validateTextureAsset(texture);
    if(seen.has(texture.id)) throw new Error(`texture_duplicate:${texture.id}`);
    seen.add(texture.id);
  }

  const previous=current.find(texture=>texture.id===next.id) || null;
  const previousDigest=previous?textureAssetDigest(previous):null;
  const nextDigest=textureAssetDigest(next);
  const textures=[
    ...current.filter(texture=>texture.id!==next.id).map(clone),
    clone(next)
  ].sort((a,b)=>a.id.localeCompare(b.id));

  const core={
    schema:'evercraft.world-engine.texture-hot-reload.v1' as const,
    textureId:next.id,
    previousDigest,
    nextDigest,
    replaced:Boolean(previous)
  };
  return {
    textures,
    receipt:{...core,digest:digest(core)}
  };
}

export function planTextureResidency(
  currentResidentIds:string[],
  requiredTextureIds:string[],
  textures:TextureAsset[],
  budgetBytes:number
):TextureResidencyPlan{
  if(!Number.isInteger(budgetBytes) || budgetBytes<0){
    throw new Error('texture_residency_budget_invalid');
  }

  const textureMap=new Map<string,TextureAsset>();
  for(const texture of textures){
    validateTextureAsset(texture);
    if(textureMap.has(texture.id)) throw new Error(`texture_duplicate:${texture.id}`);
    textureMap.set(texture.id,clone(texture));
  }

  const required=[...new Set(requiredTextureIds)].sort();
  const resident=[...new Set(currentResidentIds)].sort();
  const textureDigests=required.map(id=>{
    const texture=textureMap.get(id);
    if(!texture) throw new Error(`texture_residency_asset_missing:${id}`);
    return {
      id,
      digest:textureAssetDigest(texture),
      bytes:textureByteLength(texture)
    };
  });
  const totalResidentBytes=textureDigests.reduce((sum,row)=>sum+row.bytes,0);
  if(totalResidentBytes>budgetBytes){
    throw new Error(
      `texture_residency_budget_exceeded:${totalResidentBytes}:${budgetBytes}`
    );
  }

  const requiredSet=new Set(required);
  const residentSet=new Set(resident);
  const retainedTextureIds=required.filter(id=>residentSet.has(id));
  const loadTextureIds=required.filter(id=>!residentSet.has(id));
  const evictTextureIds=resident.filter(id=>!requiredSet.has(id));

  const core={
    schema:'evercraft.world-engine.texture-residency.v1' as const,
    budgetBytes,
    requiredTextureIds:required,
    retainedTextureIds,
    loadTextureIds,
    evictTextureIds,
    totalResidentBytes,
    textureDigests
  };
  return {...core,digest:digest(core)};
}

export function verifyTextureResidencyPlan(plan:TextureResidencyPlan){
  if(plan?.schema!=='evercraft.world-engine.texture-residency.v1') return false;
  const {digest:claimed,...core}=plan;
  return typeof claimed==='string' && claimed===digest(core);
}
