export type MediaKind = 'image' | 'video' | 'audio';
export type ProjectFormat = 'commercial' | 'social_short' | 'short_film' | 'episode';
export type AspectRatio = '9:16' | '16:9' | '1:1';
export type RightsState = 'owned' | 'licensed' | 'unknown' | 'restricted';

export interface SourceAsset {
  id: string;
  path: string;
  kind: MediaKind;
  durationSec?: number;
  width?: number;
  height?: number;
  rights?: RightsState;
  tags?: string[];
  notes?: string;
  entityRefs?: string[];
}

export interface DialogueLine {
  id?: string;
  speakerId: string;
  text: string;
  emotion?: string;
  delivery?: string;
  language?: string;
}

export interface ContinuityClaim {
  subjectId: string;
  key: string;
  value: string;
}

export interface ProjectBrief {
  prompt: string;
  format?: ProjectFormat;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  audience?: string;
  cta?: string;
  style?: string;
  seriesId?: string;
  episodeId?: string;
  episodeNumber?: number;
  dialogue?: DialogueLine[];
  continuityClaims?: ContinuityClaim[];
}

export interface MediaProject {
  id?: string;
  title?: string;
  brief: ProjectBrief;
  assets: SourceAsset[];
}

export type StoryBeat =
  | 'hook'
  | 'setup'
  | 'proof'
  | 'development'
  | 'turn'
  | 'climax'
  | 'cta'
  | 'resolution';

export interface ScenePlan {
  id: string;
  beat: StoryBeat;
  assetId: string;
  sourcePath: string;
  mediaKind: 'image' | 'video';
  durationSec: number;
  trimStartSec?: number;
  motion: 'hold' | 'push_in' | 'cover';
  transition: 'cut' | 'dissolve';
  intent: string;
  screenText?: string;
}

export interface GenerationRequest {
  id: string;
  reason: 'coverage_gap' | 'continuity_gap' | 'creative_enhancement';
  prompt: string;
  durationSec: number;
  aspectRatio: AspectRatio;
  status: 'requested' | 'resolved' | 'skipped';
  resolvedAssetPath?: string;
  provenance?: string;
}

export interface ProvenanceRecord {
  assetId: string;
  sourcePath: string;
  rights: RightsState;
  usedInScenes: string[];
}

export interface FilmPlan {
  schema: 'evercraft.media.plan.v1';
  projectId: string;
  title: string;
  prompt: string;
  format: ProjectFormat;
  aspectRatio: AspectRatio;
  durationSec: number;
  scenes: ScenePlan[];
  generationRequests: GenerationRequest[];
  provenance: ProvenanceRecord[];
  warnings: string[];
  createdAt: string;
}

export type ContinuityEntityKind =
  | 'character'
  | 'voice'
  | 'location'
  | 'prop'
  | 'brand'
  | 'style';

export interface ContinuityEntity {
  id: string;
  kind: ContinuityEntityKind;
  name: string;
  description?: string;
  immutableTraits?: Record<string, string>;
  voiceProfileId?: string;
  referenceAssetIds?: string[];
}

export interface CanonFact {
  subjectId: string;
  key: string;
  value: string;
  locked?: boolean;
  introducedEpisode?: number;
}

export interface SeriesBible {
  schema: 'evercraft.fallen.series-bible.v1';
  id: string;
  title: string;
  logline?: string;
  styleRules?: string[];
  entities: ContinuityEntity[];
  canon: CanonFact[];
}

export interface ContinuityCheck {
  type: 'entity' | 'canon' | 'voice' | 'asset';
  subjectId: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}

export interface ContinuityReport {
  status: 'pass' | 'warning' | 'fail';
  checks: ContinuityCheck[];
  bibleDigest: string;
  continuityPrompt: string;
}

export interface DialogueCue {
  id: string;
  speakerId: string;
  voiceProfileId: string;
  text: string;
  emotion?: string;
  delivery?: string;
  language?: string;
}

export interface SeriesEpisodePlan {
  schema: 'evercraft.fallen.series-plan.v1';
  seriesId: string;
  episodeId: string;
  episodeNumber?: number;
  title: string;
  filmPlan: FilmPlan;
  dialogue: DialogueCue[];
  continuity: ContinuityReport;
  proposedCanon: CanonFact[];
  canonReceipt: string;
  createdAt: string;
}
