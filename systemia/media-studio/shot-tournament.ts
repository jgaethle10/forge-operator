export type ShotJudgeRole =
  | 'subject_coverage_judge'
  | 'composition_judge'
  | 'motion_judge'
  | 'continuity_judge'
  | 'truth_judge'
  | 'brand_judge'
  | 'beauty_judge'
  | 'editability_judge';

export type CandidateSourceState =
  | 'observed_source'
  | 'licensed_source'
  | 'product_capture'
  | 'generated_visualization'
  | 'modeled_visualization';

export type ObservationMetric =
  | 'subject_coverage'
  | 'composition'
  | 'motion_quality'
  | 'continuity'
  | 'brand_fidelity'
  | 'beauty'
  | 'editability';

export interface VisualObservationReceipt {
  schema: 'evercraft.fallen.visual-observation.v1';
  candidateId: string;
  metric: ObservationMetric;
  verifierId: string;
  verifierState: 'declared' | 'verified';
  score: number;
  threshold: number;
  evidenceRefs: string[];
  subjectId?: string;
  findings?: string[];
}

export interface ShotCandidate {
  id: string;
  shotId: string;
  artifactPath: string;
  artifactDigest: string;
  kind: 'image' | 'video';
  durationSec?: number;
  aspectRatio: '9:16' | '16:9' | '1:1';
  sourceState: CandidateSourceState;
  provenance: 'complete' | 'missing';
  syntheticLabelPresent?: boolean;
  providerId?: string;
  providerModel?: string;
  providerRequestId?: string;
  estimatedCostUsd?: number;
  latencyMs?: number;
  subjectIds: string[];
  observations: VisualObservationReceipt[];
}

export interface ShotTournamentInventory {
  schema: 'evercraft.fallen.shot-tournament-inventory.v1';
  shotId: string;
  creativeGenomeDigest: string;
  requiredRoles: ShotJudgeRole[];
  candidates: ShotCandidate[];
  jobs: Array<{
    kind: 'fallen_shot_candidate';
    key: string;
    candidate: ShotCandidate;
    creativeGenomeDigest: string;
  }>;
}

export const SHOT_JUDGE_ROLES: ShotJudgeRole[] = [
  'subject_coverage_judge',
  'composition_judge',
  'motion_judge',
  'continuity_judge',
  'truth_judge',
  'brand_judge',
  'beauty_judge',
  'editability_judge',
];

export function buildShotTournamentInventory(input: {
  shotId: string;
  creativeGenomeDigest: string;
  candidates: ShotCandidate[];
}): ShotTournamentInventory {
  if (!input.shotId?.trim()) throw new Error('shotId is required.');
  if (!input.creativeGenomeDigest?.trim()) {
    throw new Error('creativeGenomeDigest is required.');
  }
  if (input.candidates.length < 2) {
    throw new Error('A shot tournament requires at least two candidates.');
  }

  const ids = new Set<string>();
  for (const candidate of input.candidates) {
    if (candidate.shotId !== input.shotId) {
      throw new Error(
        `Candidate ${candidate.id} belongs to ${candidate.shotId}, not ${input.shotId}.`,
      );
    }
    if (ids.has(candidate.id)) {
      throw new Error(`Duplicate candidate id: ${candidate.id}`);
    }
    ids.add(candidate.id);
  }

  return {
    schema: 'evercraft.fallen.shot-tournament-inventory.v1',
    shotId: input.shotId,
    creativeGenomeDigest: input.creativeGenomeDigest,
    requiredRoles: SHOT_JUDGE_ROLES,
    candidates: input.candidates,
    jobs: input.candidates.map((candidate) => ({
      kind: 'fallen_shot_candidate' as const,
      key: candidate.id,
      candidate,
      creativeGenomeDigest: input.creativeGenomeDigest,
    })),
  };
}
