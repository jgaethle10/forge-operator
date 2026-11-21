/** FIRST-CONTACT-001 | Synthetic image-localization and focal-calibration sensitivity.
 * Independent random pixel noise + operator-chosen common offset/focal bias.
 * Original pixels are projected from INVENTED 3D ground truth, not acquired media.
 * P95 error is conditional on accepted rays, NOT a calibrated confidence interval.
 */
import {projectEnuPointToRectifiedPixel,rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";
import {triangulateTwoBearings} from "./triangulation.mjs";

const finite=(label,value)=>{
  if(typeof value!=="number"||!Number.isFinite(value))
    throw new TypeError(label+" must be finite");
  return value;
};
const coordinate=(label,value)=>{
  if(!value||typeof value!=="object")
    throw new TypeError(label+" must be an ENU position");
  return {x:finite(label+".x",value.x),
    y:finite(label+".y",value.y),z:finite(label+".z",value.z)};
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
function random(seed){
  if(!Number.isInteger(seed)||seed<1||seed>0xffffffff)
    throw new RangeError("seed must be a nonzero unsigned 32-bit integer");
  let x=seed>>>0;
  return ()=>{
    x^=x<<13;x^=x>>>17;x^=x<<5;
    return (x>>>0)/4294967296;
  };
}
const normal=rng=>Math.sqrt(-2*Math.log(Math.max(Number.MIN_VALUE,rng())))*
  Math.cos(2*Math.PI*rng());
const percentile=(sorted,p)=>{
  const i=(sorted.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);
  return sorted[lo]+(sorted[hi]-sorted[lo])*(i-lo);
};
function reason(err,stage){
  if(!(err instanceof RangeError || err instanceof TypeError))throw err;
  if(stage==="pixel")return "PIXEL_OUT_OF_IMAGE_OR_INVALID_CALIBRATION";
  if(err.message.includes("Insufficient parallax"))return "INSUFFICIENT_PARALLAX";
  if(err.message.includes("behind"))return "BACKWARD_INTERSECTION";
  return "DEGENERATE_GEOMETRY";
}

/** Quantify how ASSUMED image-center and focal model errors perturb known-target triangulation. */
export function simulatePixelPositionError({
  firstCamera,secondCamera,targetMeters,pixelStdDevPixels=0,
  commonPixelBias={uPixels:0,vPixels:0},
  focalScaleErrorFraction=0,
  draws=600,seed=84017,maxRayMissMeters,minParallaxDegrees
}={}){
  const truth=coordinate("targetMeters",targetMeters);
  const sigma=finite("pixelStdDevPixels",pixelStdDevPixels);
  if(sigma<0||sigma>10)throw new RangeError("pixelStdDevPixels must be 0..10");
  const du=finite("commonPixelBias.uPixels",commonPixelBias?.uPixels);
  const dv=finite("commonPixelBias.vPixels",commonPixelBias?.vPixels);
  if(Math.abs(du)>50||Math.abs(dv)>50)
    throw new RangeError("common pixel bias limited to +/-50 pixels");
  const focalError=finite("focalScaleErrorFraction",focalScaleErrorFraction);
  if(Math.abs(focalError)>.2)
    throw new RangeError("focalScaleErrorFraction limited to +/-0.2");
  if(!Number.isInteger(draws)||draws<200||draws>5000)
    throw new RangeError("draws must be 200..5000");
  const tolerance=finite("maxRayMissMeters",maxRayMissMeters);
  if(tolerance<0)throw new RangeError("maxRayMissMeters must be nonnegative");
  const minParallax=finite("minParallaxDegrees",minParallaxDegrees);
  if(minParallax<=0||minParallax>=90)
    throw new RangeError("minParallaxDegrees must be strictly between 0 and 90");
  if(firstCamera?.sensorId===secondCamera?.sensorId)
    throw new RangeError("two distinct sensor identities required");

  // Forward projections encode the assumed perfect synthetic camera truth.
  const firstExact=projectEnuPointToRectifiedPixel({camera:firstCamera,targetMeters:truth});
  const secondExact=projectEnuPointToRectifiedPixel({camera:secondCamera,targetMeters:truth});
  const cameraA={...firstCamera,
    fxPixels:firstCamera.fxPixels*(1+focalError),
    fyPixels:firstCamera.fyPixels*(1+focalError)};
  const cameraB={...secondCamera,
    fxPixels:secondCamera.fxPixels*(1+focalError),
    fyPixels:secondCamera.fyPixels*(1+focalError)};
  const rng=random(seed),errors=[],rayMisses=[],parallaxes=[],rejections={};
  const tally=key=>{rejections[key]=(rejections[key]||0)+1;};
  for(let i=0;i<draws;i++){
    let first,second;
    try{
      const pointA={
        uPixels:firstExact.uPixels+du+sigma*normal(rng),
        vPixels:firstExact.vPixels+dv+sigma*normal(rng),
        captureEpochMilliseconds:0
      };
      const pointB={
        uPixels:secondExact.uPixels+du+sigma*normal(rng),
        vPixels:secondExact.vPixels+dv+sigma*normal(rng),
        captureEpochMilliseconds:0
      };
      first=rectifiedPixelToEnuBearing({camera:cameraA,detection:pointA});
      second=rectifiedPixelToEnuBearing({camera:cameraB,detection:pointB});
    }catch(err){tally(reason(err,"pixel"));continue;}
    let geometric;
    try{
      geometric=triangulateTwoBearings({first,second,
        maxRayMissMeters:tolerance,minParallaxDegrees:minParallax});
    }catch(err){tally(reason(err,"geometry"));continue;}
    if(geometric.status!=="CONSISTENT_WITH_SPECIFIED_TOLERANCE"){
      tally("RAY_MISS_EXCEEDS_TOLERANCE");continue;
    }
    errors.push(distance(geometric.midpointEstimateMeters,truth));
    rayMisses.push(geometric.rayMissMeters);
    parallaxes.push(geometric.parallaxDegrees);
  }
  errors.sort((a,b)=>a-b);
  rayMisses.sort((a,b)=>a-b);
  const accepted=errors.length;
  return {
    schema:"evercraft.first-contact.synthetic-pixel-error-sensitivity.v1",
    status:"SYNTHETIC_PLANNING_ONLY",
    assumptions:{draws,seed,pixelStdDevPixels:sigma,
      commonPixelBias:{uPixels:du,vPixels:dv},
      focalScaleErrorFraction:focalError,maxRayMissMeters:tolerance,
      minParallaxDegrees:minParallax,
      errorModel:"independent Gaussian image localization plus fixed shared pixel and focal-scale perturbations"},
    assumedExactImagePixels:{
      first:{uPixels:firstExact.uPixels,vPixels:firstExact.vPixels},
      second:{uPixels:secondExact.uPixels,vPixels:secondExact.vPixels}
    },
    targetMeters:truth,
    baselineMeters:distance(firstCamera.observerMeters,secondCamera.observerMeters),
    accepted,rejected:draws-accepted,rejectedFraction:(draws-accepted)/draws,
    rejectionReasons:rejections,
    acceptedPositionErrorMeters:accepted?{
      median:percentile(errors,.5),p95:percentile(errors,.95),max:errors[accepted-1]
    }:null,
    acceptedRayMissMeters:accepted?{
      median:percentile(rayMisses,.5),max:rayMisses[accepted-1]
    }:null,
    acceptedMinParallaxDegrees:accepted?Math.min(...parallaxes):null,
    warnings:[
      "Ground truth and perfect pixels were synthesized, not read from real camera images",
      "P95 summarizes ONLY accepted synthetic rays; check the rejected fraction and reasons",
      "Assumed independent Gaussian pixel noise, uniform shared pixel bias and focal-scale error omit real distortion, correlated timing, pose error, survey uncertainty and false target associations",
      "This is not a sensor confidence interval, certified field accuracy or scientific evidence of a physical anomaly"
    ],
    fieldDataProcessed:false,
    realCameraAccuracyValidated:false,
    extraterrestrialTechnologyIdentified:false
  };
}
