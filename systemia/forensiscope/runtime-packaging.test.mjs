import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('production image ships ForensiScope runtime', () => {
  const docker = fs.readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
  assert.match(
    docker,
    /COPY --from=build \/app\/systemia\/forensiscope \.\/systemia\/forensiscope/
  );
});

test('Forge health and capability surfaces expose truthful ForensiScope speech readiness', () => {
  const server = fs.readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
  assert.match(server, /transcriptionCapabilityStatus/);
  assert.match(server, /transcription_ready/);
  assert.match(server, /transcriptionReady/);
  assert.match(server, /engine_id/);
});
