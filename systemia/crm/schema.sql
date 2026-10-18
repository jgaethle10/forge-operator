-- Evercraft private CRM schema v0.1. DESIGN ONLY. DO NOT APPLY TO PRODUCTION.
-- Source-of-truth payments, interactions, authority and sensitive records stay in their respective systems.
-- No customer data belongs in this public GitHub repository.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS evercraft_crm;
CREATE TABLE evercraft_crm.tenants (
  tenant_id text PRIMARY KEY, display_name text NOT NULL
);
CREATE TABLE evercraft_crm.parties (
  tenant_id text NOT NULL REFERENCES evercraft_crm.tenants(tenant_id),
  party_id uuid NOT NULL DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK(kind IN ('person','organization','institution','service_account')),
  lifecycle text NOT NULL DEFAULT 'active',
  display_label text, -- PRIVATE
  accountable_owner_ref text, retention_class text NOT NULL DEFAULT 'standard',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.source_links (
  tenant_id text NOT NULL, link_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid NOT NULL,
  source_system text NOT NULL, source_record_key text NOT NULL, observed_at timestamptz NOT NULL,
  evidence_ref text NOT NULL,
  PRIMARY KEY(tenant_id,link_id), UNIQUE(tenant_id,source_system,source_record_key),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.private_identifiers (
  tenant_id text NOT NULL, identifier_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid NOT NULL,
  identifier_type text NOT NULL, encrypted_value bytea NOT NULL, match_digest bytea,
  verified_at timestamptz, source_ref text NOT NULL,
  PRIMARY KEY(tenant_id,identifier_id),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.party_edges (
  tenant_id text NOT NULL, edge_id uuid NOT NULL DEFAULT gen_random_uuid(),
  from_party_id uuid NOT NULL, to_party_id uuid NOT NULL, relation_type text NOT NULL,
  evidence_ref text NOT NULL, review_state text NOT NULL DEFAULT 'candidate'
    CHECK(review_state IN ('candidate','verified','rejected')),
  starts_at timestamptz, ends_at timestamptz,
  PRIMARY KEY(tenant_id,edge_id),
  FOREIGN KEY(tenant_id,from_party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id),
  FOREIGN KEY(tenant_id,to_party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.divisions (
  tenant_id text NOT NULL REFERENCES evercraft_crm.tenants(tenant_id),
  division_id text NOT NULL, name text NOT NULL, visibility_class text NOT NULL DEFAULT 'internal',
  PRIMARY KEY(tenant_id,division_id)
);
CREATE TABLE evercraft_crm.engagements (
  tenant_id text NOT NULL, engagement_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid NOT NULL,
  division_id text NOT NULL, relationship_role text NOT NULL, owner_ref text,
  stage text NOT NULL DEFAULT 'unknown', started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  PRIMARY KEY(tenant_id,engagement_id),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id),
  FOREIGN KEY(tenant_id,division_id) REFERENCES evercraft_crm.divisions(tenant_id,division_id)
);
CREATE TABLE evercraft_crm.contact_policy (
  tenant_id text NOT NULL, policy_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid NOT NULL,
  channel text NOT NULL CHECK(channel IN ('email','sms','phone','dm','push')),
  preference text NOT NULL CHECK(preference IN ('opted_out','unverified','allowed_by_separate_authority')),
  evidence_ref text NOT NULL, effective_at timestamptz NOT NULL,
  PRIMARY KEY(tenant_id,policy_id),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.interactions (
  tenant_id text NOT NULL, interaction_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid NOT NULL,
  external_ledger_event_ref text NOT NULL, channel text NOT NULL, direction text NOT NULL,
  occurred_at timestamptz NOT NULL, evidence_ref text NOT NULL,
  PRIMARY KEY(tenant_id,interaction_id), UNIQUE(tenant_id,external_ledger_event_ref),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.opportunities (
  tenant_id text NOT NULL, opportunity_id uuid NOT NULL DEFAULT gen_random_uuid(), engagement_id uuid NOT NULL,
  offering_ref text NOT NULL, stage text NOT NULL, owner_ref text, currency char(3),
  value_minor bigint CHECK(value_minor >= 0), value_basis text NOT NULL DEFAULT 'unknown',
  expected_close_at timestamptz, next_action_due_at timestamptz, evidence_ref text NOT NULL,
  PRIMARY KEY(tenant_id,opportunity_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES evercraft_crm.engagements(tenant_id,engagement_id)
);
CREATE TABLE evercraft_crm.commitments (
  tenant_id text NOT NULL, commitment_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid,
  opportunity_id uuid, owner_ref text NOT NULL, due_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN ('open','fulfilled','cancelled','disputed')),
  source_ledger_ref text NOT NULL, evidence_ref text NOT NULL,
  PRIMARY KEY(tenant_id,commitment_id), UNIQUE(tenant_id,source_ledger_ref),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES evercraft_crm.opportunities(tenant_id,opportunity_id)
);
CREATE TABLE evercraft_crm.activities (
  tenant_id text NOT NULL, activity_id uuid NOT NULL DEFAULT gen_random_uuid(), party_id uuid,
  opportunity_id uuid, kind text NOT NULL, owner_ref text, due_at timestamptz,
  state text NOT NULL DEFAULT 'open', requires_passport boolean NOT NULL DEFAULT true,
  evidence_ref text, completed_evidence_ref text,
  PRIMARY KEY(tenant_id,activity_id),
  FOREIGN KEY(tenant_id,party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES evercraft_crm.opportunities(tenant_id,opportunity_id)
);
CREATE TABLE evercraft_crm.commercial_references (
  tenant_id text NOT NULL, commercial_ref_id uuid NOT NULL DEFAULT gen_random_uuid(),
  opportunity_id uuid, provider text NOT NULL, external_order_ref text NOT NULL,
  status text NOT NULL CHECK(status IN ('unknown','checkout_open','paid_verified','refunded','disputed','fulfilled','settled')),
  status_evidence_ref text, last_verified_at timestamptz,
  PRIMARY KEY(tenant_id,commercial_ref_id), UNIQUE(tenant_id,provider,external_order_ref),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES evercraft_crm.opportunities(tenant_id,opportunity_id)
);
CREATE TABLE evercraft_crm.deliverables (
  tenant_id text NOT NULL, deliverable_id uuid NOT NULL DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL, job_ref text NOT NULL, service_type text NOT NULL,
  due_at timestamptz, state text NOT NULL, completion_evidence_ref text,
  PRIMARY KEY(tenant_id,deliverable_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES evercraft_crm.engagements(tenant_id,engagement_id)
);
CREATE TABLE evercraft_crm.cases (
  tenant_id text NOT NULL, case_id uuid NOT NULL DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL, case_type text NOT NULL, severity text NOT NULL,
  state text NOT NULL, owner_ref text, due_at timestamptz, source_ref text NOT NULL,
  resolution_evidence_ref text,
  PRIMARY KEY(tenant_id,case_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES evercraft_crm.engagements(tenant_id,engagement_id)
);
CREATE TABLE evercraft_crm.campaigns (
  tenant_id text NOT NULL, campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
  division_id text NOT NULL, purpose text NOT NULL, start_at timestamptz, end_at timestamptz,
  consent_policy_ref text NOT NULL, evidence_ref text NOT NULL,
  PRIMARY KEY(tenant_id,campaign_id),
  FOREIGN KEY(tenant_id,division_id) REFERENCES evercraft_crm.divisions(tenant_id,division_id)
);
CREATE TABLE evercraft_crm.attribution_evidence (
  tenant_id text NOT NULL, attribution_id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL, opportunity_id uuid NOT NULL,
  attribution_method text NOT NULL, baseline_ref text,
  incremental_evidence_ref text, attribution_state text NOT NULL DEFAULT 'unverified',
  PRIMARY KEY(tenant_id,attribution_id),
  FOREIGN KEY(tenant_id,campaign_id) REFERENCES evercraft_crm.campaigns(tenant_id,campaign_id),
  FOREIGN KEY(tenant_id,opportunity_id) REFERENCES evercraft_crm.opportunities(tenant_id,opportunity_id)
);
CREATE TABLE evercraft_crm.source_watermarks (
  tenant_id text NOT NULL REFERENCES evercraft_crm.tenants(tenant_id), connector_key text NOT NULL,
  opaque_cursor text, last_attempt_at timestamptz, last_success_at timestamptz,
  last_evidence_ref text, state text NOT NULL, error_class text,
  PRIMARY KEY(tenant_id,connector_key)
);
CREATE TABLE evercraft_crm.merge_decisions (
  tenant_id text NOT NULL, decision_id uuid NOT NULL DEFAULT gen_random_uuid(),
  surviving_party_id uuid NOT NULL, other_party_id uuid NOT NULL,
  decision text NOT NULL CHECK(decision IN ('candidate','approved','rejected','reversed')),
  authority_ref text, evidence_ref text NOT NULL, decided_at timestamptz,
  PRIMARY KEY(tenant_id,decision_id),
  FOREIGN KEY(tenant_id,surviving_party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id),
  FOREIGN KEY(tenant_id,other_party_id) REFERENCES evercraft_crm.parties(tenant_id,party_id)
);
CREATE TABLE evercraft_crm.audit_events (
  tenant_id text NOT NULL REFERENCES evercraft_crm.tenants(tenant_id),
  event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  aggregate_type text NOT NULL, aggregate_ref text NOT NULL, operation text NOT NULL,
  actor_ref text NOT NULL, authority_ref text, evidence_ref text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), previous_hash text, current_hash text NOT NULL,
  PRIMARY KEY(tenant_id,event_id)
);
-- Relationship covenants are explicitly purpose-scoped. A recorded email
-- never provides authority for new marketing or unrelated company divisions.
CREATE TABLE evercraft_crm.relationship_covenants (
  tenant_id text NOT NULL, covenant_id uuid NOT NULL DEFAULT gen_random_uuid(),
  engagement_id uuid NOT NULL,
  outbound_policy text NOT NULL CHECK(outbound_policy IN
    ('paused','manual_review_only','preflight_eligible')),
  not_before timestamptz, next_review_at timestamptz,
  allowed_purposes text[] NOT NULL DEFAULT '{}',
  source_evidence_ref text NOT NULL, status_observed_at timestamptz NOT NULL,
  changed_by_ref text NOT NULL, revision bigint NOT NULL DEFAULT 1,
  PRIMARY KEY(tenant_id,covenant_id),
  FOREIGN KEY(tenant_id,engagement_id) REFERENCES evercraft_crm.engagements(tenant_id,engagement_id)
);
CREATE TABLE evercraft_crm.relationship_timeline (
  tenant_id text NOT NULL, timeline_event_id uuid NOT NULL DEFAULT gen_random_uuid(),
  covenant_id uuid NOT NULL, source_event_ref text NOT NULL,
  event_kind text NOT NULL, occurred_at timestamptz NOT NULL,
  evidence_ref text NOT NULL, private_context_ref text,
  PRIMARY KEY(tenant_id,timeline_event_id),
  UNIQUE(tenant_id,covenant_id,source_event_ref),
  FOREIGN KEY(tenant_id,covenant_id) REFERENCES evercraft_crm.relationship_covenants(tenant_id,covenant_id)
);
CREATE INDEX crm_relationship_reviews
  ON evercraft_crm.relationship_covenants(tenant_id,next_review_at);
CREATE INDEX crm_opportunity_due ON evercraft_crm.opportunities(tenant_id,next_action_due_at);
CREATE INDEX crm_commitment_due ON evercraft_crm.commitments(tenant_id,due_at) WHERE state='open';
CREATE INDEX crm_activity_due ON evercraft_crm.activities(tenant_id,due_at) WHERE state='open';
CREATE INDEX crm_case_due ON evercraft_crm.cases(tenant_id,due_at);
CREATE INDEX crm_interaction_history ON evercraft_crm.interactions(tenant_id,party_id,occurred_at DESC);
CREATE INDEX crm_audit_history ON evercraft_crm.audit_events(tenant_id,occurred_at DESC);
-- RLS FAIL-CLOSED: no tenant policies here. Qualified DB admins must define,
-- audit and test tenant/purpose-specific policies before accepting real records.
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='evercraft_crm' LOOP
    EXECUTE format('ALTER TABLE evercraft_crm.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE evercraft_crm.%I FORCE ROW LEVEL SECURITY',t);
  END LOOP;
END $$;
