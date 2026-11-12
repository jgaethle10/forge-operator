// Deterministic 60-second guided camera through fictional exhibit coordinates.
// Not a floorplan, site survey, entrance route, or real underground travel guidance.
import {TITAN_SCENE,validateTitanScene,safeGalleryPosition} from './scene.mjs';
export const TITAN_TOUR_SECONDS=60;
const VIEWS=Object.freeze([
 {marker:'orientation',x:0,z:17},
 {marker:'silo-idea',x:-9,z:9},
 {marker:'lift-idea',x:9,z:5},
 {marker:'crew',x:7,z:-11},
 {marker:'interconnected',x:-7,z:-26}
].map(x=>Object.freeze(x)));
const lerp=(a,b,t)=>a+(b-a)*t,heading=(pos,marker)=>Math.atan2(marker.x-pos.x,pos.z-marker.z);
const shortestTurn=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export function titanGalleryTourFrame(seconds,scene=TITAN_SCENE){
 validateTitanScene(scene);
 if(!Number.isFinite(seconds))throw Error('Invalid tour time');
 const markers=new Map(scene.markers.map(m=>[m.id,m]));
 if(VIEWS.some(v=>!markers.has(v.marker)))throw Error('Missing historical evidence marker');
 const elapsed=Math.max(0,Math.min(TITAN_TOUR_SECONDS,seconds));
 const segment=TITAN_TOUR_SECONDS/(VIEWS.length-1);
 const leg=Math.min(VIEWS.length-2,Math.floor(elapsed/segment));
 const frac=Math.min(1,(elapsed-leg*segment)/segment);
 const eased=frac*frac*(3-2*frac);
 const a=VIEWS[leg],b=VIEWS[leg+1];
 const pos=safeGalleryPosition(lerp(a.x,b.x,eased),lerp(a.z,b.z,eased));
 const yawA=heading(a,markers.get(a.marker)),yawB=heading(b,markers.get(b.marker));
 const marker=markers.get(frac>=.55?b.marker:a.marker);
 return Object.freeze({x:pos.x,z:pos.z,yaw:yawA+shortestTurn(yawA,yawB)*eased,pitch:-.12,
  markerId:marker.id,markerTitle:marker.title,source:scene.sources[marker.source],
  elapsed,progress:elapsed/TITAN_TOUR_SECONDS,finished:elapsed>=TITAN_TOUR_SECONDS,
  evidenceBoundary:'Fictional museum geometry, not a Titan installation plan or access route.'});
}
