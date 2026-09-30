import fs from 'node:fs';
import crypto from 'node:crypto';
import { normalizeContextObservation } from './observation-fabric.mjs';

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const unique = (values = []) => [...new Set(values.map(clean).filter(Boolean))];

function safeId(value) {
  return clean(value).replace(/[^a-zA-Z0-9:_-]+/g, '_').slice(0, 180);
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function evidenceState(worldstateState) {
  if (worldstateState === 'modeled') return 'modeled';
  if (worldstateState === 'observed' || worldstateState === 'verified') return 'observed';
  return 'public_source';
}

function assertPhenomenonShape(phenomenon) {
  if (!phenomenon || typeof phenomenon !== 'object') {
    throw new Error('Observation does not carry an explicit facts.phenomenon contract.');
  }
  if (phenomenon.kind !== 'flow') {
    throw new Error('Only explicit flow phenomena are currently admitted.');
  }
  if (!phenomenon.geography?.bounds) {
    throw new Error('Phenomenon geography.bounds is required.');
  }
  if (!phenomenon.encoding?.motionLabel) {
    throw new Error('Phenomenon encoding.motionLabel is required.');
  }
  if (!Array.isArray(phenomenon.streamlines) || !phenomenon.streamlines.length) {
    throw new Error('Phenomenon streamlines are required.');
  }
}

export function phenomenonPacketFromObservation(rawObservation, options = {}) {
  const observation = normalizeContextObservation(rawObservation);
  const phenomenon = observation.facts?.phenomenon;
  assertPhenomenonShape(phenomenon);

  const sourceRefs = unique(observation.provenance_refs);
  if (!sourceRefs.length) {
    throw new Error('Worldstate phenomenon requires provenance_refs.');
  }

  const state = evidenceState(observation.evidence_state);
  const streamlines = phenomenon.streamlines.map((stream, index) => ({
    id: clean(stream.id) || `stream-${index + 1}`,
    points: Array.isArray(stream.points) ? stream.points : [],
    particles: stream.particles,
    speed: stream.speed,
    sourceRefs: unique(stream.sourceRefs?.length ? stream.sourceRefs : sourceRefs),
  }));

  const input = {
    schema: 'evercraft.fallen.phenomenon.v1',
    id: safeId(phenomenon.id || `worldstate:${observation.observation_id}`),
    title: clean(phenomenon.title || observation.summary || `${observation.kind} phenomenon`),
    subtitle: clean(phenomenon.subtitle || ''),
    durationSec: phenomenon.durationSec,
    aspectRatio: phenomenon.aspectRatio || options.aspectRatio || '9:16',
    time: phenomenon.time,
    geography: {
      bounds: phenomenon.geography.bounds,
      outlines: phenomenon.geography.outlines || [],
      labels: phenomenon.geography.labels || [],
    },
    encoding: phenomenon.encoding,
    field: {
      kind: 'flow',
      evidenceState: state,
      sourceRefs,
      streamlines,
      particleDensity: phenomenon.particleDensity,
      trailFraction: phenomenon.trailFraction,
    },
    source: {
      label: clean(phenomenon.sourceLabel || observation.source_family || observation.source_system),
      refs: sourceRefs,
    },
    callout: clean(phenomenon.callout || ''),
  };

  return {
    schema: 'evercraft.worldstate.fallen-phenomenon-packet.v1',
    observation_id: observation.observation_id,
    source_system: observation.source_system,
    source_family: observation.source_family,
    observed_at: observation.observed_at,
    worldstate_evidence_state: observation.evidence_state,
    phenomenon_evidence_state: state,
    context_keys: observation.correlation_keys,
    input,
    packet_digest: digest({
      observation_id: observation.observation_id,
      input,
      provenance_refs: sourceRefs,
    }),
    publication_authority: false,
  };
}

export function writePhenomenonPacketFile(rawObservation, outputPath, options = {}) {
  const packet = phenomenonPacketFromObservation(rawObservation, options);
  fs.writeFileSync(outputPath, JSON.stringify(packet.input, null, 2) + '\n', 'utf8');
  return packet;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    console.error('Usage: node systemia/worldstate/phenomenon-bridge.mjs <observation.json> <phenomenon.json>');
    process.exitCode = 1;
  } else {
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const packet = writePhenomenonPacketFile(raw, outputPath);
    console.log(JSON.stringify({
      ok: true,
      schema: packet.schema,
      observation_id: packet.observation_id,
      phenomenon_id: packet.input.id,
      evidence_state: packet.phenomenon_evidence_state,
      packet_digest: packet.packet_digest,
      publication_authority: packet.publication_authority,
    }, null, 2));
  }
}
