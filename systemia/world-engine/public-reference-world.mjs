/**
 * Read-only public-reference overlay integrated with the canonical World Engine.
 * Source data lives in the world definition's metadata, never in physical entities.
 * Renderer adapters may draw labels from a verified frame; no collider, asset,
 * navigation, engineering or launch authority is minted.
 */
import { compilePublicReferencePoints,REFERENCE_OVERLAY_SCHEMA } from './public-reference-points.mjs';
import { validateWorldDefinition,verifyWorldSnapshot,worldDefinitionDigest } from './engine.js';

const WORLD_OVERLAY_KEY='public_reference_points';
const FRAME_SCHEMA='evercraft.world-engine.public-reference-frame.v1';
function fail(code){throw new Error('public_reference_world:'+code);}
function plain(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}

export function mountPublicReferencePoints(world,geojson,origin) {
  validateWorldDefinition(world);
  if(world.metadata?.[WORLD_OVERLAY_KEY]!==undefined)fail('already_mounted');
  const overlay=compilePublicReferencePoints(geojson,origin);
  const next={
    ...world,
    version:world.version+1,
    // No WorldEntities are introduced; references cannot become simulation actors.
    entities:structuredClone(world.entities),
    metadata:{
      ...(world.metadata||{}),
      [WORLD_OVERLAY_KEY]:overlay,
    },
  };
  validateWorldDefinition(next);
  return next;
}

export function publicReferenceFrame(world,snapshot) {
  validateWorldDefinition(world);
  const overlay=world.metadata?.[WORLD_OVERLAY_KEY];
  if(!plain(overlay)||overlay.schema!==REFERENCE_OVERLAY_SCHEMA)fail('overlay_missing');
  if(overlay.decisionAuthority!==false || overlay.isSurvey!==false ||
    overlay.isNavigable!==false || overlay.isSimulation!==false ||
    overlay.scaleFactor!==1 || !Array.isArray(overlay.points))fail('overlay_authority_invalid');
  if(!verifyWorldSnapshot(snapshot))fail('snapshot_integrity_invalid');
  if(snapshot.worldId!==world.id || snapshot.worldVersion!==world.version ||
    snapshot.definitionDigest!==worldDefinitionDigest(world))fail('snapshot_world_mismatch');

  const annotations=overlay.points.map(point=>{
    if(!plain(point)||!plain(point.authority)||!plain(point.wgs84)||!plain(point.localMetersApprox)||
       !plain(point.evidence)||point.authority.physicalExtent!==false ||
       point.authority.collision!==false || point.authority.navigation!==false ||
       point.authority.launchOperations!==false || point.authority.engineering!==false ||
       point.authority.geology!==false)fail('point_authority_invalid');
    for(const n of [point.wgs84.lon,point.wgs84.lat,
      point.localMetersApprox.x,point.localMetersApprox.y,point.localMetersApprox.z]){
      if(typeof n!=='number'||!Number.isFinite(n))fail('point_coordinates_invalid');
    }
    return {
      id:point.id, label:point.name,
      wgs84:structuredClone(point.wgs84),
      // Approximate local meters, display only. Renderer owns styling, and may not
      // reclassify this as a survey, building footprint or physical actor.
      position:structuredClone(point.localMetersApprox),
      source:structuredClone(point.evidence),
      provenance:'public_reference_only',
      physical:false,collision:false,decisionAuthority:false,
    };
  });
  return {
    schema:FRAME_SCHEMA,
    worldId:snapshot.worldId,worldVersion:snapshot.worldVersion,
    tick:snapshot.tick,timeSec:snapshot.timeSec,
    sourceWorldDigest:snapshot.definitionDigest,
    sourceSnapshotDigest:snapshot.digest,
    coordinateSystem:'approx_local_meters_unscaled',
    decisionAuthority:false,physical:false,navigation:false,
    annotations,
  };
}
