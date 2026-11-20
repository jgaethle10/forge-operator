#!/usr/bin/env node
// Aiden's Lab: read-only source-to-public-origin parity verification.
// GETs five static assets from Evercraft's owned HTTPS origin, compares against
// canonical repository files and writes an unambiguous release receipt.
// This tool never uploads data, signs in, publishes, or changes infrastructure.
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ORIGIN = 'https://fabric.systemiacommandcenters.com';
export const ASSETS = Object.freeze([
  { path: 'index.html', type: /text\/html/i, identity: "AIDEN'S LAB" },
  { path: 'app.mjs', type: /javascript|text\/plain/i, identity: 'openTopic' },
  { path: 'learning-worlds.mjs', type: /javascript|text\/plain/i, identity: 'LEARNING_WORLDS' },
  { path: 'catalog.mjs', type: /javascript|text\/plain/i, identity: 'medical-evidence' },
  { path: 'styles.css', type: /text\/css/i, identity: 'topic-grid' },
  { path: 'mark.svg', type: /image\/svg\+xml/i, identity: '<svg' },
]);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function validOwnedOrigin(raw) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.hostname !== 'fabric.systemiacommandcenters.com' ||
      u.username || u.password || u.search || u.hash || !['', '/'].includes(u.pathname) ||
      u.port) throw new Error('owned_origin_identity_not_verified');
  return u.origin;
}

export function assessAsset({status, finalUrl, contentType, programMarker, body}, asset, expectedBody, origin) {
  const findings = [];
  let u = null;
  try { u = new URL(finalUrl); } catch { findings.push('INVALID_FINAL_URL'); }
  const expectedUrl = origin + '/aiden-lab/' + asset.path;
  if (!u || u.href !== expectedUrl) findings.push('WRONG_OR_REDIRECTED_ORIGIN');
  if (status !== 200) findings.push('HTTP_NOT_200');
  if (!asset.type.test(String(contentType || ''))) findings.push('UNEXPECTED_CONTENT_TYPE');
  if (programMarker !== 'aidens-lab-v1') findings.push('OWNED_FABRIC_ROUTE_IDENTITY_MISSING');
  if (typeof body !== 'string' || body.length > 300000) findings.push('INVALID_OR_OVERSIZED_BODY');
  if (!String(body).includes(asset.identity)) findings.push('MISSING_PAGE_OR_ASSET_IDENTITY');
  if (sha256(String(body)) !== sha256(expectedBody)) findings.push('SOURCE_LIVE_SHA256_MISMATCH');
  return {
    path: asset.path,
    state: findings.length ? 'HOLD' : 'EXACT_SOURCE_VERIFIED',
    http_status: status,
    live_sha256: sha256(String(body)),
    source_sha256: sha256(expectedBody),
    findings
  };
}

export async function runPublicCanary({origin = DEFAULT_ORIGIN, fetcher = fetch, now = new Date(), pathRoot = ROOT} = {}) {
  const verifiedOrigin = validOwnedOrigin(origin);
  const receipt = {
    schema: 'evercraft.aidens-lab.owned-public-parity.v1',
    observed_at: now.toISOString(),
    origin: verifiedOrigin,
    publication_state: 'HOLD',
    source_canonical: 'jgaethle10/forge-operator',
    method: 'read_only_https_get_with_exact_source_sha256',
    patient_data_accessed: false,
    external_action_taken: false,
    medical_outcome_validated: false,
    public_https_verified: false,
    assets: []
  };
  for (const asset of ASSETS) {
    const expectedBody = readFileSync(join(pathRoot, 'public/aiden-lab', asset.path), 'utf8');
    const url = verifiedOrigin + '/aiden-lab/' + asset.path;
    try {
      const r = await fetcher(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
        headers: { accept: 'text/html,text/css,text/javascript,application/javascript,image/svg+xml', 'user-agent': 'Evercraft-Aidens-Lab-Source-Parity/1.0' }
      });
      const body = await r.text();
      receipt.assets.push(assessAsset({
        status: r.status, finalUrl: r.url,
        contentType: r.headers.get('content-type'),
        programMarker: r.headers.get('x-evercraft-static-program'), body
      }, asset, expectedBody, verifiedOrigin));
    } catch (error) {
      receipt.assets.push({
        path: asset.path,
        state: 'HOLD',
        findings: ['NETWORK_OR_TIMEOUT'],
        error_kind: String(error?.name || 'unknown').slice(0,80)
      });
    }
  }
  receipt.public_https_verified = receipt.assets.length === ASSETS.length &&
    receipt.assets.every((row) => row.state === 'EXACT_SOURCE_VERIFIED');
  receipt.publication_state = receipt.public_https_verified ? 'EXACT_SOURCE_PUBLIC_VERIFIED' : 'HOLD_UNVERIFIED_PUBLIC_ROUTE';
  receipt.limits = [
    'The owned Fabric program marker and exact source parity are checked, but deployment receipts still need independent review.',
    'This is not medical appraisal, clinical validity, a five-minute live heartbeat, or a backend research runner.'
  ];
  return receipt;
}

const self = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const out = resolve(process.env.AIDENS_LAB_PUBLIC_CANARY_RECEIPT || '/tmp/evercraft-aidens-lab-public-parity.json');
  try {
    const receipt = await runPublicCanary({
      origin: process.env.AIDENS_LAB_PUBLIC_ORIGIN || DEFAULT_ORIGIN
    });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({receipt_path: out, ...receipt}, null, 2));
    if (process.argv.includes('--gate') && !receipt.public_https_verified) process.exitCode = 1;
  } catch (error) {
    const failure = {schema:'evercraft.aidens-lab.owned-public-parity.v1',publication_state:'HOLD',
      public_https_verified:false,reason:String(error?.message||error).slice(0,120)};
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(failure, null, 2) + '\n');
    console.error(JSON.stringify(failure));
    process.exitCode = 1;
  }
}
