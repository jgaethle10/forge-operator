export type MediaKind = 'image' | 'video' | 'audio';
export type ProjectFormat = 'commercial' | 'social_short' | 'short_film';
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
}

export interface ProjectBrief {
  prompt: string;
  format?: ProjectFormat;
  durationSec?: number;
  aspectRatio?: AspectRatio;
  audience?: string;
  cta?: string;
  style?: string;
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
