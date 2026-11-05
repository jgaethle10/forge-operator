/** FIRST-CONTACT-001 | Synthetic 3D moving-observer reconstruction, NOT UAP data.
 * Coordinates: local ENU x=East, y=North, z=Up (meters); azimuth clockwise
 * from North; elevation positive above horizon. Flat local reference,
 * straight line of sight, point target, calibrated sensor and observer state.
 */
function finite(name,v) {
  if(typeof v!=="number" || !Number.isFinite(v)) throw new TypeError(name+" must be finite");
  return v;
}
function nonnegative(name,v) {
  finite(name,v);
  if(v<0) throw new RangeError(name+" must be nonnegative");
  return v;
}
function vector(name,v) {
  if(!v || typeof v!=="object") throw new TypeError(name+" must be a 3D coordinate");
  return {x:finite(name+".x",v.x),y:finite(name+".y",v.y),z:finite(name+".z",v.z)};
}
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const div=(a,n)=>({x:a.x/n,y:a.y/n,z:a.z/n});
const mag=a=>Math.hypot(a.x,a.y,a.z);
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI;

export function reconstructPosition(s) {
  if(!s || typeof s!=="object") throw new TypeError("sample required");
  const obs=vector("observerMeters",s.observerMeters);
  const R=finite("slantRangeMeters",s.slantRangeMeters);
  if(R<=0) throw new RangeError("slantRangeMeters must be positive");
  const az=rad(finite("azimuthDegrees",s.azimuthDegrees));
  const e=finite("elevationDegrees",s.elevationDegrees);
  if(e< -90 || e>90) throw new RangeError("elevationDegrees must be between -90 and 90");
  const el=rad(e);
  return add(obs,{x:R*Math.cos(el)*Math.sin(az),y:R*Math.cos(el)*Math.cos(az),z:R*Math.sin(el)});
}
export function inferObservation({observerMeters,targetMeters,tSeconds}) {
  const obs=vector("observerMeters",observerMeters),target=vector("targetMeters",targetMeters);
  const delta=sub(target,obs),R=mag(delta);
  if(R===0) throw new RangeError("observer cannot occupy exact target position");
  return {tSeconds:finite("tSeconds",tSeconds),observerMeters:obs,slantRangeMeters:R,
    azimuthDegrees:(deg(Math.atan2(delta.x,delta.y))+360)%360,
    elevationDegrees:deg(Math.asin(delta.z/R))};
}
export function reconstructTrack(samples, options={}) {
  if(!Array.isArray(samples)||samples.length<2) throw new RangeError("at least two observations required");
  const positions=samples.map((s,i)=>({
    tSeconds:finite("samples["+i+"].tSeconds",s?.tSeconds),
    positionMeters:reconstructPosition(s)
  }));
  for(let i=1;i<positions.length;i++)
    if(positions[i].tSeconds<=positions[i-1].tSeconds) throw new RangeError("sample times must strictly increase");
  const velocitySegments=[];
  for(let i=1;i<positions.length;i++) {
    const before=positions[i-1],after=positions[i],dt=after.tSeconds-before.tSeconds;
    const velocityMetersPerSecond=div(sub(after.positionMeters,before.positionMeters),dt);
    velocitySegments.push({startSeconds:before.tSeconds,endSeconds:after.tSeconds,
      velocityMetersPerSecond,groundSpeedMetersPerSecond:mag(velocityMetersPerSecond)});
  }
  const wind=options?.windVelocityMetersPerSecond==null?null:vector("windVelocityMetersPerSecond",options.windVelocityMetersPerSecond);
  if(wind) for(const seg of velocitySegments) {
    seg.airRelativeVelocityMetersPerSecond=sub(seg.velocityMetersPerSecond,wind);
    seg.airRelativeSpeedMetersPerSecond=mag(seg.airRelativeVelocityMetersPerSecond);
  }
  const accelerations=[];
  for(let i=1;i<velocitySegments.length;i++){
    const v1=velocitySegments[i-1],v2=velocitySegments[i];
    const t1=(v1.startSeconds+v1.endSeconds)/2,t2=(v2.startSeconds+v2.endSeconds)/2;
    const accelerationMetersPerSecondSquared=div(sub(v2.velocityMetersPerSecond,v1.velocityMetersPerSecond),t2-t1);
    accelerations.push({tSeconds:(t1+t2)/2,accelerationMetersPerSecondSquared,
      accelerationMagnitudeMetersPerSecondSquared:mag(accelerationMetersPerSecondSquared)});
  }
  return {model:"synthetic_enu_3d_moving_observer_with_known_range",positions,velocitySegments,accelerations,
    limitations:["Results depend on known calibrated range/angles/time and observer state",
      "Correlated and systematic sensor errors may dominate",
      "Wind-relative velocity does not prove exotic propulsion",
      "This is not a reproduction of any historical UAP trajectory"]};
}
function rng32(seed) {
  if(!Number.isInteger(seed)||seed<1||seed>0xffffffff) throw new RangeError("seed must be a nonzero 32-bit unsigned integer");
  let state=seed>>>0;
  return ()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/0x100000000;};
}
function normal(rng){return Math.sqrt(-2*Math.log(Math.max(rng(),Number.MIN_VALUE)))*Math.cos(2*Math.PI*rng());}
function percentile(sorted,p){
  const at=(sorted.length-1)*p,lo=Math.floor(at),hi=Math.ceil(at),w=at-lo;
  return sorted[lo]*(1-w)+sorted[hi]*w;
}
export function conditionalUncertainty(samples,{
  rangeStdMeters=0,azimuthStdDegrees=0,elevationStdDegrees=0,
  observerPositionStdMeters=0,timeStdSeconds=0,sampleCount=2000,seed=12345
}={}) {
  const noise={rangeStdMeters,azimuthStdDegrees,elevationStdDegrees,observerPositionStdMeters,timeStdSeconds};
  for(const [name,value] of Object.entries(noise)) nonnegative(name,value);
  if(!Number.isInteger(sampleCount)||sampleCount<200||sampleCount>20000) throw new RangeError("sampleCount must be 200..20000");
  reconstructTrack(samples);
  const random=rng32(seed),speeds=[];
  let discarded=0;
  for(let n=0;n<sampleCount;n++){
    const trial=samples.map(s=>({
      tSeconds:s.tSeconds+timeStdSeconds*normal(random),
      slantRangeMeters:s.slantRangeMeters+rangeStdMeters*normal(random),
      azimuthDegrees:s.azimuthDegrees+azimuthStdDegrees*normal(random),
      elevationDegrees:s.elevationDegrees+elevationStdDegrees*normal(random),
      observerMeters:{
        x:s.observerMeters.x+observerPositionStdMeters*normal(random),
        y:s.observerMeters.y+observerPositionStdMeters*normal(random),
        z:s.observerMeters.z+observerPositionStdMeters*normal(random)
      }
    }));
    try{speeds.push(reconstructTrack(trial).velocitySegments[0].groundSpeedMetersPerSecond);}
    catch(e){if(e instanceof RangeError){discarded++;continue;}throw e;}
  }
  if(speeds.length<Math.ceil(sampleCount*0.95))
    throw new RangeError("too many rejected simulations: error model incompatible with samples");
  speeds.sort((a,b)=>a-b);
  return {model:"independent_gaussian_measurement_error_monte_carlo",
    interpretation:"Conditional simulation percentiles, not independently validated physical uncertainty",
    syntheticMeasurements:true,firstSegmentSpeedMetersPerSecond:{
      p2_5:percentile(speeds,.025),median:percentile(speeds,.5),p97_5:percentile(speeds,.975)
    },draws:sampleCount,accepted:speeds.length,discarded,seed,assumed1Sigma:noise,
    warning:"User-assumed independent Gaussian errors; unknown correlation, systematic error and range ambiguity are not covered"};
}
if(process.argv[1] && import.meta.url.endsWith("/"+process.argv[1].split("/").pop())){
  const target={x:300,y:1000,z:100};
  const a=inferObservation({observerMeters:{x:0,y:0,z:0},targetMeters:target,tSeconds:0});
  const b=inferObservation({observerMeters:{x:120,y:0,z:0},targetMeters:target,tSeconds:2});
  console.log(JSON.stringify({case:"synthetic stationary target observed from moving aircraft",
    observations:[a,b],result:reconstructTrack([a,b]),
    uncertainty:conditionalUncertainty([a,b],{rangeStdMeters:2,azimuthStdDegrees:.05,
      elevationStdDegrees:.05,observerPositionStdMeters:1,sampleCount:1000})},null,2));
}
