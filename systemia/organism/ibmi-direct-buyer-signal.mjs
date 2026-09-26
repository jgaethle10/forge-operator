const IBM_I_PLATFORM_PATTERNS = [
  /\bIBM\s*i\b/i,
  /\bAS\/?400\b/i,
  /\biSeries\b/i,
  /\bPower\s+Systems?\b/i,
];

const LANGUAGE_PATTERNS = [
  /\bRPG(?:LE|\s*IV|\s*III|\s*Free|\s*Free[- ]?Format)?\b/i,
  /\bSQLRPGLE\b/i,
  /\bCL(?:LE)?\b/i,
  /\bCOBOL\b/i,
  /\bDB2(?:\/400|\s+for\s+i)?\b/i,
];

const INTEGRATION_PATTERNS = [
  /\bEDI\b/i,
  /\bJDE(?:\s+World|dwards)?\b/i,
  /\bInfor\s+XA\b/i,
  /\bAPI(?:s)?\b/i,
  /\bweb\s+services?\b/i,
  /\bMQ\b/i,
];

const CHANGE_PATTERNS = [
  /\bmoderni[sz](?:e|ation|ing)\b/i,
  /\bupgrade(?:s|d|ing)?\b/i,
  /\bmigrat(?:e|ion|ing)\b/i,
  /\brefactor(?:ing)?\b/i,
  /\benhanc(?:e|ement|ing)\b/i,
  /\bmaintain(?:ing|ance)?\b/i,
  /\blegacy\b/i,
];

const HIRING_PATTERNS = [
  /\bcareer(?:s)?\b/i,
  /\bjob(?:s)?\b/i,
  /\bposition\b/i,
  /\bapply\b/i,
  /\bhiring\b/i,
  /\bjoin\s+(?:our|the)\s+team\b/i,
];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function matchNames(text, patterns) {
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

function exactRelease(text) {
  const match = String(text || '').match(/\bIBM\s*i\s*(7\.[1-6])\b/i);
  return match ? match[1] : null;
}

function sourceQuality(sourceType) {
  const normalized = clean(sourceType).toLowerCase();
  if (normalized === 'official_company') return 100;
  if (normalized === 'official_vendor_case_study') return 90;
  if (normalized === 'job_board') return 75;
  if (normalized === 'public_profile') return 65;
  return 50;
}

export function classifyIBMiDirectBuyerEvidence({
  company,
  url,
  text,
  source_type = 'public',
  observed_at = new Date().toISOString(),
} = {}) {
  const body = clean(text);
  const platformMatches = matchNames(body, IBM_I_PLATFORM_PATTERNS);
  const languageMatches = matchNames(body, LANGUAGE_PATTERNS);
  const integrationMatches = matchNames(body, INTEGRATION_PATTERNS);
  const changeMatches = matchNames(body, CHANGE_PATTERNS);
  const hiringMatches = matchNames(body, HIRING_PATTERNS);
  const release = exactRelease(body);
  const quality = sourceQuality(source_type);

  let score = 0;
  if (platformMatches.length) score += 34;
  score += Math.min(24, languageMatches.length * 6);
  score += Math.min(12, integrationMatches.length * 4);
  score += Math.min(10, changeMatches.length * 2);
  if (hiringMatches.length) score += 8;
  score += Math.round(quality * 0.12);
  score = Math.max(0, Math.min(100, score));

  const strongTechnologyEvidence = platformMatches.length > 0 && languageMatches.length > 0;
  const technologyUseState = strongTechnologyEvidence
    ? 'observed_public_strong'
    : platformMatches.length
      ? 'observed_public_platform_only'
      : 'not_established';

  const releaseState = release ? 'observed_public_exact_release' : 'unknown';
  const recommendedOffer = release === '7.4'
    ? 'ibmi_74_deadline_xray_250'
    : 'ibmi_estate_xray_250';

  return {
    schema: 'evercraft.ibmi.direct-buyer-signal.v1',
    company: clean(company) || null,
    url: clean(url) || null,
    source_type: clean(source_type) || 'public',
    evidence_quality: quality,
    score,
    technology_use_state: technologyUseState,
    release_state: releaseState,
    observed_release: release,
    buying_intent_state: 'unknown',
    budget_state: 'unknown',
    upgrade_need_state: release === '7.4' && changeMatches.length
      ? 'possible_public_signal_not_confirmed'
      : 'unknown',
    hiring_signal: hiringMatches.length > 0,
    evidence: {
      platform_match_count: platformMatches.length,
      language_match_count: languageMatches.length,
      integration_match_count: integrationMatches.length,
      change_match_count: changeMatches.length,
      hiring_match_count: hiringMatches.length,
    },
    recommended_offer_key: recommendedOffer,
    outreach_state: score >= 75 && strongTechnologyEvidence ? 'research_candidate' : 'hold',
    human_review_required: true,
    doctrine: {
      technology_use_does_not_equal_buying_intent: true,
      hiring_does_not_equal_upgrade_need: true,
      exact_release_must_be_observed_not_inferred: true,
      named_outreach_requires_verified_contact_and_human_gate: true,
      private_system_access_requires_explicit_authorization: true,
    },
    observed_at,
  };
}
