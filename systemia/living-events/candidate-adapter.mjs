import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateCaseRegistry } from '../../public/living-events/registry.mjs';

/** Source-qualified editorial proposals only. This module does not dispatch or publish. */
export function buildLivingEventCandidates(raw) {
  const cases = validateCaseRegistry(raw);
  return Object.values(cases).map((event) => {
    const sources = event.sources.map(source => ({
      ref: source.id, url: source.url, name: source.name,
      kind: source.kind, note: source.note, capture_time: null,
      published_at: null, rights_state: 'not_adjudicated',
    }));
    const claims = [
      ...event.milestones.map(entry => ({
        claim_kind: 'chronology', label: entry.label, event_time_label: entry.time,
        text: entry.detail, evidence_state: entry.state, provenance_refs: entry.sources,
      })),
      ...event.features.map(entry => ({
        claim_kind: 'theme', label: entry.label, event_time_label: null,
        text: entry.detail, evidence_state: entry.state, provenance_refs: entry.sources,
      })),
    ];
    const sourceDigest = createHash('sha256')
      .update(JSON.stringify({id:event.id, sources, claims})).digest('hex');
    return {
      schema: 'evercraft.systemia.living-event-candidate.v1',
      candidate_id: 'living-event:' + event.id,
      event_id: event.id,
      subject: event.title,
      region_label: event.place,
      event_date_label: event.date,
      research_summary: event.overview,
      source_count: sources.length,
      sources,
      claims,
      source_digest_sha256: 'sha256:' + sourceDigest,
      evidence_boundary: event.caution,
      geography: {
        mode: 'conceptual', coordinate_system: null, surveyed_coordinates: false,
        verified_footprints: false, safe_route_authority: false,
      },
      intended_consumer: 'systemia_editorial_review',
      candidate_state: 'UNADMITTED_SOURCE_PACKET',
      systemia_admission: 'not_acknowledged',
      dispatch_authority: false,
      publication_authority: false,
      payment_authority: false,
      external_contact_authority: false,
      rights_state: 'unreviewed',
      review_gates: [
        'existing_mission_deduplication',
        'source_capture_time_and_rights_review',
        'source_claim_editorial_preflight',
        'authorized_geography_if_any',
        'systemia_admission_receipt',
        'deployment_and_device_readback',
      ],
    };
  });
}

export function readLivingEventCandidates() {
  const raw = JSON.parse(readFileSync(
    new URL('../../public/living-events/cases.json', import.meta.url), 'utf8'));
  return buildLivingEventCandidates(raw);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify({
    schema: 'evercraft.systemia.living-event-candidate-batch.v1',
    packets: readLivingEventCandidates(),
    batch_dispatch_authority: false,
    batch_publication_authority: false,
  }, null, 2) + '\n');
}
