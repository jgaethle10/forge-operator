// Shadow-only, deterministic evaluator for a complete Remote Operator paged read.
// No network access, filesystem access, agent dispatch, credential use, or write.
// A worker's "done" claim cannot turn partial or mismatched bytes into evidence.
import { createHash } from 'node:crypto';

const SCHEMA = 'evercraft.saban.remote-source-observation.v1';
const HASH = /^sha256:[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{3,127}$/;
const SAFE_ROOT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 128;

const sha256 = bytes =>
  'sha256:' + createHash('sha256').update(bytes).digest('hex');

function isRelativePath(value) {
  return typeof value === 'string' && value.length > 0 &&
    value.length <= 4096 && !value.startsWith('/') &&
    !value.includes('\\') && !value.includes('\0') &&
    value.split('/').every(segment => segment && segment !== '.' && segment !== '..');
}

function canonicalBase64(text) {
  if (typeof text !== 'string' || text.length > Math.ceil(MAX_PAGE_BYTES / 3) * 4 + 4 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) {
    throw new Error('page_base64_invalid');
  }
  const bytes = Buffer.from(text, 'base64');
  if (bytes.length > MAX_PAGE_BYTES || bytes.toString('base64') !== text) {
    throw new Error('page_base64_invalid');
  }
  return bytes;
}

export function verifyRemoteSourceObservation({
  missionId, sourceId, rootKey, relativePath,
  expectedSha256, expectedBytes, pages, workerReport = null,
} = {}) {
  // Hash and byte count must originate from a trusted coordinator before
  // worker execution. This function cannot independently prove their origin.
  const receipt = {
    schema: SCHEMA,
    mission_id: missionId ?? null,
    source_id: sourceId ?? null,
    source_root_key: rootKey ?? null,
    source_relative_path: relativePath ?? null,
    status: 'hold',
    reason: null,
    expected_sha256: expectedSha256 ?? null,
    expected_bytes: expectedBytes ?? null,
    observed_sha256: null,
    observed_bytes: 0,
    pages_verified: 0,
    observed_page_receipts: [],
    worker_claimed_complete:
      workerReport?.status === 'completed' || workerReport?.verified === true,
    evidence_source: 'captured_remote_operator_paged_responses',
    source_bytes_verified: false,
    objective_semantics_verified: false,
    remote_node_identity_attested: false,
    coordinator_expectation_origin_attested: false,
    runtime_dispatched: false,
  };

  try {
    if (!SAFE_ID.test(String(missionId || '')) ||
        !SAFE_ID.test(String(sourceId || ''))) {
      throw new Error('mission_source_binding_required');
    }
    if (!SAFE_ROOT.test(String(rootKey || '')) || !isRelativePath(relativePath)) {
      throw new Error('source_path_binding_invalid');
    }
    if (!HASH.test(String(expectedSha256 || '')) ||
        !Number.isSafeInteger(expectedBytes) ||
        expectedBytes < 0 || expectedBytes > MAX_FILE_BYTES) {
      throw new Error('predeclared_source_identity_invalid');
    }
    if (!Array.isArray(pages) || pages.length === 0 ||
        pages.length > MAX_PAGES) {
      throw new Error('pages_required_or_limit_exceeded');
    }

    const chunks = [];
    let offset = 0;
    let complete = false;
    for (const page of pages) {
      if (complete) throw new Error('unexpected_page_after_end');
      if (!page || page.ok !== true || page.read_mode !== 'paged' ||
          page.encoding !== 'base64' || page.root_key !== rootKey ||
          page.path !== relativePath || page.sha256 !== expectedSha256 ||
          page.file_bytes !== expectedBytes) {
        throw new Error('page_identity_binding_mismatch');
      }
      if (!Number.isSafeInteger(page.offset_bytes) ||
          page.offset_bytes !== offset) {
        throw new Error('page_offset_mismatch');
      }

      const bytes = canonicalBase64(page.content);
      if (page.bytes !== bytes.length ||
          !HASH.test(String(page.page_sha256 || '')) ||
          page.page_sha256 !== sha256(bytes)) {
        throw new Error('page_content_integrity_mismatch');
      }
      if (offset + bytes.length > expectedBytes) {
        throw new Error('page_exceeds_declared_source_bytes');
      }
      chunks.push(bytes);
      receipt.pages_verified++;
      receipt.observed_page_receipts.push({
        offset_bytes: offset,
        bytes: bytes.length,
        page_sha256: page.page_sha256,
      });
      offset += bytes.length;
      receipt.observed_bytes = offset;

      if (page.truncated === true) {
        if (bytes.length === 0 || page.next_offset_bytes !== offset ||
            offset >= expectedBytes) {
          throw new Error('page_cursor_invalid');
        }
      } else if (page.truncated === false) {
        if (page.next_offset_bytes !== null || offset !== expectedBytes) {
          throw new Error('final_page_size_or_cursor_invalid');
        }
        complete = true;
      } else {
        throw new Error('page_completion_marker_missing');
      }
    }

    if (!complete) throw new Error('source_read_incomplete');
    const observed = sha256(Buffer.concat(chunks, offset));
    receipt.observed_sha256 = observed;
    if (observed !== expectedSha256) {
      throw new Error('assembled_source_hash_mismatch');
    }
    receipt.status = 'source_bytes_verified';
    receipt.source_bytes_verified = true;
  } catch (error) {
    receipt.reason = String(error?.message || 'source_observation_failed');
  }
  return receipt;
}
