import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_POLICY = Object.freeze({
  minIntegratedLufs: -19,
  maxIntegratedLufs: -12,
  maxTruePeakDbtp: -1,
  minChannels: 1,
  maxChannels: 2,
});

function run(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw new Error('commercial_audio_' + binary + '_unavailable:' + result.error.message);
  if (result.status !== 0) throw new Error('commercial_audio_' + binary + '_failed:' + String(result.stderr).slice(-1000));
  return result;
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function measuredNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function measureLoudness(file) {
  const stderr = run('ffmpeg', [
    '-hide_banner', '-nostats', '-v', 'info', '-i', file,
    '-map', '0:a:0', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', '-',
  ]).stderr;
  const block = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!block) throw new Error('commercial_audio_loudness_measurement_missing');
  const data = JSON.parse(block[0]);
  return {
    integratedLufs: measuredNumber(data.input_i),
    truePeakDbtp: measuredNumber(data.input_tp),
    loudnessRangeLu: measuredNumber(data.input_lra),
  };
}

/** Independent post-export measurement, never delivery or publication authority. */
export function inspectCommercialAudio(input) {
  const filePath = path.resolve(String(input?.filePath ?? ''));
  if (!input?.filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error('commercial_audio_master_missing');
  }
  const policy = { ...DEFAULT_POLICY, ...(input.policy || {}) };
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (!Number.isFinite(policy[key])) throw new Error('commercial_audio_policy_invalid:' + key);
  }
  if (policy.minIntegratedLufs >= policy.maxIntegratedLufs || policy.minChannels < 1 ||
      policy.minChannels > policy.maxChannels || policy.maxTruePeakDbtp > 0) {
    throw new Error('commercial_audio_policy_invalid_bounds');
  }

  const masterSha256 = sha256(filePath);
  if (input.expectedSha256 && input.expectedSha256.replace(/^sha256:/i, '').toLowerCase() !== masterSha256) {
    throw new Error('commercial_audio_digest_mismatch');
  }
  const probe = JSON.parse(run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type,codec_name,channels,sample_rate',
    '-of', 'json', filePath,
  ]).stdout);
  const audioStreams = (probe.streams || []).filter(s => s.codec_type === 'audio');
  const primary = audioStreams[0];
  const reasons = [];
  if (!primary) reasons.push('audio_stream_missing');
  if (audioStreams.length > 1) reasons.push('multiple_audio_streams_require_review');
  const measurements = primary ? measureLoudness(filePath) : {
    integratedLufs: null, truePeakDbtp: null, loudnessRangeLu: null,
  };
  const channels = primary ? Number(primary.channels) : null;
  if (primary && (!Number.isInteger(channels) || channels < policy.minChannels || channels > policy.maxChannels)) {
    reasons.push('audio_channel_count_out_of_range');
  }
  if (primary && measurements.integratedLufs === null) reasons.push('audio_integrated_loudness_unmeasurable');
  if (primary && measurements.truePeakDbtp === null) reasons.push('audio_true_peak_unmeasurable');
  if (measurements.integratedLufs !== null) {
    if (measurements.integratedLufs < policy.minIntegratedLufs) reasons.push('audio_too_quiet');
    if (measurements.integratedLufs > policy.maxIntegratedLufs) reasons.push('audio_too_loud');
  }
  if (measurements.truePeakDbtp !== null && measurements.truePeakDbtp > policy.maxTruePeakDbtp) {
    reasons.push('audio_true_peak_excessive');
  }
  return {
    schema: 'evercraft.fallen.commercial-audio-qc.v1',
    status: reasons.length ? 'rejected' : 'accepted',
    masterSha256,
    measurements: {
      ...measurements,
      streamCount: audioStreams.length,
      channels,
      codec: primary?.codec_name || null,
      sampleRate: primary ? Number(primary.sample_rate) : null,
    },
    policy,
    reasons,
    evidenceRefs: ['sha256:' + masterSha256, 'ffprobe:audio-streams', ...(primary ? ['ffmpeg:loudnorm-input-analysis'] : [])],
    boundaries: {
      technicalAudioOnly: true,
      masterQcStillRequired: true,
      voiceIntelligibilityReviewStillRequired: true,
      musicRightsAndCreativeReviewStillRequired: true,
      clientAndPublicationAuthorityGranted: false,
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , master, output] = process.argv;
  if (!master) {
    console.error('Usage: node commercial-audio-qc.mjs <master.mp4> [receipt.json]');
    process.exitCode = 1;
  } else {
    try {
      const receipt = inspectCommercialAudio({ filePath: master });
      if (output) {
        fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
        fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + '\n');
      }
      console.log(JSON.stringify(receipt, null, 2));
      if (receipt.status !== 'accepted') process.exitCode = 2;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
