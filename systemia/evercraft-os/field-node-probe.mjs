#!/usr/bin/env node
/**
 * Read-only localhost NodeSeed challenge probe for a machine operator.
 * A passing probe confirms a live signed NodeSeed identity matching a
 * separately pinned fingerprint; it never grants broker/Yard/Passport trust,
 * real-world device provenance, execution authority or remote jobs.
 */
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { verifyNodeAttestation } from '../compute/device-identity.mjs';

const FINGERPRINT = /^sha256:[a-f0-9]{64}$/;
const NODE_ID = /^[a-zA-Z0-9._-]{1,128}$/;
const sha = value => 'sha256:' + createHash('sha256').update(value).digest('hex');

export function validateLoopbackOrigin(endpoint) {
  const url = new URL(String(endpoint || ''));
  if (url.protocol !== 'http:' || !['127.0.0.1','[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('field_probe_requires_plain_loopback_http_origin');
  }
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('field_probe_explicit_loopback_port_required');
  }
  return url.origin;
}

async function fetchJson(origin, route, { fetchFn, headers = {}, body = null, timeoutMs = 4000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(origin + route, {
      method: body === null ? 'GET' : 'POST',
      redirect: 'error',
      signal: controller.signal,
      headers: { accept:'application/json', ...(body === null ? {} : {'content-type':'application/json'}), ...headers },
      ...(body === null ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) return {ok:false,status:response.status,body:null};
    const type=String(response.headers.get('content-type') || '');
    if (!type.includes('application/json')) return {ok:false,status:response.status,body:null};
    return {ok:true,status:response.status,body:await response.json()};
  } finally { clearTimeout(timeout); }
}

function held(reason, nodeId = null) {
  return {
    schema:'evercraft.os.local-node-identity-preflight.v1',
    state:'held',
    reason,
    node_id:nodeId,
    signed_identity_verified:false,
    pin_matched:false,
    capacity_consistent:false,
    live_local_node_seen:false,
    real_field_host_independently_verified:false,
    broker_authorized:false,
    yard_authorized:false,
    remote_jobs_enabled:false,
    production_execution_granted:false,
    deployment_performed:false,
    credentials_in_receipt:false
  };
}

export async function probeLocalNode({
  endpoint,
  expectedNodeId,
  expectedFingerprint,
  bearerToken = '',
  fetchFn = fetch,
  now = new Date(),
  timeoutMs = 4000
} = {}) {
  // Never follow redirects off-host, never probe non-loopback/private LAN here.
  const origin = validateLoopbackOrigin(endpoint);
  const nodeId = String(expectedNodeId || '').trim();
  const fingerprint = String(expectedFingerprint || '').trim().toLowerCase();
  if (!NODE_ID.test(nodeId) || !FINGERPRINT.test(fingerprint)) {
    return held('independent_device_pin_required', NODE_ID.test(nodeId) ? nodeId : null);
  }
  if (typeof fetchFn !== 'function') throw new Error('fetch_implementation_required');
  const nonce = randomBytes(24).toString('hex');
  const headers = bearerToken ? { authorization:'Bearer '+bearerToken } : {};
  try {
    const cap = await fetchJson(origin,'/v1/capacity',{fetchFn,timeoutMs});
    if (!cap.ok) return held('capacity_unavailable',nodeId);
    const capacity = cap.body;
    if (capacity?.protocol !== 'evercraft.capacity.v1' ||
        capacity.runtime !== 'Evercraft Compute' ||
        capacity.node_id !== nodeId ||
        capacity.device_fingerprint !== fingerprint ||
        capacity.attestation_supported !== true ||
        !Array.isArray(capacity.supported_workloads) ||
        !Array.isArray(capacity.placement_labels)) {
      return held('capacity_identity_or_protocol_mismatch',nodeId);
    }
    const result = await fetchJson(origin,'/v1/attest',{
      fetchFn,timeoutMs,headers,body:{nonce}
    });
    if (!result.ok || !result.body?.attestation) {
      return held('fresh_attestation_unavailable',nodeId);
    }
    const verification = verifyNodeAttestation({
      attestation:result.body.attestation,
      expectedNonce:nonce,
      expectedNodeId:nodeId,
      now,
      maxAgeMs:60_000
    });
    if (!verification.ok) return held('signature_or_challenge_invalid',nodeId);
    if (verification.device_fingerprint !== fingerprint) {
      return held('pinned_device_identity_mismatch',nodeId);
    }
    const statement = result.body.attestation.statement;
    const observedWorkloadHash = sha(JSON.stringify([...capacity.supported_workloads].map(String).sort()));
    if (statement.supported_workloads_hash !== observedWorkloadHash ||
        JSON.stringify(statement.placement_labels) !==
        JSON.stringify([...new Set(capacity.placement_labels.map(String))].sort())) {
      return held('capacity_attestation_contents_mismatch',nodeId);
    }
    return {
      schema:'evercraft.os.local-node-identity-preflight.v1',
      state:'local_signed_identity_verified',
      reason:'local_identity_verified_but_not_yard_admitted',
      node_id:nodeId,
      device_fingerprint:fingerprint,
      signed_identity_verified:true,
      pin_matched:true,
      capacity_consistent:true,
      live_local_node_seen:true,
      observed_at:verification.observed_at,
      attestation_receipt_sha256:sha(JSON.stringify(result.body.attestation)),
      supported_workloads:capacity.supported_workloads.filter(x=>typeof x==='string').slice(0,100),
      loopback_origin_verified:true,
      real_field_host_independently_verified:false,
      broker_authorized:false,
      yard_authorized:false,
      remote_jobs_enabled:false,
      production_execution_granted:false,
      deployment_performed:false,
      credentials_in_receipt:false
    };
  } catch {
    return held('local_probe_failed_closed',nodeId);
  }
}

function readArg(name) {
  const i=process.argv.indexOf(name);
  return i>=0?process.argv[i+1]:null;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const endpoint=readArg('--endpoint');
  const expectedNodeId=readArg('--expect-node-id');
  const expectedFingerprint=readArg('--expect-fingerprint');
  if (!endpoint || !expectedNodeId || !expectedFingerprint) {
    console.error('usage: node systemia/evercraft-os/field-node-probe.mjs --endpoint http://127.0.0.1:<port> --expect-node-id <pinned-id> --expect-fingerprint sha256:<pinned-hash>');
    process.exitCode=2;
  } else {
    probeLocalNode({
      endpoint,
      expectedNodeId,
      expectedFingerprint,
      bearerToken:process.env.EVERCRAFT_LOCAL_ALLOCATOR_TOKEN || ''
    }).then(receipt=>{
      console.log(JSON.stringify(receipt,null,2));
      if (receipt.state!=='local_signed_identity_verified') process.exitCode=1;
    }).catch(()=>{
      // Never echo tokens, URLs with credentials or response content.
      console.error('read-only local NodeSeed identity probe denied');
      process.exitCode=1;
    });
  }
}
