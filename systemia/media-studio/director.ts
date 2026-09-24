import crypto from 'node:crypto';
import type {
  AspectRatio,
  FilmPlan,
  GenerationRequest,
  MediaProject,
  ProjectFormat,
  ScenePlan,
  SourceAsset,
  StoryBeat,
} from './types.js';

const FORMAT_BEATS: Record<ProjectFormat, StoryBeat[]> = {
  commercial: ['hook', 'setup', 'proof', 'development', 'cta'],
  social_short: ['hook', 'proof', 'turn', 'cta'],
  short_film: ['hook', 'setup', 'development', 'turn', 'climax', 'resolution'],
};

const BEAT_INTENT: Record<StoryBeat, string> = {
  hook: 'Earn attention immediately with the strongest visual.',
  setup: 'Establish the person, place, product, problem, or world.',
  proof: 'Show concrete evidence, detail, transformation, or credibility.',
  development: 'Advance the idea with a new angle instead of repeating the hook.',
  turn: 'Introduce contrast, surprise, consequence, or a change in direction.',
  climax: 'Deliver the strongest emotional or visual payoff.',
  cta: 'Make the requested next action unmistakable without overstaying it.',
  resolution: 'Land the story with a final image that feels intentional.',
};

const BEAT_WEIGHTS: Partial<Record<StoryBeat, number>> = {
  hook: 0.16,
  setup: 0.18,
  proof: 0.21,
  development: 0.2,
  turn: 0.17,
  climax: 0.2,
  cta: 0.16,
  resolution: 0.17,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function defaultDuration(format: ProjectFormat) {
  if (format === 'social_short') return 20;
  if (format === 'short_film') return 90;
  return 30;
}

function safeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type VisualAsset = SourceAsset & { kind: 'image' | 'video' };

function chooseVisuals(assets: SourceAsset[]): VisualAsset[] {
  return assets.filter(
    (asset): asset is VisualAsset => asset.kind === 'image' || asset.kind === 'video',
  );
}

function allocateDurations(beats: StoryBeat[], target: number) {
  const raw = beats.map((beat) => BEAT_WEIGHTS[beat] ?? 0.18);
  const sum = raw.reduce((a, b) => a + b, 0);
  const normalized = raw.map((w) => (w / sum) * target);
  const rounded = normalized.map((n) => Math.max(1.5, Math.round(n * 10) / 10));
  const drift = Math.round((target - rounded.reduce((a, b) => a + b, 0)) * 10) / 10;
  rounded[rounded.length - 1] = Math.max(
    1.5,
    Math.round((rounded[rounded.length - 1] + drift) * 10) / 10,
  );
  return rounded;
}

function scoreAssetForBeat(asset: SourceAsset, beat: StoryBeat, prompt: string) {
  const haystack = [...(asset.tags ?? []), asset.notes ?? '', prompt].join(' ').toLowerCase();
  let score = asset.kind === 'video' ? 2 : 1;

  if (beat === 'hook' || beat === 'climax') score += asset.kind === 'video' ? 2 : 0;
  if (beat === 'proof' && /(detail|result|before|after|proof|demo|work|product)/.test(haystack)) score += 2;
  if (beat === 'setup' && /(wide|exterior|room|location|team|establish)/.test(haystack)) score += 2;
  if ((beat === 'cta' || beat === 'resolution') && /(logo|brand|sign|product|portrait|hero)/.test(haystack)) score += 2;

  return score;
}

function pickAsset(
  visuals: VisualAsset[],
  beat: StoryBeat,
  prompt: string,
  usedCount: Map<string, number>,
) {
  return [...visuals]
    .sort((a, b) => {
      const scoreA = scoreAssetForBeat(a, beat, prompt) - (usedCount.get(a.id) ?? 0) * 2.5;
      const scoreB = scoreAssetForBeat(b, beat, prompt) - (usedCount.get(b.id) ?? 0) * 2.5;
      return scoreB - scoreA;
    })[0];
}

function generationRequestsFor(project: MediaProject, aspectRatio: AspectRatio): GenerationRequest[] {
  const requests: GenerationRequest[] = [];
  const visuals = chooseVisuals(project.assets);
  const format = project.brief.format ?? 'commercial';

  if (visuals.length < 3) {
    requests.push({
      id: safeId('gen'),
      reason: 'coverage_gap',
      prompt: `Create one or more original establishing/detail shots that support this brief without inventing factual claims: ${project.brief.prompt}`,
      durationSec: format === 'short_film' ? 6 : 3,
      aspectRatio,
      status: 'requested',
    });
  }

  if (project.brief.style) {
    requests.push({
      id: safeId('gen'),
      reason: 'creative_enhancement',
      prompt: `Optional visual bridge in this style: ${project.brief.style}. It must preserve continuity with the supplied media and remain labeled synthetic.`,
      durationSec: 2.5,
      aspectRatio,
      status: 'requested',
    });
  }

  return requests;
}

export function compileFilmPlan(project: MediaProject): FilmPlan {
  const format = project.brief.format ?? 'commercial';
  const aspectRatio = project.brief.aspectRatio ?? (format === 'social_short' ? '9:16' : '16:9');
  const durationSec = clamp(project.brief.durationSec ?? defaultDuration(format), 6, 300);
  const visuals = chooseVisuals(project.assets);

  if (!project.brief.prompt?.trim()) throw new Error('brief.prompt is required.');
  if (!visuals.length) throw new Error('At least one image or video asset is required.');

  const restricted = project.assets.filter((asset) => asset.rights === 'restricted');
  if (restricted.length) {
    throw new Error(
      `Restricted assets cannot be rendered: ${restricted.map((asset) => asset.id).join(', ')}`,
    );
  }

  const beats = FORMAT_BEATS[format];
  const durations = allocateDurations(beats, durationSec);
  const usedCount = new Map<string, number>();
  const scenes: ScenePlan[] = [];

  beats.forEach((beat, index) => {
    const asset = pickAsset(visuals, beat, project.brief.prompt, usedCount);
    const timesUsed = usedCount.get(asset.id) ?? 0;
    usedCount.set(asset.id, timesUsed + 1);

    const requestedDuration = durations[index];
    const duration =
      asset.kind === 'video' && asset.durationSec
        ? Math.max(1.5, Math.min(requestedDuration, asset.durationSec))
        : requestedDuration;

    const availableTrim =
      asset.kind === 'video'
        ? Math.max(0, (asset.durationSec ?? duration) - duration)
        : 0;

    scenes.push({
      id: `scene-${index + 1}`,
      beat,
      assetId: asset.id,
      sourcePath: asset.path,
      mediaKind: asset.kind,
      durationSec: Math.round(duration * 10) / 10,
      trimStartSec:
        asset.kind === 'video'
          ? Math.round(Math.min(timesUsed * duration, availableTrim) * 10) / 10
          : undefined,
      motion: asset.kind === 'image' ? 'push_in' : 'cover',
      transition: index === 0 ? 'cut' : 'dissolve',
      intent: BEAT_INTENT[beat],
      screenText: beat === 'cta' ? project.brief.cta : undefined,
    });
  });

  const provenance = project.assets
    .filter((asset) => scenes.some((scene) => scene.assetId === asset.id))
    .map((asset) => ({
      assetId: asset.id,
      sourcePath: asset.path,
      rights: asset.rights ?? 'unknown',
      usedInScenes: scenes
        .filter((scene) => scene.assetId === asset.id)
        .map((scene) => scene.id),
    }));

  const warnings: string[] = [];
  const unknownRights = provenance.filter((item) => item.rights === 'unknown');
  if (unknownRights.length) {
    warnings.push(
      `Rights are unverified for: ${unknownRights.map((item) => item.assetId).join(', ')}.`,
    );
  }

  if (new Set(scenes.map((scene) => scene.assetId)).size < scenes.length) {
    warnings.push(
      'Some source assets are reused because the available visual pool is smaller than the story beat count.',
    );
  }

  return {
    schema: 'evercraft.media.plan.v1',
    projectId: project.id ?? safeId('project'),
    title: project.title ?? 'Untitled Evercraft Media Project',
    prompt: project.brief.prompt.trim(),
    format,
    aspectRatio,
    durationSec:
      Math.round(scenes.reduce((sum, scene) => sum + scene.durationSec, 0) * 10) / 10,
    scenes,
    generationRequests: generationRequestsFor(project, aspectRatio),
    provenance,
    warnings,
    createdAt: new Date().toISOString(),
  };
}
