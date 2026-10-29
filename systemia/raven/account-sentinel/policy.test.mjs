import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { evaluateFinancialAgentRequest, signedGrantMessage } from './policy.mjs';
const {publicKey, privateKey} = generateKeyPairSync('ed25519');
const {privateKey: rogueKey} = generateKeyPairSync('ed25519');
const publicPem = publicKey.export({format:'pem', type:'spki'});
const NOW = '2026-10-23T22:00:00.000Z';
const claims = {
  schema:'evercraft.account-sentinel.grant.v1', grant_id:'consent-42',
  subject_id:'person-1', agent_id:'verified-agent-1', connector_id:'bank-api-1',
  account_refs:['opaque-account-1'], scopes:['accounts:read','balances:read'],
  issued_at:'2026-10-23T21:59:00.000Z', expires_at:'2026-10-23T23:00:00.000Z'
};
const grant = (cl=claims, key=privateKey) => ({schema:'evercraft.account-sentinel.signed-grant.v1',
  key_id:'issuer-1', claims:cl, signature_base64:sign(null,signedGrantMessage(cl),key).toString('base64')});
const base = {
  request: { schema:'evercraft.account-sentinel.request.v1', operation:'balance.read',
    method:'GET',account_ref:'opaque-account-1',connector_id:'bank-api-1' },
  signedGrant:grant(), trustedPublicKeys:{'issuer-1':publicPem},
  trustedPrincipal:{authenticated:true,auth_source:'evercraft_identity',subject_id:'person-1',agent_id:'verified-agent-1'},
  trustedConnector:{connector_id:'bank-api-1',status:'active',mode:'delegated_oauth',approved:true,
    read_only:true,scopes:['accounts:read','balances:read']},
  trustedRevocations:{fresh:true,revoked_ids:new Set()}, now:new Date(NOW)
};
let count=0;
const check = (description, mutate, allowed=false, reason=null) => {
  const v={...base, request:{...base.request},trustedPrincipal:{...base.trustedPrincipal},
    trustedConnector:{...base.trustedConnector},trustedRevocations:{...base.trustedRevocations}};
  mutate(v);
  const result=evaluateFinancialAgentRequest(v);
  assert.equal(result.allowed,allowed,description);
  if(reason) assert.equal(result.reason,reason,description);
  count++;
};
check('approved read',()=>{},true,'scoped_consent_verified');
check('transfer forbidden even if consent signed',v=>{v.request.operation='transfer.create';},false,'financial_write_or_unknown_operation_forbidden');
check('new payee forbidden',v=>{v.request.operation='payee.create';});
check('unknown tool forbidden',v=>{v.request.operation='api.anything';});
check('POST forbidden',v=>{v.request.method='POST';});
check('missing consent',v=>{v.signedGrant=null;});
check('unknown signer',v=>{v.signedGrant={...v.signedGrant,key_id:'rogue'};});
check('fake signature',v=>{v.signedGrant=grant(claims,rogueKey);});
check('signed consent amount tampering',v=>{v.signedGrant={...v.signedGrant,claims:{...claims,scopes:[...claims.scopes,'transactions:read']}};});
check('other account denied',v=>{v.request.account_ref='another-account';});
check('other agent denied',v=>{v.trustedPrincipal.agent_id='different-agent';});
check('principal absent',v=>{v.trustedPrincipal=null;});
check('connector disabled',v=>{v.trustedConnector.status='disabled';});
check('password-based connector denied',v=>{v.trustedConnector.mode='shared_password';});
check('unapproved connector denied',v=>{v.trustedConnector.approved=false;});
check('connector missing scope',v=>{v.trustedConnector.scopes=['accounts:read'];});
check('signed grant missing permission',v=>{v.request.operation='transactions.read'; v.trustedConnector.scopes.push('transactions:read');});
check('revoke grant',v=>{v.trustedRevocations.revoked_ids=new Set(['consent-42']);},false,'consent_revoked');
check('revocation service down',v=>{v.trustedRevocations.fresh=false;},false,'revocation_check_unavailable');
check('expired',v=>{v.now=new Date('2026-10-24T00:00:00.000Z');},false,'expired_or_invalid_consent');
check('future dating',v=>{v.now=new Date('2026-10-22T00:00:00.000Z');},false,'expired_or_invalid_consent');
check('disallow extra request parameters',v=>{v.request.secret='nope';},false,'invalid_request');
check('deny missing trusted connector',v=>{v.trustedConnector=null;});
check('deny false identity source',v=>{v.trustedPrincipal.auth_source='agent_self_assertion';});
console.log(`PASS ${count} Account Sentinel policy tests (no live accounts accessed)`);
