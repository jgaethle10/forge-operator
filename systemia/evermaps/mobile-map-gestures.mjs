/** Projection-aware one/two pointer map gesture: pan + anchored pinch zoom. */
export function computeMapGesture({view,before,after,width,height}){
 if(!view||!Array.isArray(view.center)||!Number.isFinite(view.scale)||
    view.scale<=0||!Number.isFinite(width)||!Number.isFinite(height)||
    width<=0||height<=0||!Array.isArray(before)||!Array.isArray(after)||
    before.length!==after.length||before.length<1||before.length>2)
  throw Error('Invalid map gesture');
 const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 if(!before.every(valid)||!after.every(valid)||!view.center.every(Number.isFinite))
  throw Error('Non-finite map gesture');
 const center=pts=>pts.reduce((s,p)=>[s[0]+p[0]/pts.length,s[1]+p[1]/pts.length],[0,0]);
 const first=center(before),last=center(after);
 let multiplier=1;
 if(before.length===2){
  const span=p=>Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);
  const original=span(before),updated=span(after);
  if(original>2&&updated>2)multiplier=updated/original;
 }
 const scale=Math.max(.03,Math.min(500000,view.scale*multiplier));
 const cosine=lat=>Math.max(.05,Math.cos(lat*Math.PI/180));
 const anchorLat=view.center[1]-(first[1]-height/2)/view.scale;
 const anchorLon=view.center[0]+(first[0]-width/2)/(view.scale*cosine(view.center[1]));
 const newLat=anchorLat+(last[1]-height/2)/scale;
 const newLon=anchorLon-(last[0]-width/2)/(scale*cosine(newLat));
 if(!Number.isFinite(newLon)||!Number.isFinite(newLat))throw Error('Gesture overflow');
 return {center:[newLon,newLat],scale};
}
