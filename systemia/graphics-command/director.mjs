import { getGeoBoundary, geoBoundaryProvenance } from './boundary-registry.mjs';
import { terrainReliefProvenance } from './terrain-registry.mjs';
import crypto from 'node:crypto';

const EVIDENCE_TO_FALLEN=Object.freeze({
  observed:'observed',
  reported:'public_source',
  modeled:'modeled',
  inferred:'inferred',
  synthetic:'synthetic_visualization',
});

const clean=(value)=>String(value ?? '').replace(/\s+/g,' ').trim();
const uniq=(values=[])=>[...new Set(values.map(clean).filter(Boolean))];

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==='object'){
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a],[b])=>a.localeCompare(b))
        .map(([key,item])=>[key,stable(item)])
    );
  }
  return value;
}

function digest(value){
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function normalizeMetric(metric,index,sourceRefs){
  const value=Number(metric?.value);
  if(!Number.isFinite(value)) throw new Error('graphics_command_metric_value_invalid:'+index);
  const label=clean(metric?.label);
  if(!label) throw new Error('graphics_command_metric_label_missing:'+index);
  return {
    id:clean(metric?.id)||'metric-'+(index+1),
    label,
    value,
    unit:clean(metric?.unit),
    decimals:Number.isInteger(metric?.decimals)?metric.decimals:0,
    sourceRefs:uniq(metric?.sourceRefs?.length?metric.sourceRefs:sourceRefs),
  };
}

function chooseTreatment(story){
  const requested=clean(story?.visual?.treatment).toLowerCase();
  if(requested) return requested;
  if((story.lines?.length||0)>=Math.max(1,(story.points?.length||0)-1) && (story.points?.length||0)>=3){
    return 'geo_spine';
  }
  if((story.points?.length||0)>=3) return 'geo_cluster';
  return 'evidence_poster';
}

function fallbackHook(story){
  const explicit=clean(story?.visual?.hook);
  if(explicit) return explicit;
  if((story.points?.length||0)>1){
    return String(story.points.length)+' PLACES, ONE STORY';
  }
  return clean(story.title).toUpperCase();
}

function mapZoom(points){
  if(!points?.length) return 1;
  const latSpan=Math.max(...points.map(p=>p.lat))-Math.min(...points.map(p=>p.lat));
  const lonSpan=Math.max(...points.map(p=>p.lon))-Math.min(...points.map(p=>p.lon));
  const span=Math.max(latSpan,lonSpan);
  if(span<1) return 6;
  if(span<3) return 4.6;
  if(span<8) return 3.3;
  if(span<20) return 2.2;
  return 1.25;
}

export function compileGraphicsCommand(story){
  if(story?.schema!=='evercraft.visual-story.v1') throw new Error('graphics_command_story_schema_invalid');
  if(!story.digest) throw new Error('graphics_command_story_digest_missing');
  if(!Array.isArray(story.points)||story.points.length<1) throw new Error('graphics_command_points_missing');
  if(!Array.isArray(story.sourceRefs)||story.sourceRefs.length<1) throw new Error('graphics_command_sources_missing');

  const treatment=chooseTreatment(story);
  const hook=fallbackHook(story);
  const subhook=clean(story?.visual?.subhook)||clean(story.callout)||clean(story.subtitle);
  const eyebrow=clean(story?.visual?.eyebrow)||'EVERCRAFT VISUAL DESK';
  const metrics=(story?.visual?.metrics||[]).map((metric,index)=>normalizeMetric(metric,index,story.sourceRefs));
  const boundaryAsset=getGeoBoundary(story?.visual?.boundaryId);
  const boundary=geoBoundaryProvenance(story?.visual?.boundaryId);
  const terrain=terrainReliefProvenance(story?.visual?.terrainId);
  const byId=new Map(story.points.map(point=>[point.id,point]));
  const fallenEvidence=EVIDENCE_TO_FALLEN[story.evidenceState]||'public_source';

  const routes=(story.lines||[]).map((line,index)=>{
    const from=byId.get(line.from);
    const to=byId.get(line.to);
    if(!from||!to) throw new Error('graphics_command_route_point_missing:'+index);
    return {
      id:'route-'+(index+1),
      points:[{lat:from.lat,lon:from.lon},{lat:to.lat,lon:to.lon}],
      evidenceState:'synthetic_visualization',
      sourceRefs:story.sourceRefs,
      width:treatment==='geo_spine'?(terrain?2:5):3,
    };
  });

  const centerLat=story.points.reduce((sum,p)=>sum+p.lat,0)/story.points.length;
  const centerLon=story.points.reduce((sum,p)=>sum+p.lon,0)/story.points.length;

  const planCore={
    schema:'evercraft.graphics-command.plan.v1',
    storyDigest:story.digest,
    storySlug:story.slug,
    treatment,
    hero:{
      eyebrow,
      hook,
      subhook,
      visualPriority:'hero_first',
      mapRatio:0.72,
      maxTextCoverage:0.28,
      metadataPlacement:'collapsed_after_story',
      focalPoint:treatment.startsWith('geo_')?'geography':'subject',
    },
    formats:[
      {id:'feed',width:1080,height:1350},
      {id:'square',width:1080,height:1080},
      {id:'story',width:1080,height:1920},
    ],
    motion:{
      required:true,
      deterministic:true,
      exactFrame:true,
      targetDurationSec:12,
      grammar:treatment==='geo_spine'
        ? ['establish_region','reveal_points_north_to_south','trace_spine','land_primary_metric']
        : ['establish_subject','reveal_evidence','land_primary_metric'],
    },
    metrics,
    geography:(boundary||terrain) ? {
      ...(boundary ? {
        boundaryId:boundary.id,
        boundaryName:boundary.name,
        boundarySourceRef:boundary.sourceRef,
        boundaryRightsState:boundary.rightsState,
        boundaryLicense:boundary.license,
        boundarySourceSha256:boundary.sourceSha256,
        boundaryTransform:boundary.transform,
      } : {}),
      terrain:terrain ? {
        id:terrain.id,
        name:terrain.name,
        provider:terrain.provider,
        service:terrain.service,
        sourceRef:terrain.sourceRef,
        exportEndpoint:terrain.exportEndpoint,
        sourceFamily:terrain.sourceFamily,
        rightsState:terrain.rightsState,
        license:terrain.license,
        sourceSha256:terrain.sourceSha256,
        assetName:terrain.assetName,
        width:terrain.width,
        height:terrain.height,
        bbox:terrain.bbox,
      } : null,
      projection:terrain?'equirectangular':'source_boundary_frame',
    } : null,
    provenance:{
      evidenceState:story.evidenceState,
      sourceRefs:story.sourceRefs,
      geographySourceRefs:uniq([boundary?.sourceRef,terrain?.sourceRef]),
      frontOfHouse:'minimal',
      detailPlacement:'sources_and_methodology',
    },
    fallenStageInput:{
      id:'visual-desk-'+story.slug,
      headline:hook,
      subhead:subhook,
      durationSec:12,
      aspectRatio:'9:16',
      map:{
        projection:terrain?'equirectangular':'mercator',
        centerLat:boundaryAsset?(boundaryAsset.bbox.minLat+boundaryAsset.bbox.maxLat)/2:centerLat,
        centerLon:boundaryAsset?(boundaryAsset.bbox.minLon+boundaryAsset.bbox.maxLon)/2:centerLon,
        zoom:boundaryAsset?1:mapZoom(story.points),
        fitBounds:boundaryAsset ? {
          north:boundaryAsset.bbox.maxLat,
          south:boundaryAsset.bbox.minLat,
          east:boundaryAsset.bbox.maxLon,
          west:boundaryAsset.bbox.minLon,
          paddingPct:.08,
        } : undefined,
        terrains:terrain ? [{
          id:terrain.id,
          sourcePath:'./'+terrain.assetName,
          bounds:{
            north:terrain.bbox.maxLat,
            south:terrain.bbox.minLat,
            east:terrain.bbox.maxLon,
            west:terrain.bbox.minLon,
          },
          opacity:.74,
          blendMode:'multiply',
          evidenceState:'public_source',
          sourceRefs:[terrain.sourceRef],
          sourceSha256:terrain.sourceSha256,
          rightsState:terrain.rightsState,
        }] : [],
        routes,
        points:story.points.map(point=>({
          id:point.id,
          lat:point.lat,
          lon:point.lon,
          label:point.label,
          evidenceState:fallenEvidence,
          sourceRefs:story.sourceRefs,
        })),
        polygons:boundaryAsset ? [{
          id:boundaryAsset.id,
          rings:[boundaryAsset.coordinates.map(([lon,lat])=>({lat,lon}))],
          label:boundaryAsset.name,
          fill:'rgba(79,184,255,.08)',
          stroke:'#4FB8FF',
          strokeWidth:2,
          opacity:.9,
          evidenceState:'public_source',
          sourceRefs:[boundaryAsset.provenance.sourceRef],
        }] : [],
      },
      metrics:metrics.map(metric=>({
        id:metric.id,
        label:metric.label,
        value:metric.value,
        unit:metric.unit||undefined,
        decimals:metric.decimals,
        evidenceState:fallenEvidence,
        sourceRefs:metric.sourceRefs,
      })),
    },
    publicationAuthority:false,
  };

  return {...planCore,digest:digest(planCore)};
}

export function assessScrollStop(plan){
  if(plan?.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_command_plan_schema_invalid');
  const checks={
    hero_first:plan.hero?.visualPriority==='hero_first',
    hook_concise:clean(plan.hero?.hook).length>0 && clean(plan.hero?.hook).length<=42,
    visual_dominant:Number(plan.hero?.mapRatio)>=0.62,
    text_not_primary:Number(plan.hero?.maxTextCoverage)<=0.35,
    metadata_deferred:plan.hero?.metadataPlacement==='collapsed_after_story',
    focal_point_declared:Boolean(clean(plan.hero?.focalPoint)),
    multi_format:(plan.formats?.length||0)>=3,
    motion_ready:plan.motion?.required===true && plan.motion?.exactFrame===true,
    provenance_preserved:(plan.provenance?.sourceRefs?.length||0)>0,
  };
  const values=Object.values(checks);
  const passed=values.filter(Boolean).length;
  const score=Number((passed/values.length).toFixed(3));
  return {
    schema:'evercraft.graphics-command.scroll-stop-report.v1',
    planDigest:plan.digest,
    status:score>=0.89?'pass':'reject',
    score,
    checks,
    rule:'A visual is not social-ready unless the visual payoff leads, text stays subordinate, provenance remains available, and the composition survives platform-specific rendering.',
    publicationAuthority:false,
  };
}
