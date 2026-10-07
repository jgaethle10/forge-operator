import crypto from 'node:crypto';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));
const round=(value,places=3)=>{
  const factor=10**places;
  return Math.round(Number(value)*factor)/factor;
};

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==='object'){
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

export const DEFAULT_VISUAL_STRATEGY=Object.freeze({
  terrainBaseOpacity:.94,
  terrainHighlightOpacity:.105,
  atmosphereOpacity:.46,
  routeOpacity:.055,
  routeWidthScale:1,
  pointScale:1,
  boundaryStrokeOpacity:.82,
  regionLabelOpacity:.30,
  regionKickerOpacity:.42,
});

export function normalizeVisualStrategy(input={}){
  return {
    terrainBaseOpacity:clamp(input.terrainBaseOpacity??DEFAULT_VISUAL_STRATEGY.terrainBaseOpacity,.55,1),
    terrainHighlightOpacity:clamp(input.terrainHighlightOpacity??DEFAULT_VISUAL_STRATEGY.terrainHighlightOpacity,0,.24),
    atmosphereOpacity:clamp(input.atmosphereOpacity??DEFAULT_VISUAL_STRATEGY.atmosphereOpacity,.18,.72),
    routeOpacity:clamp(input.routeOpacity??DEFAULT_VISUAL_STRATEGY.routeOpacity,.01,.20),
    routeWidthScale:clamp(input.routeWidthScale??DEFAULT_VISUAL_STRATEGY.routeWidthScale,.65,1.5),
    pointScale:clamp(input.pointScale??DEFAULT_VISUAL_STRATEGY.pointScale,.78,1.28),
    boundaryStrokeOpacity:clamp(input.boundaryStrokeOpacity??DEFAULT_VISUAL_STRATEGY.boundaryStrokeOpacity,.45,1),
    regionLabelOpacity:clamp(input.regionLabelOpacity??DEFAULT_VISUAL_STRATEGY.regionLabelOpacity,.16,.55),
    regionKickerOpacity:clamp(input.regionKickerOpacity??DEFAULT_VISUAL_STRATEGY.regionKickerOpacity,.20,.62),
  };
}

export function buildShotTournamentCandidates(story,plan){
  if(plan?.schema!=='evercraft.graphics-command.plan.v1') throw new Error('graphics_shot_tournament_plan_invalid');
  if(story?.schema!=='evercraft.visual-story.v1') throw new Error('graphics_shot_tournament_story_invalid');
  const terrain=Boolean(plan.geography?.terrain);
  const boundary=Boolean(plan.geography?.boundaryId);

  const raw=[
    {
      id:'terrain-hero',
      title:'Terrain Hero',
      intent:'Let recognizable physical geography carry the composition while routes stay nearly invisible.',
      strategy:{
        terrainBaseOpacity:terrain ? .97 : .80,
        terrainHighlightOpacity:terrain ? .135 : .06,
        atmosphereOpacity:terrain ? .38 : .48,
        routeOpacity:.030,
        routeWidthScale:.82,
        pointScale:1.02,
        boundaryStrokeOpacity:boundary ? .76 : .70,
        regionLabelOpacity:.25,
        regionKickerOpacity:.36,
      },
    },
    {
      id:'balanced-relief',
      title:'Balanced Relief',
      intent:'Balance geographic relief, labels, markers and the evidence spine without allowing any layer to dominate.',
      strategy:{...DEFAULT_VISUAL_STRATEGY},
    },
    {
      id:'cascade-signal',
      title:'Cascade Signal',
      intent:'Make the evidence path more legible while preserving geographic context and atmospheric depth.',
      strategy:{
        terrainBaseOpacity:terrain ? .84 : .72,
        terrainHighlightOpacity:terrain ? .075 : .04,
        atmosphereOpacity:.52,
        routeOpacity:.095,
        routeWidthScale:1.12,
        pointScale:1.08,
        boundaryStrokeOpacity:.88,
        regionLabelOpacity:.34,
        regionKickerOpacity:.46,
      },
    },
  ];

  return raw.map((candidate,index)=>{
    const core={
      schema:'evercraft.graphics-command.shot-candidate.v1',
      id:candidate.id,
      rankSeed:index+1,
      title:candidate.title,
      intent:candidate.intent,
      strategy:normalizeVisualStrategy(candidate.strategy),
      publicationAuthority:false,
    };
    return {...core,digest:digest(core)};
  });
}

function componentScores({candidate,plan,layoutReports}){
  const strategy=normalizeVisualStrategy(candidate.strategy);
  const layouts=Object.values(layoutReports||{});
  const allLayoutsPresent=['feed','square','story'].every(format=>layoutReports?.[format]);
  const layoutPass=allLayoutsPresent&&layouts.every(report=>report?.status==='pass');
  const terrain=Boolean(plan.geography?.terrain);

  const terrainFit=terrain
    ? clamp(
        .70+
        (strategy.terrainBaseOpacity-.80)*1.2+
        strategy.terrainHighlightOpacity*.45-
        Math.max(0,strategy.atmosphereOpacity-.55)*.5,
        0,1
      )
    : .72;
  const routeRestraint=clamp(1-(strategy.routeOpacity-.02)/.13,0,1);
  const markerRestraint=clamp(1-Math.abs(strategy.pointScale-1)/.28,0,1);
  const regionRestraint=clamp(1-Math.abs(strategy.regionLabelOpacity-.27)/.28,0,1);
  const layoutScore=layoutPass?1:0;

  return {
    layoutPass,
    layoutScore:round(layoutScore),
    terrainFit:round(terrainFit),
    routeRestraint:round(routeRestraint),
    markerRestraint:round(markerRestraint),
    regionRestraint:round(regionRestraint),
  };
}

export function rankShotTournament({story,plan,candidates,layoutByCandidate}){
  if(!Array.isArray(candidates)||candidates.length<2) throw new Error('graphics_shot_tournament_candidates_missing');
  const scored=candidates.map(candidate=>{
    const layoutReports=layoutByCandidate?.[candidate.id]||{};
    const components=componentScores({candidate,plan,layoutReports});
    const hardGate=components.layoutPass;
    const score=hardGate
      ? round(
          components.layoutScore*.46+
          components.terrainFit*.22+
          components.routeRestraint*.14+
          components.markerRestraint*.10+
          components.regionRestraint*.08
        )
      : 0;
    return {
      id:candidate.id,
      title:candidate.title,
      candidateDigest:candidate.digest,
      score,
      hardGate:hardGate?'pass':'reject',
      components,
      layoutReports,
      strategy:candidate.strategy,
    };
  }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));

  const winner=scored.find(row=>row.hardGate==='pass');
  if(!winner) throw new Error('graphics_shot_tournament_no_eligible_candidate');

  const core={
    schema:'evercraft.graphics-command.shot-tournament.v1',
    storyDigest:story.digest,
    planDigest:plan.digest,
    candidateCount:scored.length,
    winnerId:winner.id,
    winnerCandidateDigest:winner.candidateDigest,
    winnerScore:winner.score,
    candidates:scored,
    rule:'Hard layout gates are non-negotiable. Eligible candidates compete on terrain fit, route restraint, marker restraint and region-label restraint. Highest deterministic score wins.',
    humanReviewRequired:true,
    publicationAuthority:false,
  };
  return {...core,digest:digest(core)};
}
