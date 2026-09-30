import { buildVisualStageHtml } from './visual-stage-html.js';
import {
  stageDigest,
  type EvidenceState,
  type PhenomenonLayer,
  type VisualStage,
} from './visual-stage.js';
import { EVERCRAFT_VISUAL_THEME_V1 } from './visual-theme.js';

export type PhenomenonEvidenceState = EvidenceState;

export interface PhenomenonGeoPoint {
  lat: number;
  lon: number;
}

export interface PhenomenonSample extends PhenomenonGeoPoint {
  colorValue?: number;
  magnitude?: number;
}

export interface PhenomenonStream {
  id: string;
  points: PhenomenonSample[];
  particles?: number;
  speed?: number;
  sourceRefs?: string[];
}

export interface PhenomenonOutline {
  id: string;
  points: PhenomenonGeoPoint[];
}

export interface PhenomenonLabel extends PhenomenonGeoPoint {
  label: string;
}

export interface PhenomenonInput {
  schema?: 'evercraft.fallen.phenomenon.v1';
  id: string;
  title: string;
  subtitle?: string;
  callout?: string;
  durationSec?: number;
  aspectRatio?: '16:9' | '9:16';
  time?: {
    startIso: string;
    endIso: string;
    label?: string;
  };
  geography: {
    bounds: {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    outlines?: PhenomenonOutline[];
    labels?: PhenomenonLabel[];
  };
  encoding: {
    motionLabel: string;
    color?: {
      label: string;
      min: number;
      max: number;
      unit?: string;
      palette?: string[];
    };
    brightness?: {
      label: string;
      min: number;
      max: number;
      unit?: string;
    };
  };
  field: {
    kind: 'flow';
    evidenceState: PhenomenonEvidenceState;
    sourceRefs: string[];
    streamlines: PhenomenonStream[];
    particleDensity?: number;
    trailFraction?: number;
  };
  source: {
    label: string;
    refs: string[];
  };
}

export interface PhenomenonReceipt {
  schema: 'evercraft.fallen.phenomenon-receipt.v1';
  phenomenon_id: string;
  stage_id: string;
  status: 'accepted';
  stage_digest: string;
  evidence_state: PhenomenonEvidenceState;
  source_refs: string[];
  stream_count: number;
  sample_count: number;
  exact_frame_control: true;
  distributed_render_compatible: true;
  publication_authority: false;
}

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values: string[] | undefined) {
  return [...new Set((values ?? []).map(clean).filter(Boolean))];
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value);
}

const COLOR_RX = /^#[0-9a-fA-F]{3,8}$/;
const MAX_STREAMS = 1000;
const MAX_SAMPLES = 5000;

function validLat(value: unknown) {
  return finite(value) && Number(value) >= -90 && Number(value) <= 90;
}

function validLon(value: unknown) {
  return finite(value) && Number(value) >= -180 && Number(value) <= 180;
}

function safeId(value: string) {
  return clean(value).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 128);
}

export function validatePhenomenon(input: PhenomenonInput) {
  const errors: string[] = [];
  if (!clean(input?.id)) errors.push('id_missing');
  if (!clean(input?.title)) errors.push('title_missing');
  if (input?.field?.kind !== 'flow') errors.push('field_kind_unsupported');

  const bounds = input?.geography?.bounds;
  if (!bounds || ![bounds.north, bounds.south, bounds.east, bounds.west].every(finite)) {
    errors.push('bounds_invalid');
  } else {
    if (bounds.north <= bounds.south) errors.push('bounds_latitude_order_invalid');
    if (bounds.east === bounds.west) errors.push('bounds_longitude_span_invalid');
    if (!validLat(bounds.north) || !validLat(bounds.south) || !validLon(bounds.east) || !validLon(bounds.west)) {
      errors.push('bounds_coordinate_range_invalid');
    }
  }

  const sourceRefs = unique(input?.source?.refs);
  const fieldRefs = unique(input?.field?.sourceRefs);
  if (!clean(input?.source?.label)) errors.push('source_label_missing');
  if (!sourceRefs.length) errors.push('source_refs_missing');
  if (!fieldRefs.length) errors.push('field_source_refs_missing');

  const approvedRefs = new Set(sourceRefs);
  for (const ref of fieldRefs) {
    if (!approvedRefs.has(ref)) errors.push(`field_source_ref_outside_source:${ref}`);
  }

  const streams = input?.field?.streamlines ?? [];
  if (!streams.length) errors.push('streamlines_missing');
  if (streams.length > MAX_STREAMS) errors.push('streamline_count_exceeded');

  let sampleCount = 0;
  for (const stream of streams) {
    if (!clean(stream.id)) errors.push('stream_id_missing');
    if (!Array.isArray(stream.points) || stream.points.length < 2) {
      errors.push(`stream_points_insufficient:${stream.id || 'unknown'}`);
      continue;
    }
    sampleCount += stream.points.length;
    if (sampleCount > MAX_SAMPLES) {
      errors.push('stream_sample_count_exceeded');
      break;
    }
    for (const point of stream.points) {
      if (!validLat(point.lat) || !validLon(point.lon)) {
        errors.push(`stream_coordinate_invalid:${stream.id || 'unknown'}`);
        break;
      }
      if (input.encoding?.color && !finite(point.colorValue)) {
        errors.push(`stream_color_value_missing:${stream.id || 'unknown'}`);
        break;
      }
      if (input.encoding?.brightness && !finite(point.magnitude)) {
        errors.push(`stream_magnitude_missing:${stream.id || 'unknown'}`);
        break;
      }
    }
    for (const ref of unique(stream.sourceRefs)) {
      if (!approvedRefs.has(ref)) errors.push(`stream_source_ref_outside_source:${ref}`);
    }
  }

  if (!clean(input?.encoding?.motionLabel)) errors.push('motion_label_missing');

  const color = input?.encoding?.color;
  if (color) {
    if (!finite(color.min) || !finite(color.max) || color.max <= color.min) {
      errors.push('color_range_invalid');
    }
    if (color.palette && color.palette.length < 2) errors.push('color_palette_too_short');
    if (color.palette && (color.palette.length > 16 || color.palette.some((value) => !COLOR_RX.test(clean(value))))) {
      errors.push('color_palette_invalid');
    }
  }

  const brightness = input?.encoding?.brightness;
  if (brightness && (!finite(brightness.min) || !finite(brightness.max) || brightness.max <= brightness.min)) {
    errors.push('brightness_range_invalid');
  }

  if (input?.time) {
    const start = Date.parse(input.time.startIso);
    const end = Date.parse(input.time.endIso);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) errors.push('time_range_invalid');
  }

  return {
    schema: 'evercraft.fallen.phenomenon-validation.v1' as const,
    status: errors.length ? ('rejected' as const) : ('accepted' as const),
    errors,
  };
}

export function compilePhenomenonStage(input: PhenomenonInput): VisualStage {
  const validation = validatePhenomenon(input);
  if (validation.status !== 'accepted') {
    throw new Error(`Phenomenon rejected: ${validation.errors.join(', ')}`);
  }

  const aspect = input.aspectRatio ?? '9:16';
  const vertical = aspect === '9:16';
  const width = vertical ? 1080 : 1920;
  const height = vertical ? 1920 : 1080;
  const durationSec = Math.max(4, Math.min(120, input.durationSec ?? 18));
  const sourceRefs = unique(input.source.refs);

  const phenomenonLayer: PhenomenonLayer = {
    id: 'phenomenon-field',
    kind: 'phenomenon',
    z: 1,
    x: 0,
    y: 0,
    width,
    height,
    title: clean(input.title),
    subtitle: clean(input.subtitle),
    callout: clean(input.callout),
    bounds: input.geography.bounds,
    outlines: input.geography.outlines ?? [],
    labels: input.geography.labels ?? [],
    motionLabel: clean(input.encoding.motionLabel),
    colorEncoding: input.encoding.color,
    brightnessEncoding: input.encoding.brightness,
    streamlines: input.field.streamlines.map((stream) => ({
      id: clean(stream.id),
      points: stream.points,
      particles: stream.particles,
      speed: stream.speed,
      sourceRefs: unique(stream.sourceRefs?.length ? stream.sourceRefs : sourceRefs),
    })),
    particleDensity: Math.max(0.25, Math.min(4, input.field.particleDensity ?? 1)),
    trailFraction: Math.max(0.01, Math.min(0.2, input.field.trailFraction ?? 0.055)),
    sourceLabel: clean(input.source.label),
    time: input.time,
    evidenceState: input.field.evidenceState,
    sourceRefs,
  };

  return {
    schema: 'evercraft.fallen.visual-stage.v1',
    id: safeId(input.id),
    width,
    height,
    fps: 30,
    durationSec,
    background: '#030609',
    theme: EVERCRAFT_VISUAL_THEME_V1,
    camera: {
      keyframes: [
        { t: 0, x: 0, y: 0, zoom: 1 },
        { t: durationSec, x: 0, y: 0, zoom: 1 },
      ],
    },
    layers: [phenomenonLayer],
    createdAt: new Date().toISOString(),
  };
}

export function compilePhenomenonCanvas(input: PhenomenonInput): {
  stage: VisualStage;
  html: string;
  receipt: PhenomenonReceipt;
} {
  const stage = compilePhenomenonStage(input);
  const sourceRefs = unique(input.source.refs);
  const sampleCount = input.field.streamlines.reduce((sum, stream) => sum + stream.points.length, 0);
  const receipt: PhenomenonReceipt = {
    schema: 'evercraft.fallen.phenomenon-receipt.v1',
    phenomenon_id: input.id,
    stage_id: stage.id,
    status: 'accepted',
    stage_digest: stageDigest(stage),
    evidence_state: input.field.evidenceState,
    source_refs: sourceRefs,
    stream_count: input.field.streamlines.length,
    sample_count: sampleCount,
    exact_frame_control: true,
    distributed_render_compatible: true,
    publication_authority: false,
  };

  return {
    stage,
    html: buildVisualStageHtml(stage),
    receipt,
  };
}
