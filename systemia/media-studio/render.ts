import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AspectRatio, FilmPlan, ScenePlan } from './types.js';

const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
};

function filterFor(scene: ScenePlan, width: number, height: number) {
  const cover =
    `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,format=yuv420p`;

  if (scene.mediaKind === 'image' && scene.motion === 'push_in') {
    const frames = Math.max(2, Math.round(scene.durationSec * 30));
    return `scale=4000:-2,zoompan=z='min(zoom+0.0008,1.08)':d=${frames}:s=${width}x${height}:fps=30,format=yuv420p`;
  }

  return cover;
}

function runFfmpeg(args: string[]) {
  const result = spawnSync('ffmpeg', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw new Error(`ffmpeg failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${result.stderr || 'unknown error'}`);
  }
}

function renderScene(scene: ScenePlan, outPath: string, width: number, height: number) {
  const args = ['-y'];

  if (scene.mediaKind === 'image') {
    args.push('-loop', '1', '-i', scene.sourcePath, '-t', String(scene.durationSec));
  } else {
    if (scene.trimStartSec && scene.trimStartSec > 0) {
      args.push('-ss', String(scene.trimStartSec));
    }
    args.push('-i', scene.sourcePath, '-t', String(scene.durationSec));
  }

  args.push(
    '-vf',
    filterFor(scene, width, height),
    '-an',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '20',
    '-movflags',
    '+faststart',
    outPath,
  );

  runFfmpeg(args);
}

export function renderFilm(plan: FilmPlan, outputPath: string) {
  const { width, height } = DIMENSIONS[plan.aspectRatio];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-media-'));
  const clips: string[] = [];

  try {
    plan.scenes.forEach((scene, index) => {
      const clip = path.join(
        tempDir,
        `clip-${String(index + 1).padStart(3, '0')}.mp4`,
      );
      renderScene(scene, clip, width, height);
      clips.push(clip);
    });

    const concatPath = path.join(tempDir, 'concat.txt');
    fs.writeFileSync(
      concatPath,
      clips.map((clip) => `file '${clip}'`).join('\n'),
      'utf8',
    );

    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });

    runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatPath,
      '-c',
      'copy',
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    return path.resolve(outputPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
