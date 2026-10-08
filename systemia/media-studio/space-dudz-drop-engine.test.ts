import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSpaceDudzDesignTournament,
  evaluateSpaceDudzPrintAuthorization,
  rankCommunityVotes,
  toSpaceDudzStorefrontDesignRecord,
} from './space-dudz-drop-engine.js';

function candidate(id: string) {
  return {
    designId: id,
    name: `Design ${id}`,
    artifactPath: `/art/${id}.png`,
    artifactDigest: `digest-${id}`,
    imageUrl: `https://assets.example/${id}.png`,
    sourceState: 'generated_visualization' as const,
    provenance: 'complete' as const,
    sourceAssetRef: `fallen://space-dudz/${id}`,
    provenanceRefs: [`receipt://${id}`],
    styleTags: ['space-dudz', 'drop'],
    voteLabel: id.toUpperCase(),
  };
}

test('builds a Space Dudz design tournament on top of the Fallen shot tournament', () => {
  const result = buildSpaceDudzDesignTournament({
    campaignId: 'drop-001',
    name: 'Drop 001',
    creativeGenomeDigest: 'genome-001',
    candidates: [candidate('a'), candidate('b'), candidate('c')],
  });

  assert.equal(result.schema, 'evercraft.space-dudz.design-tournament.v1');
  assert.equal(result.lifecycleStage, 'voting');
  assert.equal(result.candidates.length, 3);
  assert.equal(result.tournament.candidates.length, 3);
  assert.equal(result.tournament.shotId, 'space-dudz:drop-001');
});

test('rejects a design candidate without complete provenance', () => {
  assert.throws(
    () =>
      buildSpaceDudzDesignTournament({
        campaignId: 'drop-002',
        name: 'Drop 002',
        creativeGenomeDigest: 'genome-002',
        candidates: [
          { ...candidate('a'), provenance: 'missing' as const },
          candidate('b'),
        ],
      }),
    /missing complete provenance/,
  );
});

test('community vote ranking is deterministic and merges duplicate tallies', () => {
  assert.deepEqual(
    rankCommunityVotes([
      { designId: 'beta', votes: 5 },
      { designId: 'alpha', votes: 3 },
      { designId: 'alpha', votes: 2 },
    ]),
    [
      { designId: 'alpha', votes: 5, rank: 1 },
      { designId: 'beta', votes: 5, rank: 2 },
    ],
  );
});

test('projects a graphics-command candidate into the Space Dudz storefront schema', () => {
  const tournament = buildSpaceDudzDesignTournament({
    campaignId: 'drop-003',
    name: 'Drop 003',
    creativeGenomeDigest: 'genome-003',
    candidates: [candidate('a'), candidate('b')],
  });

  const record = toSpaceDudzStorefrontDesignRecord({
    campaignId: 'drop-003',
    creativeGenomeDigest: 'genome-003',
    candidate: tournament.candidates[0],
    preorderGoalUnits: 25,
  });

  assert.equal(record.source_system, 'evercraft_graphics_command');
  assert.equal(record.public_stage, 'voting');
  assert.equal(record.campaign_id, 'drop-003');
  assert.equal(record.preorder_goal_units, 25);
});

test('does not count mere authorizations toward the print trigger', () => {
  const result = evaluateSpaceDudzPrintAuthorization({
    winningDesignId: 'winner',
    preorderGoalUnits: 2,
    paymentReceipts: [
      {
        receiptId: 'r1',
        designId: 'winner',
        units: 2,
        paymentState: 'authorized',
        netPaidUsd: 80,
      },
    ],
    readiness: {
      designId: 'winner',
      printAssetRef: 'fallen://print/winner',
      printPartnerRef: 'printer://yakima',
      printStatus: 'quoted',
      quotedUnitCostUsd: 15,
    },
  });

  assert.equal(result.status, 'denied');
  assert.equal(result.paidUnits, 0);
  assert.ok(result.reasons.includes('preorder_goal_not_met'));
});

test('authorizes only when settled preorders fund a quoted winner print run', () => {
  const result = evaluateSpaceDudzPrintAuthorization({
    winningDesignId: 'winner',
    preorderGoalUnits: 3,
    paymentReceipts: [
      {
        receiptId: 'r1',
        designId: 'winner',
        units: 2,
        paymentState: 'captured',
        netPaidUsd: 70,
      },
      {
        receiptId: 'r2',
        designId: 'winner',
        units: 1,
        paymentState: 'paid',
        netPaidUsd: 35,
      },
      {
        receiptId: 'r3',
        designId: 'loser',
        units: 50,
        paymentState: 'captured',
        netPaidUsd: 1000,
      },
    ],
    readiness: {
      designId: 'winner',
      printAssetRef: 'fallen://print/winner',
      printPartnerRef: 'printer://yakima',
      printStatus: 'quoted',
      quotedUnitCostUsd: 18,
    },
  });

  assert.equal(result.status, 'authorized');
  assert.equal(result.paidUnits, 3);
  assert.equal(result.printUnits, 3);
  assert.equal(result.quotedPrintCostUsd, 54);
  assert.equal(result.maxPrintSpendUsd, 54);
  assert.deepEqual(result.reasons, []);
});

test('fails closed when duplicate payment receipts appear', () => {
  const receipt = {
    receiptId: 'duplicate',
    designId: 'winner',
    units: 2,
    paymentState: 'captured' as const,
    netPaidUsd: 80,
  };
  const result = evaluateSpaceDudzPrintAuthorization({
    winningDesignId: 'winner',
    preorderGoalUnits: 2,
    paymentReceipts: [receipt, receipt],
    readiness: {
      designId: 'winner',
      printAssetRef: 'fallen://print/winner',
      printPartnerRef: 'printer://yakima',
      printStatus: 'quoted',
      quotedUnitCostUsd: 15,
    },
  });

  assert.equal(result.status, 'denied');
  assert.ok(result.reasons.includes('duplicate_payment_receipt:duplicate'));
});
