// Evercraft Worlds: deliberately small, deterministic adaptive framebuffer quality governor.
// Rendering scale changes only; world physics and saved object coordinates remain unchanged.
export const QUALITY_KEY='evercraft.worlds.quality.v1';
export const QUALITY_MODES=['auto','smooth','sharp'];
export const DEFAULT_QUALITY={scale:1,slowSamples:0,fastSamples:0};
const round=n=>Math.round(n*100)/100;
export function validQualityMode(raw){return QUALITY_MODES.includes(raw)?raw:'auto';}
export function modeScale(mode,state=DEFAULT_QUALITY){return mode==='smooth'?.62:mode==='sharp'?1:state.scale;}
export function tuneQuality(state,measuredFps){
 const current={...DEFAULT_QUALITY,...state};
 if(!Number.isFinite(measuredFps)||measuredFps<=0)return current;
 if(measuredFps<28){
  const count=current.slowSamples+1;
  return {scale:count>=2?round(Math.max(.55,current.scale-.12)):current.scale,slowSamples:count>=2?0:count,fastSamples:0};
 }
 if(measuredFps>52){
  const count=current.fastSamples+1;
  return {scale:count>=8?round(Math.min(1,current.scale+.06)):current.scale,slowSamples:0,fastSamples:count>=8?0:count};
 }
 return {...current,slowSamples:0,fastSamples:0};
}
