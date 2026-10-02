import assert from 'node:assert/strict';
import {
  analyzeMachineObservations,
  normalizeMachineObservation
} from './machine-rockies.mjs';

const now = '2026-10-01T06:00:00.000Z';

const campaign = analyzeMachineObservations([
  {
    source_access: 'authorized',
    source_family: 'ionos-whois-relay',
    observed_at: now,
    signal_type: 'whois_contact',
    target_entity: 'systemiacommandcenters.com',
    actor_domain: 'soleideck.info',
    template_text: 'Business opportunities',
    provenance_ref: 'mail:1'
  },
  {
    source_access: 'authorized',
    source_family: 'ionos-whois-relay',
    observed_at: now,
    signal_type: 'whois_contact',
    target_entity: 'havenlycleaning.com',
    actor_domain: 'soleideck.info',
    template_text: 'Business opportunities',
    provenance_ref: 'mail:2'
  },
  {
    source_access: 'authorized',
    source_family: 'ionos-whois-relay',
    observed_at: now,
    signal_type: 'whois_contact',
    target_entity: 'systemiafieldlibrary.com',
    actor_domain: 'cyberdesigninglabs.info',
    template_text: 'Business opportunities',
    provenance_ref: 'mail:3'
  },
  {
    source_access: 'authorized',
    source_family: 'ionos-whois-relay',
    observed_at: now,
    signal_type: 'whois_contact',
    target_entity: 'systemiafieldlibrary.com',
    actor_domain: 'zentasystems.info',
    destination_host: 'cabbagetreesolutions.com',
    template_text: 'Business opportunities',
    provenance_ref: 'mail:4'
  }
]);

assert.equal(campaign.campaigns.length, 1);
assert.equal(campaign.campaigns[0].pattern, 'coordinated_outreach_pattern');
assert.ok(campaign.campaigns[0].actor_domains.length >= 3);
assert.ok(campaign.campaigns[0].target_entities.length >= 3);
assert.equal(campaign.campaigns[0].autonomous_attribution, false);
assert.ok(campaign.routes.some((row) => row.route === 'security_review'));

const singleBirth = analyzeMachineObservations([
  {
    source_access: 'public',
    source_family: 'dns-zone-observer',
    observed_at: now,
    signal_type: 'domain_registration',
    target_entity: 'example-newco.com',
    provenance_ref: 'dns:example-newco.com'
  }
]);
assert.equal(singleBirth.opportunities[0].stage, 'insufficient');
assert.equal(singleBirth.opportunities[0].auto_contact_allowed, false);

const convergent = analyzeMachineObservations([
  {
    source_access: 'public',
    source_family: 'state-business-registry',
    observed_at: now,
    signal_type: 'company_registration',
    target_entity: 'example-growth-co',
    evidence_state: 'verified',
    provenance_ref: 'registry:123'
  },
  {
    source_access: 'public',
    source_family: 'dns-zone-observer',
    observed_at: now,
    signal_type: 'domain_registration',
    target_entity: 'example-growth-co',
    evidence_state: 'observed',
    provenance_ref: 'dns:example-growth.co'
  },
  {
    source_access: 'public',
    source_family: 'city-permit-portal',
    observed_at: now,
    signal_type: 'building_permit',
    target_entity: 'example-growth-co',
    evidence_state: 'verified',
    provenance_ref: 'permit:456'
  },
  {
    source_access: 'public',
    source_family: 'public-job-board',
    observed_at: now,
    signal_type: 'job_posting',
    target_entity: 'example-growth-co',
    evidence_state: 'observed',
    provenance_ref: 'jobs:789'
  }
]);

assert.equal(convergent.opportunities[0].stage, 'opportunity_review_candidate');
assert.equal(convergent.opportunities[0].auto_contact_allowed, false);
assert.ok(convergent.routes.some((row) => row.route === 'opportunity_fabric_review'));

const normalized = normalizeMachineObservation({
  source_access: 'public',
  source_family: 'web-access-log',
  observed_at: now,
  signal_type: 'crawler_visit',
  target_entity: 'evercraft.example',
  actor_domain: 'crawler.example',
  template_text: 'Contact private.person@example.com about 123456',
  provenance_ref: 'log:abc'
});

assert.equal(normalized.schema, 'evercraft.context.observation.v1');
assert.equal(normalized.metadata.observer_class, 'machine_rocky');
assert.equal(normalized.metadata.data_minimized, true);
assert.equal(normalized.metadata.autonomous_contact, false);
assert.ok(normalized.facts.template_fingerprint);
assert.equal(JSON.stringify(normalized).includes('private.person@example.com'), false);

assert.throws(() => normalizeMachineObservation({
  source_access: 'private',
  source_family: 'unknown',
  signal_type: 'crawler_visit',
  target_entity: 'evercraft.example'
}), /public or authorized/);

assert.throws(() => normalizeMachineObservation({
  source_access: 'authorized',
  contains_private_data: true,
  source_family: 'mailbox',
  signal_type: 'whois_contact',
  target_entity: 'evercraft.example'
}), /minimized observations/);

console.log(JSON.stringify({
  ok: true,
  campaign_pattern: campaign.campaigns[0].pattern,
  campaign_actor_domains: campaign.campaigns[0].actor_domains.length,
  campaign_target_entities: campaign.campaigns[0].target_entities.length,
  opportunity_stage: convergent.opportunities[0].stage,
  opportunity_signal_groups: convergent.opportunities[0].signal_groups.length,
  no_autonomous_external_contact: convergent.doctrine.no_autonomous_external_contact
}, null, 2));
