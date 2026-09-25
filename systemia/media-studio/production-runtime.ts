import type { ProductionRoute } from './departments.js';
import type {
  IdentityEvidence,
  ProductionAdmission,
  ProductionArtifact,
  ProductionNeed,
  ProductionReceipt,
} from './types.js';

function expectedArtifactKind(need: ProductionNeed): ProductionArtifact['kind'] {
  if (need.kind === 'image') return 'image';
  if (need.kind === 'video' || need.kind === 'lip_sync') return 'video';
  return 'audio';
}

function addReason(reasons: string[], condition: boolean, reason: string) {
  if (!condition) reasons.push(reason);
}

function timingMatches(
  need: ProductionNeed,
  artifact: ProductionArtifact,
  receipt: ProductionReceipt,
) {
  const observed = artifact.durationSec ?? receipt.durationSec;
  if (observed === undefined) return need.durationSec === undefined;

  if (artifact.durationSec !== undefined && receipt.durationSec !== undefined) {
    if (Math.abs(artifact.durationSec - receipt.durationSec) > 0.05) return false;
  }

  if (need.durationSec === undefined) return true;
  const tolerance = Math.max(0.25, need.durationSec * 0.05);
  return Math.abs(observed - need.durationSec) <= tolerance;
}

function identityReasons(
  need: ProductionNeed,
  artifact: ProductionArtifact,
  evidence: IdentityEvidence[],
) {
  const reasons: string[] = [];
  if (!need.requires.includes('reference_identity')) return reasons;

  const requiredEntities = [...new Set(need.continuityEntityIds ?? [])];
  if (!requiredEntities.length) {
    reasons.push('Reference identity was required but the production need has no continuity entity IDs.');
    return reasons;
  }

  for (const entityId of requiredEntities) {
    const matching = evidence.filter((item) => item.entityId === entityId);
    if (!matching.length) {
      reasons.push(`Missing identity evidence for ${entityId}.`);
      continue;
    }

    const passing = matching.some(
      (item) =>
        item.verifierState === 'verified' &&
        item.candidateDigest === artifact.digest &&
        item.referenceAssetIds.length > 0 &&
        Number.isFinite(item.score) &&
        Number.isFinite(item.threshold) &&
        item.score >= item.threshold,
    );

    if (!passing) {
      reasons.push(
        `Identity evidence for ${entityId} did not pass a verified reference comparison.`,
      );
    }
  }

  return reasons;
}

export function admitProductionResult(input: {
  need: ProductionNeed;
  route: ProductionRoute;
  artifact: ProductionArtifact;
  receipt: ProductionReceipt;
  identityEvidence?: IdentityEvidence[];
}): ProductionAdmission {
  const { need, route, artifact, receipt } = input;
  const identityEvidence = input.identityEvidence ?? [];
  const reasons: string[] = [];

  addReason(
    reasons,
    route.status === 'routed' && Boolean(route.departmentId),
    'Production need was not routed to a verified creative department.',
  );
  addReason(reasons, route.needId === need.id, 'Route need ID does not match production need.');
  addReason(reasons, receipt.needId === need.id, 'Receipt need ID does not match production need.');
  addReason(
    reasons,
    receipt.departmentId === route.departmentId,
    'Receipt department does not match the routed department.',
  );
  addReason(
    reasons,
    receipt.continuityDigest === need.continuityDigest,
    'Receipt continuity digest does not match the episode continuity contract.',
  );
  addReason(
    reasons,
    receipt.artifactDigest === artifact.digest,
    'Receipt artifact digest does not match the delivered artifact.',
  );
  addReason(
    reasons,
    artifact.kind === expectedArtifactKind(need),
    `Artifact kind ${artifact.kind} does not satisfy ${need.kind}.`,
  );

  if (need.aspectRatio) {
    addReason(
      reasons,
      artifact.aspectRatio === need.aspectRatio,
      `Artifact aspect ratio does not match required ${need.aspectRatio}.`,
    );
  }

  if (need.requires.includes('commercial_rights')) {
    addReason(
      reasons,
      receipt.commercialRights === 'allowed',
      'Commercial-rights requirement is not satisfied.',
    );
  }

  if (need.requires.includes('provenance_receipt')) {
    addReason(
      reasons,
      receipt.provenance === 'complete',
      'Complete provenance receipt is required.',
    );
  }

  if (need.requires.includes('voice_profile')) {
    addReason(
      reasons,
      Boolean(need.voiceProfileId) &&
        receipt.voiceProfileId === need.voiceProfileId,
      'Generated speech does not attest the locked voice profile.',
    );
  }

  if (need.requires.includes('timing_control')) {
    addReason(
      reasons,
      timingMatches(need, artifact, receipt),
      'Artifact timing does not satisfy the production need or receipt.',
    );
  }

  reasons.push(...identityReasons(need, artifact, identityEvidence));

  return {
    needId: need.id,
    status: reasons.length ? 'rejected' : 'accepted',
    reasons,
    artifactDigest: artifact.digest,
  };
}

export interface ProductionReconciliation {
  status: 'accepted' | 'rejected';
  accepted: ProductionAdmission[];
  rejected: ProductionAdmission[];
}

export function reconcileProductionResults(
  admissions: ProductionAdmission[],
): ProductionReconciliation {
  const accepted = admissions.filter((item) => item.status === 'accepted');
  const rejected = admissions.filter((item) => item.status === 'rejected');

  return {
    status: rejected.length ? 'rejected' : 'accepted',
    accepted,
    rejected,
  };
}

export function buildSabanProductionInventory(needs: ProductionNeed[]) {
  return {
    schema: 'evercraft.fallen.saban-production-inventory.v1',
    jobs: needs.map((need) => ({
      kind: 'fallen_production_need',
      key: need.id,
      need,
      continuity_digest: need.continuityDigest,
      requested_outputs: ['artifact', 'production_receipt', 'continuity_evidence'],
    })),
  };
}
