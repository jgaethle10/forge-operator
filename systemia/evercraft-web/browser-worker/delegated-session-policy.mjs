const ALLOWED_SCOPES = new Set([
  "read",
  "same_origin_navigation",
  "draft_form_fill",
  "draft_save",
]);

const BLOCKED_CONTROL_PATTERNS = [
  /\baccept\b/i,
  /\bagree\b/i,
  /\bterms?\b/i,
  /\bconditions?\b/i,
  /\bjoin(?:\s+the)?\s+hackathon\b/i,
  /\bregister\b/i,
  /\benter\s+(?:the\s+)?(?:hackathon|competition|contest)\b/i,
  /\bsubmit\b/i,
  /\bfinali[sz]e\b/i,
  /\bcertif(?:y|ication)\b/i,
  /\battest(?:ation)?\b/i,
  /\beligibilit(?:y|ies)\b/i,
  /\bauthorized\s+representative\b/i,
  /\bpay(?:ment)?\b/i,
  /\bpurchase\b/i,
  /\bbuy\b/i,
  /\bcheckout\b/i,
  /\bstak(?:e|ing)\b/i,
  /\bpassword\b/i,
  /\bpasscode\b/i,
  /\bone[-\s]?time\s+code\b/i,
  /\botp\b/i,
  /\bmfa\b/i,
  /\b2fa\b/i,
  /\btwo[-\s]?factor\b/i,
  /\bcaptcha\b/i,
  /\bsecurity\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bwithdraw\b/i,
  /\bpublish\b/i,
  /\bsend\b/i,
  /\bconfirm\b/i,
  /\bupgrade\b/i,
  /\bbilling\b/i,
];

const BLOCKED_INPUT_PATTERNS = [
  /password/i,
  /passcode/i,
  /one[-_\s]?time[-_\s]?code/i,
  /otp/i,
  /mfa/i,
  /2fa/i,
  /captcha/i,
  /credit[-_\s]?card/i,
  /card[-_\s]?number/i,
  /cvv/i,
  /cvc/i,
  /routing/i,
  /bank[-_\s]?account/i,
  /ssn/i,
  /social[-_\s]?security/i,
];

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniq(values, max = 20) {
  return [...new Set((values || []).map(clean).filter(Boolean))].slice(0, max);
}

function normalizeOrigin(value) {
  try {
    return new URL(String(value || "")).origin;
  } catch {
    throw new Error("delegation_invalid_origin");
  }
}

export function normalizeDelegationPolicy(input = {}, { currentUrl, sessionExpiresAt } = {}) {
  const currentOrigin = normalizeOrigin(currentUrl);
  const requestedScopes = uniq(input.scopes || ["read", "same_origin_navigation", "draft_form_fill", "draft_save"]);
  for (const scope of requestedScopes) {
    if (!ALLOWED_SCOPES.has(scope)) throw new Error("delegation_scope_not_allowed");
  }

  const requestedOrigins = uniq(input.allowed_origins || [currentOrigin]).map(normalizeOrigin);
  if (!requestedOrigins.includes(currentOrigin)) requestedOrigins.unshift(currentOrigin);
  if (requestedOrigins.some((origin) => origin !== currentOrigin)) {
    throw new Error("delegation_cross_origin_not_allowed_v1");
  }

  const now = Date.now();
  const sessionExpiry = Date.parse(String(sessionExpiresAt || ""));
  const requestedTtl = Number(input.ttl_ms || 15 * 60_000);
  const ttlMs = Math.max(60_000, Math.min(30 * 60_000, Number.isFinite(requestedTtl) ? requestedTtl : 15 * 60_000));
  const expiresAt = Math.min(Number.isFinite(sessionExpiry) ? sessionExpiry : now + ttlMs, now + ttlMs);

  return {
    schema: "evercraft.browser.delegation-policy.v1",
    mode: "competition_draft_automation",
    allowed_origins: [currentOrigin],
    scopes: requestedScopes,
    expires_at: new Date(expiresAt).toISOString(),
    accepts_new_terms: false,
    payment_authority: false,
    staking_authority: false,
    account_security_authority: false,
    identity_or_mfa_authority: false,
    captcha_bypass_authority: false,
    secret_entry_authority: false,
    final_submission_authority: false,
    persisted_profile: false,
  };
}

export function normalizeDelegatedBrowserAction(input = {}) {
  const type = clean(input.type);
  if (type === "wait") {
    const ms = Math.max(0, Math.min(5000, Math.trunc(Number(input.ms) || 500)));
    return { type, ms };
  }
  if (type === "scroll") {
    const x = Math.max(-5000, Math.min(5000, Math.trunc(Number(input.x) || 0)));
    const y = Math.max(-5000, Math.min(5000, Math.trunc(Number(input.y) || 700)));
    return { type, x, y };
  }
  if (type === "navigate") {
    const url = clean(input.url);
    if (!url) throw new Error("delegated_navigation_url_required");
    return { type, url };
  }
  if (type === "click") {
    const selector = clean(input.selector);
    const intent = clean(input.intent || "nonbinding");
    if (!selector || selector.length > 512) throw new Error("delegated_selector_invalid");
    if (!["nonbinding", "draft_save"].includes(intent)) throw new Error("delegated_click_intent_not_allowed");
    return { type, selector, intent };
  }
  if (type === "fill") {
    const selector = clean(input.selector);
    const value = String(input.value ?? "");
    if (!selector || selector.length > 512) throw new Error("delegated_selector_invalid");
    if (value.length > 12000) throw new Error("delegated_fill_value_too_long");
    return { type, selector, value, intent: "non_secret_field" };
  }
  throw new Error("unsupported_delegated_browser_action");
}

function combinedElementText(meta = {}) {
  return [
    meta.tag,
    meta.text,
    meta.name,
    meta.id,
    meta.aria_label,
    meta.title,
    meta.placeholder,
    meta.autocomplete,
    meta.role,
    meta.form_action,
  ].map(clean).join(" ");
}

export function assertDelegatedElementAllowed(action, meta = {}) {
  const haystack = combinedElementText(meta);
  if (BLOCKED_CONTROL_PATTERNS.some((pattern) => pattern.test(haystack))) {
    throw new Error("delegated_sensitive_control_blocked");
  }
  if (action.type === "fill") {
    const inputHaystack = [meta.type, haystack].map(clean).join(" ");
    if (String(meta.type || "").toLowerCase() === "password") throw new Error("delegated_secret_field_blocked");
    if (String(meta.autocomplete || "").toLowerCase() === "one-time-code") throw new Error("delegated_identity_field_blocked");
    if (BLOCKED_INPUT_PATTERNS.some((pattern) => pattern.test(inputHaystack))) {
      throw new Error("delegated_sensitive_field_blocked");
    }
  }
  if (action.type === "click") {
    const tag = String(meta.tag || "").toLowerCase();
    const role = String(meta.role || "").toLowerCase();
    const isLink = tag === "a" || role === "link";
    if (action.intent === "nonbinding" && !isLink) {
      throw new Error("delegated_nonbinding_click_requires_link");
    }
    if (action.intent === "draft_save" && isLink) {
      throw new Error("delegated_draft_save_requires_control");
    }
    if (action.intent === "draft_save" && !/save\s+draft|save\s+changes|save/i.test(haystack)) {
      throw new Error("delegated_draft_save_control_unverified");
    }
  }
  return true;
}

export function assertDelegatedNavigationAllowed(action, policy, currentUrl) {
  if (action.type !== "navigate") return true;
  if (!policy?.scopes?.includes("same_origin_navigation")) throw new Error("delegated_navigation_scope_missing");
  const currentOrigin = normalizeOrigin(currentUrl);
  const targetOrigin = normalizeOrigin(action.url);
  if (targetOrigin !== currentOrigin || !(policy.allowed_origins || []).includes(targetOrigin)) {
    throw new Error("delegated_cross_origin_navigation_blocked");
  }
  return true;
}

export function delegationReceipt({ sessionId, policy }) {
  return {
    schema: "evercraft.browser.delegation-receipt.v1",
    session_id: String(sessionId || ""),
    mode: policy.mode,
    allowed_origins: policy.allowed_origins,
    scopes: policy.scopes,
    expires_at: policy.expires_at,
    accepts_new_terms: false,
    payment_authority: false,
    staking_authority: false,
    account_security_authority: false,
    identity_or_mfa_authority: false,
    captcha_bypass_authority: false,
    secret_entry_authority: false,
    final_submission_authority: false,
    secret_material_recorded: false,
  };
}
