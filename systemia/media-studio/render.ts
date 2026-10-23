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

function cropAnchors(scene: ScenePlan) {
  const x = scene.cropAnchorX ?? 0.5;
  const y = scene.cropAnchorY ?? 0.5;
  if (!Number.isFinite(x) || x < 0 || x > 1) {
    throw new Error('render_crop_anchor_x_invalid:' + scene.id);
  }
  if (!Number.isFinite(y) || y < 0 || y > 1) {
    throw new Error('render_crop_anchor_y_invalid:' + scene.id);
  }
  return {x, y};
}

function directorCrop(width: number, height: number, x: number, y: number) {
  return `crop=${width}:${height}:(iw-${width})*${x}:(ih-${height})*${y}`;
}

export function filterFor(scene: ScenePlan, width: number, height: number) {
  const {x, y} = cropAnchors(scene);
  const fitMode = scene.fitMode ?? 'cover';
  if (fitMode !== 'cover' && fitMode !== 'contain') {
    throw new Error('render_fit_mode_invalid:' + scene.id);
  }
  // A contained asset must retain every edge of its source. Unlike cover,
  // contain deliberately does not perform push-in zooms which could trim UI text.
  if (fitMode === 'contain') {
    return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=30,format=yuv420p`;
  }
  const cover =
    `scale=${width}:${height}:force_original_aspect_ratio=increase,${directorCrop(width,height,x,y)},setsar=1,fps=30,format=yuv420p`;

  if (scene.mediaKind === 'image' && scene.motion === 'push_in') {
    const frames = Math.max(2, Math.round(scene.durationSec * 30));
    // Normalize the source crop to the output canvas BEFORE zoompan. Without
    // this, zoompan can remap a square/landscape still to portrait dimensions,
    // distorting faces and character anatomy even in a correctly sized MP4.
    const workingWidth = width * 2;
    const workingHeight = height * 2;
    return `scale=${workingWidth}:${workingHeight}:force_original_aspect_ratio=increase,${directorCrop(workingWidth,workingHeight,x,y)},setsar=1,zoompan=z='min(zoom+0.0008,1.08)':d=${frames}:s=${width}x${height}:fps=30,format=yuv420p`;
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
