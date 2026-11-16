/** FIRST-CONTACT-001 | Pure formatter for manually selected rectified image pixels.
 * This module never reads real images or verifies capture/source claims.
 * The browser desk supplies source hashes; existing geometry validates optics.
 */
import {rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";

export const FIELD_PIXEL_PACKET_SCHEMA="evercraft.first-contact.rectified-pixel-two-view.v1";
export const EVIDENCE_KEYS=Object.freeze([
  "calibratedPointing",
  "surveyedObserverPositions",
  "synchronizedClocks",
  "independentSensorIdentities",
  "samePhysicalTarget"
]);

function finite(name,v){
  if(typeof v!=="number"||!Number.isFinite(v))
    throw new TypeError(name+" must be a finite number");
  return v;
}
function object(name,v){
  if(!v||typeof v!=="object"||Array.isArray(v))
    throw new TypeError(name+" must be an object");
  return v;
}
function requiredText(name,v,max=100){
  if(typeof v!=="string"||!v.trim()||v.length>max)
    throw new TypeError(name+" must be nonempty text <= "+max+" characters");
  return v.trim();
}
function cleanSource(source,camera){
  object("source",source);
  if(source.kind!=="rectified_png_derivative")
    throw new RangeError("source.kind must be rectified_png_derivative");
  if(typeof source.sha256!=="string"||!/^sha256:[a-f0-9]{64}$/.test(source.sha256))
    throw new RangeError("source.sha256 must be a complete lowercase SHA-256 digest");
  const name=requiredText("source.fileName",source.fileName,256);
  const fileName=name.split(/[/\\]/).at(-1);
  if(!/\.png$/i.test(fileName))throw new RangeError("Only rectified PNG source images are allowed");
  const width=source.imageWidthPixels,height=source.imageHeightPixels;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<2||height<2 ||
    width!==camera.imageWidthPixels||height!==camera.imageHeightPixels)
    throw new RangeError("source PNG dimensions must match the calibrated camera dimensions");
  if(!Number.isSafeInteger(source.sizeBytes)||source.sizeBytes<1||source.sizeBytes>33554432)
    throw new RangeError("rectified PNG must be 1..33554432 bytes");
  return {kind:"rectified_png_derivative",fileName,
    sha256:source.sha256,sizeBytes:source.sizeBytes,
    imageWidthPixels:width,imageHeightPixels:height};
}
function record(name,value){
  const r=object(name,value);
  const camera=object(name+".camera",r.camera);
  const detection=object(name+".detection",r.detection);
  const verified=rectifiedPixelToEnuBearing({camera,detection});
  const source=cleanSource(r.source,camera);
  // Whitelist only the parameters used by the geometry engine. Never copy
  // arbitrary metadata, private notes, tokens or unrelated camera fields
  // from an imported file into an exported measurement packet.
  const safeCamera={
    sensorId:camera.sensorId,
    observerMeters:{
      x:camera.observerMeters.x,y:camera.observerMeters.y,z:camera.observerMeters.z
    },
    imageWidthPixels:camera.imageWidthPixels,
    imageHeightPixels:camera.imageHeightPixels,
    fxPixels:camera.fxPixels,fyPixels:camera.fyPixels,
    cxPixels:camera.cxPixels,cyPixels:camera.cyPixels,
    skewPixels:camera.skewPixels===undefined?0:camera.skewPixels,
    rectifiedImage:true,
    rotationCameraToEnu:camera.rotationCameraToEnu.map(row=>row.slice())
  };
  return {
    measurement:{camera:safeCamera,detection:{
      uPixels:finite(name+".uPixels",detection.uPixels),
      vPixels:finite(name+".vPixels",detection.vPixels),
      captureEpochMilliseconds:detection.captureEpochMilliseconds
    }},
    source,
    verified
  };
}
export function createFieldPixelPacket({
  caseId,first,second,evidence={},quality={}
}={}){
  const id=requiredText("caseId",caseId,100);
  const a=record("first",first),b=record("second",second);
  if(a.verified.sensorId===b.verified.sensorId)
    throw new RangeError("two independent, distinct camera sensor IDs are required");
  if(a.source.sha256===b.source.sha256)
    throw new RangeError("the two rectified images must not be byte-identical");
  object("evidence",evidence);
  object("quality",quality);
  const maxRayMissMeters=finite("quality.maxRayMissMeters",quality.maxRayMissMeters);
  const minParallaxDegrees=finite("quality.minParallaxDegrees",quality.minParallaxDegrees);
  if(maxRayMissMeters<0||minParallaxDegrees<=0||minParallaxDegrees>=90)
    throw new RangeError("invalid quality: max ray miss >=0; parallax strictly 0..90");
  const claims={};
  for(const key of EVIDENCE_KEYS)claims[key]=evidence[key]===true;
  return {
    schema:FIELD_PIXEL_PACKET_SCHEMA,
    caseId:id,
    first:a.measurement,
    second:b.measurement,
    evidence:claims,
    quality:{maxRayMissMeters,minParallaxDegrees},
    annotationProvenance:{
      schema:"evercraft.first-contact.manual-rectified-pixel-annotation.v1",
      sourceA:a.source,sourceB:b.source,
      method:"operator_click_on_local_rectified_png",
      pixelCoordinateConvention:"zero_based_pixel_center_subpixel_coordinates",
      sourcePngsAreOriginalNativeCapture:false,
      originalDeviceFilesAuthenticated:false,
      imageRectificationIndependentlyVerified:false,
      capturedAtTimesIndependentlyVerified:false,
      sourceHashOnlyEstablishesLocalByteIdentity:true,
      reviewerSignedOff:false,
      notes:[
        "This report is a manual annotation, not independent proof of pixel correctness",
        "Preserve original native camera files, source-to-rectified transformations, surveyed poses and independently verified time synchronization separately",
        "Operator-checked evidence flags are not authenticated certificates"
      ]
    }
  };
}
