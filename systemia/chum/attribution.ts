import crypto from 'node:crypto';

export const PUBLIC_ATTRIBUTION_STAGES = ['landing', 'offer_view', 'continue_clicked', 'checkout_started'] as const;
export const TRUSTED_ATTRIBUTION_STAGES = ['payment_verified', 'fulfilled'] as const;
export type AttributionStage =
  | (typeof PUBLIC_ATTRIBUTION_STAGES)[number]
  | (typeof TRUSTED_ATTRIBUTION_STAGES)[number];

type ReferralInput = {
  productKey: string;
  publicId: string;
  providerClaim: string;
  surface: string;
  targetUrl: string;
  intent?: string;
  ttlSeconds?: number;
  now?: Date;
};

type ReferralPayload = {
  schema: 'evercraft.chum.referral.v1';
  referral_id: string;
  product_key: string;
  public_id: string;
  provider_claim: string;
  provider_evidence_state: 'caller_asserted';
  surface: string;
  target_url: string;
  intent_hmac_sha256: string | null;
  issued_at: string;
  expires_at: string;
};

type PaymentEvidence = {
  authority: string;
  verification_ref: string;
  amount_cents: number;
  currency: string;
};

const b64url = (value: string | Buffer) => Buffer.from(value).toString('base64url');
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const sign = (body: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(body).digest('base64url');
const fingerprintIntent = (value: string, secret: string) =>
  crypto.createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex');

function requireSecret(secret: string) {
  if (!secret || secret.length < 24) {
    throw new Error('CHUM attribution secret must be at least 24 characters.');
  }
}

function requireHttps(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error('CHUM attribution targets must use HTTPS.');
  }
  return parsed;
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requirePaymentEvidence(payment: PaymentEvidence | undefined) {
  if (
    !payment ||
    !payment.authority ||
    !payment.verification_ref ||
    !Number.isInteger(payment.amount_cents) ||
    payment.amount_cents < 0 ||
    !/^[A-Za-z]{3}$/.test(payment.currency)
  ) {
    throw new Error(
      'Trusted revenue stages require authoritative verification reference, amount_cents, 3-letter currency, and payment authority.',
    );
  }
  return payment;
}

export function issueReferralToken(input: ReferralInput, secret: string) {
  requireSecret(secret);
  requireHttps(input.targetUrl);

  const now = input.now ?? new Date();
  const ttlSeconds = Math.max(
    60,
    Math.min(input.ttlSeconds ?? 60 * 60 * 24 * 7, 60 * 60 * 24 * 30),
  );
  const expires = new Date(now.getTime() + ttlSeconds * 1000);

  const payload: ReferralPayload = {
    schema: 'evercraft.chum.referral.v1',
    referral_id: crypto.randomUUID(),
    product_key: String(input.productKey || '').trim(),
    public_id: String(input.publicId || '').trim(),
    provider_claim: String(input.providerClaim || 'unknown').trim().toLowerCase(),
    provider_evidence_state: 'caller_asserted',
    surface: String(input.surface || 'unknown').trim().toLowerCase(),
    target_url: input.targetUrl,
    intent_hmac_sha256: input.intent ? fingerprintIntent(input.intent, secret) : null,
    issued_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };

  if (!payload.product_key || !payload.public_id) {
    throw new Error('productKey and publicId are required.');
  }

  const body = b64url(JSON.stringify(payload));
  return {
    token: `${body}.${sign(body, secret)}`,
    payload,
  };
}

export function verifyReferralToken(token: string, secret: string, now = new Date()) {
  requireSecret(secret);
  const [body, signature, extra] = String(token || '').split('.');
  if (!body || !signature || extra) {
    throw new Error('Invalid CHUM referral token shape.');
  }

  const expected = sign(body, secret);
  if (!safeEqual(signature, expected)) {
    throw new Error('Invalid CHUM referral token signature.');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ReferralPayload;
  if (payload.schema !== 'evercraft.chum.referral.v1') {
    throw new Error('Unsupported CHUM referral token schema.');
  }
  if (new Date(payload.expires_at).getTime() <= now.getTime()) {
    throw new Error('CHUM referral token expired.');
  }
  requireHttps(payload.target_url);

  return payload;
}

export function createAttributionEvent(args: {
  token: string;
  secret: string;
  stage: AttributionStage;
  payment?: PaymentEvidence;
  now?: Date;
}) {
  const payload = verifyReferralToken(args.token, args.secret, args.now);
  const now = args.now ?? new Date();
  const tokenHash = sha256(args.token);
  const publicStage = PUBLIC_ATTRIBUTION_STAGES.includes(
    args.stage as (typeof PUBLIC_ATTRIBUTION_STAGES)[number],
  );

  if (publicStage && args.payment) {
    throw new Error('Public attribution stages cannot carry payment evidence.');
  }

  const trustedPayment = TRUSTED_ATTRIBUTION_STAGES.includes(
    args.stage as (typeof TRUSTED_ATTRIBUTION_STAGES)[number],
  )
    ? requirePaymentEvidence(args.payment)
    : null;

  return {
    schema: 'evercraft.chum.attribution-event.v1',
    event_id: crypto.randomUUID(),
    referral_id: payload.referral_id,
    referral_token_sha256: tokenHash,
    product_key: payload.product_key,
    public_id: payload.public_id,
    provider_claim: payload.provider_claim,
    provider_evidence_state: payload.provider_evidence_state,
    surface: payload.surface,
    stage: args.stage,
    occurred_at: now.toISOString(),
    target_host: new URL(payload.target_url).host,
    revenue: trustedPayment
      ? {
          verified: true,
          authority: trustedPayment.authority,
          verification_ref: trustedPayment.verification_ref,
          amount_cents: trustedPayment.amount_cents,
          currency: trustedPayment.currency.toUpperCase(),
        }
      : {
          verified: false,
          amount_cents: 0,
          currency: null,
        },
    doctrine: {
      checkout_is_not_payment: true,
      provider_claim_is_not_provider_pickup_proof: true,
      revenue_requires_authoritative_payment_verification: true,
    },
  };
}

export function summarizeAttribution(events: Array<ReturnType<typeof createAttributionEvent>>) {
  const summary = {
    events: events.length,
    landings: 0,
    offer_views: 0,
    continue_clicks: 0,
    checkout_starts: 0,
    verified_payments: 0,
    fulfilled: 0,
    verified_revenue_cents: 0,
    by_provider_claim: {} as Record<
      string,
      { events: number; verified_payments: number; verified_revenue_cents: number }
    >,
    by_product: {} as Record<
      string,
      { events: number; verified_payments: number; verified_revenue_cents: number }
    >,
  };

  for (const event of events) {
    if (event.stage === 'landing') summary.landings += 1;
    if (event.stage === 'offer_view') summary.offer_views += 1;
    if (event.stage === 'continue_clicked') summary.continue_clicks += 1;
    if (event.stage === 'checkout_started') summary.checkout_starts += 1;
    if (event.stage === 'payment_verified') summary.verified_payments += 1;
    if (event.stage === 'fulfilled') summary.fulfilled += 1;
    if (event.stage === 'payment_verified' && event.revenue.verified) {
      summary.verified_revenue_cents += event.revenue.amount_cents;
    }

    for (const [bucket, key] of [
      [summary.by_provider_claim, event.provider_claim],
      [summary.by_product, event.product_key],
    ] as const) {
      bucket[key] ||= { events: 0, verified_payments: 0, verified_revenue_cents: 0 };
      bucket[key].events += 1;
      if (event.stage === 'payment_verified' && event.revenue.verified) {
        bucket[key].verified_payments += 1;
        bucket[key].verified_revenue_cents += event.revenue.amount_cents;
      }
    }
  }

  return summary;
}
