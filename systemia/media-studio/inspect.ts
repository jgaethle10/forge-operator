import { spawnSync } from 'node:child_process';
import type { MediaProject, SourceAsset } from './types.js';

type ProbeResult = {
  streams?: Array<{
    codec_type?: string;
    width?: number;
    height?: number;
    duration?: string;
  }>;
  format?: { duration?: string };
};

function runProbe(filePath: string): ProbeResult {
  const result = spawnSync(
    'ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { encoding: 'utf8' },
  );

  if (result.error) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ffprobe failed for ${filePath}: ${result.stderr || 'unknown error'}`);
  }

  return JSON.parse(result.stdout) as ProbeResult;
}

export function inspectAsset(asset: SourceAsset): SourceAsset {
  if (asset.kind === 'image' && asset.width && asset.height) return asset;
  if ((asset.kind === 'video' || asset.kind === 'audio') && asset.durationSec) return asset;

  const probe = runProbe(asset.path);
  const visual = probe.streams?.find((stream) => stream.codec_type === 'video');
  const duration = Number(visual?.duration ?? probe.format?.duration ?? 0) || undefined;

  return {
    ...asset,
    durationSec: asset.durationSec ?? duration,
    width: asset.width ?? visual?.width,
    height: asset.height ?? visual?.height,
  };
}

export function inspectProject(project: MediaProject): MediaProject {
  return {
    ...project,
    assets: project.assets.map(inspectAsset),
  };
}
