import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function sha256File(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  if (buf.length < 24 || !buf.subarray(0,8).equals(signature)) {
    throw new Error('not_png:' + filePath);
  }
  if (buf.subarray(12,16).toString('ascii') !== 'IHDR') {
    throw new Error('png_missing_ihdr:' + filePath);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function byId(rows = []) {
  return new Map(rows.map((row) => [row.id, row]));
}

function push(blockers, code, detail = {}) {
  blockers.push({ code, ...detail });
}

export function evaluateBrandFidelity({
  baselineManifest,
  candidateManifest,
  baselineRoot,
  candidateRoot,
}) {
  const blockers = [];

  if (!baselineManifest || baselineManifest.capture_state !== 'APPROVED_BASELINE_CAPTURED') {
    push(blockers, 'approved_baseline_capture_required');
    return { ok:false, blockers };
  }

  if (!candidateManifest || candidateManifest.capture_state !== 'CANDIDATE_CAPTURED') {
    push(blockers, 'candidate_capture_required');
    return { ok:false, blockers };
  }

  for (const field of ['schema','product_id','brand_namespace','baseline_release_ref']) {
    if (baselineManifest[field] !== candidateManifest[field]) {
      push(blockers, 'manifest_identity_drift', { field });
    }
  }

  if (baselineManifest.brand_namespace !== 'rivet-isolated') {
    push(blockers, 'brand_namespace_must_be_rivet_isolated');
  }

  const baselineViewports = byId(baselineManifest.viewports);
  const candidateViewports = byId(candidateManifest.viewports);
  for (const [id, expected] of baselineViewports) {
    const actual = candidateViewports.get(id);
    if (!actual) {
      push(blockers, 'missing_viewport', { id });
      continue;
    }
    if (expected.width !== actual.width || expected.height !== actual.height) {
      push(blockers, 'viewport_drift', { id, expected:{width:expected.width,height:expected.height}, actual:{width:actual.width,height:actual.height} });
    }
  }
  for (const id of candidateViewports.keys()) {
    if (!baselineViewports.has(id)) push(blockers, 'unexpected_viewport', { id });
  }

  if (JSON.stringify(stable(baselineManifest.protected_tokens || {})) !== JSON.stringify(stable(candidateManifest.protected_tokens || {}))) {
    push(blockers, 'protected_token_drift');
  }

  if (JSON.stringify(stable(baselineManifest.interaction_contract || {})) !== JSON.stringify(stable(candidateManifest.interaction_contract || {}))) {
    push(blockers, 'interaction_contract_drift');
  }

  const baseShots = byId(baselineManifest.screenshots);
  const candidateShots = byId(candidateManifest.screenshots);

  for (const [id, expected] of baseShots) {
    const actual = candidateShots.get(id);
    if (!actual) {
      push(blockers, 'missing_screenshot', { id });
      continue;
    }

    const expectedFile = path.resolve(baselineRoot, expected.file);
    const actualFile = path.resolve(candidateRoot, actual.file);

    if (!fs.existsSync(expectedFile) || !fs.existsSync(actualFile)) {
      push(blockers, 'screenshot_file_missing', { id });
      continue;
    }

    const expectedDimensions = readPngDimensions(expectedFile);
    const actualDimensions = readPngDimensions(actualFile);
    if (expectedDimensions.width !== actualDimensions.width || expectedDimensions.height !== actualDimensions.height) {
      push(blockers, 'screenshot_dimension_drift', { id, expected:expectedDimensions, actual:actualDimensions });
    }

    const expectedSha = sha256File(expectedFile);
    const actualSha = sha256File(actualFile);
    if (expectedSha !== actualSha) {
      push(blockers, 'screenshot_visual_drift', { id, expected_sha256:expectedSha, actual_sha256:actualSha });
    }
  }

  for (const id of candidateShots.keys()) {
    if (!baseShots.has(id)) push(blockers, 'unexpected_screenshot', { id });
  }

  const baseAssets = byId(baselineManifest.assets);
  const candidateAssets = byId(candidateManifest.assets);
  for (const [id, expected] of baseAssets) {
    const actual = candidateAssets.get(id);
    if (!actual) {
      push(blockers, 'missing_asset', { id });
      continue;
    }
    if (expected.sha256 !== actual.sha256) {
      push(blockers, 'brand_asset_drift', { id });
    }
  }

  if (candidateManifest.accidental_parent_theme_inheritance === true) {
    push(blockers, 'evercraft_theme_inheritance_detected');
  }

  return { ok:blockers.length === 0, blockers };
}

export function assertBrandFidelity(input) {
  const result = evaluateBrandFidelity(input);
  if (!result.ok) {
    const err = new Error('brand_fidelity_gate_failed:' + result.blockers.map((row) => row.code).join(','));
    err.result = result;
    throw err;
  }
  return result;
}
