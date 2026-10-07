import crypto from 'node:crypto';
import {
  geometryAssetDigest,
  validateGeometryAsset,
  type GeometryAsset
} from './webgpu.js';

export type FallenGeometryRightsState=
  | 'owned'
  | 'licensed'
  | 'public_domain'
  | 'restricted'
  | 'unknown';

export interface FallenGeometryProvenance {
  sourceRef:string;
  rightsState:FallenGeometryRightsState;
  license:string;
  attribution?:string;
}

export interface FallenGeometryAsset {
  schema:'evercraft.fallen.geometry.v1';
  id:string;
  primitive:'triangles';
  coordinateSystem:'right_handed_y_up';
  units:'meters';
  positions:number[];
  normals:number[];
  uvs:number[];
  tangents?:number[];
  indices?:number[];
  provenance:FallenGeometryProvenance;
}

export interface FallenGeometryImportReceipt {
  schema:'evercraft.world-engine.fallen-geometry-import.v1';
  sourceAssetId:string;
  sourceDigest:string;
  sourceRef:string;
  rightsState:FallenGeometryRightsState;
  license:string;
  provenanceDigest:string;
  geometryId:string;
  geometryDigest:string;
  vertexCount:number;
  triangleCount:number;
  coordinateSystem:'right_handed_y_up';
  units:'meters';
  tangentSource:'authored'|'generated';
  tangentGeneration:'authored'|'deterministic_uv_gram_schmidt_v1';
  generatedTangents:boolean;
  digest:string;
}

export interface FallenGeometryImportResult {
  geometry:GeometryAsset;
  receipt:FallenGeometryImportReceipt;
}

function stable(value:unknown):unknown{
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value as Record<string,unknown>)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value:unknown){
  return crypto.createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function safeId(value:string,label:string){
  const id=String(value||'').trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,255}$/.test(id)){
    throw new Error(`fallen_geometry_${label}_invalid`);
  }
  return id;
}

function finite(value:number,label:string){
  if(!Number.isFinite(value)){
    throw new Error(`fallen_geometry_${label}_non_finite`);
  }
}

function normalize3(x:number,y:number,z:number,label:string){
  finite(x,label);finite(y,label);finite(z,label);
  const length=Math.sqrt(x*x+y*y+z*z);
  if(length<=1e-12) throw new Error(`fallen_geometry_${label}_zero`);
  return [x/length,y/length,z/length] as [number,number,number];
}

function cross3(
  ax:number,ay:number,az:number,
  bx:number,by:number,bz:number
){
  return [
    ay*bz-az*by,
    az*bx-ax*bz,
    ax*by-ay*bx
  ] as [number,number,number];
}

function validateSourceArrays(
  positions:number[],
  normals:number[],
  uvs:number[],
  indices?:number[]
){
  if(!Array.isArray(positions) || positions.length<9 || positions.length%3!==0){
    throw new Error('fallen_geometry_positions_invalid');
  }
  const vertexCount=positions.length/3;
  if(!Array.isArray(normals) || normals.length!==positions.length){
    throw new Error('fallen_geometry_normals_invalid');
  }
  if(!Array.isArray(uvs) || uvs.length!==vertexCount*2){
    throw new Error('fallen_geometry_uvs_invalid');
  }

  for(const value of positions) finite(value,'position');
  for(const value of normals) finite(value,'normal');
  for(const value of uvs) finite(value,'uv');

  for(let vertex=0;vertex<vertexCount;vertex++){
    const base=vertex*3;
    normalize3(
      normals[base],
      normals[base+1],
      normals[base+2],
      `normal_vertex_${vertex}`
    );
  }

  const triangleIndices=indices
    ? [...indices]
    : Array.from({length:vertexCount},(_,index)=>index);

  if(triangleIndices.length<3 || triangleIndices.length%3!==0){
    throw new Error('fallen_geometry_triangles_invalid');
  }
  for(const index of triangleIndices){
    if(!Number.isInteger(index) || index<0 || index>=vertexCount){
      throw new Error('fallen_geometry_index_invalid');
    }
  }
  return {vertexCount,triangleIndices};
}

function validateProvenance(provenance:FallenGeometryProvenance){
  if(!String(provenance?.sourceRef||'').trim()){
    throw new Error('fallen_geometry_provenance_source_missing');
  }
  if(!['owned','licensed','public_domain','restricted','unknown'].includes(
    provenance?.rightsState
  )){
    throw new Error('fallen_geometry_provenance_rights_invalid');
  }
  if(!String(provenance?.license||'').trim()){
    throw new Error('fallen_geometry_provenance_license_missing');
  }
  return true;
}

function validateAuthoredTangents(
  normals:number[],
  tangents:number[],
  vertexCount:number
){
  if(!Array.isArray(tangents) || tangents.length!==vertexCount*4){
    throw new Error('fallen_geometry_authored_tangents_invalid');
  }
  for(let vertex=0;vertex<vertexCount;vertex++){
    const nbase=vertex*3;
    const tbase=vertex*4;
    const [nx,ny,nz]=normalize3(
      normals[nbase],
      normals[nbase+1],
      normals[nbase+2],
      `normal_vertex_${vertex}`
    );
    const [tx,ty,tz]=normalize3(
      tangents[tbase],
      tangents[tbase+1],
      tangents[tbase+2],
      `tangent_vertex_${vertex}`
    );
    const handedness=tangents[tbase+3];
    finite(handedness,`tangent_handedness_vertex_${vertex}`);
    if(handedness!==1 && handedness!==-1){
      throw new Error(
        `fallen_geometry_tangent_handedness_invalid:${vertex}`
      );
    }
    const dot=nx*tx+ny*ty+nz*tz;
    if(Math.abs(dot)>1e-5){
      throw new Error(
        `fallen_geometry_tangent_not_orthogonal:${vertex}`
      );
    }
    const rawLength=Math.sqrt(
      tangents[tbase]*tangents[tbase] +
      tangents[tbase+1]*tangents[tbase+1] +
      tangents[tbase+2]*tangents[tbase+2]
    );
    if(Math.abs(rawLength-1)>1e-5){
      throw new Error(
        `fallen_geometry_tangent_not_normalized:${vertex}`
      );
    }
  }
  return true;
}

export function generateDeterministicTangents(
  positions:number[],
  normals:number[],
  uvs:number[],
  indices?:number[]
){
  const {vertexCount,triangleIndices}=validateSourceArrays(
    positions,
    normals,
    uvs,
    indices
  );

  const tan1=new Float64Array(vertexCount*3);
  const tan2=new Float64Array(vertexCount*3);

  for(let offset=0;offset<triangleIndices.length;offset+=3){
    const i0=triangleIndices[offset];
    const i1=triangleIndices[offset+1];
    const i2=triangleIndices[offset+2];

    const p0=i0*3,p1=i1*3,p2=i2*3;
    const uv0=i0*2,uv1=i1*2,uv2=i2*2;

    const x1=positions[p1]-positions[p0];
    const y1=positions[p1+1]-positions[p0+1];
    const z1=positions[p1+2]-positions[p0+2];
    const x2=positions[p2]-positions[p0];
    const y2=positions[p2+1]-positions[p0+1];
    const z2=positions[p2+2]-positions[p0+2];

    const s1=uvs[uv1]-uvs[uv0];
    const t1=uvs[uv1+1]-uvs[uv0+1];
    const s2=uvs[uv2]-uvs[uv0];
    const t2=uvs[uv2+1]-uvs[uv0+1];

    const denominator=s1*t2-s2*t1;
    if(!Number.isFinite(denominator) || Math.abs(denominator)<=1e-12){
      throw new Error(
        `fallen_geometry_uv_triangle_degenerate:${offset/3}`
      );
    }

    const inv=1/denominator;
    const tx=(x1*t2-x2*t1)*inv;
    const ty=(y1*t2-y2*t1)*inv;
    const tz=(z1*t2-z2*t1)*inv;
    const bx=(x2*s1-x1*s2)*inv;
    const by=(y2*s1-y1*s2)*inv;
    const bz=(z2*s1-z1*s2)*inv;

    const triangleAreaVector=cross3(x1,y1,z1,x2,y2,z2);
    const weight=Math.sqrt(
      triangleAreaVector[0]*triangleAreaVector[0] +
      triangleAreaVector[1]*triangleAreaVector[1] +
      triangleAreaVector[2]*triangleAreaVector[2]
    );
    if(!Number.isFinite(weight) || weight<=1e-12){
      throw new Error(
        `fallen_geometry_position_triangle_degenerate:${offset/3}`
      );
    }

    for(const index of [i0,i1,i2]){
      const base=index*3;
      tan1[base]+=tx*weight;
      tan1[base+1]+=ty*weight;
      tan1[base+2]+=tz*weight;
      tan2[base]+=bx*weight;
      tan2[base+1]+=by*weight;
      tan2[base+2]+=bz*weight;
    }
  }

  const tangents:number[]=[];
  for(let vertex=0;vertex<vertexCount;vertex++){
    const base=vertex*3;
    const [nx,ny,nz]=normalize3(
      normals[base],
      normals[base+1],
      normals[base+2],
      `normal_vertex_${vertex}`
    );
    const dot=nx*tan1[base]+ny*tan1[base+1]+nz*tan1[base+2];
    const [tx,ty,tz]=normalize3(
      tan1[base]-nx*dot,
      tan1[base+1]-ny*dot,
      tan1[base+2]-nz*dot,
      `generated_tangent_vertex_${vertex}`
    );
    const [cx,cy,cz]=cross3(nx,ny,nz,tx,ty,tz);
    const handedness=(
      cx*tan2[base]+
      cy*tan2[base+1]+
      cz*tan2[base+2]
    )<0 ? -1 : 1;
    tangents.push(tx,ty,tz,handedness);
  }
  return tangents;
}

export function geometryFromFallenAsset(
  asset:FallenGeometryAsset
):FallenGeometryImportResult{
  if(asset?.schema!=='evercraft.fallen.geometry.v1'){
    throw new Error('fallen_geometry_schema_invalid');
  }
  safeId(asset.id,'id');
  if(asset.primitive!=='triangles'){
    throw new Error(
      `fallen_geometry_primitive_unsupported:${asset.id}`
    );
  }
  if(asset.coordinateSystem!=='right_handed_y_up'){
    throw new Error('fallen_geometry_coordinate_system_unsupported');
  }
  if(asset.units!=='meters'){
    throw new Error('fallen_geometry_units_unsupported');
  }
  validateProvenance(asset.provenance);

  const {vertexCount}=validateSourceArrays(
    asset.positions,
    asset.normals,
    asset.uvs,
    asset.indices
  );

  const tangentSource:'authored'|'generated'=
    asset.tangents?'authored':'generated';
  const tangents=asset.tangents
    ? [...asset.tangents]
    : generateDeterministicTangents(
        asset.positions,
        asset.normals,
        asset.uvs,
        asset.indices
      );

  if(asset.tangents){
    validateAuthoredTangents(asset.normals,tangents,vertexCount);
  }

  const sourceDigest=digest(asset);
  const provenanceDigest=digest(asset.provenance);
  const geometry:GeometryAsset={
    schema:'evercraft.world-engine.geometry.v1',
    id:asset.id,
    primitive:'triangles',
    positions:[...asset.positions],
    normals:[...asset.normals],
    uvs:[...asset.uvs],
    tangents,
    ...(asset.indices?{indices:[...asset.indices]}:{})
  };

  validateGeometryAsset(geometry);
  const geometryDigest=geometryAssetDigest(geometry);
  const core={
    schema:'evercraft.world-engine.fallen-geometry-import.v1' as const,
    sourceAssetId:asset.id,
    sourceDigest,
    sourceRef:asset.provenance.sourceRef,
    rightsState:asset.provenance.rightsState,
    license:asset.provenance.license,
    provenanceDigest,
    geometryId:geometry.id,
    geometryDigest,
    vertexCount,
    triangleCount:(geometry.indices?.length || vertexCount)/3,
    coordinateSystem:'right_handed_y_up' as const,
    units:'meters' as const,
    tangentSource,
    tangentGeneration:(
      tangentSource==='authored'
        ? 'authored'
        : 'deterministic_uv_gram_schmidt_v1'
    ) as 'authored'|'deterministic_uv_gram_schmidt_v1',
    generatedTangents:tangentSource==='generated'
  };

  return {
    geometry,
    receipt:{...core,digest:digest(core)}
  };
}

export function verifyFallenGeometryImportReceipt(
  receipt:FallenGeometryImportReceipt
){
  if(receipt?.schema!=='evercraft.world-engine.fallen-geometry-import.v1'){
    return false;
  }
  const {digest:claimed,...core}=receipt;
  return typeof claimed==='string' && claimed===digest(core);
}
