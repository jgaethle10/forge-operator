import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  hasInternalFilenameMarkers,
  preflightPackage,
  sanitizeClientFilename
} from './package-preflight.mjs';
import {
  buildDispatchAudit,
  nextDispatchRoute,
  prepareShipment,
  verifySentCopy
} from './shipping-department.mjs';
import {
  loadShippingLedger,
  markSentCopyVerified,
  recordDeliveryAttempt,
  reserveShipment
} from './shipping-ledger.mjs';
import { buildVerifiedDeliveryReceipt } from './delivery-receipt.mjs';
import { dispatchVerifiedShipment } from './transport-runtime.mjs';
import { buildReleasePlan, materializeReleasePackage, verifyMaterializedRelease } from './release-station.mjs';
import { admitShippingOrder, authorizeReissue, assertCurrentRelease, buildShippingExceptionIntent, findShippingExceptions, markShippingOrderState, shippingControlTowerSummary } from './control-tower.mjs';
import { buildShippingProofBundle } from './proof-bundle.mjs';
import { buildRecipientResponseSignal, correlateRecipientResponse, dedupeRecipientResponses } from './recipient-response.mjs';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-shipping-'));
}

function makePdf(dir, name = 'internal-world-class-final.pdf') {
  const file = path.join(dir, name);
  fs.writeFileSync(file, Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'latin1'));
  return file;
}

test('client filenames strip internal lab markers', () => {
  assert.equal(hasInternalFilenameMarkers('BBSI_WORLD_CLASS_FINAL.pdf'), true);
  assert.equal(sanitizeClientFilename('BBSI_WORLD_CLASS_FINAL.pdf'), 'BBSI.pdf');
  assert.equal(hasInternalFilenameMarkers('Yakima Tax Pros x BBSI Partnership Brief.pdf'), false);
});

test('package preflight requires openability, render verification, digest and client-safe names', () => {
  const dir = tempDir();
  const file = makePdf(dir);
  const manifest = preflightPackage({
    artifacts:[{
      path:file,
      client_filename:'Yakima Tax Pros x BBSI Partnership Brief.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  assert.equal(manifest.pass, true);
  assert.equal(manifest.artifact_count, 1);
  assert.match(manifest.artifacts[0].sha256, /^sha256:/);
  assert.equal(manifest.artifacts[0].client_filename, 'Yakima Tax Pros x BBSI Partnership Brief.pdf');
});

test('package preflight rejects internal client names and unverified rendering', () => {
  const dir = tempDir();
  const file = makePdf(dir);
  const manifest = preflightPackage({
    artifacts:[{
      path:file,
      client_filename:'BBSI_WORLD_CLASS_FINAL.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:false }
    }]
  });
  assert.equal(manifest.pass, false);
  assert.ok(manifest.reasons.some((reason) => reason.includes('internal_filename_marker_present')));
  assert.ok(manifest.reasons.some((reason) => reason.includes('render_verification_required')));
});

test('shipping envelope requires explicit external-send authorization', () => {
  const dir = tempDir();
  const file = makePdf(dir);
  assert.throws(() => prepareShipment({
    logical_package_key:'bbsi-partnership-brief',
    recipient:{ address:'buyer@example.com' },
    subject:'Partnership Brief',
    body:'Attached.',
    artifacts:[{
      path:file,
      client_filename:'Partnership Brief.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  }), /send_authorization_ref_required/);
});

test('thread write failure falls back to fresh outbound, but ambiguous failure requires sent-copy check', () => {
  const dir = tempDir();
  const file = makePdf(dir);
  const envelope = prepareShipment({
    logical_package_key:'bbsi-partnership-brief',
    recipient:{ address:'buyer@example.com' },
    subject:'Partnership Brief',
    body:'Attached.',
    authorization_ref:'human-approved:2026-10-01T13:00:00-07:00',
    thread_ref:'gmail:thread:123',
    artifacts:[{
      path:file,
      client_filename:'Partnership Brief.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  assert.equal(envelope.dispatch_ready, true);

  const fallback = nextDispatchRoute({
    envelope,
    attempts:[{
      outcome:'failed',
      error:{ message:'reply thread failed before send' }
    }]
  });
  assert.equal(fallback.allowed, true);
  assert.equal(fallback.route, 'fresh_outbound');

  const blocked = nextDispatchRoute({
    envelope,
    attempts:[{
      outcome:'unknown',
      ambiguous_provider_acceptance:true,
      error:{ message:'connector returned unknown state' }
    }]
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.verification_required, true);

  const retryAfterAbsenceProof = nextDispatchRoute({
    envelope,
    attempts:[{
      outcome:'unknown',
      ambiguous_provider_acceptance:true,
      error:{ message:'connector returned unknown state' }
    }],
    sent_copy_state:'verified_absent'
  });
  assert.equal(retryAfterAbsenceProof.allowed, true);
  assert.equal(retryAfterAbsenceProof.route, 'fresh_outbound');
});

test('sent-copy verification requires exact recipient, subject and attachment manifest', () => {
  const dir = tempDir();
  const file = makePdf(dir);
  const envelope = prepareShipment({
    logical_package_key:'havenly-vendor-info',
    recipient:{ address:'vendor@example.com' },
    subject:'HAVENLY Vendor Information',
    body:'Attached.',
    authorization_ref:'human-approved:send',
    preferred_route:'fresh_outbound',
    artifacts:[{
      path:file,
      client_filename:'HAVENLY Vendor Information.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });

  const verification = verifySentCopy({
    envelope,
    sent_message:{
      id:'gmail-message-123',
      to:['vendor@example.com'],
      cc:[],
      subject:'HAVENLY Vendor Information',
      attachments:[{ filename:'HAVENLY Vendor Information.pdf' }]
    }
  });
  assert.equal(verification.verified, true);

  const bad = verifySentCopy({
    envelope,
    sent_message:{
      id:'gmail-message-124',
      to:['vendor@example.com'],
      cc:[],
      subject:'HAVENLY Vendor Information',
      attachments:[]
    }
  });
  assert.equal(bad.verified, false);
  assert.ok(bad.reasons.includes('attachment_manifest_mismatch'));
});

test('ledger suppresses duplicate shipments and does not call delivered until sent copy is verified', () => {
  const dir = tempDir();
  const ledgerFile = path.join(dir, 'shipping-ledger.json');
  const packageDigest = 'sha256:package-abc';

  const first = reserveShipment({
    ledger_file:ledgerFile,
    recipient_ref:'vendor@example.com',
    subject:'HAVENLY Vendor Information',
    package_digest:packageDigest,
    logical_package_key:'havenly-vendor',
    authorization_ref:'approved:1',
    now:new Date('2026-10-01T20:00:00Z')
  });
  assert.equal(first.dispatch_allowed, true);

  const duplicate = reserveShipment({
    ledger_file:ledgerFile,
    recipient_ref:'vendor@example.com',
    subject:'HAVENLY Vendor Information',
    package_digest:packageDigest,
    logical_package_key:'havenly-vendor',
    authorization_ref:'approved:2',
    now:new Date('2026-10-01T20:01:00Z')
  });
  assert.equal(duplicate.duplicate_suppressed, true);
  assert.equal(duplicate.dispatch_allowed, false);
  assert.equal(duplicate.shipment.shipment_key, first.shipment.shipment_key);

  const sent = recordDeliveryAttempt({
    ledger_file:ledgerFile,
    shipment_key:first.shipment.shipment_key,
    route:'fresh_outbound',
    provider:'gmail',
    outcome:'sent',
    provider_message_id:'gmail-message-1',
    now:new Date('2026-10-01T20:02:00Z')
  });
  assert.equal(sent.shipment.state, 'provider_accepted');

  const verified = markSentCopyVerified({
    ledger_file:ledgerFile,
    shipment_key:first.shipment.shipment_key,
    verification_ref:'gmail-readback:gmail-message-1',
    provider_message_id:'gmail-message-1',
    attachment_names:['HAVENLY Vendor Information.pdf'],
    now:new Date('2026-10-01T20:03:00Z')
  });
  assert.equal(verified.shipment.state, 'verified_delivered');

  const ledger = loadShippingLedger(ledgerFile);
  assert.equal(ledger.shipments.length, 1);
});

test('dispatch audit distinguishes prepared, accepted and verified states', () => {
  const baseEnvelope = {
    shipment_fingerprint:'sha256:abc',
    logical_package_key:'demo'
  };
  assert.equal(buildDispatchAudit({ envelope:baseEnvelope }).state, 'prepared');
  assert.equal(buildDispatchAudit({
    envelope:baseEnvelope,
    attempts:[{ outcome:'sent', provider_message_id:'msg-1' }]
  }).state, 'provider_accepted_unverified');
  assert.equal(buildDispatchAudit({
    envelope:baseEnvelope,
    attempts:[{ outcome:'sent', provider_message_id:'msg-1' }],
    sent_copy_verification:{ verified:true }
  }).state, 'verified_delivered');
});


test('v2 delivery receipt requires verified provider delivery and preserves truth boundaries', () => {
  const state = {
    fulfillment_key:'fulfillment:abc',
    mission_key:'evercraft-fulfillment',
    public_id:'website-launch-service-v1',
    product_name:'Website Launch',
    payment:{ order_key:'order-1', evidence_ref:'stripe:session:1' },
    promised_deliverables:['customer-ready package'],
    qa_contract:['render verified'],
    evidence_refs:['evidence:root'],
    tasks:[
      { work_key:'parallel-quality-pass', state:'completed', evidence_refs:['qa:1'] },
      { work_key:'delivery-package', state:'completed', evidence_refs:['package:1'] },
      { work_key:'customer-delivery', state:'completed', evidence_refs:['send:1'] }
    ]
  };
  const packageManifest = {
    pass:true,
    package_digest:'sha256:package',
    artifacts:[{
      client_filename:'Client Package.pdf',
      mime_type:'application/pdf',
      size_bytes:123,
      sha256:'sha256:file',
      openability:{ openable:true },
      render_verified:true
    }]
  };
  const shipment = {
    shipment_key:'shipment:1',
    idempotency_key:'shipidem:1',
    state:'verified_delivered',
    provider_message_id:'gmail:message:1'
  };
  const verification = {
    verified:true,
    provider_message_id:'gmail:message:1',
    verification_digest:'sha256:verify',
    recipient_verified:true,
    subject_verified:true,
    attachments_verified:true,
    attachment_names:['Client Package.pdf']
  };
  const receipt = buildVerifiedDeliveryReceipt({
    state,
    recipient_ref:'customer@example.com',
    shipment,
    package_manifest:packageManifest,
    sent_copy_verification:verification,
    delivered_at:'2026-10-01T20:10:00Z'
  });
  assert.equal(receipt.schema, 'evercraft.shipping.delivery-receipt.v2');
  assert.equal(receipt.provider_message_id, 'gmail:message:1');
  assert.equal(receipt.truth_boundary.customer_acceptance_not_inferred, true);
  assert.equal(receipt.truth_boundary.sent_copy_attachment_manifest_verified, true);
  assert.match(receipt.integrity_digest, /^sha256:/);

  assert.throws(() => buildVerifiedDeliveryReceipt({
    state,
    recipient_ref:'customer@example.com',
    shipment:{ ...shipment, state:'provider_accepted' },
    package_manifest:packageManifest,
    sent_copy_verification:verification
  }), /shipment_not_verified_delivered/);
});


test('transport runtime reproduces the safe thread-to-fresh recovery without duplicate sending', async () => {
  const dir = tempDir();
  const ledgerFile = path.join(dir, 'shipping-ledger.json');
  const file = makePdf(dir);
  const envelope = prepareShipment({
    logical_package_key:'bbsi-send',
    recipient:{ address:'buyer@example.com' },
    subject:'Yakima Tax Pros x BBSI Partnership Brief',
    body:'Attached.',
    authorization_ref:'human-approved:send-now',
    thread_ref:'gmail:thread:old',
    artifacts:[{
      path:file,
      client_filename:'Yakima Tax Pros x BBSI Partnership Brief.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });

  const routes = [];
  const adapter = {
    async send({ route }) {
      routes.push(route);
      if (route === 'thread_reply') {
        const error = new Error('reply thread failed before send');
        error.code = 'thread_write_failed';
        throw error;
      }
      return { id:'gmail-message-safe-1' };
    },
    async readSent({ provider_message_id }) {
      return {
        id:provider_message_id,
        to:['buyer@example.com'],
        cc:[],
        subject:'Yakima Tax Pros x BBSI Partnership Brief',
        attachments:[{ filename:'Yakima Tax Pros x BBSI Partnership Brief.pdf' }]
      };
    }
  };

  const result = await dispatchVerifiedShipment({
    envelope,
    adapter,
    ledger_file:ledgerFile,
    provider:'gmail'
  });
  assert.equal(result.delivered, true);
  assert.equal(result.state, 'verified_delivered');
  assert.deepEqual(routes, ['thread_reply','fresh_outbound']);

  const second = await dispatchVerifiedShipment({
    envelope,
    adapter,
    ledger_file:ledgerFile,
    provider:'gmail'
  });
  assert.equal(second.duplicate_suppressed, true);
  assert.equal(second.delivered, true);
  assert.deepEqual(routes, ['thread_reply','fresh_outbound']);
});


test('release station creates a client-clean deterministic package and catches later mutation', () => {
  const dir = tempDir();
  const file = makePdf(dir, 'BBSI_WORLD_CLASS_FINAL.pdf');
  const artifacts = [{
    path:file,
    client_filename:'Yakima Tax Pros x BBSI Partnership Brief.pdf',
    mime_type:'application/pdf',
    qa:{ openable:true, render_verified:true, renderer_count:2 }
  }];

  const plan = buildReleasePlan({
    release_key:'bbsi-partnership-brief-2026-10-01',
    channel:'email',
    recipient_ref:'buyer@example.com',
    authorization_ref:'human-approved:send',
    artifacts,
    source_refs:['mission:bbsi-partnership']
  });
  assert.equal(plan.ready, true);
  assert.equal(plan.package_manifest.artifacts[0].client_filename, 'Yakima Tax Pros x BBSI Partnership Brief.pdf');

  const materialized = materializeReleasePackage({
    plan,
    artifacts,
    output_root:path.join(dir, 'releases')
  });
  const firstCheck = verifyMaterializedRelease({ release_dir:materialized.release_dir });
  assert.equal(firstCheck.verified, true);

  const names = fs.readdirSync(materialized.release_dir).sort();
  assert.deepEqual(names, [
    'RELEASE.txt',
    'Yakima Tax Pros x BBSI Partnership Brief.pdf',
    'manifest.json'
  ]);

  fs.appendFileSync(path.join(materialized.release_dir, 'Yakima Tax Pros x BBSI Partnership Brief.pdf'), 'mutation');
  const mutated = verifyMaterializedRelease({ release_dir:materialized.release_dir });
  assert.equal(mutated.verified, false);
  assert.ok(mutated.reasons.some((reason) => reason.includes('digest_mismatch')));
});

test('release station blocks external packages without explicit send authority', () => {
  const dir = tempDir();
  const file = makePdf(dir, 'client.pdf');
  assert.throws(() => buildReleasePlan({
    release_key:'no-authority',
    channel:'email',
    recipient_ref:'buyer@example.com',
    artifacts:[{
      path:file,
      client_filename:'Client Package.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  }), /external_send_authorization_required/);
});


test('control tower supersedes stale unsent package versions instead of letting old bytes ship', () => {
  const dir = tempDir();
  const towerFile = path.join(dir, 'control-tower.json');
  const fileA = makePdf(dir, 'package-a.pdf');
  const planA = buildReleasePlan({
    release_key:'customer-proposal',
    channel:'email',
    recipient_ref:'buyer@example.com',
    authorization_ref:'approved:a',
    artifacts:[{
      path:fileA,
      client_filename:'Customer Proposal.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  const first = admitShippingOrder({
    tower_file:towerFile,
    release_plan:planA,
    recipient_ref:'buyer@example.com',
    subject:'Customer Proposal',
    authorization_ref:'approved:a',
    now:new Date('2026-10-01T20:00:00Z')
  });
  assert.equal(first.admitted, true);
  assert.equal(first.order.version, 1);

  const fileB = path.join(dir, 'package-b.pdf');
  fs.writeFileSync(fileB, Buffer.from('%PDF-1.4\n2 0 obj\n<< /Updated true >>\nendobj\n%%EOF\n','latin1'));
  const planB = buildReleasePlan({
    release_key:'customer-proposal',
    channel:'email',
    recipient_ref:'buyer@example.com',
    authorization_ref:'approved:b',
    artifacts:[{
      path:fileB,
      client_filename:'Customer Proposal.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  const second = admitShippingOrder({
    tower_file:towerFile,
    release_plan:planB,
    recipient_ref:'buyer@example.com',
    subject:'Customer Proposal',
    authorization_ref:'approved:b',
    now:new Date('2026-10-01T20:05:00Z')
  });
  assert.equal(second.order.version, 2);

  const oldState = assertCurrentRelease({ tower_file:towerFile, order_key:first.order.order_key });
  assert.equal(oldState.current, false);
  assert.equal(oldState.newer_order_key, second.order.order_key);

  const summary = shippingControlTowerSummary({ tower_file:towerFile });
  assert.equal(summary.by_state.superseded, 1);
  assert.equal(summary.by_state.admitted, 1);
});

test('control tower distinguishes intentional reissue from accidental duplicate', () => {
  const dir = tempDir();
  const towerFile = path.join(dir, 'control-tower.json');
  const file = makePdf(dir, 'reissue.pdf');
  const plan = buildReleasePlan({
    release_key:'vendor-packet',
    channel:'email',
    recipient_ref:'vendor@example.com',
    authorization_ref:'approved:initial',
    artifacts:[{
      path:file,
      client_filename:'Vendor Packet.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  const admitted = admitShippingOrder({
    tower_file:towerFile,
    release_plan:plan,
    recipient_ref:'vendor@example.com',
    subject:'Vendor Packet',
    authorization_ref:'approved:initial',
    now:new Date('2026-10-01T20:00:00Z')
  });
  markShippingOrderState({
    tower_file:towerFile,
    order_key:admitted.order.order_key,
    state:'verified_delivered',
    shipment_key:'shipment:1',
    provider_message_id:'gmail:1',
    sent_copy_verification_ref:'sha256:verification',
    delivery_receipt_ref:'delivery-v2:receipt',
    now:new Date('2026-10-01T20:05:00Z')
  });

  const duplicate = admitShippingOrder({
    tower_file:towerFile,
    release_plan:plan,
    recipient_ref:'vendor@example.com',
    subject:'Vendor Packet',
    authorization_ref:'approved:again',
    now:new Date('2026-10-01T20:06:00Z')
  });
  assert.equal(duplicate.duplicate_suppressed, true);

  const reissue = authorizeReissue({
    tower_file:towerFile,
    prior_order_key:admitted.order.order_key,
    authorization_ref:'human-approved:please-resend',
    reason:'Recipient explicitly requested another copy',
    now:new Date('2026-10-01T20:07:00Z')
  });
  assert.equal(reissue.order.reissue_of, admitted.order.order_key);
  assert.equal(reissue.order.state, 'admitted');
  assert.equal(reissue.order.reissue_count, 1);
});

test('control tower emits deduplicated operational exception intent without sending anything itself', () => {
  const dir = tempDir();
  const towerFile = path.join(dir, 'control-tower.json');
  const file = makePdf(dir, 'exception.pdf');
  const plan = buildReleasePlan({
    release_key:'exception-demo',
    channel:'email',
    recipient_ref:'buyer@example.com',
    authorization_ref:'approved',
    artifacts:[{
      path:file,
      client_filename:'Exception Demo.pdf',
      mime_type:'application/pdf',
      qa:{ openable:true, render_verified:true, renderer_count:2 }
    }]
  });
  const admitted = admitShippingOrder({
    tower_file:towerFile,
    release_plan:plan,
    recipient_ref:'buyer@example.com',
    subject:'Exception Demo',
    authorization_ref:'approved',
    now:new Date('2026-10-01T19:00:00Z')
  });
  markShippingOrderState({
    tower_file:towerFile,
    order_key:admitted.order.order_key,
    state:'provider_accepted_unverified',
    provider_message_id:'gmail:pending',
    now:new Date('2026-10-01T19:05:00Z')
  });
  const scan = findShippingExceptions({
    tower_file:towerFile,
    now:new Date('2026-10-01T19:30:00Z'),
    verification_after_minutes:10
  });
  assert.equal(scan.exception_count, 1);
  assert.equal(scan.exceptions[0].code, 'provider_acceptance_unverified');

  const intent = buildShippingExceptionIntent({
    exception_scan:scan,
    operator_recipient_ids:['operator:jesse'],
    now:new Date('2026-10-01T19:30:00Z')
  });
  assert.equal(intent.schema, 'systemia.notification.intent.v2');
  assert.equal(intent.purpose, 'operational');
  assert.equal(intent.priority, 'high');
  assert.match(intent.dedupe_key, /^shipping-exception:sha256:/);
});

test('proof bundle refuses broken chain-of-custody and passes a fully consistent delivery', () => {
  const artifact = {
    client_filename:'Client Package.pdf',
    size_bytes:123,
    sha256:'sha256:file'
  };
  const order = {
    order_key:'shipping-order:1',
    logical_package_key:'client-package',
    version:1,
    recipient_ref:'buyer@example.com',
    channel:'email',
    authorization_ref:'approved',
    state:'verified_delivered',
    package_digest:'sha256:package'
  };
  const releaseManifest = {
    release_key:'client-package',
    release_fingerprint:'sha256:release',
    package_digest:'sha256:package',
    materialization_digest:'sha256:materialized',
    artifacts:[artifact]
  };
  const shipment = {
    shipment_key:'shipment:1',
    idempotency_key:'shipidem:1',
    provider_message_id:'gmail:1',
    state:'verified_delivered'
  };
  const verification = {
    verified:true,
    verification_digest:'sha256:verification',
    provider_message_id:'gmail:1',
    recipient_verified:true,
    subject_verified:true,
    attachments_verified:true,
    attachment_names:['Client Package.pdf']
  };
  const receipt = {
    receipt_key:'delivery-v2:1',
    integrity_digest:'sha256:receipt',
    shipment_key:'shipment:1',
    provider_message_id:'gmail:1',
    package_digest:'sha256:package',
    recipient_ref:'buyer@example.com',
    artifact_manifest:[artifact]
  };

  const proof = buildShippingProofBundle({
    order,
    release_manifest:releaseManifest,
    shipment,
    sent_copy_verification:verification,
    delivery_receipt:receipt,
    generated_at:'2026-10-01T20:10:00Z'
  });
  assert.equal(proof.pass, true);
  assert.match(proof.proof_digest, /^sha256:/);

  const broken = buildShippingProofBundle({
    order,
    release_manifest:releaseManifest,
    shipment:{ ...shipment, provider_message_id:'gmail:other' },
    sent_copy_verification:verification,
    delivery_receipt:receipt
  });
  assert.equal(broken.pass, false);
  assert.ok(broken.reasons.includes('provider_message_id_mismatch'));
});


test('recipient response loop records evidence without silently inferring acceptance', () => {
  const order = {
    order_key:'shipping-order:response',
    state:'verified_delivered'
  };
  const shipment = {
    shipment_key:'shipment:response',
    state:'verified_delivered',
    provider_message_id:'gmail:sent-1',
    provider_thread_id:'gmail:thread-1'
  };
  const response = correlateRecipientResponse({
    order,
    shipment,
    inbound_message:{
      id:'gmail:reply-1',
      thread_id:'gmail:thread-1',
      from:'buyer@example.com',
      to:['sender@example.com'],
      subject:'Re: Client Package',
      received_at:'2026-10-01T22:03:34Z'
    }
  });
  assert.equal(response.truth_boundary.proves_inbound_response_observed, true);
  assert.equal(response.truth_boundary.proves_customer_acceptance, false);
  assert.equal(response.disposition, 'unknown');

  const signal = buildRecipientResponseSignal(response);
  assert.equal(signal.signal_type, 'recipient_response_observed');
  assert.equal(signal.recommended_next_action, 'route_to_owner_review');
  assert.equal(signal.autonomous_external_action_authorized, false);

  const approved = correlateRecipientResponse({
    order,
    shipment,
    inbound_message:{
      id:'gmail:reply-2',
      thread_id:'gmail:thread-1',
      from:'buyer@example.com',
      to:['sender@example.com'],
      subject:'Re: Client Package'
    },
    disposition:'approved',
    disposition_basis:'human_confirmed'
  });
  assert.equal(approved.truth_boundary.proves_customer_acceptance, true);

  const deduped = dedupeRecipientResponses([response, response, approved]);
  assert.equal(deduped.length, 2);
});
