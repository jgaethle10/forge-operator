#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { writeFrontierArtifacts } from './frontier-watch.mjs';
import { runScienceHazardWatch } from './science-hazard-watch.mjs';
import { writeMedicalEvidenceBrief } from './medical-evidence-brief.mjs';
import { writeMedicalAbstractEvidence } from './medical-abstract-evidence.mjs';
import { writeMedicalEvidenceTriage } from './medical-evidence-triage.mjs';
import { writeMedicalReviewPacket } from './medical-review-packet.mjs';
import { writeRegistryCrosscheck } from './medical-registry-crosscheck.mjs';
import { KaidanceRuntime } from '../collider/runtime.mjs';

const rootDir = process.cwd();
const now = new Date();
const artifactRoot = path.join(rootDir, 'artifacts');
const frontier = writeFrontierArtifacts({
  rootDir,
  outDir: path.join(artifactRoot, 'portfolio-frontier'),
  now
});
const science = await runScienceHazardWatch({
  outDir: path.join(artifactRoot, 'science-hazard-watch'),
  now
});

const medicalBrief = writeMedicalEvidenceBrief({
  watch: science.report,
  outDir: path.join(artifactRoot, 'medical-evidence-radar'),
  now
});

const medicalAbstracts = await writeMedicalAbstractEvidence({
  watch: science.report,
  outDir: path.join(artifactRoot, 'medical-abstract-evidence'),
  now
});

const triageDir = path.join(artifactRoot, 'medical-evidence-triage');
let previousTriage = null;
try { previousTriage = JSON.parse(fs.readFileSync(path.join(triageDir,'state.json'),'utf8')); }
catch { /* First cycle has no durable triage ledger; output will mark it as first-seen. */ }
const medicalTriage = writeMedicalEvidenceTriage({
  abstractReport: medicalAbstracts,
  previous: previousTriage,
  outDir: triageDir,
  now
});

const medicalReview = writeMedicalReviewPacket({
  abstractReport: medicalAbstracts,
  triageReport: medicalTriage.report,
  outDir: path.join(artifactRoot, 'medical-review-packets'),
  now
});

const registryCrosscheck = await writeRegistryCrosscheck({
  abstracts: medicalAbstracts,
  review: medicalReview,
  now,
  outDir: path.join(artifactRoot, 'medical-registry-crosscheck')
});

const cycleRoot = path.join(artifactRoot, 'kaidance-frontier');
fs.mkdirSync(cycleRoot, { recursive: true });
const configPath = path.join(cycleRoot, 'mission-sources.json');
fs.writeFileSync(configPath, JSON.stringify({
  schema: 'evercraft.kaidance.mission-fabric-config.v1',
  sources: [
    {
      source_key: 'portfolio-frontier',
      path: '../portfolio-frontier/mission-snapshot.json',
      required: true,
      stale_after_seconds: 900
    },
    {
      source_key: 'science-hazard-watch',
      path: '../science-hazard-watch/mission-snapshot.json',
      required: true,
      stale_after_seconds: 900
    }
  ]
}, null, 2) + '\n');

const runtime = new KaidanceRuntime({
  root: path.join(cycleRoot, 'runtime'),
  colliderKey: 'kaidance-frontier-field',
  heartbeatTargetSeconds: 300,
  graceSeconds: 120,
  deploymentReceipt: process.env.GITHUB_RUN_ID ? `github-actions:${process.env.GITHUB_RUN_ID}` : 'local-field-cycle',
  missionFabricConfigPath: configPath,
  missionFabricAllowedRoot: artifactRoot,
  clock: () => now
});

const result = await runtime.runOnce(now);
const body = {
  schema: 'evercraft.kaidance.frontier-field-cycle.v1',
  observed_at: now.toISOString(),
  ok: Boolean(result.ok),
  hold: result.hold || null,
  frontier: {
    asset_count: frontier.report.asset_count,
    obligation_count: frontier.report.obligation_count,
    silent_drop_count: frontier.report.silent_drop_count,
    receipt_hash: frontier.report.receipt_hash
  },
  science_hazard: {
    earthquake_count: science.report.lanes.earthquakes.count ?? null,
    elevated_volcano_count: science.report.lanes.volcanoes.elevated_count ?? null,
    recent_medical_matches: science.report.lanes.medical_research.total_recent_matches ?? null,
    held_sources: science.snapshot.counts.held,
    receipt_hash: science.report.receipt_hash
  },
  medical_evidence: {
    status: medicalBrief.status,
    sampled_titles: medicalBrief.sampled_titles,
    abstract_evidence_status: medicalAbstracts.status,
    abstracts_retrieved: medicalAbstracts.abstracts_retrieved,
    abstract_evidence_receipt: medicalAbstracts.receipt_hash,
    triage_status: medicalTriage.report.source_status,
    triage_history_status: medicalTriage.report.history_status,
    triage_counts: medicalTriage.report.counts,
    triage_receipt: medicalTriage.report.receipt_hash,
    review_packet_status: medicalReview.source_status,
    review_packet_counts: medicalReview.counts,
    review_packet_receipt: medicalReview.receipt_hash,
    registry_crosscheck_status: registryCrosscheck.source_status,
    registry_crosscheck_counts: registryCrosscheck.counts,
    registry_crosscheck_receipt: registryCrosscheck.receipt_hash,
    publication_disposition: medicalBrief.publication_disposition,
    receipt_hash: medicalBrief.receipt_hash
  },
  kaidance: result.ok ? {
    cycle_key: result.cycle?.cycle_key || null,
    coverage_receipt: result.coverageReceipt?.receipt_hash || result.coverageReceipt?.receipt_key || null,
    health: result.health
  } : {
    health: result.health || runtime.health(now)
  }
};
fs.writeFileSync(path.join(cycleRoot, 'latest.json'), JSON.stringify(body, null, 2) + '\n');
console.log(JSON.stringify(body));
