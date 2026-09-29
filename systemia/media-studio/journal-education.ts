import {
  compileWorldIntelStage,
  type WorldIntelStageInput,
  type WorldIntelMediaInput,
  type WorldIntelMetricInput,
  type WorldIntelPointInput,
  type WorldIntelRouteInput,
  type WorldIntelTimelineInput,
} from './world-intel-stage.js';
import type { VisualStage } from './visual-stage.js';

export type JournalFreshnessState = 'fresh' | 'mixed' | 'stale' | 'unknown' | 'not_applicable';
export type JournalVisualRightsState = 'not_required' | 'verified' | 'blocked' | 'unknown';

export interface JournalVolatileClaim {
  claim_key?: string;
  claim: string;
  value?: string;
  authority?: string;
  source_ref?: string;
  verified_at?: string;
  expires_at?: string;
  conflict_refs?: string[];
  freshness_state?: 'fresh' | 'stale' | 'contradicted' | 'unknown';
}

export interface JournalFallenProductionBrief {
  contract: 'evercraft.fallen.journal.production.v1';
  package_key: string;
  mission_key: string;
  work_key: string;
  story: {
    title: string;
    thesis?: string;
    education_goal: string;
    desk?: string;
  };
  evidence: {
    source_refs: string[];
    evidence_refs: string[];
    evidence_state: string;
    confidence: string;
    freshness_state: JournalFreshnessState;
    volatile_claims?: JournalVolatileClaim[];
    uncertainty_notes?: string;
  };
  rights: {
    visual_rights_state: JournalVisualRightsState;
  };
  audience_tracks?: string[];
  derivative_plan?: Array<Record<string, unknown>>;
  visual_story: WorldIntelStageInput;
  invariant?: string;
}

export interface JournalFallenStageReceipt {
  schema: 'evercraft.fallen.journal-stage-receipt.v1';
  package_key: string;
  mission_key: string;
  work_key: string;
  stage_id: string;
  status: 'accepted';
  freshness_state: 'fresh' | 'not_applicable';
  visual_rights_state: 'verified' | 'not_required';
  source_refs: string[];
  evidence_refs: string[];
  visual_evidence_ref_count: number;
  publication_authority: false;
}

export interface JournalFallenStageBundle {
  schema: 'evercraft.fallen.journal-stage-bundle.v1';
  stage: VisualStage;
  receipt: JournalFallenStageReceipt;
}

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function unique(values: string[] | undefined) {
  return [...new Set((values ?? []).map(clean).filter(Boolean))];
}

function safeId(value: string) {
  return clean(value).replace(/[^a-zA-Z0-9:_-]+/g, '_').slice(0, 180);
}

function collectEvidenceRows(story: WorldIntelStageInput) {
  const rows: Array<
    WorldIntelMediaInput |
    WorldIntelRouteInput |
    WorldIntelPointInput |
    WorldIntelMetricInput |
    WorldIntelTimelineInput
  > = [];

  if (story.setPlate) rows.push(story.setPlate);
  if (story.subjectMedia) rows.push(story.subjectMedia);
  if (story.mapPlate) rows.push(story.mapPlate);
  rows.push(...(story.map?.routes ?? []));
  rows.push(...(story.map?.points ?? []));
  rows.push(...(story.metrics ?? []));
  rows.push(...(story.timeline?.events ?? []));
  return rows;
}

function hasMedia(story: WorldIntelStageInput) {
  return Boolean(story.setPlate || story.subjectMedia || story.mapPlate);
}

function assertGroundedVisuals(brief: JournalFallenProductionBrief) {
  const knownRefs = new Set([
    ...unique(brief.evidence.source_refs),
    ...unique(brief.evidence.evidence_refs),
  ]);

  const rows = collectEvidenceRows(brief.visual_story);
  for (const row of rows) {
    const refs = unique(row.sourceRefs);
    if (!refs.length) {
      throw new Error('Every Journal visual input requires at least one source reference.');
    }
    const unknownRefs = refs.filter((ref) => !knownRefs.has(ref));
    if (unknownRefs.length) {
      throw new Error(
        `Journal visual input references evidence outside the approved package: ${unknownRefs.join(', ')}`,
      );
    }
  }

  return rows.reduce((count, row) => count + unique(row.sourceRefs).length, 0);
}

export function compileJournalEducationStage(
  brief: JournalFallenProductionBrief,
): JournalFallenStageBundle {
  if (brief?.contract !== 'evercraft.fallen.journal.production.v1') {
    throw new Error('Unsupported Journal/Fallen production contract.');
  }
  if (!clean(brief.package_key) || !clean(brief.mission_key) || !clean(brief.work_key)) {
    throw new Error('Journal/Fallen package, mission and work identity are required.');
  }
  if (!clean(brief.story?.title) || !clean(brief.story?.education_goal)) {
    throw new Error('Journal/Fallen story title and education goal are required.');
  }

  const sourceRefs = unique(brief.evidence?.source_refs);
  const evidenceRefs = unique(brief.evidence?.evidence_refs);
  if (!sourceRefs.length || !evidenceRefs.length) {
    throw new Error('Journal/Fallen production requires both source and evidence lineage.');
  }
  if (clean(brief.evidence?.evidence_state).toLowerCase() === 'unknown') {
    throw new Error('Journal/Fallen production blocks unknown package evidence state.');
  }

  const freshness = brief.evidence?.freshness_state;
  if (freshness !== 'fresh' && freshness !== 'not_applicable') {
    throw new Error(`Journal/Fallen production blocks freshness state: ${freshness || 'unknown'}.`);
  }

  const volatileClaims = brief.evidence?.volatile_claims ?? [];
  const unsafeClaims = volatileClaims.filter((claim) => claim.freshness_state !== 'fresh');
  if (unsafeClaims.length) {
    throw new Error(
      `Journal/Fallen production blocks ${unsafeClaims.length} stale, contradicted or unverified volatile claim(s).`,
    );
  }

  if (!brief.visual_story) {
    throw new Error('Journal/Fallen production requires a render-ready visual_story contract.');
  }

  const rights = brief.rights?.visual_rights_state;
  if (hasMedia(brief.visual_story) && rights !== 'verified') {
    throw new Error('Journal/Fallen source media cannot render until visual rights are verified.');
  }
  if (!hasMedia(brief.visual_story) && rights !== 'verified' && rights !== 'not_required') {
    throw new Error('Journal/Fallen visual rights state is unresolved.');
  }

  const visualEvidenceRefCount = assertGroundedVisuals(brief);
  const stageInput: WorldIntelStageInput = {
    ...brief.visual_story,
    id: safeId(brief.visual_story.id || `journal:${brief.package_key}`),
    headline: brief.story.title,
    subhead: brief.visual_story.subhead || brief.story.education_goal,
  };

  const stage = compileWorldIntelStage(stageInput);
  return {
    schema: 'evercraft.fallen.journal-stage-bundle.v1',
    stage,
    receipt: {
      schema: 'evercraft.fallen.journal-stage-receipt.v1',
      package_key: brief.package_key,
      mission_key: brief.mission_key,
      work_key: brief.work_key,
      stage_id: stage.id,
      status: 'accepted',
      freshness_state: freshness,
      visual_rights_state: rights,
      source_refs: sourceRefs,
      evidence_refs: evidenceRefs,
      visual_evidence_ref_count: visualEvidenceRefCount,
      publication_authority: false,
    },
  };
}
