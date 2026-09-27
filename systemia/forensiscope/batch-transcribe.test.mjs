import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseBatchArgs,
  planMediaChunks,
  reconcileOverlapSegments
} from './batch-transcribe.mjs';

test('plans overlapping chunks without exceeding source duration', () => {
  const chunks = planMediaChunks(725, { chunkSeconds: 300, overlapSeconds: 2 });
  assert.deepEqual(chunks, [
    { index: 0, start_seconds: 0, duration_seconds: 300, end_seconds: 300 },
    { index: 1, start_seconds: 298, duration_seconds: 300, end_seconds: 598 },
    { index: 2, start_seconds: 596, duration_seconds: 129, end_seconds: 725 }
  ]);
});

test('reconciles duplicate overlap segments while preserving different speech', () => {
  const segments = reconcileOverlapSegments([
    { meeting_start_seconds: 298.2, text: 'same sentence', chunk_index: 0 },
    { meeting_start_seconds: 299.1, text: 'Same sentence!', chunk_index: 1 },
    { meeting_start_seconds: 300.0, text: 'new sentence', chunk_index: 1 }
  ], 2);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].text, 'same sentence');
  assert.equal(segments[1].text, 'new sentence');
});

test('parses multiple media files and operator options', () => {
  const parsed = parseBatchArgs([
    'a.mov',
    'b.mp4',
    '--out', 'meeting.json',
    '--chunk-seconds', '240',
    '--overlap-seconds', '3',
    '--keep-audio'
  ]);
  assert.deepEqual(parsed.files, ['a.mov', 'b.mp4']);
  assert.equal(parsed.options.out, 'meeting.json');
  assert.equal(parsed.options.chunkSeconds, 240);
  assert.equal(parsed.options.overlapSeconds, 3);
  assert.equal(parsed.options.keepAudio, true);
});
