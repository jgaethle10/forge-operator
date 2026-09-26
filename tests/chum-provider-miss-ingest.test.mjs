import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ingestProviderMisses } from '../systemia/chum/provider-miss-ingest.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-provider-miss-'));
const suitePath=path.join(root,'probe-suite.json');
const receiptPath=path.join(root,'provider-probe.json');
const observationsRoot=path.join(root,'observations');
const summaryPath=path.join(root,'summary.json');

fs.writeFileSync(suitePath,JSON.stringify({
  schema:'evercraft.chum.cross-llm-probe-suite.v1',
  cases:[
    {case_id:'media-test',product_key:'forensiscope',expected_product:'ForensiScope',prompt:'I need long video analysis with timestamps.',expected_fit:true},
    {case_id:'other-test',product_key:'other',expected_product:'Other',prompt:'I need another thing.',expected_fit:true}
  ]
}));

fs.writeFileSync(receiptPath,JSON.stringify({
  schema:'evercraft.chum.cross-llm-run-receipt.v1',
  completed_at:'2026-09-25T23:00:00Z',
  results:[
    {
      probe_id:'media-test:chatgpt',provider:'chatgpt',surface:'consumer_chat',product_key:'forensiscope',case_id:'media-test',status:'completed',
      provider_receipt:{id:'receipt-123'},response_sha256:'abc123',
      evaluation:{expected_fit:true,pickup_observed:false}
    },
    {
      probe_id:'media-test:claude',provider:'claude',surface:'consumer_chat',product_key:'forensiscope',case_id:'media-test',status:'completed',
      provider_receipt:{id:'receipt-456'},response_sha256:'def456',
      evaluation:{expected_fit:true,pickup_observed:true}
    },
    {
      probe_id:'other-test:gemini',provider:'gemini',surface:'consumer_chat',product_key:'other',case_id:'other-test',status:'completed',
      response_sha256:'ghi789',
      evaluation:{expected_fit:true,pickup_observed:false}
    }
  ]
}));

const summary=ingestProviderMisses({probeReceiptPath:receiptPath,probeSuitePath:suitePath,observationsRoot,summaryPath});
assert.equal(summary.created,1);
assert.equal(summary.skipped_pickup_observed,1);
assert.equal(summary.skipped_missing_provider_receipt,1);
const files=fs.readdirSync(observationsRoot);
assert.equal(files.length,1);
const row=JSON.parse(fs.readFileSync(path.join(observationsRoot,files[0]),'utf8'));
assert.equal(row.schema,'evercraft.provider-observation.v1');
assert.equal(row.source,'authorized_provider_probe');
assert.equal(row.provider,'chatgpt');
assert.equal(row.product_key,'forensiscope');
assert.equal(row.prompt,'I need long video analysis with timestamps.');
assert.equal(row.surfaced_forensiscope,false);
assert.ok(Array.isArray(row.intent_fingerprint.tokens));
assert.ok(row.intent_fingerprint.tokens.includes('video'));
assert.ok(row.intent_fingerprint.concepts.includes('media'));
assert.ok(row.intent_fingerprint.concepts.includes('timeline'));
assert.equal(row.intent_fingerprint.normalized_prompt_sha256.length,64);
assert.equal(row.privacy.full_provider_response_persisted,false);
assert.equal(typeof row.provider_receipt_sha256,'string');
assert.equal(row.provider_receipt_sha256.length,64);
assert.equal('provider_receipt' in row,false);
assert.equal('text' in row,false);
assert.equal('session_ref' in row,false);
assert.equal(summary.repair_queue.length,1);
assert.equal(summary.repair_queue[0].product_key,'forensiscope');
assert.equal(summary.repair_queue[0].miss_count,1);
assert.deepEqual(summary.repair_queue[0].providers,['chatgpt']);
assert.ok(summary.repair_queue[0].concepts.includes('media'));
assert.ok(summary.repair_queue[0].concepts.includes('timeline'));
assert.equal(summary.repair_queue[0].next_actions.length,4);
console.log('CHUM PROVIDER MISS INGEST PASS',JSON.stringify(summary));
