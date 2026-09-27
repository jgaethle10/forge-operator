import type {
  FilmPlan,
  GenerationRequest,
  ScenePlan,
  VisualCoverageRequirement,
} from './types.js';

export type CreativeCouncilRole =
  | 'story_architect'
  | 'cinematography_director'
  | 'visual_evidence_scout'
  | 'data_graphics_director'
  | 'world_builder'
  | 'edit_rhythm_director'
  | 'sound_director'
  | 'brand_art_director'
  | 'documentary_truth_guard'
  | 'beauty_judge';

export interface CreativeCrewBinding {
  role: CreativeCouncilRole;
  owner:
    | 'little-red-studio'
    | 'forensiscope-create'
    | 'fallen'
    | 'kaidance'
    | 'human-experience-sentinel';
  mission: string;
}

export interface CreativeShotMission {
  id: string;
  sourceType: 'scene' | 'generation_request';
  sourceId: string;
  beat?: ScenePlan['beat'];
  durationSec: number;
  aspectRatio: FilmPlan['aspectRatio'];
  storyPrompt: string;
  intent: string;
  screenText?: string;
  sourcePath?: string;
  mediaKind?: ScenePlan['mediaKind'];
  subjectIds: string[];
  coverage: VisualCoverageRequirement[];
  generationRequest?: GenerationRequest;
  crew: CreativeCrewBinding[];
}

export interface CreativeCouncilBlueprint {
  shot_id: string;
  status: 'blocked' | 'ready_for_asset_or_provider_routing';
  missing_roles: string[];
  findings: string[];
  creative_genome: Record<string, any>;
  rejection_contract: string[];
}

export interface CreativeCouncilReconciliation {
  schema: 'evercraft.fallen.creative-council-reconciliation.v1';
  status: 'blocked' | 'reconciled';
  shot_count: number;
  blocked_shot_count: number;
  blueprints: CreativeCouncilBlueprint[];
}

export interface CreativeCouncilInventory {
  schema: 'evercraft.fallen.creative-council-inventory.v1';
  projectId: string;
  title: string;
  aspectRatio: FilmPlan['aspectRatio'];
  durationSec: number;
  jobs: Array<{
    kind: 'fallen_creative_shot';
    key: string;
    shot: CreativeShotMission;
  }>;
}

export const CREATIVE_COUNCIL_CREW: CreativeCrewBinding[] = [
  {
    role: 'story_architect',
    owner: 'little-red-studio',
    mission: 'Protect story meaning, emotional progression and visual-first storytelling.',
  },
  {
    role: 'cinematography_director',
    owner: 'fallen',
    mission: 'Specify framing, camera motion, lens feeling, depth and shot-to-shot visual progression.',
  },
  {
    role: 'visual_evidence_scout',
    owner: 'forensiscope-create',
    mission: 'Find or demand concrete source coverage for named subjects instead of accepting generic substitutes.',
  },
  {
    role: 'data_graphics_director',
    owner: 'fallen',
    mission: 'Translate maps, timelines, telemetry, charts and evidence into readable motion graphics.',
  },
  {
    role: 'world_builder',
    owner: 'little-red-studio',
    mission: 'Maintain spatial continuity, environments, recurring rooms and a recognizable visual universe.',
  },
  {
    role: 'edit_rhythm_director',
    owner: 'fallen',
    mission: 'Shape pacing, transitions, reveal order and visual rhythm around the story beat.',
  },
  {
    role: 'sound_director',
    owner: 'kaidance',
    mission: 'Plan narration space, score, ambience, impacts, transitions and sonic continuity.',
  },
  {
    role: 'brand_art_director',
    owner: 'little-red-studio',
    mission: 'Enforce the active brand kit while keeping typography subordinate to the visual story.',
  },
  {
    role: 'documentary_truth_guard',
    owner: 'forensiscope-create',
    mission: 'Keep sourced evidence, modeled data and synthetic visualization visibly distinct.',
  },
  {
    role: 'beauty_judge',
    owner: 'human-experience-sentinel',
    mission: 'Reject cheap-looking, confusing, repetitive or visually unfinished shot concepts.',
  },
];

function coverageForScene(
  plan: FilmPlan,
  scene: ScenePlan,
): VisualCoverageRequirement[] {
  return (plan.visualCoverage ?? []).filter((item) =>
    item.matchedAssetIds.includes(scene.assetId),
  );
}

function coverageForRequest(
  plan: FilmPlan,
  request: GenerationRequest,
): VisualCoverageRequirement[] {
  if (!request.coverageRequirementId) return [];
  return (plan.visualCoverage ?? []).filter(
    (item) => item.id === request.coverageRequirementId,
  );
}

function subjectIdsForCoverage(coverage: VisualCoverageRequirement[]) {
  return [...new Set(coverage.map((item) => item.subjectId))].sort();
}

export function buildCreativeCouncilInventory(
  plan: FilmPlan,
): CreativeCouncilInventory {
  const jobs: CreativeCouncilInventory['jobs'] = [];

  for (const scene of plan.scenes) {
    const coverage = coverageForScene(plan, scene);
    const shot: CreativeShotMission = {
      id: `creative-${scene.id}`,
      sourceType: 'scene',
      sourceId: scene.id,
      beat: scene.beat,
      durationSec: scene.durationSec,
      aspectRatio: plan.aspectRatio,
      storyPrompt: plan.prompt,
      intent: scene.intent,
      screenText: scene.screenText,
      sourcePath: scene.sourcePath,
      mediaKind: scene.mediaKind,
      subjectIds: subjectIdsForCoverage(coverage),
      coverage,
      crew: CREATIVE_COUNCIL_CREW,
    };
    jobs.push({
      kind: 'fallen_creative_shot',
      key: shot.id,
      shot,
    });
  }

  for (const request of plan.generationRequests.filter(
    (item) => item.reason === 'semantic_coverage_gap',
  )) {
    const coverage = coverageForRequest(plan, request);
    const shot: CreativeShotMission = {
      id: `creative-${request.id}`,
      sourceType: 'generation_request',
      sourceId: request.id,
      durationSec: request.durationSec,
      aspectRatio: request.aspectRatio,
      storyPrompt: plan.prompt,
      intent: request.prompt,
      subjectIds: [
        ...new Set([
          ...(request.subjectId ? [request.subjectId] : []),
          ...subjectIdsForCoverage(coverage),
        ]),
      ].sort(),
      coverage,
      generationRequest: request,
      crew: CREATIVE_COUNCIL_CREW,
    };
    jobs.push({
      kind: 'fallen_creative_shot',
      key: shot.id,
      shot,
    });
  }

  return {
    schema: 'evercraft.fallen.creative-council-inventory.v1',
    projectId: plan.projectId,
    title: plan.title,
    aspectRatio: plan.aspectRatio,
    durationSec: plan.durationSec,
    jobs,
  };
}
