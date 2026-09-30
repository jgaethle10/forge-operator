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
const PHENOMENON_COLOR_RX=/^#[0-9a-fA-F]{3,8}$/;
const MAX_PHENOMENON_STREAMS=1000;
const MAX_PHENOMENON_SAMPLES=5000;

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
    if(!['media','text','shape','geo','metric','timeline','phenomenon'].includes(layer?.kind)) throw new Error(`layer_kind_invalid:${layerId}`);
    if(!Number.isFinite(Number(layer?.z))) throw new Error(`layer_z_invalid:${layerId}`);
    validateEvidence(layer);
    if(layer?.kind==='phenomenon'){
      const b=layer.bounds||{};
      if(![b.north,b.south,b.east,b.west].every(v=>Number.isFinite(Number(v)))||Number(b.north)<=Number(b.south)||Number(b.east)===Number(b.west)){
        throw new Error(`phenomenon_bounds_invalid:${layerId}`);
      }
      if(Number(b.north)>90||Number(b.north)<-90||Number(b.south)>90||Number(b.south)<-90||Number(b.east)>180||Number(b.east)<-180||Number(b.west)>180||Number(b.west)<-180){
        throw new Error(`phenomenon_bounds_coordinate_range_invalid:${layerId}`);
      }
      if(!String(layer.title||'').trim()) throw new Error(`phenomenon_title_missing:${layerId}`);
      if(!String(layer.motionLabel||'').trim()) throw new Error(`phenomenon_motion_label_missing:${layerId}`);
      if(!String(layer.sourceLabel||'').trim()) throw new Error(`phenomenon_source_label_missing:${layerId}`);
      if(!Array.isArray(layer.sourceRefs)||!layer.sourceRefs.length) throw new Error(`phenomenon_source_refs_missing:${layerId}`);
      const sourceRefs=new Set(layer.sourceRefs.map(value=>String(value||'').trim()).filter(Boolean));
      if(!sourceRefs.size) throw new Error(`phenomenon_source_refs_missing:${layerId}`);
      if(layer.colorEncoding){
        if(!Number.isFinite(Number(layer.colorEncoding.min))||!Number.isFinite(Number(layer.colorEncoding.max))||Number(layer.colorEncoding.max)<=Number(layer.colorEncoding.min)) throw new Error(`phenomenon_color_range_invalid:${layerId}`);
        if(layer.colorEncoding.palette){
          if(!Array.isArray(layer.colorEncoding.palette)||layer.colorEncoding.palette.length<2||layer.colorEncoding.palette.length>16||layer.colorEncoding.palette.some(value=>!PHENOMENON_COLOR_RX.test(String(value||'')))) throw new Error(`phenomenon_color_palette_invalid:${layerId}`);
        }
      }
      if(layer.brightnessEncoding&&(!Number.isFinite(Number(layer.brightnessEncoding.min))||!Number.isFinite(Number(layer.brightnessEncoding.max))||Number(layer.brightnessEncoding.max)<=Number(layer.brightnessEncoding.min))) throw new Error(`phenomenon_brightness_range_invalid:${layerId}`);
      if(layer.time){
        const start=Date.parse(String(layer.time.startIso||'')),end=Date.parse(String(layer.time.endIso||''));
        if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) throw new Error(`phenomenon_time_range_invalid:${layerId}`);
      }
      if(!Array.isArray(layer.streamlines)||!layer.streamlines.length) throw new Error(`phenomenon_streamlines_missing:${layerId}`);
      if(layer.streamlines.length>MAX_PHENOMENON_STREAMS) throw new Error(`phenomenon_streamline_count_exceeded:${layerId}`);
      let sampleCount=0;
      for(const stream of layer.streamlines){
        if(Array.isArray(stream?.sourceRefs)){
          for(const ref of stream.sourceRefs){
            if(!sourceRefs.has(String(ref||'').trim())) throw new Error(`phenomenon_stream_source_ref_outside_layer:${layerId}`);
          }
        }
        if(!Array.isArray(stream?.points)||stream.points.length<2) throw new Error(`phenomenon_stream_points_invalid:${layerId}`);
        sampleCount+=stream.points.length;
        if(sampleCount>MAX_PHENOMENON_SAMPLES) throw new Error(`phenomenon_sample_count_exceeded:${layerId}`);
        for(const point of stream.points){
          if(!Number.isFinite(Number(point?.lat))||Number(point.lat)<-90||Number(point.lat)>90||!Number.isFinite(Number(point?.lon))||Number(point.lon)<-180||Number(point.lon)>180) throw new Error(`phenomenon_coordinate_invalid:${layerId}`);
          if(layer.colorEncoding&&!Number.isFinite(Number(point?.colorValue))) throw new Error(`phenomenon_color_value_missing:${layerId}`);
          if(layer.brightnessEncoding&&!Number.isFinite(Number(point?.magnitude))) throw new Error(`phenomenon_magnitude_missing:${layerId}`);
        }
      }
    }
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
