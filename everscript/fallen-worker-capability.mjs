import { createHash } from 'node:crypto';
import { sanitizeRenderJob } from '../systemia/media-studio/render-worker/policy.mjs';

const digest = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const shaRx = /^[0-9a-f]{64}$/i;

export function verifyFallenWorkerReceipt(job, response) {
  if (!response || response.ok !== true) throw new Error('fallen_worker_not_ok');
  const { ok, ...receipt } = response;
  if (receipt.schema !== 'evercraft.fallen.render-receipt.v1') throw new Error('fallen_receipt_schema_invalid');
  if (receipt.job_id !== job.job_id || receipt.stage_id !== job.stage.id) throw new Error('fallen_receipt_identity_mismatch');
  if (receipt.frame_start !== job.frame_start || receipt.frame_count !== job.frame_count || receipt.total_frames !== job.total_frames) {
    throw new Error('fallen_receipt_frame_range_mismatch');
  }
  const expectedStageHash = digest({ ...job.stage, createdAt: undefined });
  if (receipt.stage_sha256 !== expectedStageHash) throw new Error('fallen_receipt_stage_digest_mismatch');
  const boundary = receipt.boundaries;
  if (!boundary || boundary.external_network_allowed !== false || boundary.arbitrary_html_accepted !== false ||
      boundary.asset_uri_only !== true || boundary.asset_sha256_verified !== true || boundary.exact_frame_control !== true) {
    throw new Error('fallen_receipt_boundary_missing');
  }
  if (!Array.isArray(receipt.frames) || receipt.frames.length !== job.frame_count) throw new Error('fallen_receipt_frames_missing');
  if (!Array.isArray(receipt.console_errors) || receipt.console_errors.length) throw new Error('fallen_receipt_console_errors');
  if (!Array.isArray(receipt.assets) || receipt.assets.length !== job.assets.length) throw new Error('fallen_receipt_assets_missing');
  const expectedAssets = new Map(job.assets.map(a => [a.id, a]));
  for (const a of receipt.assets) {
    const expected = expectedAssets.get(a.id);
    if (!expected || expected.sha256 !== a.sha256 || expected.filename !== a.filename) throw new Error('fallen_receipt_asset_identity_mismatch');
  }
  const seenFrames = new Set();
  for (let i = 0; i < receipt.frames.length; i++) {
    const frame = receipt.frames[i];
    if (frame.frame !== job.frame_start + i || !shaRx.test(frame.sha256) || frame.bytes <= 0 || seenFrames.has(frame.frame)) {
      throw new Error('fallen_receipt_frame_invalid');
    }
    seenFrames.add(frame.frame);
  }
  if (!shaRx.test(receipt.receipt_sha256)) throw new Error('fallen_receipt_digest_missing');
  const { receipt_sha256, ...unsigned } = receipt;
  if (digest(unsigned) !== receipt_sha256) throw new Error('fallen_receipt_digest_invalid');
  return { verified: true, job_id: receipt.job_id, frame_count: receipt.frame_count,
    stage_sha256: receipt.stage_sha256, receipt_sha256, frame_sha256: receipt.frames.map(f => f.sha256) };
}

function exactRenderJob(request) {
  const job = sanitizeRenderJob(request);
  if ((request.frame_start ?? 0) !== job.frame_start || (request.frame_count ?? 1) !== job.frame_count ||
      request.stage.width !== job.stage.width || request.stage.height !== job.stage.height ||
      request.stage.fps !== job.stage.fps || request.stage.durationSec !== job.stage.durationSec) {
    throw new Error('fallen_render_request_normalized_or_clamped');
  }
  return job;
}

/**
 * Local/owned composition boundary, NOT a public network adapter.
 * Caller supplies a signed EverScript manifest and an authorized dispatch handler.
 * Caller MUST compile with requireSignedManifests=true and an appropriate trust store,
 * require human approval before FallenRenderWorker.render, and use authenticated
 * Systemia/Yard admission before connecting a production transport.
 */
export function createFallenWorkerCapability({ manifest, dispatch, quoteCostCents = 0 } = {}) {
  if (manifest?.name !== 'FallenRenderWorker' || !manifest?.signature || manifest.signature.algorithm !== 'Ed25519' || !manifest?.actions?.render || manifest.actions.render.arity !== 1) {
    throw new Error('fallen_manifest_contract_invalid');
  }
  if (typeof dispatch !== 'function') throw new Error('fallen_authorized_transport_required');
  if (!Number.isInteger(quoteCostCents) || quoteCostCents < 0) throw new Error('fallen_quote_invalid');
  return {
    manifest,
    async quote(action, args) {
      if (action !== 'render' || args.length !== 1) throw new Error('fallen_action_invalid');
      exactRenderJob(args[0]);
      return quoteCostCents;
    },
    async invoke(action, args, context) {
      if (action !== 'render' || args.length !== 1) throw new Error('fallen_action_invalid');
      if (context?.approvalGranted !== true) throw new Error('fallen_approval_required');
      const job = exactRenderJob(args[0]);
      const raw = await dispatch(job, context);
      const proof = verifyFallenWorkerReceipt(job, raw);
      return { value: proof, costCents: quoteCostCents,
        evidence: { job_id: job.job_id, stage_sha256: proof.stage_sha256,
          receipt_sha256: proof.receipt_sha256, output: 'private_worker_receipt_only',
          publication_authority: false, payment_authority: false } };
    }
  };
}
