import { evaluateFinancialAgentRequest } from './policy.mjs';

const requestKeys = ['schema', 'operation', 'account_ref', 'connector_id', 'method'];
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const deny = (reason, receipt = null) => ({
  allowed: false, decision: 'deny', reason, receipt, data: null,
});

/**
 * Demo/integration policy gateway. Dependencies are privileged server-side
 * providers, NEVER controlled by the requesting agent or LLM.
 *
 * This is not a bank API or a production identity/consent service. Rechecking
 * just before release reduces stale-authority exposure, but does NOT offer
 * atomic bank-side revocation or block clients bypassing this gateway.
 */
export function createAccountSentinelGateway({
  identity, consent, connectors, revocations, bankReader, audit,
  trustedPublicKeys, clock = () => new Date(),
}) {
  if (![identity?.resolve, consent?.get, connectors?.get, revocations?.snapshot,
    bankReader?.read, audit?.append].every(x => typeof x === 'function')) {
    throw new Error('required_privileged_provider_missing');
  }
  if (!trustedPublicKeys || typeof trustedPublicKeys !== 'object') {
    throw new Error('trusted_signer_registry_missing');
  }
  const record = async event => {
    const receipt = await audit.append(event);
    if (!receipt?.hash || typeof receipt.hash !== 'string' ||
        !/^[a-f0-9]{64}$/.test(receipt.hash)) throw new Error('audit_receipt_missing');
    return receipt;
  };
  const resolveAuthority = async input => {
    const [trustedPrincipal, signedGrant, trustedConnector, trustedRevocations] =
      await Promise.all([
        identity.resolve(input.session_proof),
        consent.get(input.grant_ref),
        connectors.get(input.request.connector_id),
        revocations.snapshot(),
      ]);
    const decision = evaluateFinancialAgentRequest({
      request: input.request, signedGrant, trustedPublicKeys, trustedPrincipal,
      trustedConnector, trustedRevocations, now: clock(),
    });
    return { decision, signedGrant };
  };

  return Object.freeze({
    async read(input) {
      // An external caller may not smuggle privileged context into the request.
      if (!exact(input, ['session_proof', 'grant_ref', 'request']) ||
          typeof input.session_proof !== 'string' || !input.session_proof ||
          typeof input.grant_ref !== 'string' || !input.grant_ref ||
          !exact(input.request, requestKeys)) return deny('invalid_gateway_request');

      const { request } = input;
      const auditBase = {
        operation: typeof request.operation === 'string' ? request.operation : 'invalid',
      };
      let first;
      try {
        first = await resolveAuthority(input);
      } catch {
        first = { decision: { allowed: false, reason: 'authority_lookup_unavailable' } };
      }
      let receipt;
      try {
        receipt = await record({
          ...auditBase, kind: first.decision.allowed ? 'preauthorized' : 'denied',
          reason: first.decision.reason,
        });
      } catch {
        // Bank adapter never called if recording authorization itself fails.
        return deny('audit_unavailable');
      }
      if (!first.decision.allowed) return deny(first.decision.reason, receipt);

      let data;
      try {
        // Credentials and authentication NEVER originate in agent input.
        data = await bankReader.read({
          operation: request.operation, account_ref: request.account_ref,
          connector_id: request.connector_id,
        });
      } catch {
        try { receipt = await record({ ...auditBase, kind: 'read_failed',
          reason: 'provider_error' }); } catch { /* never leak provider response */ }
        return deny('provider_or_audit_error', receipt);
      }

      // A grant can be revoked or the connector disabled while a slow bank
      // API call is in flight. Revalidate all privileged authority before
      // releasing any of the returned information to the agent.
      let current;
      try {
        current = await resolveAuthority(input);
      } catch {
        current = { decision: { allowed: false, reason: 'authority_lookup_unavailable' } };
      }
      const sameGrant = current.decision.allowed &&
        current.decision.grant_id === first.decision.grant_id &&
        current.signedGrant?.key_id === first.signedGrant?.key_id &&
        current.signedGrant?.signature_base64 === first.signedGrant?.signature_base64;
      if (!sameGrant) {
        const reason = current.decision.allowed ? 'grant_changed_during_read' :
          'authority_changed_during_read';
        try {
          receipt = await record({ ...auditBase, kind: 'read_withheld', reason });
        } catch { return deny('audit_unavailable'); }
        return deny(reason, receipt);
      }

      try {
        // Never release data if the final evidence write fails.
        receipt = await record({ ...auditBase, kind: 'read_completed', reason: 'ok' });
        return {
          allowed: true, decision: 'allow_read_only', reason: 'scoped_consent_verified',
          data, receipt,
        };
      } catch {
        return deny('audit_unavailable');
      }
    },
  });
}
