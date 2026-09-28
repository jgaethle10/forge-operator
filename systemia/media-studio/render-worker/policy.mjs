import path from 'node:path';

const MAX_BODY_BYTES=512*1024;
const MAX_LAYERS=200;
const MAX_ASSETS=100;
const MAX_FRAMES_PER_JOB=120;
const MAX_DURATION_SEC=600;
const MAX_FPS=60;
const MAX_DIMENSION=3840;
const ID_RX=/^[a-zA-Z0-9._-]{1,128}$/;
const SHA_RX=/^[a-f0-9]{64}$/i;
const MEDIA_TYPES=new Set(['image/png','image/jpeg','image/webp','video/mp4','video/webm']);

function boundedNumber(value,fallback,min,max){
  const n=Number(value);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min,Math.min(max,n));
}

function cleanId(value,name){
  const id=String(value||'').trim();
  if(!ID_RX.test(id)) throw new Error(`${name}_invalid`);
  return id;
}

function validateEvidence(layer){
  if(['modeled','inferred','synthetic_visualization'].includes(layer?.evidenceState)){
    if(!Array.isArray(layer?.sourceRefs)||!layer.sourceRefs.length){
      throw new Error(`evidence_source_refs_missing:${layer?.id||'unknown'}`);
    }
  }
}

function sanitizeStage(input){
  if(!input||input.schema!=='evercraft.fallen.visual-stage.v1') throw new Error('stage_schema_invalid');
  const id=cleanId(input.id,'stage_id');
  const width=Math.trunc(boundedNumber(input.width,0,1,MAX_DIMENSION));
  const height=Math.trunc(boundedNumber(input.height,0,1,MAX_DIMENSION));
  const fps=Math.trunc(boundedNumber(input.fps,0,1,MAX_FPS));
  const durationSec=boundedNumber(input.durationSec,0,.01,MAX_DURATION_SEC);
  if(!width||!height||!fps||!durationSec) throw new Error('stage_dimensions_or_timing_invalid');
  if(!Array.isArray(input.camera?.keyframes)||!input.camera.keyframes.length) throw new Error('camera_keyframes_missing');
  if(!Array.isArray(input.layers)) throw new Error('stage_layers_missing');
  if(input.layers.length>MAX_LAYERS) throw new Error('too_many_layers');

  const ids=new Set();
  for(const layer of input.layers){
    const layerId=cleanId(layer?.id,'layer_id');
    if(ids.has(layerId)) throw new Error('duplicate_layer_id');
    ids.add(layerId);
    if(!['media','text','shape','geo','metric','timeline'].includes(layer?.kind)) throw new Error(`layer_kind_invalid:${layerId}`);
    if(!Number.isFinite(Number(layer?.z))) throw new Error(`layer_z_invalid:${layerId}`);
    validateEvidence(layer);
  }

  return JSON.parse(JSON.stringify({...input,id,width,height,fps,durationSec}));
}

function sanitizeAssets(input,stage){
  const rows=Array.isArray(input)?input:[];
  if(rows.length>MAX_ASSETS) throw new Error('too_many_assets');
  const map=new Map();
  for(const row of rows){
    const id=cleanId(row?.id,'asset_id');
    if(map.has(id)) throw new Error('duplicate_asset_id');
    const filename=String(row?.filename||'').trim();
    if(!filename||path.basename(filename)!==filename||filename==='.'||filename==='..') throw new Error(`asset_filename_invalid:${id}`);
    const sha256=String(row?.sha256||'').trim().toLowerCase();
    if(!SHA_RX.test(sha256)) throw new Error(`asset_sha256_invalid:${id}`);
    const mediaType=String(row?.media_type||'').trim().toLowerCase();
    if(!MEDIA_TYPES.has(mediaType)) throw new Error(`asset_media_type_invalid:${id}`);
    map.set(id,{id,filename,sha256,media_type:mediaType});
  }

  for(const layer of stage.layers){
    if(layer.kind!=='media') continue;
    const source=String(layer.sourcePath||'');
    const match=source.match(/^asset:\/\/([a-zA-Z0-9._-]{1,128})$/);
    if(!match) throw new Error(`media_source_must_be_asset_uri:${layer.id}`);
    if(!map.has(match[1])) throw new Error(`media_asset_missing:${match[1]}`);
  }
  return [...map.values()];
}

export function sanitizeRenderJob(input={}){
  if(input.schema!=='evercraft.fallen.render-job.v1') throw new Error('render_job_schema_invalid');
  const jobId=cleanId(input.job_id,'job_id');
  const assetScopeId=cleanId(input.asset_scope_id||jobId,'asset_scope_id');
  const stage=sanitizeStage(input.stage);
  const assets=sanitizeAssets(input.assets,stage);
  const totalFrames=Math.ceil(stage.durationSec*stage.fps);
  const frameStart=Math.trunc(boundedNumber(input.frame_start,0,0,Math.max(0,totalFrames-1)));
  const maxCount=Math.min(MAX_FRAMES_PER_JOB,totalFrames-frameStart);
  const frameCount=Math.trunc(boundedNumber(input.frame_count,1,1,Math.max(1,maxCount)));
  return {
    schema:'evercraft.fallen.render-job.v1',
    job_id:jobId,
    asset_scope_id:assetScopeId,
    stage,
    assets,
    frame_start:frameStart,
    frame_count:frameCount,
    total_frames:totalFrames
  };
}

export {MAX_BODY_BYTES,MAX_FRAMES_PER_JOB};
