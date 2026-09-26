#!/usr/bin/env node
import path from 'node:path';
import { createHash } from 'node:crypto';
import { YardOperator } from './operator.mjs';

const sha = (value) => createHash('sha256').update(
  typeof value === 'string' ? value : JSON.stringify(value)
).digest('hex');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function clean(value) {
  return String(value ?? '').trim();
}

export function remoteDeviceCandidateRef(candidate) {
  const material = {
    node_id: clean(candidate?.node_id),
    device_fingerprint: clean(candidate?.device_fingerprint).toLowerCase(),
    request_receipt_hash: clean(candidate?.request_receipt_hash),
  };
  if (!material.node_id || !material.device_fingerprint || !material.request_receipt_hash) {
    throw new Error('pending candidate is missing identity evidence');
  }
  return `candidate:sha256:${sha(material)}`;
}

export function presentPendingRemoteDevices(view) {
  const pending = Array.isArray(view?.pending) ? view.pending : [];
  return {
    schema: 'evercraft.yard.remote-device-review-list.v1',
    broker_deployment_id: clean(view?.broker_deployment_id),
    count: pending.length,
    candidates: pending.map((candidate) => ({
      candidate_ref: remoteDeviceCandidateRef(candidate),
      node_id: clean(candidate.node_id),
      request_receipt_hash: clean(candidate.request_receipt_hash),
      identity_attested: candidate.identity_attested === true,
      authority_granted: false,
      first_seen_at: clean(candidate.first_seen_at) || null,
      last_seen_at: clean(candidate.last_seen_at) || null,
      expires_at: clean(candidate.expires_at) || null,
    })),
    observed_at: clean(view?.observed_at) || null,
  };
}

function findCandidate(view, candidateRef) {
  const target = clean(candidateRef);
  if (!target) throw new Error('candidate ref is required');

  const pending = Array.isArray(view?.pending) ? view.pending : [];
  const matches = pending.filter(
    (candidate) => remoteDeviceCandidateRef(candidate) === target
  );
  if (matches.length === 0) throw new Error('pending candidate not found');
  if (matches.length > 1) throw new Error('pending candidate ref is ambiguous');
  return matches[0];
}

export async function listPendingRemoteDeviceReviews({
  yard,
  brokerDeploymentId,
} = {}) {
  if (!yard) throw new Error('yard is required');
  if (!clean(brokerDeploymentId)) throw new Error('broker deployment id is required');
  const view = await yard.listPendingRemoteDevices(brokerDeploymentId);
  return presentPendingRemoteDevices(view);
}

export async function authorizePendingRemoteDevice({
  yard,
  brokerDeploymentId,
  candidateRef,
  confirmCandidateRef,
  approvalRef,
} = {}) {
  if (!yard) throw new Error('yard is required');
  const broker = clean(brokerDeploymentId);
  if (!broker) throw new Error('broker deployment id is required');

  const candidate = clean(candidateRef);
  const confirmation = clean(confirmCandidateRef);
  if (!candidate) throw new Error('candidate ref is required');
  if (!confirmation) throw new Error('explicit candidate confirmation is required');
  if (candidate !== confirmation) {
    throw new Error('candidate confirmation does not match');
  }

  const approval = clean(approvalRef);
  if (!approval || approval.length > 512) {
    throw new Error('explicit approval reference is required');
  }

  const view = await yard.listPendingRemoteDevices(broker);
  const selected = findCandidate(view, candidate);

  const decision = await yard.authorizeRemoteDevice(broker, {
    deviceFingerprint: selected.device_fingerprint,
    nodeId: selected.node_id,
    approvalRef: approval,
  });

  return {
    schema: 'evercraft.yard.remote-device-review-decision.v1',
    broker_deployment_id: broker,
    action: 'authorize',
    candidate_ref: candidate,
    node_id: clean(selected.node_id),
    approval_ref: approval,
    decision_receipt_hash: clean(decision.receipt_hash) || null,
    broker_decision_receipt_hash:
      clean(decision.broker_decision_receipt_hash) || null,
    decided_at: clean(decision.decided_at) || new Date().toISOString(),
  };
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;

if (invokedDirectly) {
  const command = clean(process.argv[2] || 'list');
  const yardState = arg('--yard-state');
  const brokerDeploymentId = arg('--broker-deployment');

  if (!yardState || !brokerDeploymentId) {
    console.error(
      'usage: remote-device-review.mjs <list|authorize> --yard-state <private-dir> --broker-deployment <id> [authorization args]'
    );
    process.exit(2);
  }

  const yard = new YardOperator({ stateDir: path.resolve(yardState) });

  if (command === 'list') {
    const result = await listPendingRemoteDeviceReviews({
      yard,
      brokerDeploymentId,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  if (command === 'authorize') {
    const result = await authorizePendingRemoteDevice({
      yard,
      brokerDeploymentId,
      candidateRef: arg('--candidate'),
      confirmCandidateRef: arg('--confirm-candidate'),
      approvalRef: arg('--approval-ref'),
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  console.error('command must be list or authorize');
  process.exit(2);
}
