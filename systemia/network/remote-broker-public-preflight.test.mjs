import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePublicBrokerWithYardReceipt } from './remote-broker-public-preflight.mjs';

const approvedOrigin = 'https://broker.systemiacommandcenters.com';
const yard = Object.freeze({
  schema: 'evercraft.remote-capacity.public-broker.v1',
  runtime: 'Evercraft Compute',
  verified: true,
  source: 'Systemia Yard Operator',
  origin: approvedOrigin,
  health_path: '/v1/remote/health',
  deployment_receipt_hash: 'sha256:' + 'a'.repeat(64),
  public_route_receipt_hash: 'sha256:' + 'b'.repeat(64),
  instance_id: 'remote_broker_' + 'c'.repeat(24),
  secure_envelope_schema: 'evercraft.secure-envelope.v1',
});
const health = {
  ok: true,
  schema: 'evercraft.remote-capacity.broker-health.v1',
  service: 'remote-capacity-broker',
  runtime: 'Evercraft Compute',
  instance_id: yard.instance_id,
  deployment_receipt_bound: true,
  deployment_receipt_ref: yard.deployment_receipt_hash,
  secure_envelope_schema: 'evercraft.secure-envelope.v1',
};
const response = body => ({ status: 200, json: async () => body });

test('exact allowlisted HTTPS and matching Yard receipt can establish health consistency, not trust', async () => {
  let observed = null;
  const got = await comparePublicBrokerWithYardReceipt({
    yardReceipt: yard, allowedOrigins: [approvedOrigin],
    fetchImpl: async (url, options) => {
      observed = {url, options};
      return response(health);
    },
  });
  assert.equal(observed.url, approvedOrigin + '/v1/remote/health');
  assert.equal(observed.options.redirect, 'error');
  assert.equal(observed.options.method, 'GET');
  assert.equal(got.result, 'health_matches_claim');
  assert.equal(got.health_matches_yard_claim, true);
  assert.equal(got.yard_receipt_source_authenticated_by_this_tool, false);
  assert.equal(got.remote_control_authorized, false);
  assert.doesNotMatch(JSON.stringify(got), /broker\\.|sha256:|remote_broker_/);
});

test('rejects absent independent exact-origin allowlist without fetching', async () => {
  let called = 0;
  for(const origins of [[], ['https://other.systemiacommandcenters.com'], ['http://broker.systemiacommandcenters.com']]) {
    await assert.rejects(comparePublicBrokerWithYardReceipt({
      yardReceipt: yard, allowedOrigins: origins,
      fetchImpl: async () => { called++; return response(health); },
    }), /broker_origin_not_independently_allowlisted/);
  }
  assert.equal(called, 0);
});

test('rejects untrusted URL surfaces, IPs, localhost, credentialed, and tampered Yard receipts', async () => {
  const badClaims = [
    {origin:'https://127.0.0.1'},
    {origin:'https://localhost'},
    {origin:'http://broker.systemiacommandcenters.com'},
    {origin:'https://broker.systemiacommandcenters.com/other'},
    {origin:'https://user:pass@broker.systemiacommandcenters.com'},
    {origin:'https://broker.systemiacommandcenters.com?open=1'},
    {origin:'https://broker.systemiacommandcenters.com#fragment'},
    {health_path:'/different'},
    {verified:false},
    {source:'MCP client'},
    {instance_id:'unverified'},
    {deployment_receipt_hash:'unknown'},
    {public_route_receipt_hash:'unknown'},
  ];
  for (const mutation of badClaims) {
    await assert.rejects(comparePublicBrokerWithYardReceipt({
      yardReceipt:{...yard,...mutation}, allowedOrigins:[approvedOrigin],
      fetchImpl: async () => response(health),
    }), /broker_public_origin_invalid|yard_broker_route_receipt_invalid/);
  }
});

test('fails closed on wrong instance, changed deployment receipt, or bad envelope', async () => {
  for(const altered of [
    {instance_id:'remote_broker_'+'d'.repeat(24)},
    {deployment_receipt_ref:'sha256:'+'f'.repeat(64)},
    {deployment_receipt_bound:false},
    {secure_envelope_schema:'none'},
    {ok:false},
    {service:'wrong-service'},
  ]) {
    const got = await comparePublicBrokerWithYardReceipt({
      yardReceipt:yard,allowedOrigins:[approvedOrigin],
      fetchImpl:async()=>response({...health,...altered}),
    });
    assert.equal(got.result,'health_mismatch');
    assert.equal(got.remote_control_authorized,false);
  }
});

test('broker network outage and malformed responses never yield verified health', async () => {
  const args={yardReceipt:yard,allowedOrigins:[approvedOrigin]};
  const unavailable=await comparePublicBrokerWithYardReceipt({
    ...args,fetchImpl:async()=>{throw new Error('sensitive internal network details');},
  });
  assert.equal(unavailable.result,'unreachable');
  assert.doesNotMatch(JSON.stringify(unavailable),/sensitive/);
  const malformed=await comparePublicBrokerWithYardReceipt({
    ...args,fetchImpl:async()=>({status:200,json:async()=>{throw new Error('bad json')}}),
  });
  assert.equal(malformed.result,'health_mismatch');
  assert.equal(malformed.remote_control_authorized,false);
});
