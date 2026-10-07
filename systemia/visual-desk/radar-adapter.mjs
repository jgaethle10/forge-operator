import crypto from 'node:crypto';

const POLITICAL_DOMAINS=new Set(['politics','government','public_policy','regulation','elections']);

const clean=(value)=>String(value ?? '').replace(/\s+/g,' ').trim();
const clamp01=(value,fallback=0)=>{
  const n=Number(value);
  return Number.isFinite(n)?Math.max(0,Math.min(1,n)):fallback;
};
const unique=(values=[])=>[...new Set((values||[]).map(clean).filter(Boolean))];
const hash=(value)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,24);

const CHANGE_WEIGHT=Object.freeze({
  NEW:1,
  INTENSIFIED:1,
  CORROBORATED:0.9,
  CONTESTED:0.72,
  WEAKENED:0.58,
  CLOSED:0.42,
  ROLLED_OFF:0.25,
  UNCHANGED:0.08,
});

const TRUTH_WEIGHT=Object.freeze({
  CORROBORATED:1,
  OBSERVED:0.9,
  REPORTED:0.64,
  CONTESTED:0.48,
  INFERRED:0.38,
  PENDING:0.32,
  CLOSED:0.25,
  UNKNOWN:0,
});

function evidenceStateFor(truthState){
  if(['CORROBORATED','OBSERVED'].includes(truthState)) return 'observed';
  if(['REPORTED','CONTESTED'].includes(truthState)) return 'reported';
  return 'inferred';
}

function shortTitle(value,max=104){
  const text=clean(value);
  if(text.length<=max) return text;
  const slice=text.slice(0,max-1);
  const boundary=slice.lastIndexOf(' ');
  return (boundary>50?slice.slice(0,boundary):slice).replace(/[.,;:!?\s]+$/,'')+'…';
}

function blockersFor(signal){
  const blockers=[];
  const points=Array.isArray(signal?.visual_points)?signal.visual_points:[];
  const sources=unique(signal?.provenance_refs||[]);
  if(!points.length) blockers.push('geospatial_measurements_missing');
  if(!sources.length) blockers.push('source_lineage_missing');
  if(signal?.review?.status!=='pass') blockers.push('radar_adversarial_review_not_passed');
  if(signal?.review?.freshness?.state!=='fresh') blockers.push('signal_not_fresh');
  if(signal?.truth_state==='UNKNOWN') blockers.push('truth_state_unknown');
  if((signal?.domains||[]).some((domain)=>POLITICAL_DOMAINS.has(clean(domain).toLowerCase()))){
    blockers.push('political_visual_requires_editorial_review');
  }
  return blockers;
}

export function scoreRadarSignalForVisual(signal){
  if(signal?.schema && signal.schema!=='evercraft.systemia-radar.signal.v1'){
    throw new Error('radar_visual_signal_schema_invalid');
  }

  const points=Array.isArray(signal?.visual_points)?signal.visual_points:[];
  const sources=unique(signal?.provenance_refs||[]);
  const factors={
    materiality:clamp01(signal?.materiality_score),
    anomaly:clamp01(signal?.anomaly_score),
    reliability:clamp01(signal?.reliability,0.5),
    change:CHANGE_WEIGHT[clean(signal?.change_state).toUpperCase()] ?? 0.08,
    truth:TRUTH_WEIGHT[clean(signal?.truth_state).toUpperCase()] ?? 0,
    freshness:signal?.review?.freshness?.state==='fresh'?1:0,
    spatial_richness:clamp01(points.length/8),
    source_density:clamp01(sources.length/3),
  };
  const score=Number(clamp01(
    0.25*factors.materiality+
    0.15*factors.anomaly+
    0.10*factors.reliability+
    0.15*factors.change+
    0.10*factors.truth+
    0.10*factors.freshness+
    0.10*factors.spatial_richness+
    0.05*factors.source_density
  ).toFixed(3));

  const blockers=blockersFor(signal);
  return {
    score,
    factors,
    blockers,
    admissible:blockers.length===0,
  };
}

export function rankRadarVisualCandidates(edition,{
  minScore=0.58,
  maxCandidates=5,
}={}){
  if(edition?.schema!=='evercraft.systemia-radar.edition.v1'){
    throw new Error('radar_visual_edition_schema_invalid');
  }
  const threshold=clamp01(minScore,0.58);
  const rows=(edition.signals||[]).map((signal)=>{
    const evaluation=scoreRadarSignalForVisual(signal);
    const status=evaluation.admissible&&evaluation.score>=threshold?'admitted':
      evaluation.admissible?'background':'held';
    return {
      schema:'evercraft.visual-desk.radar-candidate.v1',
      candidate_id:'visual-radar:'+hash([
        edition.edition_id,
        signal.signal_id,
        signal.observation_id,
        evaluation.score
      ]),
      source_edition_id:edition.edition_id,
      source_signal_id:signal.signal_id,
      source_observation_id:signal.observation_id||null,
      status,
      visual_priority_score:evaluation.score,
      score_factors:evaluation.factors,
      blockers:evaluation.blockers,
      signal:structuredClone(signal),
      publicationAuthority:false,
    };
  });

  const admitted=rows
    .filter((row)=>row.status==='admitted')
    .sort((a,b)=>
      b.visual_priority_score-a.visual_priority_score||
      clean(b.signal.observed_at).localeCompare(clean(a.signal.observed_at))||
      clean(a.source_signal_id).localeCompare(clean(b.source_signal_id))
    )
    .slice(0,Math.max(1,Math.min(25,Number(maxCandidates)||5)));

  return {
    schema:'evercraft.visual-desk.radar-admission.v1',
    source_edition_id:edition.edition_id,
    threshold,
    evaluated:rows.length,
    admitted,
    held:rows.filter((row)=>row.status==='held'),
    background:rows.filter((row)=>row.status==='background'),
    publicationAuthority:false,
  };
}

export function compileRadarVisualStory(candidate,{publishedAt=null}={}){
  if(candidate?.schema!=='evercraft.visual-desk.radar-candidate.v1'){
    throw new Error('radar_visual_candidate_schema_invalid');
  }
  if(candidate.status!=='admitted') throw new Error('radar_visual_candidate_not_admitted');

  const signal=candidate.signal||{};
  const points=(signal.visual_points||[]).map((point,index)=>({
    id:clean(point.id)||'point-'+(index+1),
    label:clean(point.label)||clean(point.id)||'Point '+(index+1),
    lat:Number(point.lat),
    lon:Number(point.lon),
    value:point.value===null||point.value===undefined?null:Number(point.value),
    note:clean(point.note),
  }));
  if(!points.length) throw new Error('radar_visual_candidate_points_missing');

  const pointSources=(signal.visual_points||[]).map((point)=>point.source_ref);
  const sourceRefs=unique([...(signal.provenance_refs||[]),...pointSources]);
  if(!sourceRefs.length) throw new Error('radar_visual_candidate_sources_missing');

  const title=shortTitle(signal.summary||signal.subject_key||signal.signal_id);
  const subtitle=[
    clean(signal.change_state).toUpperCase(),
    clean(signal.truth_state).toUpperCase(),
    'Radar visual priority '+Number(candidate.visual_priority_score||0).toFixed(3),
  ].filter(Boolean).join(' • ');

  const story={
    schema:'evercraft.visual-story.v1',
    slug:'radar-'+hash([candidate.source_signal_id,candidate.source_observation_id]).slice(0,16),
    title,
    subtitle,
    narrative:[
      'Systemia Radar admitted this spatial signal after its evidence, freshness and adversarial gates passed.',
      'The visual maps only geolocated measurements carried by the source record.',
      'It does not convert co-occurrence into causation, a forecast into an outcome, or a modeled value into an observation.'
    ].join(' '),
    callout:points.length+' geolocated measurement'+(points.length===1?'':'s')+' carried by '+clean(signal.source_family||'the cited source')+'.',
    evidenceState:evidenceStateFor(clean(signal.truth_state).toUpperCase()),
    sourceRefs,
    points,
    lines:[],
    brand:'Evercraft Visual Desk',
    publishedAt:publishedAt||signal.last_verified_at||signal.observed_at||new Date().toISOString(),
  };

  return {
    schema:'evercraft.visual-desk.radar-story-compile.v1',
    candidate_id:candidate.candidate_id,
    source_edition_id:candidate.source_edition_id,
    story,
    publicationAuthority:false,
  };
}
