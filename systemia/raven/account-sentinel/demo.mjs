import { generateKeyPairSync, sign } from 'node:crypto';
import { signedGrantMessage } from './policy.mjs';
import { createAccountSentinelGateway } from './gateway.mjs';
import { createDemoAuditLedger } from './ledger.mjs';
import { createSandboxBankReader } from './sandbox-bank-reader.mjs';

export const DEMO_SCENARIOS = Object.freeze([
  { id: 'authorized', label: 'Authorized balance read', detail: 'Properly signed, narrowly scoped request' },
  { id: 'transfer', label: 'Agent attempts transfer', detail: 'No financial writes allowed' },
  { id: 'rogue', label: 'Unrecognized agent', detail: 'Identity mismatch' },
  { id: 'revoked', label: 'Consent revoked', detail: 'Previously valid permission is disabled' },
  { id: 'expired', label: 'Expired consent', detail: 'Consent validity window enforced' },
  { id: 'tampered', label: 'Consent tampered', detail: 'Modified signature claims rejected' },
  { id: 'other_account', label: 'Wrong bank account', detail: 'Access outside original grant' },
  { id: 'missing_scope', label: 'Missing transaction scope', detail: 'Read permission limited to balances' },
  { id: 'connector_offline', label: 'Connector disconnected', detail: 'Registry fails closed' },
  { id: 'revocation_offline', label: 'Revocation service offline', detail: 'Cannot confirm consent is valid' },
  { id: 'audit_offline', label: 'Audit system offline', detail: 'No bank read without evidence trail' },
  { id: 'provider_offline', label: 'Bank adapter fails', detail: 'Failure produces no account data' },
  { id: 'revoked_during_read', label: 'Consent revoked during read', detail: 'Data withheld after bank response' },
  { id: 'connector_during_read', label: 'Connector disabled during read', detail: 'Access removed while data is in flight' },
  { id: 'identity_during_read', label: 'Agent identity changes', detail: 'Fresh identity required before data release' },
  { id: 'revocation_unavailable_during_read', label: 'Revocation check goes offline', detail: 'Recheck fails closed' },
  { id: 'grant_changed_during_read', label: 'Grant replaced during read', detail: 'Mid-request permission substitution blocked' },
  { id: 'audit_after_read', label: 'Audit goes offline after read', detail: 'No data disclosure without final receipt' },
]);

const LATE_CHANGE = new Set([
  'revoked_during_read', 'connector_during_read', 'identity_during_read',
  'revocation_unavailable_during_read', 'grant_changed_during_read',
]);

export function expectedSimulatedProviderReads(id) {
  return id === 'authorized' || id === 'provider_offline' || id === 'audit_after_read' ||
    LATE_CHANGE.has(id) ? 1 : 0;
}

export async function runDemoScenario(scenarioId) {
  if (!DEMO_SCENARIOS.some(s => s.id === scenarioId)) throw new Error('unknown_scenario');
  const now = new Date();
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ format: 'pem', type: 'spki' });
  const dateAt = mins => new Date(now.getTime() + mins * 60_000).toISOString();
  const claims = {
    schema: 'evercraft.account-sentinel.grant.v1',
    grant_id: 'demo-consent-1', subject_id: 'demo-person-1', agent_id: 'demo-agent-1',
    connector_id: 'demo-bank-oauth', account_refs: ['demo-checking'],
    scopes: ['balances:read'], issued_at: dateAt(-5),
    expires_at: scenarioId === 'expired' ? dateAt(-1) : dateAt(30),
  };
  const signClaims = claim => ({
    schema: 'evercraft.account-sentinel.signed-grant.v1', key_id: 'demo-issuer',
    claims: claim,
    signature_base64: sign(null, signedGrantMessage(claim), privateKey).toString('base64'),
  });
  const signed = signClaims(claims);
  if (scenarioId === 'tampered') {
    signed.claims = { ...claims, scopes: ['balances:read', 'transactions:read'] };
  }
  const audit = createDemoAuditLedger();
  const stats = { provider_reads: 0, identities: 0, grants: 0, connectors: 0, revocations: 0 };
  // Saban exercises the actual read-only sandbox egress adapter, not a direct
  // synthetic balance return. Credentials originate from this private fixture.
  const sandboxReader = createSandboxBankReader({
    connector: {
      connector_id: 'demo-bank-oauth', status: 'active', environment: 'sandbox',
      sandbox_only: true, approved: true, read_only: true, mode: 'delegated_oauth',
      api_origin: 'https://sandbox.examplebank.test', scopes: ['balances:read'],
    },
    allowedSandboxOrigins: ['https://sandbox.examplebank.test'],
    tokenVault: { getAccessToken: async () => ({
      schema: 'evercraft.account-sentinel.sandbox-token.v1',
      access_token: 'SYNTHETIC_DEMO_TOKEN_DO_NOT_USE',
      token_type: 'Bearer',
      connector_id: 'demo-bank-oauth', environment: 'sandbox',
      audience: 'https://sandbox.examplebank.test', scopes: ['balances:read'],
      expires_at: dateAt(30),
    }) },
    transport: async (url, options) => {
      stats.provider_reads++;
      if (scenarioId === 'provider_offline') throw Error('synthetic_provider_unavailable');
      if (url !== 'https://sandbox.examplebank.test/v1/accounts/demo-checking/balances' ||
          options.method !== 'GET' || options.redirect !== 'error' ||
          options.headers.authorization !== 'Bearer SYNTHETIC_DEMO_TOKEN_DO_NOT_USE') {
        throw Error('synthetic_provider_request_invalid');
      }
      return Response.json({
        account_label: 'Simulated checking', currency: 'USD',
        available_balance: 2847.22, simulated: true,
        private_token: 'FAKE_SECRET_MUST_NOT_APPEAR_IN_GATEWAY_RESULTS',
      });
    },
  });
  const gateway = createAccountSentinelGateway({
    trustedPublicKeys: { 'demo-issuer': publicPem }, clock: () => now,
    identity: { resolve: async session => {
      stats.identities++;
      return session === 'demo-session-1' ? {
        authenticated: true, auth_source: 'evercraft_identity',
        subject_id: 'demo-person-1',
        agent_id: scenarioId === 'rogue' ||
          (scenarioId === 'identity_during_read' && stats.identities > 1)
          ? 'demo-agent-rogue' : 'demo-agent-1',
      } : null;
    } },
    consent: { get: async ref => {
      stats.grants++;
      if (ref !== 'demo-consent-1') return null;
      if (scenarioId === 'grant_changed_during_read' && stats.grants > 1) {
        return signClaims({ ...claims, expires_at: dateAt(25) });
      }
      return signed;
    } },
    connectors: { get: async () => {
      stats.connectors++;
      return {
        connector_id: 'demo-bank-oauth',
        status: scenarioId === 'connector_offline' ||
          (scenarioId === 'connector_during_read' && stats.connectors > 1)
          ? 'disabled' : 'active',
        mode: 'delegated_oauth', read_only: true, approved: true,
        scopes: ['balances:read'],
      };
    } },
    revocations: { snapshot: async () => {
      stats.revocations++;
      return {
        fresh: scenarioId !== 'revocation_offline' &&
          !(scenarioId === 'revocation_unavailable_during_read' && stats.revocations > 1),
        revoked_ids: new Set(scenarioId === 'revoked' ||
          (scenarioId === 'revoked_during_read' && stats.revocations > 1)
          ? ['demo-consent-1'] : []),
      };
    } },
    bankReader: sandboxReader,
    audit: { append: async event => {
      if (scenarioId === 'audit_offline' ||
          (scenarioId === 'audit_after_read' && event.kind === 'read_completed')) {
        throw new Error('simulated_audit_outage');
      }
      return audit.append(event);
    } },
  });
  const request = {
    schema: 'evercraft.account-sentinel.request.v1',
    operation: scenarioId === 'transfer' ? 'transfer.create' :
      scenarioId === 'missing_scope' ? 'transactions.read' : 'balance.read',
    method: 'GET',
    account_ref: scenarioId === 'other_account' ? 'demo-savings' : 'demo-checking',
    connector_id: 'demo-bank-oauth',
  };
  const result = await gateway.read({
    session_proof: 'demo-session-1', grant_ref: 'demo-consent-1', request,
  });
  return {
    scenario: scenarioId, result, provider_reads: stats.provider_reads,
    audit_valid: audit.verify(), audit_events: audit.entries(),
    environment: 'SIMULATION_ONLY',
  };
}
