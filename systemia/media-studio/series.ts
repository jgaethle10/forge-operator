import crypto from 'node:crypto';
import { compileFilmPlan } from './director.js';
import type {
  CanonFact,
  ContinuityCheck,
  ContinuityClaim,
  ContinuityEntity,
  ContinuityReport,
  DialogueCue,
  MediaProject,
  ProductionNeed,
  SeriesBible,
  SeriesEpisodePlan,
} from './types.js';

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

function entityMap(bible: SeriesBible) {
  const map = new Map<string, ContinuityEntity>();
  for (const entity of bible.entities) {
    if (map.has(entity.id)) throw new Error(`Duplicate continuity entity id: ${entity.id}`);
    map.set(entity.id, entity);
  }
  return map;
}

function canonKey(subjectId: string, key: string) {
  return `${subjectId}::${key}`;
}

function continuityPromptFor(bible: SeriesBible) {
  const entityLines = bible.entities.map((entity) => {
    const traits = Object.entries(entity.immutableTraits ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(', ');
    const voice = entity.voiceProfileId ? `; voiceProfileId=${entity.voiceProfileId}` : '';
    return `- ${entity.id} [${entity.kind}] ${entity.name}: ${entity.description ?? ''}${traits ? `; LOCKED ${traits}` : ''}${voice}`;
  });

  const canonLines = bible.canon
    .filter((fact) => fact.locked !== false)
    .map((fact) => `- ${fact.subjectId}.${fact.key}=${fact.value}`);

  const styleLines = (bible.styleRules ?? []).map((rule) => `- ${rule}`);

  return [
    'FALLEN CONTINUITY CONTRACT. Preserve these identities and facts exactly unless a human-authorized canon change is supplied.',
    'ENTITIES:',
    ...entityLines,
    'LOCKED CANON:',
    ...canonLines,
    ...(styleLines.length ? ['STYLE RULES:', ...styleLines] : []),
    'Do not silently redesign characters, substitute voices, rename entities, alter locked traits, or contradict locked canon.',
  ].join('\n');
}

export function checkSeriesContinuity(
  project: MediaProject,
  bible: SeriesBible,
): ContinuityReport {
  if (bible.schema !== 'evercraft.fallen.series-bible.v1') {
    throw new Error('Unsupported Fallen series bible schema.');
  }

  if (project.brief.seriesId && project.brief.seriesId !== bible.id) {
    throw new Error(
      `Project seriesId ${project.brief.seriesId} does not match bible ${bible.id}.`,
    );
  }

  const entities = entityMap(bible);
  const checks: ContinuityCheck[] = [];
  const canon = new Map(
    bible.canon.map((fact) => [canonKey(fact.subjectId, fact.key), fact]),
  );

  for (const asset of project.assets) {
    for (const ref of asset.entityRefs ?? []) {
      if (entities.has(ref)) {
        checks.push({
          type: 'asset',
          subjectId: ref,
          status: 'pass',
          message: `Asset ${asset.id} is explicitly bound to ${ref}.`,
        });
      } else {
        checks.push({
          type: 'asset',
          subjectId: ref,
          status: 'fail',
          message: `Asset ${asset.id} references unknown continuity entity ${ref}.`,
        });
      }
    }
  }

  for (const claim of project.brief.continuityClaims ?? []) {
    const entity = entities.get(claim.subjectId);
    if (!entity) {
      checks.push({
        type: 'entity',
        subjectId: claim.subjectId,
        status: 'fail',
        message: `Continuity claim references unknown entity ${claim.subjectId}.`,
      });
      continue;
    }

    const lockedTrait = entity.immutableTraits?.[claim.key];
    if (lockedTrait !== undefined && lockedTrait !== claim.value) {
      checks.push({
        type: 'entity',
        subjectId: claim.subjectId,
        status: 'fail',
        message: `Immutable trait violation: ${claim.subjectId}.${claim.key} is locked to "${lockedTrait}", not "${claim.value}".`,
      });
      continue;
    }

    const prior = canon.get(canonKey(claim.subjectId, claim.key));
    if (prior && prior.locked !== false && prior.value !== claim.value) {
      checks.push({
        type: 'canon',
        subjectId: claim.subjectId,
        status: 'fail',
        message: `Locked canon violation: ${claim.subjectId}.${claim.key} is "${prior.value}", not "${claim.value}".`,
      });
    } else if (prior && prior.value !== claim.value) {
      checks.push({
        type: 'canon',
        subjectId: claim.subjectId,
        status: 'warning',
        message: `Mutable canon changes ${claim.subjectId}.${claim.key} from "${prior.value}" to "${claim.value}".`,
      });
    } else {
      checks.push({
        type: prior ? 'canon' : 'entity',
        subjectId: claim.subjectId,
        status: 'pass',
        message: prior
          ? `Claim matches canon for ${claim.subjectId}.${claim.key}.`
          : `New canon candidate accepted for ${claim.subjectId}.${claim.key}.`,
      });
    }
  }

  for (const line of project.brief.dialogue ?? []) {
    const speaker = entities.get(line.speakerId);
    if (!speaker) {
      checks.push({
        type: 'voice',
        subjectId: line.speakerId,
        status: 'fail',
        message: `Dialogue references unknown speaker ${line.speakerId}.`,
      });
      continue;
    }
    if (speaker.kind !== 'character' && speaker.kind !== 'voice') {
      checks.push({
        type: 'voice',
        subjectId: line.speakerId,
        status: 'fail',
        message: `Dialogue speaker ${line.speakerId} is a ${speaker.kind}, not a character or voice entity.`,
      });
      continue;
    }
    if (!speaker.voiceProfileId) {
      checks.push({
        type: 'voice',
        subjectId: line.speakerId,
        status: 'fail',
        message: `Dialogue speaker ${line.speakerId} has no locked voiceProfileId.`,
      });
      continue;
    }
    checks.push({
      type: 'voice',
      subjectId: line.speakerId,
      status: 'pass',
      message: `Dialogue speaker ${line.speakerId} is locked to voice profile ${speaker.voiceProfileId}.`,
    });
  }

  const hasFail = checks.some((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warning');

  return {
    status: hasFail ? 'fail' : hasWarning ? 'warning' : 'pass',
    checks,
    bibleDigest: digest(bible),
    continuityPrompt: continuityPromptFor(bible),
  };
}

function compileDialogue(project: MediaProject, bible: SeriesBible): DialogueCue[] {
  const entities = entityMap(bible);

  return (project.brief.dialogue ?? []).map((line, index) => {
    const speaker = entities.get(line.speakerId);
    if (!speaker?.voiceProfileId) {
      throw new Error(`Speaker ${line.speakerId} has no locked voice profile.`);
    }

    return {
      id: line.id ?? `dialogue-${index + 1}`,
      speakerId: line.speakerId,
      voiceProfileId: speaker.voiceProfileId,
      text: line.text,
      emotion: line.emotion,
      delivery: line.delivery,
      language: line.language,
    };
  });
}

function proposedCanonFor(
  claims: ContinuityClaim[],
  bible: SeriesBible,
  episodeNumber?: number,
): CanonFact[] {
  const prior = new Map(
    bible.canon.map((fact) => [canonKey(fact.subjectId, fact.key), fact]),
  );

  return claims
    .filter((claim) => {
      const existing = prior.get(canonKey(claim.subjectId, claim.key));
      return !existing || existing.value !== claim.value;
    })
    .map((claim) => ({
      subjectId: claim.subjectId,
      key: claim.key,
      value: claim.value,
      locked: false,
      introducedEpisode: episodeNumber,
    }));
}

function productionNeedsFor(
  filmPlan: SeriesEpisodePlan['filmPlan'],
  dialogue: SeriesEpisodePlan['dialogue'],
  continuityDigest: string,
): ProductionNeed[] {
  const visualNeeds: ProductionNeed[] = filmPlan.generationRequests.map((request) => ({
    id: `need-${request.id}`,
    kind: 'video',
    prompt: request.prompt,
    durationSec: request.durationSec,
    aspectRatio: request.aspectRatio,
    sourceRequestId: request.id,
    continuityDigest,
    requires: [
      'reference_identity',
      'commercial_rights',
      'provenance_receipt',
      'timing_control',
    ],
    status: 'planned',
  }));

  const speechNeeds: ProductionNeed[] = dialogue.map((cue) => ({
    id: `need-${cue.id}`,
    kind: 'speech',
    prompt: cue.text,
    speakerId: cue.speakerId,
    voiceProfileId: cue.voiceProfileId,
    language: cue.language,
    continuityDigest,
    requires: [
      'voice_profile',
      'commercial_rights',
      'provenance_receipt',
      'timing_control',
    ],
    status: 'planned',
  }));

  return [...visualNeeds, ...speechNeeds];
}

export function compileSeriesEpisode(
  project: MediaProject,
  bible: SeriesBible,
): SeriesEpisodePlan {
  const continuity = checkSeriesContinuity(project, bible);
  const failures = continuity.checks.filter((check) => check.status === 'fail');

  if (failures.length) {
    throw new Error(
      `Fallen continuity gate rejected episode: ${failures
        .map((failure) => failure.message)
        .join(' | ')}`,
    );
  }

  const episodeId =
    project.brief.episodeId ??
    project.id ??
    `episode-${project.brief.episodeNumber ?? crypto.randomUUID().slice(0, 8)}`;

  const normalizedProject: MediaProject = {
    ...project,
    id: project.id ?? episodeId,
    brief: {
      ...project.brief,
      format: 'episode',
      seriesId: bible.id,
      episodeId,
    },
  };

  const filmPlan = compileFilmPlan(normalizedProject);
  filmPlan.generationRequests = filmPlan.generationRequests.map((request) => ({
    ...request,
    prompt: `${request.prompt}\n\n${continuity.continuityPrompt}`,
  }));

  const dialogue = compileDialogue(normalizedProject, bible);
  const proposedCanon = proposedCanonFor(
    normalizedProject.brief.continuityClaims ?? [],
    bible,
    normalizedProject.brief.episodeNumber,
  );

  const productionNeeds = productionNeedsFor(
    filmPlan,
    dialogue,
    continuity.bibleDigest,
  );

  const canonReceipt = digest({
    bibleDigest: continuity.bibleDigest,
    seriesId: bible.id,
    episodeId,
    episodeNumber: normalizedProject.brief.episodeNumber,
    claims: normalizedProject.brief.continuityClaims ?? [],
    proposedCanon,
    dialogue: dialogue.map((cue) => ({
      speakerId: cue.speakerId,
      voiceProfileId: cue.voiceProfileId,
      text: cue.text,
    })),
  });

  return {
    schema: 'evercraft.fallen.series-plan.v1',
    seriesId: bible.id,
    episodeId,
    episodeNumber: normalizedProject.brief.episodeNumber,
    title: project.title ?? `${bible.title}: ${episodeId}`,
    filmPlan,
    dialogue,
    continuity,
    proposedCanon,
    productionNeeds,
    canonReceipt,
    createdAt: new Date().toISOString(),
  };
}
