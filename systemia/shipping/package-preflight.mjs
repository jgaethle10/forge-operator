import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const INTERNAL_NAME_PATTERNS = [
  /world[\s._-]*class/i,
  /(^|[\s._-])draft([\s._-]|$)/i,
  /(^|[\s._-])internal([\s._-]|$)/i,
  /(^|[\s._-])tmp([\s._-]|$)/i,
  /(^|[\s._-])final([\s._-]|$)/i,
  /(^|[\s._-])v\d+([\s._-]|$)/i
];

const MIME_BY_EXT = {
  '.pdf':'application/pdf',
  '.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.webp':'image/webp',
  '.txt':'text/plain',
  '.csv':'text/csv',
  '.json':'application/json'
};

function clean(value) {
  return String(value ?? '').trim();
}

function sha256(buffer) {
  return 'sha256:' + crypto.createHash('sha256').update(buffer).digest('hex');
}

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function manifestDigest(value) {
  return 'sha256:' + crypto.createHash('sha256').update(stable(value)).digest('hex');
}

function detectSignature(buffer, ext) {
  if (!buffer?.length) return { openable:false, reason:'empty_file' };
  if (ext === '.pdf') {
    const head = buffer.subarray(0, 8).toString('latin1');
    const tail = buffer.subarray(Math.max(0, buffer.length - 2048)).toString('latin1');
    return head.startsWith('%PDF-') && tail.includes('%%EOF')
      ? { openable:true, reason:'pdf_signature_and_eof' }
      : { openable:false, reason:'invalid_pdf_signature_or_eof' };
  }
  if (['.docx','.xlsx','.pptx'].includes(ext)) {
    const zip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b &&
      ((buffer[2] === 0x03 && buffer[3] === 0x04) || (buffer[2] === 0x05 && buffer[3] === 0x06));
    return zip ? { openable:true, reason:'office_zip_signature' } : { openable:false, reason:'invalid_office_zip_signature' };
  }
  if (ext === '.png') {
    const ok = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    return ok ? { openable:true, reason:'png_signature' } : { openable:false, reason:'invalid_png_signature' };
  }
  if (['.jpg','.jpeg'].includes(ext)) {
    const ok = buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 &&
      buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
    return ok ? { openable:true, reason:'jpeg_signature' } : { openable:false, reason:'invalid_jpeg_signature' };
  }
  return { openable:true, reason:'signature_check_not_required_for_type' };
}

export function sanitizeClientFilename(value, { fallback = 'Evercraft Deliverable' } = {}) {
  const raw = path.basename(clean(value) || fallback);
  const ext = path.extname(raw).toLowerCase();
  let stem = path.basename(raw, ext)
    .replace(/world[\s._-]*class/ig, '')
    .replace(/(^|[\s._-])(draft|internal|tmp|final|v\d+)(?=[\s._-]|$)/ig, ' ')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/[._-]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (!stem) stem = fallback;
  const safeExt = ext.replace(/[^.a-z0-9]/g, '');
  return (stem + safeExt).slice(0, 180);
}

export function hasInternalFilenameMarkers(filename) {
  const base = path.basename(clean(filename));
  return INTERNAL_NAME_PATTERNS.some((pattern) => pattern.test(base));
}

function loadArtifactBytes(artifact) {
  if (Buffer.isBuffer(artifact?.bytes)) return artifact.bytes;
  if (artifact?.content_base64) return Buffer.from(String(artifact.content_base64), 'base64');
  if (clean(artifact?.path) && fs.existsSync(path.resolve(artifact.path))) return fs.readFileSync(path.resolve(artifact.path));
  return null;
}

export function inspectArtifact(artifact = {}, {
  require_openability = true,
  require_render_verification = true
} = {}) {
  const sourceFilename = clean(artifact.source_filename || artifact.filename || artifact.path);
  const clientFilename = clean(artifact.client_filename || sanitizeClientFilename(sourceFilename));
  const ext = path.extname(clientFilename).toLowerCase();
  const bytes = loadArtifactBytes(artifact);
  const reasons = [];

  if (!clientFilename) reasons.push('client_filename_required');
  if (hasInternalFilenameMarkers(clientFilename)) reasons.push('internal_filename_marker_present');
  if (!ext) reasons.push('file_extension_required');

  const declaredMime = clean(artifact.mime_type).toLowerCase();
  const expectedMime = MIME_BY_EXT[ext] || null;
  if (declaredMime && expectedMime && declaredMime !== expectedMime) reasons.push('mime_extension_mismatch');

  let openability = { openable:null, reason:'not_inspected' };
  let sizeBytes = Number(artifact.size_bytes || 0) || null;
  let digest = clean(artifact.sha256 || artifact.digest) || null;

  if (bytes) {
    sizeBytes = bytes.length;
    digest = sha256(bytes);
    openability = detectSignature(bytes, ext);
  } else if (artifact.qa?.openable === true) {
    openability = { openable:true, reason:'external_openability_evidence' };
  }

  if (require_openability && openability.openable !== true) reasons.push('openability_not_verified');

  const isRenderedDocument = ext === '.pdf' || ext === '.pptx' || ext === '.docx';
  if (require_render_verification && isRenderedDocument && artifact.qa?.render_verified !== true) {
    reasons.push('render_verification_required');
  }

  if (!sizeBytes || sizeBytes <= 0) reasons.push('file_size_unknown_or_empty');
  if (!digest) reasons.push('artifact_digest_required');

  return {
    schema:'evercraft.shipping.artifact-inspection.v1',
    source_filename:sourceFilename || null,
    client_filename:clientFilename,
    mime_type:declaredMime || expectedMime || null,
    size_bytes:sizeBytes,
    sha256:digest,
    openability,
    render_verified:artifact.qa?.render_verified === true,
    renderer_count:Number(artifact.qa?.renderer_count || 0) || null,
    client_visible:true,
    pass:reasons.length === 0,
    reasons
  };
}

export function preflightPackage({
  artifacts = [],
  require_openability = true,
  require_render_verification = true,
  max_total_bytes = 25 * 1024 * 1024
} = {}) {
  const reasons = [];
  if (!Array.isArray(artifacts) || artifacts.length === 0) reasons.push('at_least_one_artifact_required');

  const inspections = (artifacts || []).map((artifact) => inspectArtifact(artifact, {
    require_openability,
    require_render_verification
  }));

  for (const row of inspections) {
    for (const reason of row.reasons) reasons.push(row.client_filename + ':' + reason);
  }

  const nameSet = new Set();
  for (const row of inspections) {
    const key = row.client_filename.toLowerCase();
    if (nameSet.has(key)) reasons.push(row.client_filename + ':duplicate_client_filename');
    nameSet.add(key);
  }

  const digestSet = new Set();
  for (const row of inspections) {
    if (!row.sha256) continue;
    if (digestSet.has(row.sha256)) reasons.push(row.client_filename + ':duplicate_artifact_content');
    digestSet.add(row.sha256);
  }

  const totalBytes = inspections.reduce((sum, row) => sum + Number(row.size_bytes || 0), 0);
  if (totalBytes > max_total_bytes) reasons.push('package_exceeds_transport_size_budget');

  const manifestCore = {
    schema:'evercraft.shipping.package-manifest.v2',
    artifact_count:inspections.length,
    total_bytes:totalBytes,
    artifacts:inspections.map((row) => ({
      client_filename:row.client_filename,
      mime_type:row.mime_type,
      size_bytes:row.size_bytes,
      sha256:row.sha256,
      openability:row.openability,
      render_verified:row.render_verified,
      renderer_count:row.renderer_count
    }))
  };

  return {
    ...manifestCore,
    pass:reasons.length === 0,
    reasons:[...new Set(reasons)],
    package_digest:manifestDigest(manifestCore)
  };
}
