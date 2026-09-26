import { issueEvidenceAccessToken } from './evidence-access.mjs';

const DEFAULT_SCOPES = Object.freeze([
  'query',
  'context',
  'timeline',
  'duplicates',
  'verify'
]);

const TOOL_BY_SCOPE = Object.freeze({
  query: 'forensiscope_query_evidence',
  context: 'forensiscope_build_context_packet',
  timeline: 'forensiscope_get_timeline',
  duplicates: 'forensiscope_get_duplicate_relationships',
  compare: 'forensiscope_compare_evidence',
  verify: 'forensiscope_verify_analysis'
});

function normalizedScopes(scopes) {
  return [...new Set(
    (Array.isArray(scopes) && scopes.length ? scopes : DEFAULT_SCOPES)
      .map((scope) => String(scope || '').trim())
      .filter(Boolean)
  )].sort();
}

export function issueForensiScopeAnalysisHandoff({
  analysisReceipt,
  handoff,
  scopes = DEFAULT_SCOPES,
  ttlSeconds = 3600,
  key = null
} = {}) {
  if (
    !analysisReceipt ||
    analysisReceipt.schema !== 'evercraft.forensiscope.analysis-receipt.v1' ||
    analysisReceipt.status !== 'ready'
  ) {
    throw new Error('ForensiScope handoff requires a ready analysis receipt.');
  }

  if (handoff?.confirmed !== true) {
    throw new Error('ForensiScope external handoff requires explicit confirmation.');
  }

  const evidenceRef = String(analysisReceipt.result?.evidence_ref || '');
  if (!/^forensiscope-evidence:sha256:[a-f0-9]{64}$/.test(evidenceRef)) {
    throw new Error('ForensiScope handoff requires a valid immutable evidence ref.');
  }

  const recipient = String(handoff.recipient || '').trim();
  if (!recipient) {
    throw new Error('ForensiScope handoff requires a recipient identifier.');
  }

  const selectedScopes = normalizedScopes(scopes);
  const access = issueEvidenceAccessToken({
    evidenceRef,
    scopes: selectedScopes,
    ttlSeconds,
    subject: recipient,
    key
  });

  return {
    schema: 'evercraft.forensiscope.analysis-handoff.v1',
    product: 'ForensiScope by Evercraft',
    job_id: analysisReceipt.job_id,
    evidence_ref: evidenceRef,
    provenance_ref: analysisReceipt.result?.provenance_ref || null,
    provenance_digest: analysisReceipt.result?.provenance_digest || null,
    source_sha256: analysisReceipt.source?.sha256 || null,
    access: {
      token: access.access_token,
      scopes: access.scopes,
      issued_at_unix: access.issued_at_unix,
      expires_at_unix: access.expires_at_unix
    },
    recipient,
    tools: access.scopes
      .map((scope) => TOOL_BY_SCOPE[scope])
      .filter(Boolean),
    suggested_first_tool: access.scopes.includes('context')
      ? 'forensiscope_build_context_packet'
      : 'forensiscope_query_evidence',
    boundaries: {
      human_confirmed: true,
      raw_media_included: false,
      source_path_included: false,
      analysis_admission_granted: false,
      checkout_or_payment_created: false,
      access_is_scoped_and_expiring: true,
      evidence_ref_is_not_authorization_by_itself: true
    }
  };
}
