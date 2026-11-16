// A guided walk through an INVENTED historical exhibition arrangement, not Yakima street directions.
// The dates, source facts and uncertainty boundaries come from the public research ledger.
import {YAKIMA_SCENE,validateYakimaScene,safeYakimaPosition} from './scene.mjs';
export const YAKIMA_TOUR_SECONDS=72;
const VIEWS=Object.freeze([
 {marker:'orientation',x:0,z:17},
 {marker:'lund-1899',x:1,z:7},
 {marker:'retail-1910',x:1,z:-6},
 {marker:'postcard',x:-1,z:-18},
 {marker:'archives',x:-1,z:-29},
 {marker:'doorways',x:1,z:-38}
].map(x=>Object.freeze(x)));
const lerp=(a,b,t)=>a+(b-a)*t;
const heading=(p,m)=>Math.atan2(m.x-p.x,p.z-m.z);
const shortest=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function yakimaTourFrame(seconds,scene=YAKIMA_SCENE){
 validateYakimaScene(scene);
 if(!Number.isFinite(seconds))throw Error('invalid_tour_elapsed');
 const lookup=new Map(scene.markers.map(m=>[m.id,m]));
 if(VIEWS.some(v=>!lookup.has(v.marker)))throw Error('tour_missing_evidence_stop');
 const elapsed=Math.max(0,Math.min(YAKIMA_TOUR_SECONDS,seconds));
 const d=YAKIMA_TOUR_SECONDS/(VIEWS.length-1);
 const leg=Math.min(VIEWS.length-2,Math.floor(elapsed/d));
 const fraction=Math.min(1,(elapsed-leg*d)/d);
 const eased=fraction*fraction*(3-2*fraction);
 const a=VIEWS[leg],b=VIEWS[leg+1],pos=safeYakimaPosition(lerp(a.x,b.x,eased),lerp(a.z,b.z,eased));
 const yawA=heading(a,lookup.get(a.marker)),yawB=heading(b,lookup.get(b.marker));
 const marker=lookup.get(fraction>=.55?b.marker:a.marker);
 return Object.freeze({x:pos.x,z:pos.z,yaw:yawA+shortest(yawA,yawB)*eased,pitch:-.10,
  markerId:marker.id,markerTitle:marker.title,source:scene.sources[marker.source],
  elapsed,progress:elapsed/YAKIMA_TOUR_SECONDS,finished:elapsed>=YAKIMA_TOUR_SECONDS,
  evidenceBoundary:'All layouts and walking coordinates are illustrative, never a map of underground connections.'});
}
