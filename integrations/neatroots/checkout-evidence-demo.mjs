/**
 * Synthetic Evercraft checkout-evidence scenarios for neatroots.
 * No production data, credentials, paid transactions, or actual LLM calls.
 * Uses neatroots' documented POST /v1/trace JSON-tree ingestion API.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PROJECT = 'evercraft-checkout-evidence-demo';
const QUESTION = 'Is checkout DEMO-1001 paid, and can fulfillment proceed?';
const CASES = Object.freeze({
  false_success: 'Payment confirmed and order fulfilled successfully.',
  truthful_block: 'Checkout page is reachable, but provider receipt verification failed. Payment is unverified; fulfillment is blocked.',
});

export function buildTrace(scenario) {
  if (!Object.hasOwn(CASES, scenario)) throw new TypeError('Unknown synthetic scenario');
  const output = CASES[scenario];
  return {
    name: 'checkout-evidence-agent',
    project: PROJECT,
    session_id: `synthetic-${scenario}`,
    kind: 'AGENT',
    input: QUESTION,
    output,
    status: 'OK',
    metadata: {
      scenario,
      synthetic: true,
      evidence_type: 'simulated_example_not_live_order',
      policy: 'provider_receipt_required_before_paid_or_fulfilled',
    },
    children: [
      {
        name: 'probe_checkout_page',
        kind: 'TOOL',
        tool_name: 'probe_checkout_page',
        input: { url: 'https://example.invalid/synthetic-checkout' },
        output: { http_status: 200, page_reachable: true, payment_verified: false },
        status: 'OK',
        duration_ms: 8,
      },
      {
        name: 'verify_provider_receipt',
        kind: 'TOOL',
        tool_name: 'verify_provider_receipt',
        input: { synthetic_order_id: 'DEMO-1001' },
        status: 'ERROR',
        error: 'No authoritative provider payment receipt available for synthetic order',
        duration_ms: 12,
      },
      {
        name: 'report_evidence_state',
        kind: 'AGENT',
        input: 'Report only what available evidence supports',
        output,
        status: 'OK',
        duration_ms: 2,
        metadata: { synthetic: true, no_llm_call: true },
      },
    ],
  };
}

export function buildTraces() {
  return [buildTrace('false_success'), buildTrace('truthful_block')];
}

// Never send these synthetic demonstrations to a third-party collector.
// Only the user's loopback neatroots instance is permitted.
export function localCollectorURL(raw = 'http://127.0.0.1:4100') {
  const url = new URL(raw);
  if (
    url.protocol !== 'http:' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash ||
    !['', '/'].includes(url.pathname)
  ) {
    throw new TypeError('Only a local HTTP neatroots collector origin is permitted');
  }
  return new URL('/v1/trace', url).toString();
}

export async function sendTraces(traces, { endpoint = 'http://127.0.0.1:4100', fetchImpl = fetch } = {}) {
  const url = localCollectorURL(endpoint);
  const results = [];
  for (const trace of traces) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trace),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`Local neatroots collector returned HTTP ${response.status}`);
    results.push({ scenario: trace.metadata.scenario, status: response.status });
  }
  return results;
}

async function main(args) {
  const traces = buildTraces();
  const send = args.includes('--send');
  const fileIndex = args.indexOf('--output');
  const endpointIndex = args.indexOf('--endpoint');
  const endpoint = endpointIndex >= 0 ? args[endpointIndex + 1] : undefined;
  if (args.includes('--help')) {
    console.log('Usage: node checkout-evidence-demo.mjs [--output FILE | --send [--endpoint http://127.0.0.1:4100]]');
    return;
  }
  if ((fileIndex >= 0 && (!args[fileIndex + 1] || send)) ||
      (endpointIndex >= 0 && (!endpoint || !send)) ||
      args.some(arg => arg.startsWith('-') && !['--output', '--send', '--endpoint'].includes(arg))) {
    throw new TypeError('Invalid options (see --help)');
  }
  if (send) {
    const receipts = await sendTraces(traces, { endpoint });
    for (const receipt of receipts) console.log(JSON.stringify(receipt));
  } else {
    const jsonl = traces.map(trace => JSON.stringify(trace)).join('\n') + '\n';
    if (fileIndex >= 0) {
      await writeFile(args[fileIndex + 1], jsonl, { flag: 'wx', mode: 0o600 });
      console.log(`Wrote two synthetic trace records to ${args[fileIndex + 1]}`);
    } else {
      process.stdout.write(jsonl);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch(err => {
    console.error(`Demo failed: ${err.message}`);
    process.exitCode = 1;
  });
}
