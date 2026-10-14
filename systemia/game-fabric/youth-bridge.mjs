import { createHash } from 'node:crypto';

// A conservative, read-only handoff for local coach-facing prototypes.
// It neither admits missions nor transmits athlete data to any service.
export const GAME_FABRIC_MISSION = 'sports-weekly-opponent-intelligence-001';
export const YOUTH_SCHEMA = 'evercraft.game_fabric.youth_practice.v1';
export const DEVELOPMENT_SCHEMA = 'evercraft.game_fabric.development_path.v1';
export const STATUS = 'PENDING_SYSTEMIA_REVIEW';
export const YOUTH_RELEASE = Object.freeze({
  version: '0.1',
  generated_on: '2026-10-14',
  source_sha256: '1dd9a19ef3a7d149c72c6ef790a16ddb035bee60b69a37967cb6386a0adf87d0',
  package_sha256: '770f74c4e3fde64e9e50a575950118f96c11c59f7d8cf728c70264f5867038c5',
  custody_url: 'https://drive.google.com/drive/folders/1ixvtaUo2DsaPXVZHbzP_mwgDb7kJRo2x',
  visibility: 'internal_release_candidate'
});

const AGES = new Set(['5-7', '8-10', '11-13', '14-17']);
const GOALS = new Set(['catch', 'throw', 'route', 'flag', 'communicate']);
const DURATIONS = new Set([30, 45, 60, 75]);
const PRIVATE_KEYS = /(?:^|_)(?:name|first_name|last_name|email|phone|dob|date_of_birth|student_id|athlete_id|address|medical|diagnosis|injury|biometric|face_id|faceprint|ssn|school_id)(?:$|_)/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function reject(code) { throw new Error('game_fabric_' + code); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function scanForPersonalData(value, depth = 0) {
  if (depth > 15) reject('input_too_deep');
  if (Array.isArray(value)) { value.forEach(v => scanForPersonalData(v, depth + 1)); return; }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_KEYS.test(key.replace(/[A-Z]/g, x => '_' + x.toLowerCase()))) reject('private_field_blocked');
      scanForPersonalData(item, depth + 1);
    }
    return;
  }
  if (typeof value === 'string' && EMAIL_LIKE.test(value)) reject('email_address_blocked');
}
function requireExact(value, expected, field) { if (value !== expected) reject(field + '_invalid'); }
function requireText(value, field) { if (typeof value !== 'string' || !value.trim() || value.length > 2000) reject(field + '_invalid'); }
function validatePractice(document) {
  requireExact(document.program_only, true, 'program_only');
  requireExact(document.non_contact, true, 'non_contact');
  const c = document.configuration;
  if (!isObject(c)) reject('configuration_required');
  if (!AGES.has(c.age) || !GOALS.has(c.goal) || !DURATIONS.has(c.duration)) reject('configuration_unsupported');
  if (!Number.isInteger(c.group) || c.group < 1 || c.group > 40 ||
      !Number.isInteger(c.coaches) || c.coaches < 1 || c.coaches > 10) reject('staffing_values_invalid');
  if (!Array.isArray(document.blocks) || document.blocks.length !== 5) reject('blocks_invalid');
  let total = 0;
  for (const block of document.blocks) {
    if (!isObject(block) || !Number.isInteger(block.minute) || block.minute < 1) reject('block_duration_invalid');
    requireText(block.title, 'block_title');
    requireText(block.instruction, 'block_instruction');
    total += block.minute;
  }
  if (total !== c.duration || document.total_minutes !== c.duration) reject('time_budget_mismatch');
  const staffingReview = c.group > 12 && c.coaches < 2;
  if (staffingReview && document.requires_staffing_review !== true) reject('staffing_review_required');
  return { kind: 'youth_practice', age_band: c.age, planned_minutes: total, staffing_review: staffingReview };
}
function validateDevelopment(document) {
  requireExact(document.group_only, true, 'group_only');
  requireExact(document.non_contact, true, 'non_contact');
  if (!Array.isArray(document.three_sessions) || document.three_sessions.length !== 3) reject('sessions_invalid');
  for (const [index, session] of document.three_sessions.entries()) {
    if (!isObject(session) || session.session !== index + 1) reject('session_sequence_invalid');
    requireText(session.stage, 'session_stage');
    requireText(session.coaching_activity, 'session_activity');
    requireText(session.group_observation, 'session_observation');
  }
  return { kind: 'development_path', session_count: 3, group_only: true };
}

/**
 * Creates an internal review record only. Does not store, enroll, publish, email,
 * contact a child, claim coaching safety, or verify rights to external footage.
 */
export function createYouthGameFabricHandoff(document, { origin = 'local_offline_prototype' } = {}) {
  if (!isObject(document)) reject('document_required');
  const serialized = JSON.stringify(document);
  if (serialized.length > 100_000) reject('document_too_large');
  scanForPersonalData(document);
  requireExact(document.status, 'illustrative-coach-review-required', 'evidence_status');
  const summary = document.schema === YOUTH_SCHEMA
    ? validatePractice(document)
    : document.schema === DEVELOPMENT_SCHEMA
      ? validateDevelopment(document)
      : reject('schema_unknown');
  if (origin !== 'local_offline_prototype') reject('origin_not_authorized');
  return Object.freeze({
    schema: 'evercraft.systemia.game_fabric.handoff.v1',
    mission_id: GAME_FABRIC_MISSION,
    state: STATUS,
    source: 'Game Fabric Youth Practice Room v0.1',
    origin,
    source_schema: document.schema,
    source_sha256: createHash('sha256').update(serialized).digest('hex'),
    release: YOUTH_RELEASE,
    summary,
    evidence_state: 'prototype_tested_field_unvalidated',
    authorized_actions: ['local_coach_preview', 'internal_review'],
    forbidden_actions: ['production_dispatch', 'external_outreach', 'child_profiles', 'restricted_film_ingest', 'commercial_release'],
    gates: [
      'systemia_admission', 'adult_coach_curriculum_review', 'youth_safety_and_privacy_review',
      'rights_and_security_review', 'permissioned_field_pilot', 'independent_release_verification'
    ]
  });
}
