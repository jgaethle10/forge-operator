/** FIRST-CONTACT-001 | Bearing-only dual-observer geometry control.
 * Pure synthetic ENU geometry, not extracted from any UAP recording.
 * x East, y North, z Up in meters; azimuth clockwise from North,
 * elevation above horizontal. Observer positions must use one surveyed frame.
 */
const dot = (a,b) => a.x*b.x+a.y*b.y+a.z*b.z;
const subtract = (a,b) => ({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add = (a,b) => ({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const scale = (a,s) => ({x:a.x*s,y:a.y*s,z:a.z*s});
const norm = a => Math.hypot(a.x,a.y,a.z);
const rad = v => v*Math.PI/180;
const deg = v => v*180/Math.PI;
function finite(name,v) {
  if(typeof v!=="number" || !Number.isFinite(v)) throw new TypeError(`${name} must be finite`);
  return v;
}
function observer(o,name) {
  if(!o || typeof o!=="object") throw new TypeError(`${name} must be a 3D observer position`);
  return {x:finite(name+'.x',o.x),y:finite(name+'.y',o.y),z:finite(name+'.z',o.z)};
}
export function bearingDirection({azimuthDegrees,elevationDegrees}) {
  const az=rad(finite('azimuthDegrees',azimuthDegrees));
  const el=finite('elevationDegrees',elevationDegrees);
  if (el < -90 || el > 90) throw new RangeError('elevationDegrees must be within [-90,90]');
  return {x:Math.sin(az)*Math.cos(rad(el)),y:Math.cos(az)*Math.cos(rad(el)),z:Math.sin(rad(el))};
}
export function bearingToTarget({observerMeters,targetMeters}) {
  const p=observer(observerMeters,'observerMeters');
  const t=observer(targetMeters,'targetMeters');
  const d=subtract(t,p),r=norm(d);
  if (r===0) throw new RangeError('observer and target cannot coincide');
  return {observerMeters:p,azimuthDegrees:(deg(Math.atan2(d.x,d.y))+360)%360,elevationDegrees:deg(Math.asin(d.z/r))};
}
export function triangulateTwoBearings({first,second,minParallaxDegrees=1,maxRayMissMeters=null}) {
  if(!first || !second) throw new TypeError('Two bearing records required');
  if(typeof minParallaxDegrees!=="number" || !Number.isFinite(minParallaxDegrees) || minParallaxDegrees<=0 || minParallaxDegrees>=90) {
    throw new RangeError('minParallaxDegrees must be strictly between 0 and 90');
  }
  if(maxRayMissMeters!==null && (typeof maxRayMissMeters!=="number" || !Number.isFinite(maxRayMissMeters) || maxRayMissMeters<0)) {
    throw new RangeError('maxRayMissMeters must be nonnegative or null');
  }
  const p=observer(first.observerMeters,'first.observerMeters');
  const q=observer(second.observerMeters,'second.observerMeters');
  if(norm(subtract(q,p))<1e-9) throw new RangeError('An independent observer baseline is required');
  const u=bearingDirection(first), v=bearingDirection(second);
  const cosine=Math.max(-1,Math.min(1,dot(u,v)));
  const parallaxDegrees=deg(Math.acos(Math.abs(cosine)));
  if(parallaxDegrees<minParallaxDegrees) throw new RangeError('Insufficient parallax: bearing rays nearly parallel');
  const w=subtract(p,q),b=dot(u,v),d=dot(u,w),e=dot(v,w);
  const denominator=1-b*b;
  if(denominator<1e-12) throw new RangeError('Numerically degenerate bearing intersection');
  const firstRangeMeters=(b*e-d)/denominator;
  const secondRangeMeters=(e-b*d)/denominator;
  if(firstRangeMeters<=0 || secondRangeMeters<=0) throw new RangeError('Closest intersection lies behind one or both observers');
  const point1=add(p,scale(u,firstRangeMeters));
  const point2=add(q,scale(v,secondRangeMeters));
  const missMeters=norm(subtract(point1,point2));
  const compatible=maxRayMissMeters===null?null:missMeters<=maxRayMissMeters+1e-9;
  return {
    status:compatible===null?'CANDIDATE_UNVALIDATED':compatible?'CONSISTENT_WITH_SPECIFIED_TOLERANCE':'INCONSISTENT_BEARINGS',
    model:'bearing_only_two_observer_ray_closest_approach',
    baselineMeters:norm(subtract(q,p)),
    parallaxDegrees,
    firstRangeMeters,secondRangeMeters,
    rayMissMeters:missMeters,
    midpointEstimateMeters:compatible===false?null:scale(add(point1,point2),.5),
    suppliedMaxRayMissMeters:maxRayMissMeters,
    limitations:[
      'Geometry alone is not validated target identity, object size or propulsion',
      'Two bearings require synchronized observations and known observer poses in one surveyed frame',
      'Angular calibration and systematic errors are not included in this deterministic result',
      'Nearly parallel views or incompatible rays cannot establish a trusted range',
      'CANDIDATE_UNVALIDATED is not a confirmed three-dimensional location'
    ]
  };
}
