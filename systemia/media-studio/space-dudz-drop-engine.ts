import {
  buildShotTournamentInventory,
  type CandidateSourceState,
  type ShotCandidate,
  type ShotTournamentInventory,
  type VisualObservationReceipt,
} from './shot-tournament.js';

export type SpaceDudzLifecycleStage =
  | 'designing'
  | 'voting'
  | 'preorder'
  | 'print_ready'
  | 'printing'
  | 'fulfilled';

export type SpaceDudzPublicStage =
  | 'hidden'
  | 'voting'
  | 'preorder'
  | 'winner'
  | 'printing'
  | 'fulfilled';

export interface SpaceDudzDesignCandidateInput {
  designId: string;
  name: string;
  artifactPath: string;
  artifactDigest: string;
  imageUrl: string;
  sourceState: CandidateSourceState;
  provenance: 'complete' | 'missing';
  sourceAssetRef: string;
  provenanceRefs: string[];
  styleTags?: string[];
  productLine?: 'main' | 'baby-rangers';
  voteLabel?: string;
  providerId?: string;
  providerModel?: string;
  providerRequestId?: string;
  estimatedCostUsd?: number;
  observations?: VisualObservationReceipt[];
}

export interface SpaceDudzDesignCandidate {
  designId: string;
  name: string;
  imageUrl: string;
  artifactPath: string;
  artifactDigest: string;
  sourceAssetRef: string;
  provenanceRefs: string[];
  styleTags: string[];
  productLine: 'main' | 'baby-rangers';
  voteLabel?: string;
}

export interface SpaceDudzDesignTournament {
  schema: 'evercraft.space-dudz.design-tournament.v1';
  campaignId: string;
  name: string;
  creativeGenomeDigest: string;
  lifecycleStage: 'voting';
  candidates: SpaceDudzDesignCandidate[];
  tournament: ShotTournamentInventory;
}

export interface CommunityVoteTally {
  designId: string;
  votes: number;
}

export interface RankedCommunityVote {
  designId: string;
  votes: number;
  rank: number;
}

export interface EvercraftPaymentReceipt {
  receiptId: string;
  designId: string;
  units: number;
  paymentState:
    | 'created'
    | 'authorized'
    | 'paid'
    | 'captured'
    | 'refunded'
    | 'cancelled';
  netPaidUsd: number;
}

export interface SpaceDudzPrintReadiness {
  designId: string;
  printAssetRef: string;
  printPartnerRef: string;
  printStatus:
    | 'not_ready'
    | 'ready'
    | 'quoted'
    | 'authorized'
    | 'ordered'
    | 'complete';
  quotedUnitCostUsd: number;
}

export interface SpaceDudzPrintAuthorization {
  schema: 'evercraft.space-dudz.print-authorization.v1';
  status: 'authorized' | 'denied';
  winningDesignId: string;
  paidUnits: number;
  preorderGoalUnits: number;
  capturedNetUsd: number;
  quotedPrintCostUsd: number;
  printUnits: number;
  maxPrintSpendUsd: number;
  printPartnerRef?: string;
  printAssetRef?: string;
  reasons: string[];
}

function required(value: string, field: string) {
  if (!value?.trim()) throw new Error(`${field} is required.`);
  return value.trim();
}

function money(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function buildSpaceDudzDesignTournament(input: {
  campaignId: string;
  name: string;
  creativeGenomeDigest: string;
  candidates: SpaceDudzDesignCandidateInput[];
}): SpaceDudzDesignTournament {
  const campaignId = required(input.campaignId, 'campaignId');
  const name = required(input.name, 'name');
  const creativeGenomeDigest = required(
    input.creativeGenomeDigest,
    'creativeGenomeDigest',
  );

  if (input.candidates.length < 2) {
    throw new Error('A Space Dudz design tournament requires at least two candidates.');
  }

  const shotId = `space-dudz:${campaignId}`;
  const ids = new Set<string>();
  const candidates: SpaceDudzDesignCandidate[] = [];
  const shotCandidates: ShotCandidate[] = [];

  for (const item of input.candidates) {
    const designId = required(item.designId, 'designId');
    if (ids.has(designId)) throw new Error(`Duplicate designId: ${designId}`);
    ids.add(designId);

    if (item.provenance !== 'complete') {
      throw new Error(`Design ${designId} is missing complete provenance.`);
    }
    if (!item.provenanceRefs?.length) {
      throw new Error(`Design ${designId} is missing provenanceRefs.`);
    }

    candidates.push({
      designId,
      name: required(item.name, 'name'),
      imageUrl: required(item.imageUrl, 'imageUrl'),
      artifactPath: required(item.artifactPath, 'artifactPath'),
      artifactDigest: required(item.artifactDigest, 'artifactDigest'),
      sourceAssetRef: required(item.sourceAssetRef, 'sourceAssetRef'),
      provenanceRefs: [...new Set(item.provenanceRefs.filter(Boolean))],
      styleTags: [...new Set(item.styleTags ?? [])],
      productLine: item.productLine ?? 'main',
      voteLabel: item.voteLabel?.trim() || undefined,
    });

    shotCandidates.push({
      id: designId,
      shotId,
      artifactPath: item.artifactPath,
      artifactDigest: item.artifactDigest,
      kind: 'image',
      aspectRatio: '1:1',
      sourceState: item.sourceState,
      provenance: item.provenance,
      providerId: item.providerId,
      providerModel: item.providerModel,
      providerRequestId: item.providerRequestId,
      estimatedCostUsd: item.estimatedCostUsd,
      subjectIds: ['space-dudz'],
      observations: item.observations ?? [],
    });
  }

  return {
    schema: 'evercraft.space-dudz.design-tournament.v1',
    campaignId,
    name,
    creativeGenomeDigest,
    lifecycleStage: 'voting',
    candidates,
    tournament: buildShotTournamentInventory({
      shotId,
      creativeGenomeDigest,
      candidates: shotCandidates,
    }),
  };
}

export function rankCommunityVotes(
  tallies: CommunityVoteTally[],
): RankedCommunityVote[] {
  const merged = new Map<string, number>();

  for (const tally of tallies) {
    const designId = required(tally.designId, 'designId');
    if (!Number.isInteger(tally.votes) || tally.votes < 0) {
      throw new Error(`Invalid vote count for ${designId}.`);
    }
    merged.set(designId, (merged.get(designId) ?? 0) + tally.votes);
  }

  return [...merged.entries()]
    .sort(([leftId, leftVotes], [rightId, rightVotes]) => {
      if (leftVotes !== rightVotes) return rightVotes - leftVotes;
      return leftId.localeCompare(rightId);
    })
    .map(([designId, votes], index) => ({
      designId,
      votes,
      rank: index + 1,
    }));
}

export function toSpaceDudzStorefrontDesignRecord(input: {
  campaignId: string;
  creativeGenomeDigest: string;
  candidate: SpaceDudzDesignCandidate;
  publicStage?: SpaceDudzPublicStage;
  preorderProductId?: string;
  preorderGoalUnits?: number;
}) {
  return {
    name: input.candidate.name,
    image_url: input.candidate.imageUrl,
    style_tags: input.candidate.styleTags,
    product_line: input.candidate.productLine,
    status: 'approved',
    campaign_id: input.campaignId,
    public_stage: input.publicStage ?? 'voting',
    vote_label: input.candidate.voteLabel ?? '',
    source_system: 'evercraft_graphics_command',
    source_asset_ref: input.candidate.sourceAssetRef,
    creative_genome_digest: input.creativeGenomeDigest,
    provenance_refs: input.candidate.provenanceRefs,
    print_asset_ref: input.candidate.artifactPath,
    preorder_product_id: input.preorderProductId ?? '',
    preorder_goal_units: input.preorderGoalUnits,
    print_status: 'not_ready',
  };
}

export function evaluateSpaceDudzPrintAuthorization(input: {
  winningDesignId: string;
  preorderGoalUnits: number;
  paymentReceipts: EvercraftPaymentReceipt[];
  readiness: SpaceDudzPrintReadiness;
}): SpaceDudzPrintAuthorization {
  const winningDesignId = required(input.winningDesignId, 'winningDesignId');
  if (!Number.isInteger(input.preorderGoalUnits) || input.preorderGoalUnits < 1) {
    throw new Error('preorderGoalUnits must be a positive integer.');
  }

  const reasons: string[] = [];
  const seenReceipts = new Set<string>();
  let paidUnits = 0;
  let capturedNetUsd = 0;

  for (const receipt of input.paymentReceipts) {
    const receiptId = required(receipt.receiptId, 'receiptId');
    if (seenReceipts.has(receiptId)) {
      reasons.push(`duplicate_payment_receipt:${receiptId}`);
      continue;
    }
    seenReceipts.add(receiptId);

    if (!Number.isInteger(receipt.units) || receipt.units < 1) {
      reasons.push(`invalid_payment_units:${receiptId}`);
      continue;
    }
    if (!Number.isFinite(receipt.netPaidUsd) || receipt.netPaidUsd < 0) {
      reasons.push(`invalid_net_paid:${receiptId}`);
      continue;
    }

    const settled = receipt.paymentState === 'paid' || receipt.paymentState === 'captured';
    if (!settled || receipt.designId !== winningDesignId) continue;

    paidUnits += receipt.units;
    capturedNetUsd += receipt.netPaidUsd;
  }

  capturedNetUsd = money(capturedNetUsd);

  if (paidUnits < input.preorderGoalUnits) {
    reasons.push('preorder_goal_not_met');
  }

  if (input.readiness.designId !== winningDesignId) {
    reasons.push('print_readiness_design_mismatch');
  }
  if (!input.readiness.printAssetRef?.trim()) {
    reasons.push('print_asset_missing');
  }
  if (!input.readiness.printPartnerRef?.trim()) {
    reasons.push('print_partner_missing');
  }
  if (!['quoted', 'authorized'].includes(input.readiness.printStatus)) {
    reasons.push('print_quote_not_ready');
  }
  if (
    !Number.isFinite(input.readiness.quotedUnitCostUsd) ||
    input.readiness.quotedUnitCostUsd <= 0
  ) {
    reasons.push('quoted_unit_cost_invalid');
  }

  const quotedPrintCostUsd = money(
    paidUnits * Math.max(0, Number(input.readiness.quotedUnitCostUsd) || 0),
  );
  if (quotedPrintCostUsd > capturedNetUsd) {
    reasons.push('captured_funds_below_print_cost');
  }

  const status = reasons.length ? 'denied' : 'authorized';

  return {
    schema: 'evercraft.space-dudz.print-authorization.v1',
    status,
    winningDesignId,
    paidUnits,
    preorderGoalUnits: input.preorderGoalUnits,
    capturedNetUsd,
    quotedPrintCostUsd,
    printUnits: status === 'authorized' ? paidUnits : 0,
    maxPrintSpendUsd: status === 'authorized' ? quotedPrintCostUsd : 0,
    printPartnerRef:
      status === 'authorized' ? input.readiness.printPartnerRef : undefined,
    printAssetRef:
      status === 'authorized' ? input.readiness.printAssetRef : undefined,
    reasons,
  };
}
