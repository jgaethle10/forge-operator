#!/usr/bin/env node
// Owner-local TOWI one-shot. Reads an already-owned Radar edition, writes only
// private TOWI research state and receipts. Never publishes or contacts anyone.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTowiResident } from './resident.mjs';

export function inspectRadarEdition(file, {
  now = new Date().toISOString(),
  maxAgeHours = 48
} = {}) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return { status: 'hold', reason: 'radar_edition_missing' };
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024
      || (stat.mode & 0o077) !== 0) {
    return { status: 'hold', reason: 'radar_edition_unsafe_or_oversized' };
  }
  let edition;
  try {
    edition = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { status: 'hold', reason: 'radar_edition_invalid_json' };
  }
  if (edition?.schema !== 'evercraft.systemia-radar.edition.v1'
      || typeof edition.edition_id !== 'string'
      || edition.edition_id.length < 3 || edition.edition_id.length > 200
      || !Array.isArray(edition.signals)
      || !Array.isArray(edition.rolled_off_signals)
      || edition.signals.length + edition.rolled_off_signals.length > 200) {
    return { status: 'hold', reason: 'radar_edition_invalid_contract' };
  }
  const nowMs = Date.parse(now);
  const editionMs = Date.parse(edition.generated_at);
  if (!Number.isFinite(nowMs) || !Number.isFinite(editionMs)
      || editionMs > nowMs + 5 * 60 * 1000
      || nowMs - editionMs > maxAgeHours * 3600 * 1000) {
    return { status: 'hold', reason: 'radar_edition_stale_or_future' };
  }
  return { status: 'ready', edition };
}

export async function runTowiFromOwnerRadar({
  radarStateDir = process.env.RADAR_STATE_DIR || path.resolve('.runtime', 'radar'),
  towiStateDir = process.env.TOWI_STATE_DIR || path.resolve('.runtime', 'towi'),
  clock = () => new Date()
} = {}) {
  const observedAt = clock().toISOString();
  const inspected = inspectRadarEdition(path.join(radarStateDir, 'latest-edition.json'), { now: observedAt });
  if (inspected.status !== 'ready') {
    return {
      schema: 'evercraft.towi.owner-once-receipt.v1',
      status: 'hold',
      reason: inspected.reason,
      evidence_retrieved: false,
      publication_authority: false,
      institutional_contact_authority: false
    };
  }
  const resident = createTowiResident({ stateDir: towiStateDir, clock });
  const receipt = await resident.runOnce({ radarEdition: inspected.edition });
  return {
    schema: 'evercraft.towi.owner-once-receipt.v1',
    status: receipt.status,
    reason: receipt.status === 'failed' ? 'resident_cycle_failed' : 'owner_private_research_cycle',
    source_edition_id: inspected.edition.edition_id,
    dossier_count: receipt.dossier_count ?? null,
    ingest_status: receipt.ingest_status ?? null,
    evidence_retrieved: true,
    publication_authority: false,
    institutional_contact_authority: false
  };
}

const executing = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (executing) {
  if (process.argv.length !== 3 || process.argv[2] !== '--from-radar') {
    console.error('Usage: node systemia/towi/once.mjs --from-radar');
    process.exitCode = 2;
  } else {
    try {
      const result = await runTowiFromOwnerRadar();
      console.log(JSON.stringify(result));
      if (result.status !== 'pass') process.exitCode = 1;
    } catch {
      console.error('TOWI_OWNER_CYCLE_HELD: resident initialization or storage failed');
      process.exitCode = 1;
    }
  }
}
