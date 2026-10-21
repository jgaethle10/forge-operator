import {validateGeometryAsset,type GeometryAsset} from './webgpu.js';

/**
 * Physically placed, deterministic toroidal geometry for owned synthetic scenes.
 * Produces a real triangle mesh with radial normals and repeatable UVs.
 * No pixel rendering, external model provider or third-party assets.
 */
export interface TorusGeometryOptions{
  id:string;
  majorRadius:number;
  tubeRadius:number;
  radialSegments?:number;
  tubularSegments?:number;
}
function finite(value:number,label:string){
  if(!Number.isFinite(value)) throw new Error('world_procedural_'+label+'_invalid');
}
export function makeTorusGeometry(options:TorusGeometryOptions):GeometryAsset{
  const {id,majorRadius,tubeRadius}=options;
  if(!/^[a-z0-9][a-z0-9:/._-]{1,125}$/.test(id||''))throw new Error('world_procedural_id_invalid');
  finite(majorRadius,'major_radius');finite(tubeRadius,'tube_radius');
  if(majorRadius<0.05||majorRadius>1000)throw new Error('world_procedural_major_radius_out_of_range');
  if(tubeRadius<0.01||tubeRadius>=majorRadius||tubeRadius>100)throw new Error('world_procedural_tube_radius_out_of_range');
  const radial=options.radialSegments??40,tubular=options.tubularSegments??10;
  if(!Number.isInteger(radial)||radial<8||radial>128 ||
     !Number.isInteger(tubular)||tubular<4||tubular>32 ||
     radial*tubular>4096)throw new Error('world_procedural_segments_invalid');
  const positions:number[]=[],normals:number[]=[],uvs:number[]=[];
  const vertex=(i:number,j:number)=>{
    const angle=2*Math.PI*i/radial,tube=2*Math.PI*j/tubular;
    const ca=Math.cos(angle),sa=Math.sin(angle),cb=Math.cos(tube),sb=Math.sin(tube);
    const radius=majorRadius+tubeRadius*cb;
    return {point:[radius*ca,tubeRadius*sb,radius*sa],
      normal:[ca*cb,sb,sa*cb],uv:[i/radial,j/tubular]};
  };
  for(let i=0;i<radial;i++){
    for(let j=0;j<tubular;j++){
      for(const [x,y] of [[i,j],[i+1,j],[i+1,j+1],[i,j],[i+1,j+1],[i,j+1]]){
        const v=vertex(x,y);
        positions.push(...v.point);
        normals.push(...v.normal);
        uvs.push(...v.uv);
      }
    }
  }
  const geometry:GeometryAsset={
    schema:'evercraft.world-engine.geometry.v1',id,primitive:'triangles',
    positions,normals,uvs
  };
  validateGeometryAsset(geometry);
  return geometry;
}
