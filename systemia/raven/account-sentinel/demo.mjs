import { generateKeyPairSync, sign } from 'node:crypto';
import { signedGrantMessage } from './policy.mjs';
import { createAccountSentinelGateway } from './gateway.mjs';
import { createDemoAuditLedger } from './ledger.mjs';

export const DEMO_SCENARIOS = Object.freeze([
  { id: 'authorized', label: 'Authorized balance read', detail: 'Properly signed, narrowly scoped request' },
  { id: 'transfer', label: 'Agent attempts transfer', detail: 'No financial writes allowed' },
  { id: 'rogue', label: 'Unrecognized agent', detail: 'Identity mismatch' },
  { id: 'revoked', label: 'Consent revoked', detail: 'Previously valid permission is disabled' },
  { id: 'expired', label: 'Expired consent', detail: 'Consent validity window enforced' },
  { id: 'tampered', label: 'Consent tampered', detail: 'Modified signature claims rejected' },
  { id: 'other_account', label: 'Wrong bank account', detail: 'Account access outside original grant' },
  { id: 'missing_scope', label: 'Missing transaction scope', detail: 'Read permission limited to balances' },
  { id: 'connector_offline', label: 'Connector disconnected', detail: 'Registry fails closed' },
  { id: 'revocation_offline', label: 'Revocation service offline', detail: 'Cannot confirm consent is valid' },
  { id: 'audit_offline', label: 'Audit system offline', detail: 'No bank read without evidence trail' },
  { id: 'provider_offline', label: 'Bank adapter fails', detail: 'Failure produces no account data' },
]);

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
  const signed = {
    schema: 'evercraft.account-sentinel.signed-grant.v1', key_id: 'demo-issuer', claims,
    signature_base64: sign(null, signedGrantMessage(claims), privateKey).toString('base64'),
  };
  if (scenarioId === 'tampered') {
    // The signature remains tied to the original claims.
    signed.claims = { ...claims, scopes: ['balances:read', 'transactions:read'] };
  }
  const audit = createDemoAuditLedger();
  const stats = { provider_reads: 0 };
  const gateway = createAccountSentinelGateway({
    trustedPublicKeys: { 'demo-issuer': publicPem }, clock: () => now,
    identity: { resolve: async session => session === 'demo-session-1'
      ? { authenticated: true, auth_source: 'evercraft_identity', subject_id: 'demo-person-1',
        agent_id: scenarioId === 'rogue' ? 'demo-agent-rogue' : 'demo-agent-1' }
      : null },
    consent: { get: async ref => ref === 'demo-consent-1' ? signed : null },
    connectors: { get: async () => ({ connector_id: 'demo-bank-oauth',
      status: scenarioId === 'connector_offline' ? 'disabled' : 'active',
      mode: 'delegated_oauth', read_only: true, approved: true, scopes: ['balances:read'] }) },
    revocations: { snapshot: async () => ({ fresh: scenarioId !== 'revocation_offline',
      revoked_ids: new Set(scenarioId === 'revoked' ? ['demo-consent-1'] : []) }) },
    bankReader: { read: async request => {
      stats.provider_reads++;
      if (scenarioId === 'provider_offline') throw new Error('simulated_provider_outage');
      if (request.operation !== 'balance.read' || request.account_ref !== 'demo-checking') {
        throw new Error('unsupported_simulated_read');
      }
      return { account_label: 'Simulated checking', currency: 'USD',
        available_balance: 2847.22, simulated: true };
    } },
    audit: { append: async event => {
      if (scenarioId === 'audit_offline') throw new Error('simulated_audit_outage');
      return audit.append(event);
    } },
  });
  const req = {
    schema: 'evercraft.account-sentinel.request.v1',
    operation: scenarioId === 'transfer' ? 'transfer.create' :
      scenarioId === 'missing_scope' ? 'transactions.read' : 'balance.read',
    method: 'GET', account_ref: scenarioId === 'other_account' ? 'demo-savings' : 'demo-checking',
    connector_id: 'demo-bank-oauth',
  };
  const result = await gateway.read({ session_proof: 'demo-session-1',
    grant_ref: 'demo-consent-1', request: req });
  return {
    scenario: scenarioId, result, provider_reads: stats.provider_reads,
    audit_valid: audit.verify(), audit_events: audit.entries(),
    environment: 'SIMULATION_ONLY',
  };
}
