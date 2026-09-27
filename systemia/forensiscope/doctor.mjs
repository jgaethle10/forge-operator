import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { probeTranscriptionEngine } from './transcription-engine.mjs';

function executableStatus(name) {
  const result = spawnSync(name, ['-version'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024
  });
  return {
    name,
    ready: result.status === 0,
    reason: result.status === 0
      ? null
      : (result.error?.message || String(result.stderr || '').trim().slice(-500) || 'not available')
  };
}

export function buildForensiScopeDoctorReport({ env = process.env } = {}) {
  const ffmpeg = executableStatus('ffmpeg');
  const ffprobe = executableStatus('ffprobe');
  const transcription = probeTranscriptionEngine({ env });

  const engineReady =
    transcription.state === 'configured' &&
    transcription.probe_state !== 'unavailable';

  const blockers = [];
  if (!ffmpeg.ready) blockers.push('ffmpeg unavailable');
  if (!ffprobe.ready) blockers.push('ffprobe unavailable');
  if (!engineReady) {
    blockers.push(
      transcription.probe_reason ||
      transcription.reason ||
      `transcription engine state: ${transcription.state}`
    );
  }

  return {
    schema: 'evercraft.forensiscope.doctor.v1',
    status: blockers.length ? 'BLOCKED' : 'READY',
    media: { ffmpeg, ffprobe },
    transcription: {
      state: transcription.state,
      engine_id: transcription.engine_id || null,
      probe_state: transcription.probe_state || null,
      reason: transcription.probe_reason || transcription.reason || null
    },
    blockers
  };
}

function main() {
  const strict = process.argv.slice(2).includes('--strict');
  const report = buildForensiScopeDoctorReport();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (strict && report.status !== 'READY') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main();
}
