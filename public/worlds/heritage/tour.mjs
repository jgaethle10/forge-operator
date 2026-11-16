// Evercraft Worlds / Below the Line: deterministic guided camera tour.
// Original educational geometry only. No survey points, underwater routes or autonomous system claims.
import {PAVLOPETRI_SCENE,validateHeritageScene,safePlayerPosition} from './scene.mjs';
export const HERITAGE_TOUR_SECONDS=60;
// Virtual viewpoints in fictional schematic coordinates, not real-world positions.
const VIEWS=Object.freeze([
 Object.freeze({marker:'orientation',x:0,z:17}),
 Object.freeze({marker:'street',x:1,z:8}),
 Object.freeze({marker:'building',x:-5,z:0}),
 Object.freeze({marker:'courtyard',x:6,z:-8}),
 Object.freeze({marker:'ridge',x:16,z:-15})
]);
const lerp=(a,b,t)=>a+(b-a)*t;
const heading=(camera,marker)=>Math.atan2(marker.x-camera.x,camera.z-marker.z);
const shortestTurn=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
export function heritageTourFrame(seconds,scene=PAVLOPETRI_SCENE){
 validateHeritageScene(scene);
 if(!Number.isFinite(seconds))throw Error('Invalid tour time');
 const markers=new Map(scene.markers.map(m=>[m.id,m]));
 if(VIEWS.some(v=>!markers.has(v.marker)))throw Error('Missing guided evidence marker');
 const elapsed=Math.max(0,Math.min(HERITAGE_TOUR_SECONDS,seconds));
 const length=HERITAGE_TOUR_SECONDS/(VIEWS.length-1);
 const leg=Math.min(VIEWS.length-2,Math.floor(elapsed/length));
 const fraction=Math.min(1,(elapsed-leg*length)/length);
 const eased=fraction*fraction*(3-2*fraction);
 const a=VIEWS[leg],b=VIEWS[leg+1];
 const position=safePlayerPosition(lerp(a.x,b.x,eased),lerp(a.z,b.z,eased));
 const yawA=heading(a,markers.get(a.marker)),yawB=heading(b,markers.get(b.marker));
 const yaw=yawA+shortestTurn(yawA,yawB)*eased;
 const marker=markers.get(fraction>=.55?b.marker:a.marker);
 return Object.freeze({
  x:position.x,z:position.z,yaw,pitch:-.10,
  markerId:marker.id,markerTitle:marker.title,source:scene.sources[marker.source],
  elapsed,progress:elapsed/HERITAGE_TOUR_SECONDS,finished:elapsed>=HERITAGE_TOUR_SECONDS,
  evidenceBoundary:'Original schematic layout; not surveyed, georeferenced or diving guidance.'
 });
}
