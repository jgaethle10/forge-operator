import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {createFieldPixelPacket,EVIDENCE_KEYS,FIELD_PIXEL_PACKET_SCHEMA}
  from "./field-annotation-core.mjs";
import {rectifiedPixelToEnuBearing} from "./pixel-bearing.mjs";
import {evaluateSynchronizedPair} from "./observation-sync.mjs";
import {inspectPixelTwoViewFile} from "./pixel-two-view-cli.mjs";

const root=path.dirname(fileURLToPath(import.meta.url));
const reference=JSON.parse(fs.readFileSync(path.join(root,"fixtures","pixel-pair-synthetic-valid.json"),"utf8"));
function state(){
  return {
    caseId:"LOCAL-SYNTHETIC-REFERENCE",
    first:{...structuredClone(reference.first),source:{
      kind:"rectified_png_derivative",fileName:"rectified-A.png",
      sha256:"sha256:"+"a".repeat(64),sizeBytes:1024,
      imageWidthPixels:1280,imageHeightPixels:720
    }},
    second:{...structuredClone(reference.second),source:{
      kind:"rectified_png_derivative",fileName:"rectified-B.png",
      sha256:"sha256:"+"b".repeat(64),sizeBytes:1034,
      imageWidthPixels:1280,imageHeightPixels:720
    }},
    evidence:{...reference.evidence},
    quality:{...reference.quality}
  };
}
test("the browser desk builds a packet accepted by the real two-view CLI and geometry",t=>{
  const packet=createFieldPixelPacket(state());
  assert.equal(packet.schema,FIELD_PIXEL_PACKET_SCHEMA);
  assert.equal(packet.annotationProvenance.sourceA.sha256,"sha256:"+"a".repeat(64));
  assert.equal(packet.annotationProvenance.sourceB.sha256,"sha256:"+"b".repeat(64));
  assert.equal(packet.annotationProvenance.originalDeviceFilesAuthenticated,false);
  assert.equal(packet.annotationProvenance.reviewerSignedOff,false);
  const a=rectifiedPixelToEnuBearing(packet.first);
  const b=rectifiedPixelToEnuBearing(packet.second);
  const g=evaluateSynchronizedPair({first:a,second:b,evidence:packet.evidence,
    maxRayMissMeters:packet.quality.maxRayMissMeters,
    minParallaxDegrees:packet.quality.minParallaxDegrees});
  assert.equal(g.status,"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
  assert.ok(Math.abs(g.geometry.midpointEstimateMeters.y-10)<1e-7);
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),"fc-photo-annot-"));
  t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const file=path.join(folder,"annotated.json");
  fs.writeFileSync(file,JSON.stringify(packet,null,2)+"\n");
  const receipt=inspectPixelTwoViewFile(file);
  assert.equal(receipt.geometry.status,"CANDIDATE_REQUIRES_INDEPENDENT_REVIEW");
  assert.equal(receipt.suppliedCalibrationAuthenticated,false);
  assert.equal(receipt.mediaContentInspected,false);
});
test("all evidence checkboxes default to FALSE and downstream refuses empty claims",()=>{
  const x=state();delete x.evidence;
  const packet=createFieldPixelPacket(x);
  assert.deepEqual(Object.keys(packet.evidence),[...EVIDENCE_KEYS]);
  assert.ok(Object.values(packet.evidence).every(v=>v===false));
  const a=rectifiedPixelToEnuBearing(packet.first),b=rectifiedPixelToEnuBearing(packet.second);
  const result=evaluateSynchronizedPair({first:a,second:b,evidence:packet.evidence});
  assert.equal(result.status,"HOLD");
  assert.equal(result.reason,"EVIDENCE_NOT_ESTABLISHED");
});
test("false and nonboolean claims cannot be silently promoted to certified evidence",()=>{
  const x=state();
  x.evidence={calibratedPointing:"true",surveyedObserverPositions:1};
  const packet=createFieldPixelPacket(x);
  assert.equal(packet.evidence.calibratedPointing,false);
  assert.equal(packet.evidence.surveyedObserverPositions,false);
});
test("asynchronous source timestamps remain recorded, never re-synchronized by UI",()=>{
  const x=state();
  x.second.detection.captureEpochMilliseconds+=1;
  const packet=createFieldPixelPacket(x);
  assert.equal(packet.second.detection.captureEpochMilliseconds,
    x.second.detection.captureEpochMilliseconds);
  const result=evaluateSynchronizedPair({
    first:rectifiedPixelToEnuBearing(packet.first),
    second:rectifiedPixelToEnuBearing(packet.second),
    evidence:packet.evidence,
    maxRayMissMeters:packet.quality.maxRayMissMeters,
    minParallaxDegrees:packet.quality.minParallaxDegrees
  });
  assert.equal(result.status,"HOLD");
  assert.equal(result.reason,"NON_SIMULTANEOUS_OBSERVATIONS");
});
test("camera calibration image dimensions must match the actual annotated PNG dimensions",()=>{
  const x=state();x.first.source.imageWidthPixels=640;
  assert.throws(()=>createFieldPixelPacket(x),/PNG dimensions must match/);
});
test("image-source bytes must be hashed, complete and not identical",()=>{
  const x=state();x.first.source.sha256="sha256:unknown";
  assert.throws(()=>createFieldPixelPacket(x),/complete lowercase SHA-256/);
  const y=state();y.second.source.sha256=y.first.source.sha256;
  assert.throws(()=>createFieldPixelPacket(y),/must not be byte-identical/);
});
test("native source recordings cannot be mislabeled as lens-rectified PNG",()=>{
  const x=state();x.first.source.kind="native_original_video";
  assert.throws(()=>createFieldPixelPacket(x),/rectified_png_derivative/);
  const y=state();y.first.source.fileName="camera-native.jpg";
  assert.throws(()=>createFieldPixelPacket(y),/Only rectified PNG/);
});
test("uncorrected camera image and invalid camera rotation fail through existing geometry",()=>{
  const x=state();x.first.camera.rectifiedImage=false;
  assert.throws(()=>createFieldPixelPacket(x),/rectifiedImage/);
  const y=state();y.first.camera.rotationCameraToEnu=[[1,0,0],[0,0,1],[0,1,0]];
  assert.throws(()=>createFieldPixelPacket(y),/right-handed/);
});
test("independent camera IDs are mandatory, not inferred from filenames",()=>{
  const x=state();x.second.camera.sensorId=x.first.camera.sensorId;
  assert.throws(()=>createFieldPixelPacket(x),/distinct camera sensor IDs/);
});
test("missing thresholds, bad parallax, invalid pixel centers, or unsafe source size refuse export",()=>{
  assert.throws(()=>createFieldPixelPacket({...state(),quality:{}}),/finite/);
  assert.throws(()=>createFieldPixelPacket({...state(),quality:{maxRayMissMeters:1,minParallaxDegrees:90}}),/invalid quality/);
  const bad=state();bad.first.detection.uPixels=-1;
  assert.throws(()=>createFieldPixelPacket(bad),/outside rectified image/);
  const oversized=state();oversized.first.source.sizeBytes=33554433;
  assert.throws(()=>createFieldPixelPacket(oversized),/1..33554432/);
});
test("exported packet is deterministic and does not include raw image bytes or unverified attestations",()=>{
  const x=createFieldPixelPacket(state()),y=createFieldPixelPacket(state());
  assert.deepEqual(x,y);
  assert.equal(x.annotationProvenance.sourcePngsAreOriginalNativeCapture,false);
  assert.equal(x.annotationProvenance.capturedAtTimesIndependentlyVerified,false);
  assert.equal(x.annotationProvenance.sourceHashOnlyEstablishesLocalByteIdentity,true);
  assert.equal("imageBytes" in x,false);
});
test("local annotator HTML uses only owned relative JavaScript modules and privacy-local controls",()=>{
  const html=fs.readFileSync(path.join(root,"field-annotation.html"),"utf8");
  assert.match(html,/import \{createFieldPixelPacket\} from "\.\/field-annotation-core\.mjs"/);
  assert.match(html,/type="file" accept="image\/png/);
  assert.match(html,/crypto\.subtle\.digest\("SHA-256"/);
  assert.match(html,/data-claim="synchronizedClocks"/);
  assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);
  assert.doesNotMatch(html,/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/);
});


test("inline browser module has valid JavaScript syntax",()=>{
  const html=fs.readFileSync(path.join(root,"field-annotation.html"),"utf8");
  const script=html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(script,"one inline module is required");
  const proc=spawnSync(process.execPath,["--check","--input-type=module"],
    {input:script[1],encoding:"utf8",timeout:5000});
  assert.equal(proc.status,0,proc.stderr);
});


test("export whitelists calibrated fields rather than leaking imported camera secrets",()=>{
  const x=state();
  x.first.camera.apiToken="SECRET-MUST-NOT-EXPORT";
  x.first.camera.ownerPrivateNote="PRIVATE-ALSO-STRIP";
  x.first.detection.unrelatedUserData="EXTRA-DETECTION-DATA";
  x.first.source.originalPrivatePath="/home/someone/private.jpg";
  const record=createFieldPixelPacket(x);
  const json=JSON.stringify(record);
  assert.doesNotMatch(json,/SECRET-MUST-NOT-EXPORT|PRIVATE-ALSO-STRIP|EXTRA-DETECTION-DATA|originalPrivatePath/);
  assert.equal(record.first.camera.fxPixels,800);
  assert.equal(record.first.camera.skewPixels,0);
});
