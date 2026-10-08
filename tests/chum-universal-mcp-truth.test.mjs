import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { verifiedReadonlyUniversalMcp } from '../systemia/chum/verified-universal-mcp.mjs';

const source = JSON.parse(fs.readFileSync('distribution/machine-commerce-distribution.json','utf8'));
const expected = 'https://fabric.systemiacommandcenters.com/mcp';

test('receipt-backed owned universal Fabric read-only discovery endpoint is recoverable without env configuration',()=>{
  assert.equal(verifiedReadonlyUniversalMcp(source), expected);
  assert.equal(source.live_runtime.transactional, false);
});

test('do not promote unverifiable or transactional gateways into universal discovery',()=>{
  const replace = (patch) => ({...source,live_runtime:{...source.live_runtime,...patch}});
  for(const patch of [
    {state:'route_pending'},
    {read_only:false},
    {transactional:true},
    {base44_runtime_supported:true},
    {authority:'unverified'},
    {evidence_ref:null},
    {last_verified_at:null},
    {endpoint:'https://evercraft-ai-suite.base44.app/mcp'},
    {endpoint:'https://fabric.systemiacommandcenters.com/payments'},
    {endpoint:'http://fabric.systemiacommandcenters.com/mcp'},
    {endpoint:'https://fabric.systemiacommandcenters.com/mcp?checkout=1'},
  ]) {
    assert.equal(verifiedReadonlyUniversalMcp(replace(patch)),null,JSON.stringify(patch));
  }
  assert.equal(verifiedReadonlyUniversalMcp({...source,destinations:[]}),null);
  assert.equal(verifiedReadonlyUniversalMcp({...source,destinations:source.destinations.map(x=>
    x.destination==='Official MCP Registry'?{...x,is_latest:false}:x
  )}),null);
});
