import crypto from 'node:crypto';
import type {
  CreativeCouncilInventory,
  CreativeCouncilReconciliation,
  CreativeShotMission,
} from './creative-council.js';

export type ExplorationStrategy =
  | 'source_first_documentary'
  | 'spatial_data_fusion'
  | 'cinematic_scale'
  | 'proof_detail'
  | 'product_capture'
  | 'workflow_spatial'
  | 'data_proof'
  | 'human_context';

export type AcquisitionPolicy =
  | 'source_first'
  | 'source_or_generated'
  | 'product_capture_first';

export interface ShotExplorationVariant {
  id: string;
  shotId: string;
  strategy: ExplorationStrategy;
  acquisitionPolicy: AcquisitionPolicy;
  syntheticAllowed: boolean;
  syntheticLabelRequired: boolean;
  mustShow: string[];
  mustPreserve: string[];
  mustAvoid: string[];
  councilDirectives: string[];
  prompt: string;
}

export interface ShotExploration {
  schema: 'evercraft.fallen.shot-exploration.v1';
  shotId: string;
  creativeGenomeDigest: string;
  variants: ShotExplorationVariant[];
}

export interface ExplorationBatch {
  schema: 'evercraft.fallen.exploration-batch.v1';
  projectId: string;
  creativeGenomeDigest: string;
  shots: ShotExploration[];
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

export function creativeInventoryDigest(inventory: CreativeCouncilInventory) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(inventory)))
    .digest('hex');
}

function textFor(shot: CreativeShotMission) {
  return [
    shot.storyPrompt,
    shot.intent,
    ...shot.coverage.map((item) => item.subjectLabel),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function isWorldIntel(shot: CreativeShotMission) {
  return /(ship|naval|tank|aircraft|wildfire|hurricane|flood|earthquake|volcano|shipping|satellite|infrastructure|weather|global|world|geopolitic)/.test(
    textFor(shot),
  );
}

function isProductOrWorkflow(shot: CreativeShotMission) {
  return /(product|software|workflow|report|dashboard|charger|charging|rivet|forensiscope|systemia|network|ui|interface)/.test(
    textFor(shot),
  );
}

function mustShow(shot: CreativeShotMission) {
  const coverageLabels = shot.coverage.map((item) => item.subjectLabel);
  return [
    ...new Set([
      ...coverageLabels,
      ...(coverageLabels.length ? [] : ['the concrete subject of the beat']),
    ]),
  ];
}

function commonAvoids(extra: string[] = []) {
  return [...new Set([
    'generic text-only title card used as the primary visual',
    'abstract neon interface with no story function',
    'fake product UI presented as a real capture',
    'synthetic real-event imagery presented as documentary evidence',
    'unreadable dashboard wall',
    'decorative motion that does not reveal information',
    ...extra,
  ])];
}

function commonPreserve(shot: CreativeShotMission) {
  return [
    'story intent',
    'named-subject visibility',
    'source/provenance state',
    'observed-versus-modeled distinction',
    'active product or Evercraft brand rules',
    ...(shot.screenText ? [`screen text when required: ${shot.screenText}`] : []),
  ];
}

function variant(
  shot: CreativeShotMission,
  strategy: ExplorationStrategy,
  acquisitionPolicy: AcquisitionPolicy,
  syntheticAllowed: boolean,
  syntheticLabelRequired: boolean,
  direction: string,
  councilDirectives: string[],
  councilRejections: string[],
): ShotExplorationVariant {
  const show = mustShow(shot);
  const preserve = commonPreserve(shot);
  const avoid = commonAvoids(councilRejections);

  return {
    id: `${shot.id}-${strategy}`,
    shotId: shot.id,
    strategy,
    acquisitionPolicy,
    syntheticAllowed,
    syntheticLabelRequired,
    mustShow: show,
    mustPreserve: preserve,
    mustAvoid: avoid,
    councilDirectives,
    prompt: [
      `SHOT STRATEGY: ${strategy}.`,
      direction,
      `MUST SHOW: ${show.join('; ')}.`,
      `PRESERVE: ${preserve.join('; ')}.`,
      `AVOID: ${avoid.join('; ')}.`,
      ...(councilDirectives.length ? [`COUNCIL DIRECTIVES: ${councilDirectives.join('; ')}.`] : []),
      `STORY: ${shot.storyPrompt}`,
      `SHOT INTENT: ${shot.intent}`,
      `DURATION: ${shot.durationSec}s. ASPECT: ${shot.aspectRatio}.`,
    ].join(' '),
  };
}

export function compileShotExploration(
  shot: CreativeShotMission,
  creativeGenomeDigest: string,
  councilDirectives: string[] = [],
  councilRejections: string[] = [],
): ShotExploration {
  if (!creativeGenomeDigest?.trim()) {
    throw new Error('creativeGenomeDigest is required.');
  }

  const worldIntel = isWorldIntel(shot);
  const product = isProductOrWorkflow(shot);

  const variants: ShotExplorationVariant[] = [];

  if (worldIntel) {
    variants.push(
      variant(
        shot,
        'source_first_documentary',
        'source_first',
        false,
        false,
        'Lead with the strongest authentic or properly licensed physical-world source shot. Let the real object or event occupy the frame before explanatory graphics arrive.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'spatial_data_fusion',
        'source_or_generated',
        true,
        true,
        'Fuse the physical subject with geography, movement, timeline, telemetry or evidence overlays that remain spatially attached to what they explain. Synthetic elements are visualization, never evidence.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'cinematic_scale',
        'source_or_generated',
        true,
        true,
        'Communicate scale through depth, environment, relative size and motivated camera movement. Prefer a strong physical subject and world context over interface chrome.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'proof_detail',
        'source_first',
        false,
        false,
        'Use a concrete detail, source moment, close view or evidence insert that proves the narrated point, then preserve enough context that the viewer knows what they are seeing.',
        councilDirectives,
        councilRejections,
      ),
    );
  } else if (product) {
    variants.push(
      variant(
        shot,
        'product_capture',
        'product_capture_first',
        false,
        false,
        'Use the real product or verified product capture as the hero. Demonstrate one meaningful action with minimal explanatory text.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'workflow_spatial',
        'source_or_generated',
        true,
        false,
        'Represent the workflow as a physical or spatial transformation while keeping real product captures clearly distinguishable from explanatory visualization.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'data_proof',
        'product_capture_first',
        false,
        false,
        'Lead with the result, report, metric, map or evidence produced by the product. Show cause and effect rather than a feature checklist.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'human_context',
        'source_or_generated',
        true,
        true,
        'Show the real-world situation the product changes, then connect the product action to that outcome. Avoid generic lifestyle imagery with no causal link.',
        councilDirectives,
        councilRejections,
      ),
    );
  } else {
    variants.push(
      variant(
        shot,
        'cinematic_scale',
        'source_or_generated',
        true,
        true,
        'Find the strongest concrete visual embodiment of the story beat and stage it with depth, motivated motion and a clear focal point.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'proof_detail',
        'source_first',
        false,
        false,
        'Ground the beat in a source-backed detail or close view that carries meaning without requiring a paragraph of text.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'human_context',
        'source_or_generated',
        true,
        true,
        'Anchor the beat in a human or real-world context when doing so clarifies why the moment matters.',
        councilDirectives,
        councilRejections,
      ),
      variant(
        shot,
        'spatial_data_fusion',
        'source_or_generated',
        true,
        true,
        'Use spatial graphics, scale, sequence or relationship only when they reveal structure that a normal shot cannot.',
        councilDirectives,
        councilRejections,
      ),
    );
  }

  return {
    schema: 'evercraft.fallen.shot-exploration.v1',
    shotId: shot.id,
    creativeGenomeDigest,
    variants,
  };
}

function genomeDirectives(genome: Record<string, any>) {
  return [
    ...new Set(
      Object.values(genome)
        .flatMap((section: any) => Array.isArray(section?.directives) ? section.directives : [])
        .map((item: unknown) => String(item).trim())
        .filter(Boolean),
    ),
  ];
}

export function compileExplorationBatch(
  inventory: CreativeCouncilInventory,
  reconciliation: CreativeCouncilReconciliation,
): ExplorationBatch {
  if (reconciliation.status !== 'reconciled') {
    throw new Error('Creative Council must reconcile before shot exploration.');
  }

  const blueprintByShot = new Map(
    reconciliation.blueprints.map((blueprint) => [blueprint.shot_id, blueprint]),
  );

  const shots = inventory.jobs.map((job) => {
    const blueprint = blueprintByShot.get(job.shot.id);
    if (!blueprint) {
      throw new Error(`Creative Council blueprint missing for ${job.shot.id}.`);
    }
    if (blueprint.status !== 'ready_for_asset_or_provider_routing') {
      throw new Error(`Creative Council blocked ${job.shot.id}.`);
    }
    const digest = crypto
      .createHash('sha256')
      .update(JSON.stringify(stable(blueprint.creative_genome)))
      .digest('hex');

    return compileShotExploration(
      job.shot,
      digest,
      genomeDirectives(blueprint.creative_genome),
      blueprint.rejection_contract,
    );
  });

  const batchDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(shots.map((shot) => shot.creativeGenomeDigest))))
    .digest('hex');

  return {
    schema: 'evercraft.fallen.exploration-batch.v1',
    projectId: inventory.projectId,
    creativeGenomeDigest: batchDigest,
    shots,
  };
}
