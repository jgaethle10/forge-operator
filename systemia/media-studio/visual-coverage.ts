import type {
  AspectRatio,
  GenerationRequest,
  MediaProject,
  SourceAsset,
  VisualCoverageRequirement,
  VisualSubject,
} from './types.js';

interface SubjectRule {
  id: string;
  label: string;
  aliases: RegExp;
  promptAliases: RegExp;
  treatment: VisualCoverageRequirement['preferredTreatment'];
}

const SUBJECT_RULES: SubjectRule[] = [
  {
    id: 'naval-vessel',
    label: 'naval vessel',
    aliases: /\b(ship|ships|warship|warships|battleship|battleships|destroyer|destroyers|carrier|carriers|frigate|frigates|navy|naval|fleet)\b/i,
    promptAliases: /\b(ship|ships|warship|warships|battleship|battleships|destroyer|destroyers|aircraft carrier|aircraft carriers|frigate|frigates|navy|naval|fleet)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'armored-vehicle',
    label: 'tank or armored vehicle',
    aliases: /\b(tank|tanks|armou?red vehicle|armou?red vehicles|apc|ifv|armor|armour)\b/i,
    promptAliases: /\b(tank|tanks|armou?red vehicle|armou?red vehicles|apc|ifv|armor|armour)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'aircraft',
    label: 'aircraft',
    aliases: /\b(aircraft|airplane|airplanes|plane|planes|fighter jet|fighter jets|bomber|bombers|helicopter|helicopters|aviation)\b/i,
    promptAliases: /\b(aircraft|airplane|airplanes|plane|planes|fighter jet|fighter jets|bomber|bombers|helicopter|helicopters|aviation)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'wildfire',
    label: 'wildfire',
    aliases: /\b(wildfire|wildfires|forest fire|forest fires|fire perimeter|smoke plume|smoke)\b/i,
    promptAliases: /\b(wildfire|wildfires|forest fire|forest fires|fire perimeter|smoke plume|smoke)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'hurricane',
    label: 'hurricane or tropical cyclone',
    aliases: /\b(hurricane|hurricanes|tropical cyclone|tropical cyclones|typhoon|typhoons|storm track)\b/i,
    promptAliases: /\b(hurricane|hurricanes|tropical cyclone|tropical cyclones|typhoon|typhoons|storm track)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'flood',
    label: 'flooding',
    aliases: /\b(flood|flooding|floodwater|inundation|river crest|storm surge)\b/i,
    promptAliases: /\b(flood|flooding|floodwater|inundation|river crest|storm surge)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'earthquake',
    label: 'earthquake',
    aliases: /\b(earthquake|earthquakes|seismic|fault rupture|ground shaking)\b/i,
    promptAliases: /\b(earthquake|earthquakes|seismic|fault rupture|ground shaking)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'volcano',
    label: 'volcano',
    aliases: /\b(volcano|volcanoes|volcanic|eruption|eruptions|lava|ash plume)\b/i,
    promptAliases: /\b(volcano|volcanoes|volcanic|eruption|eruptions|lava|ash plume)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'ev-charging',
    label: 'EV charging infrastructure',
    aliases: /\b(ev charger|ev chargers|charging station|charging stations|charger|chargers|dc fast charger|dcfc)\b/i,
    promptAliases: /\b(ev charger|ev chargers|charging station|charging stations|charger|chargers|dc fast charger|dcfc|ev charging)\b/i,
    treatment: 'product_or_data_visualization',
  },
  {
    id: 'shipping',
    label: 'commercial shipping',
    aliases: /\b(cargo ship|cargo ships|container ship|container ships|freighter|freighters|shipping|port|ports|vessel|vessels)\b/i,
    promptAliases: /\b(cargo ship|cargo ships|container ship|container ships|freighter|freighters|shipping|port|ports|vessel|vessels)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
  {
    id: 'satellite',
    label: 'satellite or orbital asset',
    aliases: /\b(satellite|satellites|spacecraft|orbit|orbital)\b/i,
    promptAliases: /\b(satellite|satellites|spacecraft|orbit|orbital)\b/i,
    treatment: 'documentary_or_verified_visualization',
  },
];

function assetText(asset: SourceAsset) {
  return [
    asset.id,
    asset.path,
    ...(asset.tags ?? []),
    asset.notes ?? '',
    ...(asset.entityRefs ?? []),
  ].join(' ');
}

function matchingAssetIds(assets: SourceAsset[], rule: SubjectRule) {
  return assets
    .filter((asset) => asset.kind === 'image' || asset.kind === 'video')
    .filter((asset) => rule.aliases.test(assetText(asset)))
    .map((asset) => asset.id);
}

export function detectVisualSubjects(prompt: string): VisualSubject[] {
  return SUBJECT_RULES
    .filter((rule) => rule.promptAliases.test(prompt))
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      preferredTreatment: rule.treatment,
    }));
}

export function compileVisualCoverage(project: MediaProject): VisualCoverageRequirement[] {
  return detectVisualSubjects(project.brief.prompt).map((subject, index) => {
    const rule = SUBJECT_RULES.find((candidate) => candidate.id === subject.id)!;
    const matchedAssetIds = matchingAssetIds(project.assets, rule);
    return {
      id: `coverage-${index + 1}-${subject.id}`,
      subjectId: subject.id,
      subjectLabel: subject.label,
      preferredTreatment: subject.preferredTreatment,
      minScreenTimeSec: project.brief.format === 'social_short' ? 1.5 : 2.5,
      matchedAssetIds,
      status: matchedAssetIds.length ? 'covered' : 'missing',
    };
  });
}

export function semanticCoverageGenerationRequests(
  project: MediaProject,
  aspectRatio: AspectRatio,
  coverage: VisualCoverageRequirement[],
): GenerationRequest[] {
  return coverage
    .filter((item) => item.status === 'missing')
    .map((item, index) => ({
      id: `gen-semantic-${index + 1}-${item.subjectId}`,
      reason: 'semantic_coverage_gap',
      prompt: [
        `MUST-SHOW visual coverage: ${item.subjectLabel}.`,
        `The subject must be visibly recognizable on screen for at least ${item.minScreenTimeSec.toFixed(1)} seconds; do not substitute generic typography, abstract backgrounds, or unrelated imagery.`,
        item.preferredTreatment === 'product_or_data_visualization'
          ? 'Prefer real product capture or a clearly labeled data visualization when source material exists.'
          : 'Prefer licensed/public-domain documentary footage or source-grounded imagery when available; if synthetic coverage is used, label it as visualization and never present it as event evidence.',
        `Story brief: ${project.brief.prompt}`,
      ].join(' '),
      durationSec: Math.max(item.minScreenTimeSec, project.brief.format === 'social_short' ? 2 : 3),
      aspectRatio,
      status: 'requested',
      coverageRequirementId: item.id,
      subjectId: item.subjectId,
    }));
}

export function subjectRelevanceScore(asset: SourceAsset, prompt: string) {
  const text = assetText(asset);
  return SUBJECT_RULES.reduce((score, rule) => {
    if (!rule.promptAliases.test(prompt)) return score;
    return score + (rule.aliases.test(text) ? 6 : 0);
  }, 0);
}
