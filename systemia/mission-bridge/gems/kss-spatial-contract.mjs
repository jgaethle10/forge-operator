// Kennedy Space Station -> GEMS geometry handoff contract.
// Pure read-only spatial checks; does NOT invoke KSS or grant its authority.
// Only shape, CRS and pixel/world round-trip validation for public metadata.
const fail=(reason)=>Object.freeze({schema:'evercraft.kss.gems-spatial-contract.v1',state:'held',reason,
  kss_worker_invoked:false,real_gems_raster_opened:false});
const numbers=(a,n)=>Array.isArray(a)&&a.length===n&&a.every(Number.isFinite);
const eps=1e-7;
export function verifyGemsKssSpatialContract(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||
   Object.keys(input).some(x=>!['schema','width','height','crs','affine','pixel_size_m','band_count','data_type','nodata_representation'].includes(x)))
   return fail('metadata_fields_invalid');
 if(input.schema!=='evercraft.kss.gems-spatial-metadata.v1')return fail('schema_invalid');
 if(input.width!==3292||input.height!==3730||input.crs!=='EPSG:32611'||
  input.band_count!==1||input.data_type!=='float32'||input.nodata_representation!=='NaN')
   return fail('gems_geospatial_contract_mismatch');
 if(!numbers(input.affine,6)||!numbers(input.pixel_size_m,2))return fail('affine_invalid');
 const [a,b,c,d,e,f]=input.affine;
 if(Math.abs(a-100)>eps||Math.abs(e+100)>eps||Math.abs(b)>eps||Math.abs(d)>eps||
  Math.abs(input.pixel_size_m[0]-100)>eps||Math.abs(input.pixel_size_m[1]-100)>eps)
   return fail('grid_resolution_or_rotation_invalid');
 const determinant=a*e-b*d;
 if(!Number.isFinite(determinant)||Math.abs(determinant)<eps)return fail('affine_singular');
 const probes=[[0,0],[input.width-1,0],[0,input.height-1],
   [input.width-1,input.height-1],[Math.floor(input.width/2),Math.floor(input.height/2)]];
 const results=probes.map(([col,row])=>{
   const worldX=a*(col+0.5)+b*(row+0.5)+c;
   const worldY=d*(col+0.5)+e*(row+0.5)+f;
   const dx=worldX-c,dy=worldY-f;
   const inverseCol=(e*dx-b*dy)/determinant-0.5;
   const inverseRow=(-d*dx+a*dy)/determinant-0.5;
   return {pixel:[col,row],world_m:[worldX,worldY],
     roundtrip_error_px:Math.max(Math.abs(inverseCol-col),Math.abs(inverseRow-row))};
 });
 if(results.some(x=>!Number.isFinite(x.roundtrip_error_px)||x.roundtrip_error_px>1e-7))
   return fail('pixel_world_roundtrip_invalid');
 return Object.freeze({schema:'evercraft.kss.gems-spatial-contract.v1',state:'geometry_contract_verified',
   crs:input.crs,grid:[input.width,input.height],pixel_size_m:[100,100],
   world_bounds_m:[c+input.width*a,f+input.height*e,c,f].sort((x,y)=>x-y),
   checks:results,coordinate_roundtrip_passed:true,
   kss_worker_invoked:false,real_gems_raster_opened:false,
   source_only_geometry_test:true,reference_mask_verified:false,
   source_geometry_validation_not_official_scoring:true});
}
