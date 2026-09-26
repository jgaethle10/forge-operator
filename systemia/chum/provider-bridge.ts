import crypto from 'node:crypto';

export const CONSUMER_PROBE_PROVIDERS = ['chatgpt', 'claude', 'gemini', 'copilot', 'perplexity', 'grok'] as const;
export type ConsumerProbeProvider = typeof CONSUMER_PROBE_PROVIDERS[number];

type FetchLike = typeof fetch;
type EnvLike = Record<string, string | undefined>;

export type ProbeBridgeAuthInput = {
  authorization?: string;
  repository?: string;
  runId?: string;
  sha?: string;
};

type ProbeBridgeOptions = {
  env?: EnvLike;
  fetchImpl?: FetchLike;
};

type OidcCache = {
  expiresAt: number;
  issuer: string;
  jwksUri: string;
  keys: any[];
};

let githubOidcCache: OidcCache | null = null;

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const GITHUB_OIDC_CONFIG = `${GITHUB_OIDC_ISSUER}/.well-known/openid-configuration`;

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function bearerToken(header = ''): string {
  const match = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return match?.[1]?.trim() || '';
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function providerPrefix(provider: string): string {
  return `CHUM_${provider.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_PROBE_ADAPTER`;
}

function safeHttpsUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function adapterConfig(provider: string, env: EnvLike) {
  const prefix = providerPrefix(provider);
  const url = safeHttpsUrl(env[`${prefix}_URL`]);
  const token = String(env[`${prefix}_TOKEN`] || '').trim();
  return {
    configured: Boolean(url && token),
    url,
    token
  };
}

function decodeJwtPart(value: string): any {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function oidcAudience(env: EnvLike): string {
  return String(env.CHUM_PROBE_BRIDGE_OIDC_AUDIENCE || 'evercraft-chum-provider-bridge').trim();
}

async function githubOidcKeys(fetchImpl: FetchLike): Promise<OidcCache> {
  if (fetchImpl === fetch && githubOidcCache && githubOidcCache.expiresAt > Date.now()) {
    return githubOidcCache;
  }

  const configResponse = await fetchImpl(GITHUB_OIDC_CONFIG, {
    headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM-Provider-Bridge/1.0' }
  });
  if (!configResponse.ok) throw new Error('github_oidc_configuration_unavailable');
  const config = await configResponse.json() as any;
  if (String(config?.issuer || '') !== GITHUB_OIDC_ISSUER) throw new Error('github_oidc_issuer_mismatch');

  const jwksUri = safeHttpsUrl(config?.jwks_uri);
  if (!jwksUri || new URL(jwksUri).hostname !== 'token.actions.githubusercontent.com') {
    throw new Error('github_oidc_jwks_uri_invalid');
  }

  const jwksResponse = await fetchImpl(jwksUri, {
    headers: { accept: 'application/json', 'user-agent': 'Evercraft-CHUM-Provider-Bridge/1.0' }
  });
  if (!jwksResponse.ok) throw new Error('github_oidc_jwks_unavailable');
  const jwks = await jwksResponse.json() as any;
  const cache = {
    expiresAt: Date.now() + 5 * 60 * 1000,
    issuer: GITHUB_OIDC_ISSUER,
    jwksUri,
    keys: Array.isArray(jwks?.keys) ? jwks.keys : []
  };
  if (fetchImpl === fetch) githubOidcCache = cache;
  return cache;
}

async function verifyGithubOidcToken(token: string, env: EnvLike, fetchImpl: FetchLike): Promise<any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('github_oidc_token_malformed');

  const header = decodeJwtPart(parts[0]);
  const claims = decodeJwtPart(parts[1]);
  if (header?.alg !== 'RS256' || !header?.kid) throw new Error('github_oidc_token_header_invalid');

  const oidc = await githubOidcKeys(fetchImpl);
  const jwk = oidc.keys.find((key: any) => key?.kid === header.kid && key?.kty === 'RSA');
  if (!jwk) throw new Error('github_oidc_signing_key_not_found');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    publicKey,
    Buffer.from(parts[2], 'base64url')
  );
  if (!validSignature) throw new Error('github_oidc_signature_invalid');

  const now = Math.floor(Date.now() / 1000);
  if (String(claims?.iss || '') !== GITHUB_OIDC_ISSUER) throw new Error('github_oidc_claim_issuer_invalid');
  if (!Number.isFinite(Number(claims?.exp)) || Number(claims.exp) < now - 30) throw new Error('github_oidc_token_expired');
  if (claims?.nbf != null && Number(claims.nbf) > now + 30) throw new Error('github_oidc_token_not_yet_valid');

  const expectedAudience = oidcAudience(env);
  const audiences = Array.isArray(claims?.aud) ? claims.aud.map(String) : [String(claims?.aud || '')];
  if (!audiences.includes(expectedAudience)) throw new Error('github_oidc_audience_invalid');

  return claims;
}

export function providerBridgeHealth(env: EnvLike = process.env) {
  return {
    schema: 'evercraft.chum.provider-bridge-health.v1',
    service: 'CHUM authorized provider bridge',
    github_actions_oidc_enabled: String(env.CHUM_PROBE_BRIDGE_GITHUB_OIDC || 'true').toLowerCase() !== 'false',
    github_actions_oidc_audience: oidcAudience(env),
    static_token_configured: Boolean(String(env.CHUM_PROBE_BRIDGE_INBOUND_TOKEN || '').trim()),
    providers: CONSUMER_PROBE_PROVIDERS.map((provider) => ({
      provider,
      surface: 'consumer_chat',
      adapter_configured: adapterConfig(provider, env).configured
    })),
    boundaries: {
      generic_agent_is_separate_machine_client_lane: true,
      provider_api_is_not_consumer_ui_behavior: true,
      raw_provider_credentials_returned: false,
      raw_session_tokens_returned: false,
      consequential_external_actions_allowed: false
    }
  };
}

export async function authenticateProviderBridgeRequest(
  input: ProbeBridgeAuthInput,
  options: ProbeBridgeOptions = {}
): Promise<{ ok: true; mode: string; run_id?: string } | { ok: false; status: number; error: string }> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const token = bearerToken(input.authorization);
  if (!token) return { ok: false, status: 401, error: 'missing_bearer_token' };

  const staticToken = String(env.CHUM_PROBE_BRIDGE_INBOUND_TOKEN || '').trim();
  if (staticToken && safeEqual(token, staticToken)) {
    return { ok: true, mode: 'static_token' };
  }

  const oidcEnabled = String(env.CHUM_PROBE_BRIDGE_GITHUB_OIDC || 'true').toLowerCase() !== 'false';
  if (!oidcEnabled) return { ok: false, status: 401, error: 'bridge_auth_failed' };

  const expectedRepository = String(env.CHUM_PROBE_BRIDGE_GITHUB_REPOSITORY || 'jgaethle10/forge-operator').trim();
  const repository = String(input.repository || '').trim();
  const runId = String(input.runId || '').trim();
  const sha = String(input.sha || '').trim().toLowerCase();
  if (repository !== expectedRepository || !/^\d+$/.test(runId) || !/^[a-f0-9]{40}$/.test(sha)) {
    return { ok: false, status: 401, error: 'invalid_github_actions_identity_headers' };
  }

  try {
    const claims = await verifyGithubOidcToken(token, env, fetchImpl);
    const allowedEvents = new Set(['push', 'schedule', 'workflow_dispatch']);
    if (
      String(claims?.repository || '') !== expectedRepository ||
      String(claims?.ref || '') !== 'refs/heads/main' ||
      String(claims?.sha || '').toLowerCase() !== sha ||
      String(claims?.run_id || '') !== runId ||
      !allowedEvents.has(String(claims?.event_name || ''))
    ) {
      return { ok: false, status: 401, error: 'github_actions_oidc_identity_mismatch' };
    }
    return { ok: true, mode: 'github_actions_oidc', run_id: runId };
  } catch (error) {
    return {
      ok: false,
      status: 401,
      error: error instanceof Error ? error.message : 'github_actions_oidc_verification_failed'
    };
  }
}

function validateProbe(body: any): { provider: ConsumerProbeProvider; surface: 'consumer_chat'; prompt: string } {
  const provider = String(body?.provider || '').trim() as ConsumerProbeProvider;
  if (!CONSUMER_PROBE_PROVIDERS.includes(provider)) throw new Error('provider_not_supported_by_consumer_bridge');
  if (String(body?.surface || '') !== 'consumer_chat') throw new Error('consumer_bridge_requires_consumer_chat_surface');
  if (body?.clean_session !== true) throw new Error('clean_session_required');
  const prompt = String(body?.prompt || '').trim();
  if (prompt.length < 3 || prompt.length > 8000) throw new Error('prompt_length_invalid');
  if (
    body?.constraints?.no_brand_seed !== true ||
    body?.constraints?.no_prior_context !== true ||
    body?.constraints?.no_external_actions !== true
  ) {
    throw new Error('probe_constraints_required');
  }
  return { provider, surface: 'consumer_chat', prompt };
}

function sanitizeCitations(value: unknown): Array<{ title: string; url: string }> {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((row: any) => {
    const url = sanitizeUrl(row?.url);
    if (!url) return [];
    return [{ title: String(row?.title || '').slice(0, 500), url }];
  });
}

function sanitizeUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, 30).map(sanitizeUrl).filter(Boolean) as string[])];
}

export async function executeProviderBridgeProbe(
  body: any,
  options: ProbeBridgeOptions = {}
): Promise<any> {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const { provider, surface } = validateProbe(body);
  const adapter = adapterConfig(provider, env);

  if (!adapter.configured || !adapter.url) {
    return {
      status: 'blocked',
      provider,
      surface,
      blocked_reason: 'authorized_provider_adapter_not_configured'
    };
  }

  const controller = new AbortController();
  const timeoutMs = Math.max(5000, Math.min(90000, Number(env.CHUM_PROBE_ADAPTER_TIMEOUT_MS || 45000)));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(adapter.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adapter.token}`,
        'user-agent': 'Evercraft-CHUM-Provider-Bridge/1.0'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const raw = await response.text();
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch {}

    const adapterStatus = String(parsed?.status || (response.ok ? 'completed' : 'failed'));
    const status = ['completed', 'blocked', 'failed'].includes(adapterStatus)
      ? adapterStatus
      : (response.ok ? 'completed' : 'failed');
    const citations = sanitizeCitations(parsed?.citations);
    const urls = sanitizeUrls(parsed?.urls);
    const adapterReceiptHash = parsed?.provider_receipt == null
      ? null
      : sha256(JSON.stringify(parsed.provider_receipt));

    return {
      status,
      provider,
      surface,
      session_ref: parsed?.session_ref ? `sha256:${sha256(parsed.session_ref)}` : null,
      text: String(parsed?.text || '').slice(0, 120000),
      citations,
      urls,
      screenshot_ref: null,
      provider_receipt: {
        schema: 'evercraft.chum.provider-bridge-receipt.v1',
        provider,
        surface,
        adapter_http_status: response.status,
        adapter_response_sha256: sha256(raw),
        adapter_receipt_sha256: adapterReceiptHash,
        observed_at: new Date().toISOString()
      },
      blocked_reason: status === 'blocked' ? String(parsed?.blocked_reason || 'provider_adapter_blocked').slice(0, 500) : null,
      error: status === 'failed'
        ? String(parsed?.error || (!response.ok ? `HTTP ${response.status}` : 'provider_adapter_failed')).slice(0, 500)
        : null
    };
  } finally {
    clearTimeout(timer);
  }
}
