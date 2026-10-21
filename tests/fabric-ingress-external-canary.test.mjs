import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const source=fs.readFileSync(new URL('../scripts/fabric-ingress-external-canary.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/evercraft-fabric-public-ingress-monitor.yml',import.meta.url),'utf8');

test('independent public ingress monitor parses and has a bounded HTTPS origin',()=>{
  execFileSync(process.execPath,['--check',new URL('../scripts/fabric-ingress-external-canary.mjs',import.meta.url).pathname]);
  assert.match(source,/url\.protocol!=='https:'/);
  assert.match(source,/url\.username\|\|url\.password/);
  assert.match(source,/redirect:'error'/);
});

test('monitor verifies TLS, exact transport, signed identity and real read-only MCP',()=>{
  for(const value of [
    "resolve4", "tls.connect", "rejectUnauthorized:true",
    "method:'GET'", "text/event-stream", "mcp_sse_identity_missing",
    "verifyNodeAttestation", "expectedNonce:nonce", "field_claim!==false",
    "rpc(1,'initialize'", "tools/list", "tools/call",
    "readOnlyHint!==true", "destructiveHint!==false",
    "external_action_taken!==false", "transactional!==false",
    "public_ingress_and_read_only_mcp_verified",
  ]) assert.ok(source.includes(value),'missing ingress requirement: '+value);
});

test('an incomplete ingress check fails closed with a specific stage, not a green receipt',()=>{
  assert.match(source,/receipt\.verified=true/);
  assert.match(source,/receipt\.state='failed'/);
  assert.match(source,/receipt\.failure_stage=stage/);
  assert.match(source,/process\.exitCode=1/);
});

test('a green ingress receipt makes no editorial, payment or overall release assertion',()=>{
  assert.match(source,/journal_edition_verified:false/);
  assert.match(source,/commerce_verified:false/);
  assert.doesNotMatch(source,/journal_live_edition_missing|checkout_enabled|payment_created/);
  assert.match(workflow,/schedule:/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/artifacts\/fabric-ingress-receipt\.json/);
  assert.doesNotMatch(workflow,/continue-on-error: true/);
});
