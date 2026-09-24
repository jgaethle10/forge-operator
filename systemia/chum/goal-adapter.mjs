import { readFile } from 'node:fs/promises';
import { rankOffers } from '../chum/discovery-router.mjs';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function catalogEvidence(catalog) {
  const version = clean(catalog?.source_schema_version || catalog?.generated_at || 'unknown');
  return `evercraft-machine-catalog:${version}`;
}

export function createChumOfferDiscoveryAdapter({
  catalogPath = 'public/.well-known/evercraft-machine-catalog.json',
  minimumScore = 8,
  limit = 5,
} = {}) {
  return {
    capability_key: 'chum.offer-discovery.v1',
    work_types: ['discover', 'commercial-discovery', 'match-offer'],
    authority: 'read-only',
    human_gate_required: false,

    async execute({ work, context }) {
      const query = clean(context?.query || work?.query || work?.title);
      if (!query) {
        return {
          result: 'blocked',
          blocker: 'CHUM offer discovery requires a query.',
        };
      }

      const raw = await readFile(catalogPath, 'utf8');
      const catalog = JSON.parse(raw);
      const matches = rankOffers(catalog, query, { minimumScore, limit });
      const evidence = catalogEvidence(catalog);

      return {
        result: 'complete',
        receipt_ref: `chum:discover:${work.work_key}:${clean(catalog.source_schema_version || 'catalog')}`,
        evidence_refs: [evidence],
        output: {
          schema: 'evercraft.chum.goal-discovery-result.v1',
          query,
          match_count: matches.length,
          matches,
          catalog: {
            source_schema_version: catalog.source_schema_version || '',
            generated_at: catalog.generated_at || '',
          },
          safety: {
            discovery_creates_obligation: false,
            checkout_is_payment_proof: false,
            human_confirmation_required_for_checkout: true,
          },
        },
      };
    },
  };
}
