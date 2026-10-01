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
