#!/usr/bin/env node
// Fail-closed publisher inventory audit. No login, claims, submissions or external mutations.
import { readFileSync, writeFileSync } from 'node:fs';
const input = process.argv[2] || 'systemia/distribution/publisher-ownership.json';
const output = process.argv[3] || '/tmp/evercraft-publisher-audit.json';
const allowed = new Set(['DISCOVERED','CLAIM_REQUIRED','VERIFICATION_PENDING','CLAIMED','SUBMITTED','APPROVED','PUBLISHED','STALE','REJECTED','POLICY_BLOCKED','UNKNOWN']);
const proofStates = new Set(['CLAIMED','SUBMITTED','APPROVED','PUBLISHED']);
const ledger = JSON.parse(readFileSync(input, 'utf8'));
if (ledger.schema !== 'evercraft.distribution.publisher-ownership.v1' || !Array.isArray(ledger.entries)) throw Error('invalid ledger');
const seen = new Set(), findings = [];
for (const entry of ledger.entries) {
  if (!entry.key || seen.has(entry.key)) throw Error('missing or duplicate publisher key');
  seen.add(entry.key);
  if (!allowed.has(entry.status)) throw Error('unknown publisher status: '+entry.key);
  if (proofStates.has(entry.status) && (!entry.evidence?.receipt_url || !entry.evidence?.verified_at)) findings.push({key:entry.key,issue:'MISSING_PUBLISHER_RECEIPT'});
  // Private personal plugins have backend IDs, not public listing URLs. A private
  // record must never be promoted to public ownership simply because it is installed.
  const privateInventory = entry.visibility === 'PRIVATE' && entry.internal_plugin_id
    && entry.evidence?.source && ['DISCOVERED','UNKNOWN'].includes(entry.status);
  if (entry.status !== 'UNKNOWN' && !entry.public_url && !entry.evidence?.listing_url && !privateInventory) {
    findings.push({key:entry.key,issue:'NO_SOURCE_URL_OR_PRIVATE_ID_EVIDENCE'});
  }
  if (entry.visibility === 'PRIVATE' && proofStates.has(entry.status)) {
    findings.push({key:entry.key,issue:'PRIVATE_RECORD_CANNOT_ASSERT_PUBLIC_RELEASE'});
  }
  if (entry.status === 'PUBLISHED' && entry.current_release_verified !== true) findings.push({key:entry.key,issue:'PUBLIC_RELEASE_NOT_ATTESTED'});
}
const receipt = {schema:'evercraft.distribution.publisher-audit.v1', generated_at:new Date().toISOString(), total:ledger.entries.length, statuses:Object.fromEntries([...allowed].map(s=>[s,ledger.entries.filter(e=>e.status===s).length]).filter(([,n])=>n)), findings, status:findings.length?'BLOCKED':'VALID_LEDGER_NOT_OWNERSHIP_PROOF'};
writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if (findings.length) process.exitCode=1;
