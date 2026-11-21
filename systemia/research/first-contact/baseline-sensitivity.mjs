/** FIRST-CONTACT-001 | Deterministic geometry sensitivity lab.
 * This software simulates invented bearings; no field/video data is consumed.
 * Reported error quantiles are CONDITIONAL on accepted synthetic ray pairs.
 * Camera/survey systematic errors and source authentication are NOT inferred.
 */
import {bearingToTarget,bearingDirection,triangulateTwoBearings} from "./triangulation.mjs";

function finite(name,v){
  if(typeof v!=="number" || !Number.isFinite(v)) throw new TypeError(name+" must be finite");
  return v;
}
function vector(name,v){
  if(v===null || typeof v!=="object") throw new TypeError(name+" must be an ENU coordinate");
  return {x:finite(name+".x",v.x),y:finite(name+".y",v.y),z:finite(name+".z",v.z)};
}
const difference=(a,b)=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const length=v=>Math.hypot(v.x,v.y,v.z);
const dot=(a,b)=>a.x*b.x+a.y*b.y+a.z*b.z;
const percentile=(sorted,p)=>{
  const idx=(sorted.length-1)*p,lo=Math.floor(idx),hi=Math.ceil(idx);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);
};
function randomGenerator(seed){
  if(!Number.isInteger(seed) || seed<=0 || seed>0xffffffff)
    throw new RangeError("seed must be a nonzero unsigned 32-bit integer");
  let state=seed>>>0;
  return ()=>{
    state ^= state<<13;
    state ^= state>>>17;
    state ^= state<<5;
    return (state>>>0)/0x100000000;
  };
}
const gaussian=rng=>Math.sqrt(-2*Math.log(Math.max(Number.MIN_VALUE,rng()))) *
  Math.cos(2*Math.PI*rng());

export function compareSyntheticBaselines({
  targetMeters,firstObserverMeters,baselineOffsetsMeters,
  angularStdDegrees,commonAzimuthBiasDegrees=0,
  draws=600,seed=12345,
  maxRayMissMeters,minParallaxDegrees
}={}){
  const target=vector("targetMeters",targetMeters);
  const firstObserver=vector("firstObserverMeters",firstObserverMeters);
  const angleSigma=finite("angularStdDegrees",angularStdDegrees);
  if(angleSigma<0 || angleSigma>5) throw new RangeError("angularStdDegrees must be 0..5");
  const commonBias=finite("commonAzimuthBiasDegrees",commonAzimuthBiasDegrees);
  if(Math.abs(commonBias)>5) throw new RangeError("commonAzimuthBiasDegrees must be within +/-5");
  if(!Number.isInteger(draws) || draws<200 || draws>10000)
    throw new RangeError("draws must be an integer in 200..10000");
  if(!Array.isArray(baselineOffsetsMeters) || baselineOffsetsMeters.length<1 ||
     baselineOffsetsMeters.length>16)
    throw new RangeError("1..16 baseline offset vectors required");
  const offsets=baselineOffsetsMeters.map((v,i)=>vector("baselineOffsetsMeters["+i+"]",v));
  if(offsets.some(v=>length(v)<1e-6)) throw new RangeError("Nonzero observer baseline required");
  const tolerance=finite("maxRayMissMeters",maxRayMissMeters);
  const minimumParallax=finite("minParallaxDegrees",minParallaxDegrees);
  if(tolerance<0) throw new RangeError("maxRayMissMeters must be nonnegative");
  if(minimumParallax<=0 || minimumParallax>=90)
    throw new RangeError("minParallaxDegrees must be strictly between 0 and 90");
  const truthFirst=bearingToTarget({observerMeters:firstObserver,targetMeters:target});
  const firstVector=bearingDirection(truthFirst);
  const scenarios=[];
  for(const offset of offsets){
    const secondObserver=add(firstObserver,offset);
    const truthSecond=bearingToTarget({observerMeters:secondObserver,targetMeters:target});
    const secondVector=bearingDirection(truthSecond);
    const trueParallaxDegrees=Math.acos(Math.min(1,Math.abs(dot(firstVector,secondVector))))*180/Math.PI;
    const rng=randomGenerator(seed); // Common random numbers across baseline scenarios.
    const errors=[],misses=[],holds={};
    for(let i=0;i<draws;i++){
      const first={
        ...truthFirst,
        azimuthDegrees:truthFirst.azimuthDegrees+commonBias+angleSigma*gaussian(rng),
        elevationDegrees:truthFirst.elevationDegrees+angleSigma*gaussian(rng)
      };
      const second={
        ...truthSecond,
        azimuthDegrees:truthSecond.azimuthDegrees+commonBias+angleSigma*gaussian(rng),
        elevationDegrees:truthSecond.elevationDegrees+angleSigma*gaussian(rng)
      };
      let geometric;
      try{
        geometric=triangulateTwoBearings({
          first,second,
          maxRayMissMeters:tolerance,
          minParallaxDegrees:minimumParallax
        });
      }catch(err){
        if(!(err instanceof RangeError) && !(err instanceof TypeError)) throw err;
        const key=err.message.startsWith("Insufficient parallax")?"PARALLAX_TOO_SMALL":
          err.message.startsWith("Closest intersection")?"BEHIND_OBSERVER":"INVALID_GEOMETRY";
        holds[key]=(holds[key]||0)+1;
        continue;
      }
      if(geometric.status!=="CONSISTENT_WITH_SPECIFIED_TOLERANCE"){
        holds.RAY_MISS_EXCEEDS_TOLERANCE=(holds.RAY_MISS_EXCEEDS_TOLERANCE||0)+1;
        continue;
      }
      errors.push(length(difference(geometric.midpointEstimateMeters,target)));
      misses.push(geometric.rayMissMeters);
    }
    errors.sort((a,b)=>a-b);
    const accepted=errors.length;
    scenarios.push({
      baselineOffsetMeters:offset,
      baselineLengthMeters:length(offset),
      trueParallaxDegrees,
      firstTrueRangeMeters:length(difference(target,firstObserver)),
      secondTrueRangeMeters:length(difference(target,secondObserver)),
      accepted,rejected:draws-accepted,rejectedFraction:(draws-accepted)/draws,
      rejectionReasons:holds,
      acceptedPositionErrorMeters:accepted?{
        median:percentile(errors,.5),
        p95:percentile(errors,.95),
        max:errors[accepted-1]
      }:null,
      acceptedRayMissMeters:accepted?{
        median:percentile(misses.sort((a,b)=>a-b),.5),
        max:misses[accepted-1]
      }:null
    });
  }
  return {
    schema:"evercraft.first-contact.synthetic-baseline-sensitivity.v1",
    status:"SYNTHETIC_PLANNING_ONLY",
    interpretation:"Monte Carlo stress test of assumed angular error and explicitly modeled shared azimuth bias. Not measured camera performance.",
    simulation:{drawsPerBaseline:draws,seed,assumedIndependentGaussianAngleSigmaDegrees:angleSigma,
      assumedSharedAzimuthBiasDegrees:commonBias,maxRayMissMeters:tolerance,
      minParallaxDegrees:minimumParallax,source:"invented geometry, not field telemetry"},
    assumptions:[
      "Target stationary; all simulated observers and target use one local ENU system",
      "Only simulated angular error is random; camera/target survey positions and clocks are exact by assumption",
      "Constant common azimuth bias approximates one systematic alignment error, not all correlated errors",
      "Accepted error P95 is conditional on the ray-miss filter; rejected samples are reported separately",
      "Short viewing baselines and weak parallax can amplify range error",
      "Seeded synthetic distributions do not establish confidence coverage or actual sensor calibration"
    ],
    cases:scenarios,
    fieldMeasurementsVerified:false,
    extraterrestrialTechnologyIdentified:false
  };
}
if(process.argv[1] && import.meta.url.endsWith("/"+process.argv[1].split("/").pop())){
  console.log(JSON.stringify(compareSyntheticBaselines({
    targetMeters:{x:0,y:300,z:20},
    firstObserverMeters:{x:0,y:0,z:0},
    baselineOffsetsMeters:[{x:20,y:0,z:0},{x:60,y:0,z:0},{x:100,y:0,z:0}],
    angularStdDegrees:.05,
    commonAzimuthBiasDegrees:0,
    maxRayMissMeters:10,
    minParallaxDegrees:1,
    draws:600,
    seed:73109
  }),null,2));
}
