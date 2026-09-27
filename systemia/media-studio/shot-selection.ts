import crypto from 'node:crypto';
import type {
  ShotSelectionReceipt,
} from './types.js';
import type { ShotCandidate } from './shot-tournament.js';

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

function digest(value: unknown) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

export interface ShotTournamentReconciliation {
  schema: 'evercraft.fallen.shot-tournament-reconciliation.v1';
  status: 'reconciled' | 'blocked';
  winner_candidate_id: string | null;
  winner_artifact_digest: string | null;
  creative_genome_digest: string | null;
  [key: string]: unknown;
}

export function buildShotSelectionReceipt(input: {
  needId: string;
  tournament: ShotTournamentReconciliation;
  candidates: ShotCandidate[];
  selectedAt?: string;
}): ShotSelectionReceipt {
  if (input.tournament.status !== 'reconciled') {
    throw new Error('Cannot select a shot from a blocked tournament.');
  }
  const winnerId = input.tournament.winner_candidate_id;
  if (!winnerId) throw new Error('Tournament has no winner candidate ID.');

  const candidate = input.candidates.find((item) => item.id === winnerId);
  if (!candidate) {
    throw new Error(`Tournament winner ${winnerId} is missing from candidate inventory.`);
  }
  if (candidate.artifactDigest !== input.tournament.winner_artifact_digest) {
    throw new Error('Tournament winner artifact digest does not match candidate inventory.');
  }
  if (!input.tournament.creative_genome_digest) {
    throw new Error('Tournament reconciliation is missing the creative genome digest.');
  }

  return {
    schema: 'evercraft.fallen.shot-selection-receipt.v1',
    needId: input.needId,
    candidateId: candidate.id,
    artifactDigest: candidate.artifactDigest,
    creativeGenomeDigest: input.tournament.creative_genome_digest,
    tournamentReceiptDigest: digest(input.tournament),
    selectedAt: input.selectedAt ?? new Date().toISOString(),
  };
}
