export const DOCUMENTARY_OWNED_RUNTIME = Object.freeze({
  admission: Object.freeze([
    'systemia/organism/goal-runtime.mjs',
    'systemia/organism/goal-store.mjs',
  ]),
  research: Object.freeze([
    'systemia/newsroom/claim-reactor.mjs',
    'systemia/newsroom/newsroom-intake.mjs',
    'systemia/worldstate/observation-fabric.mjs',
    'systemia/worldstate/context-reader.mjs',
  ]),
  archive_and_media_evidence: Object.freeze([
    'systemia/forensiscope/authorized-source.mjs',
    'systemia/forensiscope/evidence-graph.mjs',
    'systemia/forensiscope/transcription-engine.mjs',
    'systemia/forensiscope/batch-transcribe.mjs',
  ]),
  geospatial_and_world_state: Object.freeze([
    'systemia/worldstate/worldstate.mjs',
    'systemia/worldstate/phenomenon-bridge.mjs',
    'systemia/media-studio/world-map.ts',
    'systemia/media-studio/world-intel-stage.ts',
  ]),
  production: Object.freeze([
    'systemia/media-studio/narrative-film-admission.ts',
    'systemia/media-studio/narrative-film-pipeline.ts',
    'systemia/media-studio/film-proof-bundle.ts',
    'systemia/media-studio/production-grade-gate.ts',
    'systemia/media-studio/master-qc.ts',
    'systemia/media-studio/distributed-render-coordinator.mjs',
    'systemia/saban/multiplier.mjs',
  ]),
  distribution: Object.freeze([
    'systemia/newsroom/journal-publisher.mjs',
    'systemia/clip/media-intake.mjs',
    'systemia/clip/publisher-runtime.mjs',
    'systemia/clip/youtube-publisher.mjs',
  ]),
});

export function documentaryExecutionLanes() {
  return Object.entries(DOCUMENTARY_OWNED_RUNTIME).map(([lane, modules]) => ({
    lane,
    runtime: 'evercraft_owned',
    modules: [...modules],
  }));
}

export function assertOwnedDocumentaryRuntime(lanes = documentaryExecutionLanes()) {
  const errors = [];
  for (const lane of lanes) {
    if (lane.runtime !== 'evercraft_owned') {
      errors.push(`${lane.lane}:runtime_not_owned`);
    }
    for (const modulePath of lane.modules ?? []) {
      const normalized = String(modulePath || '').trim();
      if (!normalized.startsWith('systemia/')) {
        errors.push(`${lane.lane}:non_systemia_target:${normalized}`);
      }
      if (/base44/i.test(normalized)) {
        errors.push(`${lane.lane}:legacy_host_dependency:${normalized}`);
      }
      if (/^https?:\/\//i.test(normalized)) {
        errors.push(`${lane.lane}:remote_runtime_dependency:${normalized}`);
      }
    }
  }
  if (errors.length) {
    throw new Error('documentary_owned_runtime_violation:' + errors.join('|'));
  }
  return {
    schema: 'evercraft.documentary-desk.owned-runtime-receipt.v1',
    status: 'accepted',
    laneCount: lanes.length,
    moduleCount: lanes.reduce((sum, lane) => sum + (lane.modules?.length ?? 0), 0),
    externalRuntimeDependencies: 0,
  };
}
