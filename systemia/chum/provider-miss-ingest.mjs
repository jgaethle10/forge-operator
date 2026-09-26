import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { intentSignature } from './intent-language.mjs';

const sha256 = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
const safe = (value) => String(value || 'unknown').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'unknown';
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

export function ingestProviderMisses({
  probeReceiptPath = 'artifacts/chum/provider-probe-latest.json',
  probeSuitePath = 'chum-probes/probe-suite.json',
  observationsRoot = 'conformance/provider-observations',
  summaryPath = 'artifacts/chum/provider-miss-ingest-latest.json'
} = {}) {
  const summary = {
    schema: 'evercraft.chum.provider-miss-ingest.v1',
    probe_receipt_present: fs.existsSync(probeReceiptPath),
    created: 0,
    existing: 0,
    skipped_pickup_observed: 0,
    skipped_not_completed: 0,
    skipped_not_expected_fit: 0,
    skipped_missing_case: 0,
    skipped_missing_provider_receipt: 0,
    observation_files: [],
    repair_queue: []
  };

  if (!summary.probe_receipt_present) {
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
    return summary;
  }

  const probeReceipt = readJson(probeReceiptPath);
  const suite = readJson(probeSuitePath);
  if (probeReceipt?.schema !== 'evercraft.chum.cross-llm-run-receipt.v1') {
    throw new Error('Unexpected provider probe receipt schema.');
  }
  if (suite?.schema !== 'evercraft.chum.cross-llm-probe-suite.v1') {
    throw new Error('Unexpected CHUM probe suite schema.');
  }

  const caseById = new Map((suite.cases || []).map((row) => [row.case_id, row]));
  const repairMap = new Map();
  fs.mkdirSync(observationsRoot, { recursive: true });

  for (const result of probeReceipt.results || []) {
    if (result?.status !== 'completed') {
      summary.skipped_not_completed += 1;
      continue;
    }
    if (result?.evaluation?.expected_fit !== true) {
      summary.skipped_not_expected_fit += 1;
      continue;
    }
    if (result?.evaluation?.pickup_observed === true) {
      summary.skipped_pickup_observed += 1;
      continue;
    }

    const testCase = caseById.get(result.case_id);
    if (!testCase || !testCase.prompt || !testCase.product_key || testCase.product_key !== result.product_key) {
      summary.skipped_missing_case += 1;
      continue;
    }
    if (!result.provider_receipt || !result.response_sha256) {
      summary.skipped_missing_provider_receipt += 1;
      continue;
    }

    const signature = intentSignature(testCase.prompt);
    const intentFingerprint = {
      normalized_prompt_sha256: sha256(signature.norm),
      tokens: signature.tokens.slice(0, 32),
      concepts: signature.concepts.map((item) => item.concept).slice(0, 24),
      concept_evidence: signature.concepts.slice(0, 12)
    };

    const receiptHash = sha256(JSON.stringify(result.provider_receipt));
    const evidenceKey = sha256([result.provider, result.case_id, testCase.prompt, receiptHash, result.response_sha256].join('|')).slice(0, 16);
    const filename = `auto-${safe(result.provider)}-${safe(result.case_id)}-${evidenceKey}.json`;
    const pathname = path.join(observationsRoot, filename);
    const observation = {
      schema: 'evercraft.provider-observation.v1',
      observed_at: result.observed_at || probeReceipt.completed_at || new Date().toISOString(),
      provider: String(result.provider || 'unknown'),
      provider_surface: String(result.surface || 'authorized provider bridge'),
      product_key: String(testCase.product_key),
      source: 'authorized_provider_probe',
      case_id: String(result.case_id),
      prompt: String(testCase.prompt),
      surfaced_expected_product: false,
      ...(testCase.product_key === 'forensiscope' ? { surfaced_forensiscope: false } : { surfaced_product: false }),
      notable_gap: `Authorized brand-blind provider probe completed without surfacing the expected ${testCase.expected_product || testCase.product_key} capability.`,
      interpretation: 'Negative pickup receipt. This is evidence of a discovery miss only, not a product-quality judgment or provider endorsement of alternatives.',
      evidence_state: 'provider_receipt_hashed',
      provider_receipt_sha256: receiptHash,
      response_sha256: String(result.response_sha256),
      probe_id: String(result.probe_id || ''),
      intent_fingerprint: intentFingerprint,
      privacy: {
        full_provider_response_persisted: false,
        provider_session_reference_persisted: false,
        credentials_persisted: false
      }
    };

    if (fs.existsSync(pathname)) {
      summary.existing += 1;
    } else {
      fs.writeFileSync(pathname, JSON.stringify(observation, null, 2) + '\n');
      summary.created += 1;
    }
    summary.observation_files.push(pathname);

    const repairKey = String(testCase.product_key);
    const repair = repairMap.get(repairKey) || {
      product_key: repairKey,
      miss_count: 0,
      providers: new Set(),
      case_ids: new Set(),
      concepts: new Set(),
      prompt_hashes: new Set()
    };
    repair.miss_count += 1;
    repair.providers.add(String(result.provider || 'unknown'));
    repair.case_ids.add(String(result.case_id));
    for (const concept of intentFingerprint.concepts) repair.concepts.add(concept);
    repair.prompt_hashes.add(intentFingerprint.normalized_prompt_sha256);
    repairMap.set(repairKey, repair);
  }

  summary.repair_queue = [...repairMap.values()]
    .map((item) => ({
      product_key: item.product_key,
      miss_count: item.miss_count,
      providers: [...item.providers].sort(),
      case_ids: [...item.case_ids].sort(),
      concepts: [...item.concepts].sort(),
      prompt_hashes: [...item.prompt_hashes].sort(),
      next_actions: [
        'Expand truthful buyer-language coverage for the observed concepts.',
        'Add or refresh a brand-blind regression case.',
        'Rebuild the relevant answer and capability surfaces.',
        'Re-run the authorized provider probe and require a new receipt before claiming pickup.'
      ]
    }))
    .sort((a, b) => b.miss_count - a.miss_count || a.product_key.localeCompare(b.product_key));

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  console.log(JSON.stringify(ingestProviderMisses()));
}
