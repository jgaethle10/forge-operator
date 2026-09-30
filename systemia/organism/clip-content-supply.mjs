#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const APP_ID = process.env.EVERCRAFT_CLIP_APP_ID || '6a83af980c9f995f588c7df3';
const INGRESS_URL = process.env.EVERCRAFT_CLIP_SUPPLY_INGRESS_URL || `https://base44.app/api/apps/${APP_ID}/functions/systemiaClipSupplyIngress`;
const TOKEN_FILE = String(process.env.SYSTEMIA_CLIP_SUPPLY_ID_TOKEN_FILE || '').trim();
const OUT = path.resolve(process.env.CLIP_SUPPLY_RECEIPT_PATH || 'artifacts/clip-content-supply/latest.json');
const MAX_REQUESTS = Math.max(1, Math.min(Number(process.env.CLIP_SUPPLY_MAX_REQUESTS || 2), 3));
const EXCLUDED_PAGE_IDS = new Set([
  '116675248108887',
  '1302468962947782',
]);

function clean(value, max = 3000) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}
function sha(value) {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function pdOrCc0(value) {
  return /public domain|cc0|cc-zero|pd-old|pd-usgov/i.test(clean(value, 500));
}
function decodeHtml(value) {
  return clean(value, 1500)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
function token() {
  if (!TOKEN_FILE || !fs.existsSync(TOKEN_FILE)) throw new Error('SYSTEMIA_CLIP_SUPPLY_ID_TOKEN_FILE missing');
  const value = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  if (!value) throw new Error('Clip supply workload identity file is empty');
  return value;
}
async function ingress(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(INGRESS_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + token(),
        'user-agent': 'EvercraftClipSupply/1.0',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok && data?.ok === true, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}
async function commonsCandidates(request) {
  const terms = Array.isArray(request?.search_terms) && request.search_terms.length
    ? request.search_terms.slice(0, 4).join(' ')
    : clean(request?.page_name, 300);
  if (!terms) return [];

  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: '20',
    gsrsearch: terms,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
  });
  const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params.toString(), {
    headers: { 'user-agent': 'EvercraftClipSupply/1.0 (rights-cleared media discovery)' },
  });
  if (!response.ok) return [];
  const body = await response.json();
  const pages = Object.values(body?.query?.pages || {});

  return pages.flatMap((page) => {
    const info = page?.imageinfo?.[0];
    const mime = clean(info?.mime, 100).toLowerCase();
    const direct = clean(info?.url, 3000);
    if (!mime.startsWith('video/') || !/\.(?:webm|mp4)(?:\?|$)/i.test(direct)) return [];

    const ext = info?.extmetadata || {};
    const licenseName = decodeHtml(ext?.LicenseShortName?.value || ext?.UsageTerms?.value);
    const usage = decodeHtml(ext?.UsageTerms?.value);
    if (!pdOrCc0(licenseName + ' ' + usage)) return [];

    const creator = decodeHtml(ext?.Artist?.value || ext?.Credit?.value || ext?.Attribution?.value);
    const descriptionUrl = clean(info?.descriptionurl, 3000) ||
      'https://commons.wikimedia.org/wiki/' + encodeURIComponent(clean(page?.title, 500).replace(/ /g, '_'));

    return [{
      provider_key: 'wikimedia_commons',
      provider_asset_id: String(page?.pageid || ''),
      title: clean(page?.title, 500).replace(/^File:/, ''),
      source_url: descriptionUrl,
      direct_media_url: direct,
      mime,
      license_name: licenseName,
      license_url: clean(ext?.LicenseUrl?.value, 1800),
      creator_name: creator,
      credit_line: [creator, 'Wikimedia Commons', licenseName].filter(Boolean).join(' · '),
      permission_evidence: 'Wikimedia Commons machine-readable metadata. License: ' + licenseName + '. Usage terms: ' + usage + '.',
    }];
  });
}

export async function run() {
  const startedAt = new Date().toISOString();
  const receipt = {
    schema: 'evercraft.systemia.clip-content-supply.v1',
    started_at: startedAt,
    completed_at: null,
    ingress_url_host: new URL(INGRESS_URL).hostname,
    max_requests: MAX_REQUESTS,
    requests_seen: 0,
    requests_attempted: 0,
    assets_created: 0,
    duplicate_assets: 0,
    no_candidate: 0,
    excluded_requests: 0,
    results: [],
    publication_attempted: false,
    llm_calls: 0,
  };

  try {
    const listed = await ingress({ action: 'list_open_requests' });
    if (!listed.ok) throw new Error('Clip supply ingress list failed HTTP ' + listed.status + ': ' + clean(listed?.data?.error || listed?.data?.auth_reason, 400));
    const requests = Array.isArray(listed?.data?.requests) ? listed.data.requests : [];
    receipt.requests_seen = requests.length;

    for (const request of requests) {
      if (receipt.requests_attempted >= MAX_REQUESTS) break;
      const pageId = clean(request?.page_id, 100);
      if (EXCLUDED_PAGE_IDS.has(pageId)) {
        receipt.excluded_requests += 1;
        continue;
      }
      receipt.requests_attempted += 1;
      const candidates = await commonsCandidates(request);
      if (!candidates.length) {
        receipt.no_candidate += 1;
        receipt.results.push({
          supply_request_id: request?.supply_request_id || null,
          page_id: pageId,
          page_name: request?.page_name || null,
          result: 'no_pd_cc0_video_candidate',
        });
        continue;
      }

      let accepted = false;
      for (const candidate of candidates.slice(0, 6)) {
        const ingested = await ingress({
          action: 'ingest_wikimedia_asset',
          supply_request_id: request.supply_request_id,
          candidate,
        });
        if (!ingested.ok) {
          receipt.results.push({
            supply_request_id: request?.supply_request_id || null,
            page_id: pageId,
            page_name: request?.page_name || null,
            provider_asset_id: candidate.provider_asset_id,
            result: 'ingress_rejected',
            http_status: ingested.status,
            reason: clean(ingested?.data?.error, 500),
          });
          continue;
        }
        if (ingested?.data?.created === true) receipt.assets_created += 1;
        else receipt.duplicate_assets += 1;
        receipt.results.push({
          supply_request_id: request?.supply_request_id || null,
          page_id: pageId,
          page_name: request?.page_name || null,
          provider_asset_id: candidate.provider_asset_id,
          result: ingested?.data?.created === true ? 'created' : clean(ingested?.data?.reason, 100) || 'preserved',
          asset_id: ingested?.data?.asset_id || null,
        });
        accepted = true;
        break;
      }
      if (!accepted && candidates.length) receipt.no_candidate += 1;
    }

    receipt.completed_at = new Date().toISOString();
    receipt.status = receipt.assets_created > 0 || receipt.duplicate_assets > 0
      ? 'supplied'
      : receipt.requests_seen === 0
        ? 'idle'
        : 'no_clearable_candidate';
    receipt.receipt_sha256 = sha(receipt);
    atomicJson(OUT, receipt);
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    receipt.completed_at = new Date().toISOString();
    receipt.status = 'blocked';
    receipt.error = clean(error?.message || error, 1200);
    receipt.receipt_sha256 = sha(receipt);
    atomicJson(OUT, receipt);
    console.error(JSON.stringify(receipt, null, 2));
    process.exitCode = 1;
    return receipt;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run();
}
