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
  if (entry.status !== 'UNKNOWN' && !entry.public_url && !entry.evidence?.listing_url) findings.push({key:entry.key,issue:'NO_SOURCE_URL'});
  if (entry.status === 'PUBLISHED' && entry.current_release_verified !== true) findings.push({key:entry.key,issue:'PUBLIC_RELEASE_NOT_ATTESTED'});
}
const receipt = {schema:'evercraft.distribution.publisher-audit.v1', generated_at:new Date().toISOString(), total:ledger.entries.length, statuses:Object.fromEntries([...allowed].map(s=>[s,ledger.entries.filter(e=>e.status===s).length]).filter(([,n])=>n)), findings, status:findings.length?'BLOCKED':'VALID_LEDGER_NOT_OWNERSHIP_PROOF'};
writeFileSync(output,JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
if (findings.length) process.exitCode=1;
