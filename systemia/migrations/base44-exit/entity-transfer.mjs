import { createHash, randomUUID } from 'node:crypto';

const sha = (value) => {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return 'sha256:' + createHash('sha256').update(input).digest('hex');
};

function required(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(field + '_required');
  return text;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stableValue(value[key]);
    return out;
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function validateRows(rows, keyField) {
  if (!Array.isArray(rows)) throw new Error('migration_page_rows_required');
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('migration_row_invalid');
    if (row[keyField] == null || String(row[keyField]).trim() === '') throw new Error('migration_row_key_required');
  }
  return rows;
}

function parsePage(data, expectedRows) {
  const text = Buffer.from(data).toString('utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line) => JSON.parse(line));
  if (rows.length !== Number(expectedRows)) throw new Error('migration_page_row_count_mismatch');
  return rows;
}

function pageContent(rows) {
  return Buffer.from(rows.map((row) => stableJson(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
}

export async function exportLegacyEntityBundle({
  appKey,
  entityName,
  pageSource,
  objectStore,
  keyField = 'id',
  pageSize = 500,
  maxPages = 100000
} = {}) {
  const app = required(appKey, 'app_key');
  const entity = required(entityName, 'entity_name');
  const key = required(keyField, 'key_field');
  if (typeof pageSource !== 'function') throw new Error('migration_page_source_required');
  if (!objectStore || typeof objectStore.put !== 'function') throw new Error('migration_object_store_required');

  const size = Math.max(1, Math.min(5000, Number(pageSize) || 500));
  const limitPages = Math.max(1, Math.min(1000000, Number(maxPages) || 100000));
  const pages = [];
  const seenCursors = new Set();
  const seenKeys = new Set();
  const streamHash = createHash('sha256');
  let cursor = null;
  let totalRows = 0;
  let assertedSourceTotal = null;
  let terminalExhaustion = false;

  for (let pageIndex = 0; pageIndex < limitPages; pageIndex += 1) {
    const cursorFingerprint = sha(cursor == null ? 'initial' : stableJson(cursor));
    if (seenCursors.has(cursorFingerprint)) throw new Error('migration_pagination_cursor_loop');
    seenCursors.add(cursorFingerprint);

    const page = await pageSource({
      cursor,
      limit: size,
      pageIndex
    });
    const rows = validateRows(page?.rows, key);
    if (rows.length > size) throw new Error('migration_page_exceeds_requested_limit');

    if (page?.sourceTotal != null) {
      const nextTotal = Number(page.sourceTotal);
      if (!Number.isInteger(nextTotal) || nextTotal < 0) throw new Error('migration_source_total_invalid');
      if (assertedSourceTotal == null) assertedSourceTotal = nextTotal;
      else if (assertedSourceTotal !== nextTotal) throw new Error('migration_source_total_changed_during_export');
    }

    for (const row of rows) {
      const value = String(row[key]);
      if (seenKeys.has(value)) throw new Error('migration_source_key_duplicate');
      seenKeys.add(value);
      streamHash.update(stableJson(row) + '\n');
    }

    const content = pageContent(rows);
    const stored = objectStore.put(app, content, {
      name: 'base44-exit/' + entity + '/page-' + String(pageIndex).padStart(6, '0') + '.ndjson',
      contentType: 'application/x-ndjson',
      metadata: {
        migration: 'base44-exit',
        entity,
        page_index: pageIndex,
        row_count: rows.length,
        source_cursor_fingerprint: cursorFingerprint
      }
    });

    pages.push({
      page_index: pageIndex,
      object_ref: stored.reference.object_ref,
      blob_sha256: stored.reference.blob_sha256,
      row_count: rows.length,
      source_cursor_fingerprint: cursorFingerprint,
      object_receipt_hash: stored.receipt.receipt_hash
    });
    totalRows += rows.length;

    terminalExhaustion = page?.exhausted === true;
    if (terminalExhaustion) {
      if (page?.nextCursor != null && String(page.nextCursor).trim()) {
        throw new Error('migration_terminal_page_has_next_cursor');
      }
      break;
    }

    if (page?.nextCursor == null || String(page.nextCursor).trim() === '') {
      throw new Error('migration_next_cursor_required_before_exhaustion');
    }
    cursor = page.nextCursor;
  }

  if (!terminalExhaustion) throw new Error('migration_terminal_exhaustion_not_proven');
  if (assertedSourceTotal != null && assertedSourceTotal !== totalRows) {
    throw new Error('migration_source_total_mismatch');
  }

  const manifest = {
    schema: 'evercraft.base44.entity-transfer-manifest.v1',
    transfer_id: 'entity_transfer_' + randomUUID(),
    app_key_hash: sha(app),
    entity,
    key_field: key,
    page_size: size,
    page_count: pages.length,
    row_count: totalRows,
    asserted_source_total: assertedSourceTotal,
    terminal_exhaustion_verified: true,
    record_stream_sha256: 'sha256:' + streamHash.digest('hex'),
    pages,
    source_secret_values_emitted: false,
    source_cursor_values_emitted: false,
    source_mutated: false,
    traffic_cutover_performed: false,
    exported_at: new Date().toISOString()
  };
  const manifestStored = objectStore.put(app, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), {
    name: 'base44-exit/' + entity + '/manifest.json',
    contentType: 'application/json',
    metadata: {
      migration: 'base44-exit',
      entity,
      transfer_id: manifest.transfer_id,
      row_count: totalRows
    }
  });

  return {
    manifest,
    manifest_object_ref: manifestStored.reference.object_ref,
    manifest_blob_sha256: manifestStored.reference.blob_sha256,
    manifest_receipt_hash: manifestStored.receipt.receipt_hash
  };
}

export function importEntityBundle({
  appKey,
  entityName,
  manifest,
  objectStore,
  entityStore,
  batchSize = 500
} = {}) {
  const app = required(appKey, 'app_key');
  const entity = required(entityName, 'entity_name');
  if (manifest?.schema !== 'evercraft.base44.entity-transfer-manifest.v1') throw new Error('migration_manifest_schema_invalid');
  if (manifest.app_key_hash !== sha(app)) throw new Error('migration_manifest_app_mismatch');
  if (manifest.entity !== entity) throw new Error('migration_manifest_entity_mismatch');
  if (manifest.terminal_exhaustion_verified !== true) throw new Error('migration_terminal_exhaustion_not_proven');
  if (!objectStore || typeof objectStore.get !== 'function') throw new Error('migration_object_store_required');
  if (!entityStore || typeof entityStore.importRecords !== 'function') throw new Error('migration_entity_store_required');

  const key = required(manifest.key_field, 'key_field');
  const pages = Array.isArray(manifest.pages) ? [...manifest.pages].sort((a,b) => a.page_index - b.page_index) : [];
  if (pages.length !== Number(manifest.page_count)) throw new Error('migration_manifest_page_count_mismatch');

  const streamHash = createHash('sha256');
  const seenKeys = new Set();
  let verifiedRows = 0;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (page.page_index !== index) throw new Error('migration_page_sequence_invalid');
    const stored = objectStore.get(app, page.object_ref);
    if (stored.reference.blob_sha256 !== page.blob_sha256) throw new Error('migration_page_blob_hash_mismatch');
    const rows = validateRows(parsePage(stored.data, page.row_count), key);
    for (const row of rows) {
      const value = String(row[key]);
      if (seenKeys.has(value)) throw new Error('migration_bundle_key_duplicate');
      seenKeys.add(value);
      streamHash.update(stableJson(row) + '\n');
    }
    verifiedRows += rows.length;
  }

  if (verifiedRows !== Number(manifest.row_count)) throw new Error('migration_manifest_row_count_mismatch');
  const computedStreamHash = 'sha256:' + streamHash.digest('hex');
  if (computedStreamHash !== manifest.record_stream_sha256) throw new Error('migration_record_stream_hash_mismatch');
  if (manifest.asserted_source_total != null && Number(manifest.asserted_source_total) !== verifiedRows) {
    throw new Error('migration_asserted_source_total_mismatch');
  }

  const size = Math.max(1, Math.min(5000, Number(batchSize) || 500));
  const mutationReceipts = [];
  let importedRows = 0;
  for (const page of pages) {
    const stored = objectStore.get(app, page.object_ref);
    const rows = parsePage(stored.data, page.row_count);
    for (let offset = 0; offset < rows.length; offset += size) {
      const batch = rows.slice(offset, offset + size);
      const result = entityStore.importRecords(app, entity, batch, { key });
      mutationReceipts.push(result.receipt.receipt_hash);
      importedRows += result.records.length;
    }
  }

  const destination = entityStore.state(app, entity).records;
  const byKey = new Map(destination.map((row) => [String(row[key]), row]));
  let verifiedDestinationRows = 0;
  for (const page of pages) {
    const rows = parsePage(objectStore.get(app, page.object_ref).data, page.row_count);
    for (const source of rows) {
      const destinationRow = byKey.get(String(source[key]));
      if (!destinationRow) throw new Error('migration_destination_row_missing');
      for (const [field, sourceValue] of Object.entries(source)) {
        if (stableJson(destinationRow[field]) !== stableJson(sourceValue)) {
          throw new Error('migration_destination_value_mismatch:' + field);
        }
      }
      verifiedDestinationRows += 1;
    }
  }

  return {
    schema: 'evercraft.base44.entity-transfer-receipt.v1',
    transfer_id: manifest.transfer_id,
    app_key_hash: manifest.app_key_hash,
    entity,
    key_field: key,
    source_rows: manifest.row_count,
    imported_rows: importedRows,
    destination_rows_verified: verifiedDestinationRows,
    record_stream_sha256: computedStreamHash,
    terminal_exhaustion_verified: true,
    mutation_receipt_hashes: mutationReceipts,
    source_mutated: false,
    traffic_cutover_performed: false,
    completed_at: new Date().toISOString()
  };
}
