/**
 * Evercraft native hull plating material lane.
 * Source-owned, UV-space procedural steel plate seams, pigment breakup,
 * low-energy oxidation and roughness variation for real lofted geometry.
 * No external imagery, third-party textures, or historical paint claims.
 *
 * -2: existing original organic foam alpha
 * -3: NEW original illustrative steel hull plating material
 * No default changes to ordinary World Engine render plans.
 */
import type {WorldDefinition} from './engine.js';
import {validateWorldDefinition} from './engine.js';
export const NATIVE_PLATING_MATERIAL_FLAG=-3;
export const NATIVE_FOAM_MATERIAL_FLAG=-2;
export const NAVAL_PLATING_SHADER_SOURCE_ID='owned:wgsl-ship-plating-v1';
export function isOriginalLoftedNavalHullGeometry(ref:string):boolean{
 return /^owned:battle-vessel-(hood|prince-of-wales|bismarck|prinz-eugen)-hull$/.test(ref);
}
export function stageNavalPlatingSourceWorld(source:WorldDefinition):WorldDefinition{
 const w=structuredClone(source);
 const hulls=w.entities.filter(e=>e.renderable&&
  isOriginalLoftedNavalHullGeometry(e.renderable.geometryRef));
 if(hulls.length!==4)throw Error('naval_plating_requires_four_original_lofted_hulls');
 const originalIds=new Set(hulls.map(x=>x.id));
 if(originalIds.size!==4||!w.visualScene)throw Error('naval_plating_scene_invalid');
 w.metadata={...(w.metadata||{}),
  navalPlatingShader:NAVAL_PLATING_SHADER_SOURCE_ID,
  simulatedSurfaceDetails:'source_wgsl_uv_space_seams_pigment_grime_and_roughness',
  authenticHistoricalPaint:false,
  historicallyDocumentedPlateLayout:false,
  externalImageAssetsRequired:false,
  founderVisualReviewRequired:true,
  publicationAuthority:false};
 validateWorldDefinition(w);
 return w;
}
