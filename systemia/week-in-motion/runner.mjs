#!/usr/bin/env node
import {
  collectGitHubEvidence,
  generateEditorial,
  publicationPayload,
  publishJournal,
  qualityGate,
  resolveCompletedWeek,
  summarizeEvidence,
  writeArtifacts,
} from './engine.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const repo = process.env.GITHUB_REPOSITORY || process.env.EVERCRAFT_REPOSITORY || 'jgaethle10/forge-operator';
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const now = arg('--now') ? new Date(arg('--now')) : new Date();
const window = resolveCompletedWeek(now);
const outDir = arg('--out') || 'artifacts/week-in-motion';
const shouldPublish = process.argv.includes('--publish');

const evidence = await collectGitHubEvidence({ repo, token, window });
const summary = summarizeEvidence(evidence);
if (!evidence.length) {
  console.error(JSON.stringify({ status: 'blocked_no_evidence', window: { start: window.startDate, end: window.endDate } }, null, 2));
  process.exitCode = 2;
} else {
  const editorial = await generateEditorial({
    window,
    evidence,
    endpoint: process.env.EVERCRAFT_EDITORIAL_ENDPOINT,
    token: process.env.EVERCRAFT_EDITORIAL_TOKEN,
    model: process.env.EVERCRAFT_EDITORIAL_MODEL,
  });

  let gate = { pass: false, reasons: [editorial.reason || editorial.status], metrics: {} };
  let payload = null;
  let publication = { status: 'not_attempted' };

  if (editorial.status === 'generated') {
    gate = qualityGate({ output: editorial.output, evidence, window });
    payload = publicationPayload({ output: editorial.output, evidence, window, gate });
    if (shouldPublish && gate.pass) {
      publication = await publishJournal({
        payload,
        ingressUrl: process.env.SYSTEMIA_JOURNAL_INGRESS_URL,
        secret: process.env.SYSTEMIA_JOURNAL_SHARED_SECRET,
      });
    } else if (shouldPublish) {
      publication = { status: 'blocked_quality_gate', reasons: gate.reasons };
    }
  }

  const artifactDir = await writeArtifacts({
    outDir,
    window,
    evidence,
    editorial,
    gate,
    publication,
    publishPayload: payload,
  });

  const result = {
    status: publication.status === 'published' ? 'published' : gate.pass ? 'ready' : 'blocked',
    window: { start: window.startDate, end: window.endDate },
    evidence: summary,
    gate,
    publication,
    artifactDir,
  };
  console.log(JSON.stringify(result, null, 2));
  if (shouldPublish && publication.status !== 'published') process.exitCode = 3;
}
