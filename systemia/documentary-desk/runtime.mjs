import { assertOwnedDocumentaryRuntime, documentaryExecutionLanes } from './owned-runtime.mjs';

const EVIDENCE_STATES = new Set([
  'observed',
  'documented',
  'attributed',
  'inferred',
  'modeled',
  'disputed',
  'unknown',
]);

const RIGHTS_STATES = new Set([
  'owned',
  'licensed',
  'public_domain',
  'permissioned',
  'fair_use_review_required',
  'unknown',
]);

const VISUAL_STATES = new Set([
  'original_footage',
  'archival_footage',
  'photo',
  'document',
  'map',
  'data_visualization',
  'generated_visualization',
  'text_card',
]);

const DEFAULT_QA_GATES = [
  'evidence_integrity',
  'attribution',
  'causal_claims',
  'uncertainty',
  'contradictions',
  'chronology',
  'rights_and_licensing',
  'visual_authenticity',
  'generated_media_labeling',
  'pronunciation',
  'captions_and_transcript',
  'brand_and_platform_limits',
  'adversarial_read',
];

function required(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`missing required field: ${name}`);
  }
  return value;
}

function array(value, name) {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
  return value;
}

function uniqueIds(items, name) {
  const seen = new Set();
  for (const item of items) {
    required(item?.id, `${name}.id`);
    if (seen.has(item.id)) throw new Error(`duplicate ${name} id: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function normalizeEvidence(record) {
  required(record.id, 'evidence.id');
  required(record.claim, `evidence.${record.id}.claim`);
  required(record.state, `evidence.${record.id}.state`);
  if (!EVIDENCE_STATES.has(record.state)) {
    throw new Error(`invalid evidence state for ${record.id}: ${record.state}`);
  }
  const sources = array(record.sources ?? [], `evidence.${record.id}.sources`).map((source, index) => {
    required(source.ref, `evidence.${record.id}.sources[${index}].ref`);
    const rights = source.rights ?? 'unknown';
    if (!RIGHTS_STATES.has(rights)) throw new Error(`invalid rights state for ${record.id}: ${rights}`);
    return {
      ref: source.ref,
      kind: source.kind ?? 'source',
      authority: source.authority ?? 'unrated',
      capturedAt: source.capturedAt ?? null,
      rights,
      notes: source.notes ?? null,
    };
  });
  return {
    id: record.id,
    claim: record.claim,
    state: record.state,
    confidence: Number.isFinite(record.confidence) ? record.confidence : null,
    sources,
    contradictionRefs: [...new Set(record.contradictionRefs ?? [])],
    uncertainty: record.uncertainty ?? null,
    requiresOnScreenQualifier: ['inferred', 'modeled', 'disputed', 'unknown'].includes(record.state),
  };
}

function normalizeVisual(visual) {
  required(visual.id, 'visual.id');
  required(visual.type, `visual.${visual.id}.type`);
  if (!VISUAL_STATES.has(visual.type)) throw new Error(`invalid visual type for ${visual.id}: ${visual.type}`);
  const rights = visual.rights ?? 'unknown';
  if (!RIGHTS_STATES.has(rights)) throw new Error(`invalid visual rights state for ${visual.id}: ${rights}`);
  return {
    id: visual.id,
    type: visual.type,
    sourceRef: visual.sourceRef ?? null,
    evidenceRefs: [...new Set(visual.evidenceRefs ?? [])],
    rights,
    synthetic: visual.synthetic === true || visual.type === 'generated_visualization',
    syntheticLabelRequired: visual.type === 'generated_visualization' || visual.synthetic === true,
    mayProveFact: visual.type !== 'generated_visualization' && visual.synthetic !== true,
    notes: visual.notes ?? null,
  };
}

function normalizeChapter(chapter, evidenceIds, visualIds) {
  required(chapter.id, 'chapter.id');
  required(chapter.title, `chapter.${chapter.id}.title`);
  const evidenceRefs = [...new Set(array(chapter.evidenceRefs ?? [], `chapter.${chapter.id}.evidenceRefs`))];
  if (!evidenceRefs.length) throw new Error(`chapter ${chapter.id} must cite evidence`);
  for (const ref of evidenceRefs) {
    if (!evidenceIds.has(ref)) throw new Error(`chapter ${chapter.id} references unknown evidence: ${ref}`);
  }
  const visualRefs = [...new Set(chapter.visualRefs ?? [])];
  for (const ref of visualRefs) {
    if (!visualIds.has(ref)) throw new Error(`chapter ${chapter.id} references unknown visual: ${ref}`);
  }
  return {
    id: chapter.id,
    title: chapter.title,
    purpose: chapter.purpose ?? '',
    targetMinutes: chapter.targetMinutes ?? null,
    evidenceRefs,
    visualRefs,
    narrationNotes: chapter.narrationNotes ?? '',
    status: 'planned',
  };
}

function buildEvidenceWarnings(evidence, visuals) {
  const warnings = [];
  for (const item of evidence) {
    if (!item.sources.length && !['inferred', 'modeled', 'unknown'].includes(item.state)) {
      warnings.push({
        code: 'SOURCELESS_CLAIM',
        severity: 'blocker',
        evidenceId: item.id,
        message: `${item.state} claim has no source records`,
      });
    }
    if (item.sources.some((source) => source.rights === 'unknown')) {
      warnings.push({
        code: 'UNKNOWN_SOURCE_RIGHTS',
        severity: 'review',
        evidenceId: item.id,
        message: 'One or more sources have unknown rights state',
      });
    }
  }
  for (const visual of visuals) {
    if (visual.rights === 'unknown') {
      warnings.push({
        code: 'UNKNOWN_VISUAL_RIGHTS',
        severity: 'review',
        visualId: visual.id,
        message: 'Visual rights state must be resolved before release',
      });
    }
    if (visual.synthetic && visual.evidenceRefs.length) {
      warnings.push({
        code: 'SYNTHETIC_EVIDENCE_BINDING',
        severity: 'blocker',
        visualId: visual.id,
        message: 'Generated/synthetic visuals may illustrate a claim but may not serve as factual proof',
      });
    }
  }
  return warnings;
}

function buildResearchNeeds(evidence) {
  const researchRoute = [
    'systemia/newsroom/claim-reactor.mjs',
    'systemia/worldstate/observation-fabric.mjs',
    'systemia/worldstate/context-reader.mjs',
  ];
  return evidence
    .filter((item) =>
      item.state === 'unknown' ||
      item.state === 'disputed' ||
      item.sources.length === 0 ||
      item.sources.some((source) => source.authority === 'unrated')
    )
    .map((item) => ({
      evidenceId: item.id,
      question: item.claim,
      runtime: 'evercraft_owned',
      route: [...researchRoute],
      desiredOutcome: 'resolve evidence state, provenance, contradiction handling and confidence',
    }));
}

export function compileDocumentaryPlan(input) {
  required(input, 'input');
  required(input.id, 'id');
  required(input.title, 'title');
  required(input.logline, 'logline');

  const executionLanes = documentaryExecutionLanes();
  const ownedRuntimeReceipt = assertOwnedDocumentaryRuntime(executionLanes);

  const evidence = array(input.evidence, 'evidence').map(normalizeEvidence);
  const evidenceIds = uniqueIds(evidence, 'evidence');
  const visuals = array(input.visuals ?? [], 'visuals').map(normalizeVisual);
  const visualIds = uniqueIds(visuals, 'visual');
  const chaptersRaw = array(input.chapters, 'chapters');
  uniqueIds(chaptersRaw, 'chapter');
  const chapters = chaptersRaw.map((chapter) => normalizeChapter(chapter, evidenceIds, visualIds));

  for (const visual of visuals) {
    for (const ref of visual.evidenceRefs) {
      if (!evidenceIds.has(ref)) throw new Error(`visual ${visual.id} references unknown evidence: ${ref}`);
    }
  }

  const warnings = buildEvidenceWarnings(evidence, visuals);
  const blockerCount = warnings.filter((warning) => warning.severity === 'blocker').length;
  const reviewCount = warnings.filter((warning) => warning.severity === 'review').length;
  const targetRuntimeMinutes =
    Number.isFinite(input.targetRuntimeMinutes) && input.targetRuntimeMinutes > 0
      ? input.targetRuntimeMinutes
      : 18;

  return {
    schema: 'evercraft.documentary-desk.plan.v2',
    id: input.id,
    title: input.title,
    logline: input.logline,
    targetRuntimeMinutes,
    editorialThesis: input.editorialThesis ?? null,
    audience: input.audience ?? 'general',
    systemia: {
      admissionRequired: true,
      canonicalRoute: 'Systemia -> Documentary Desk',
      directSpecialistDispatchAllowed: false,
      runtimeAuthority: 'Evercraft-owned Systemia/Yard runtime only',
      externalLegacyRuntimeAllowed: false,
      ownedRuntimeReceipt,
      executionLanes,
    },
    evidence,
    visuals,
    chapters,
    researchNeeds: buildResearchNeeds(evidence),
    productionContract: {
      realMediaFirst: true,
      generatedVisualPolicy:
        'Generated visuals may illustrate only. They must be labeled and may never be used as factual proof.',
      sourceLineageRequired: true,
      transcriptRequired: true,
      sourceRoomRequired: true,
      contradictionPreservationRequired: true,
      uncertaintyLanguageRequired: true,
      evidenceStateVocabulary: [...EVIDENCE_STATES],
    },
    outputs: {
      masterFilm: {
        format: 'mp4',
        aspectRatio: '16:9',
        targetRuntimeMinutes,
        runtime: 'systemia/media-studio/narrative-film-pipeline.ts',
      },
      trailer: {
        targetSeconds: 60,
        runtime: 'systemia/media-studio/narrative-film-pipeline.ts',
      },
      socialCuts: {
        intake: 'systemia/clip/media-intake.mjs',
        publisher: 'systemia/clip/publisher-runtime.mjs',
        youtubeAdapter: 'systemia/clip/youtube-publisher.mjs',
        targetCount: 8,
        preserveSourceProject: true,
      },
      journalCompanion: {
        required: true,
        runtime: 'systemia/newsroom/journal-publisher.mjs',
        includeTranscript: true,
        includeSources: true,
      },
      audioEdition: { required: true },
      sourceRoom: { required: true },
    },
    qa: {
      gates: DEFAULT_QA_GATES.map((gate) => ({ gate, status: 'pending' })),
      releaseState: blockerCount > 0 ? 'blocked' : reviewCount > 0 ? 'review_required' : 'qa_pending',
      blockerCount,
      reviewCount,
      warnings,
    },
  };
}

export function assertDocumentaryReleaseReady(plan) {
  required(plan?.qa, 'plan.qa');
  assertOwnedDocumentaryRuntime(plan?.systemia?.executionLanes ?? []);
  const unresolvedWarnings = (plan.qa.warnings ?? []).filter(
    (warning) => warning.severity === 'blocker' || warning.severity === 'review'
  );
  const unresolvedGates = (plan.qa.gates ?? []).filter((gate) => gate.status !== 'passed');
  if (unresolvedWarnings.length || unresolvedGates.length) {
    throw new Error(
      `documentary is not release-ready: ${unresolvedWarnings.length} unresolved warnings, ${unresolvedGates.length} QA gates not passed`
    );
  }
  return {
    schema: 'evercraft.documentary-desk.release-receipt.v2',
    documentaryId: plan.id,
    status: 'release_ready',
    runtimeAuthority: 'evercraft_owned',
    outputs: Object.keys(plan.outputs ?? {}),
  };
}

export const DOCUMENTARY_QA_GATES = Object.freeze([...DEFAULT_QA_GATES]);
