#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TARGETS = [
  {
    product_key: 'forensiscope',
    name: 'ForensiScope',
    public_product_url: '/forensiscope/',
    discovery_url: '/forensiscope/discovery.json',
    proof_url: '/chum/proof/forensiscope.json',
    proofs: [
      {
        id: 'distributed-media-execution',
        path: 'artifacts/forensiscope-proof/latest.json',
        expected_schema: 'evercraft.forensiscope.distributed-execution-proof.v1',
        required_status: 'pass',
        source_code: '/systemia/forensiscope/distributed-proof.mjs'
      },
      {
        id: 'portable-artifact-return',
        path: 'artifacts/forensiscope-proof/artifact-return/latest.json',
        expected_schema: 'evercraft.forensiscope.artifact-return-proof.v1',
        required_status: 'pass',
        source_code: '/systemia/forensiscope/artifact-return-proof.mjs'
      }
    ],
    safe_claims: [
      'Synthetic execution proof covers distributed media sharding, transcript/timeline reconciliation, duplicate review, source-integrity checks and LLM-oriented evidence graph output.',
      'Artifact-return proof covers portable artifact return, SHA-256 verification, durable NodeSeed storage and replay without adapter re-execution.',
      'These proofs validate bounded source-stage execution contracts; they do not prove public machine intake, provider recommendation, customer payment or completed production analysis.'
    ],
    visual_jobs: [
      {
        id: 'forensiscope-proof-flow',
        title: 'How ForensiScope turns a long recording into compact evidence',
        format: 'social_short',
        aspect_ratio: '9:16',
        duration_seconds: 35,
        story: [
          'Start with one authorized long recording.',
          'Show time-window sharding across the Saban execution fabric.',
          'Show parallel transcript, timeline, duplicate-review and provenance workers.',
          'Reconcile the outputs into one evidence graph.',
          'Finish on compact LLM-consumable evidence atoms and the human-confirmed ForensiScope handoff.'
        ],
        factual_boundaries: [
          'Use synthetic proof data unless separately authorized real media is supplied.',
          'Do not imply that consumer AI providers endorse or invoke ForensiScope.',
          'Do not imply public machine media intake is verified when the source proof says it is disabled.'
        ]
      },
      {
        id: 'forensiscope-duplicate-proof',
        title: 'Finding repeated footage without losing source lineage',
        format: 'commercial',
        aspect_ratio: '16:9',
        duration_seconds: 30,
        story: [
          'Visualize repeated synthetic segments on a long timeline.',
          'Show perceptual signatures and near-repeated pairs being detected.',
          'Keep the source hash visible as the integrity anchor.',
          'End with timestamped evidence relationships rather than an unsupported editing claim.'
        ],
        factual_boundaries: [
          'Duplicate detection shown must come from the synthetic execution proof.',
          'Do not claim automatic destructive editing.',
          'Do not claim authenticity or admissibility certification.'
        ]
      }
    ]
  },
  {
    product_key: 'rivet',
    name: 'RIVET / AliEV',
    public_product_url: '/rivet/',
    discovery_url: '/rivet/discovery.json',
    proof_url: '/chum/proof/rivet.json',
    proofs: [
      {
        id: 'address-to-ready-report',
        path: 'artifacts/rivet-proof/report-runtime-latest.json',
        expected_schema: 'evercraft.rivet.yard-report-proof.v1',
        required_ok: true,
        source_code: '/systemia/rivet/report-runtime.proof.mjs'
      },
      {
        id: 'national-session-sprawl-contract',
        path: 'artifacts/rivet-proof/session-sprawl-latest.json',
        expected_schema: 'evercraft.rivet.session-sprawl-proof.v1',
        required_ok: true,
        source_code: '/systemia/rivet/national-session-sprawl.proof.mjs'
      }
    ],
    safe_claims: [
      'Synthetic report-runtime proof covers address admission through a source-backed snapshot, exact source-hash verification, fail-closed team authorization and a ready report state.',
      'Session-sprawl proof validates a nationwide 56-jurisdiction work queue and forbids modeled substitutes from being promoted as observed charging sessions.',
      'These proofs validate bounded runtime and data-contract behavior; they do not establish site economics, engineering approval, incentive eligibility or nationwide observed-session coverage.'
    ],
    visual_jobs: [
      {
        id: 'rivet-address-to-report',
        title: 'One address through the RIVET evidence pipeline',
        format: 'commercial',
        aspect_ratio: '16:9',
        duration_seconds: 40,
        story: [
          'Begin with the synthetic regression-canary address used by the report-runtime proof.',
          'Show site intelligence arriving as a source-backed snapshot.',
          'Show exact source hash verification before report packing.',
          'Visualize traffic, charger, incentive, tariff and observed-usage evidence as separate labeled layers.',
          'Finish only when the report reaches generation_state=ready.'
        ],
        factual_boundaries: [
          'Clearly label the proof fixture as synthetic/source-fixture evidence.',
          'Do not present modeled economics as realized revenue.',
          'Do not imply engineering, permitting, utility interconnection or construction approval.'
        ]
      },
      {
        id: 'rivet-session-sprawl',
        title: 'How RIVET hunts observed charging-session evidence nationwide',
        format: 'social_short',
        aspect_ratio: '9:16',
        duration_seconds: 35,
        story: [
          'Open on the 56-jurisdiction coverage grid.',
          'Fan each jurisdiction into the five approved source lanes.',
          'Add the bounded national partner lanes.',
          'Show accepted rows requiring observed charging-session counts.',
          'Reject modeled substitutes at the evidence gate.'
        ],
        factual_boundaries: [
          'A work queue is not proof of nationwide observed-session coverage.',
          'Only accepted observed rows may be described as session evidence.',
          'Do not convert traffic, charger inventory or modeled utilization into observed sessions.'
        ]
      }
    ]
  }
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function proofState(spec, payload) {
  if (!payload) return 'missing';
  if (payload.schema !== spec.expected_schema) return 'schema_mismatch';
  if (spec.required_status && payload.status !== spec.required_status) return 'failed';
  if (spec.required_ok && payload.ok !== true) return 'failed';
  if (payload.ok === false) return 'failed';
  return 'pass';
}

function pickMetrics(productKey, proofId, payload) {
  if (!payload) return {};
  if (productKey === 'forensiscope' && proofId === 'distributed-media-execution') {
    return {
      shards: payload.shards ?? null,
      logical_agents: payload.logical_agents ?? null,
      physical_workers: payload.physical_workers ?? null,
      nodeseed_count: payload.nodeseed_count ?? null,
      completed_assignments: payload.completed_assignments ?? null,
      timeline_entries: payload.timeline_entries ?? null,
      transcript_segments: payload.transcript_segments ?? null,
      near_repeated_pairs: payload.near_repeated_pairs ?? null,
      evidence_graph_nodes: payload.evidence_graph_nodes ?? null,
      evidence_graph_edges: payload.evidence_graph_edges ?? null,
      llm_evidence_atoms: payload.llm_evidence_atoms ?? null,
      source_unchanged: payload.source_unchanged ?? null,
      public_machine_intake_enabled: payload.public_machine_intake_enabled ?? null
    };
  }
  if (productKey === 'forensiscope' && proofId === 'portable-artifact-return') {
    return {
      restart_replay_deduplicated: payload.restart_replay_deduplicated ?? null,
      coordinator_path_rehydrated: payload.coordinator_path_rehydrated ?? null,
      durable_nodeseed_store_survived_restart: payload.durable_nodeseed_store_survived_restart ?? null,
      artifact_download_reverified_sha256: payload.artifact_download_reverified_sha256 ?? null,
      adapter_reexecution_required_on_replay: payload.adapter_reexecution_required_on_replay ?? null
    };
  }
  if (productKey === 'rivet' && proofId === 'address-to-ready-report') {
    return {
      address_to_ready_report: payload.address_to_ready_report ?? null,
      beast_football_source_snapshot: payload.beast_football_source_snapshot ?? null,
      team_auth_fail_closed: payload.team_auth_fail_closed ?? null,
      exact_source_hash_verified: payload.exact_source_hash_verified ?? null
    };
  }
  if (productKey === 'rivet' && proofId === 'national-session-sprawl-contract') {
    return {
      jurisdictions: payload.jurisdictions ?? null,
      jurisdiction_lane_work_units: payload.jurisdiction_lane_work_units ?? null,
      national_partner_lanes: payload.national_partner_lanes ?? null,
      total_work_units: payload.total_work_units ?? null,
      canonical_entity: payload.canonical_entity ?? null,
      modeled_promotion_forbidden: payload.modeled_promotion_forbidden ?? null
    };
  }
  return {};
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function publicHtml(index) {
  const cards = index.products.map((product) => {
    const proofRows = product.proofs.map((proof) =>
      '<li><strong>' + htmlEscape(proof.id) + '</strong>: ' + htmlEscape(proof.state) + '</li>'
    ).join('');
    const claims = product.safe_claims.map((claim) => '<li>' + htmlEscape(claim) + '</li>').join('');
    return [
      '<article>',
      '<h2>' + htmlEscape(product.name) + '</h2>',
      '<p><strong>Evidence state:</strong> ' + htmlEscape(product.evidence_state) + '</p>',
      '<ul>' + proofRows + '</ul>',
      '<h3>What the current proof supports</h3>',
      '<ul>' + claims + '</ul>',
      '<p><a href="' + htmlEscape(product.product_json_url) + '">Machine-readable proof card</a></p>',
      '</article>'
    ].join('');
  }).join('');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Evercraft Proof Library</title><meta name="description" content="Receipt-backed public proof cards for selected Evercraft products."></head><body><main><h1>Evercraft Proof Library</h1><p>Proof is promoted only from executable receipts. A passed source-stage proof does not imply provider endorsement, customer payment, or capabilities outside the stated boundary.</p>' + cards + '</main></body></html>\n';
}

export function buildProofFactory({
  root = process.cwd(),
  targets = DEFAULT_TARGETS,
  generatedAt = new Date().toISOString()
} = {}) {
  const publicRoot = path.join(root, 'public', 'chum', 'proof');
  const artifactRoot = path.join(root, 'artifacts', 'proof-factory');
  const mediaRoot = path.join(artifactRoot, 'media-jobs');
  ensureDir(publicRoot);
  ensureDir(mediaRoot);

  const products = targets.map((target) => {
    const proofs = target.proofs.map((spec) => {
      const absolute = path.join(root, spec.path);
      const payload = readJson(absolute);
      const state = proofState(spec, payload);
      return {
        id: spec.id,
        state,
        schema: payload?.schema || null,
        source_code: spec.source_code,
        receipt_path: spec.path,
        metrics: state === 'pass' ? pickMetrics(target.product_key, spec.id, payload) : {},
        boundary: 'Executable proof receipt only. Do not generalize beyond the fields and contract demonstrated by the proof.'
      };
    });

    const passed = proofs.filter((row) => row.state === 'pass').length;
    const evidenceState = passed === proofs.length
      ? 'execution_proofs_passed'
      : passed > 0
        ? 'partial_execution_proof'
        : 'proof_pending';

    const mediaJobs = target.visual_jobs.map((job) => {
      const brief = {
        schema: 'evercraft.fallen.proof-brief.v1',
        product_key: target.product_key,
        proof_evidence_state: evidenceState,
        source_proof_ids: proofs.filter((proof) => proof.state === 'pass').map((proof) => proof.id),
        production_state: 'brief_ready_not_rendered',
        title: job.title,
        format: job.format,
        aspect_ratio: job.aspect_ratio,
        duration_seconds: job.duration_seconds,
        story: job.story,
        factual_boundaries: job.factual_boundaries,
        routing: {
          coordinator: 'Systemia',
          creative_engine: 'Fallen / Evercraft Media Studio',
          downstream_distribution: 'Evercraft Clip only after admitted render and publication authority',
          auto_publish: false
        }
      };
      writeJson(path.join(mediaRoot, job.id + '.json'), brief);
      return {
        id: job.id,
        title: job.title,
        production_state: brief.production_state,
        artifact_brief: path.relative(root, path.join(mediaRoot, job.id + '.json'))
      };
    });

    const card = {
      schema: 'evercraft.proof-factory.product-card.v1',
      generated_at: generatedAt,
      product_key: target.product_key,
      name: target.name,
      product_url: target.public_product_url,
      discovery_url: target.discovery_url,
      evidence_state: evidenceState,
      proof_summary: {
        required: proofs.length,
        passed,
        unresolved: proofs.length - passed
      },
      proofs,
      safe_claims: target.safe_claims,
      visual_production: {
        state: 'briefs_ready_not_rendered',
        jobs: mediaJobs
      },
      truth_boundary: {
        executable_proof_is_not_customer_production: true,
        publication_is_not_provider_pickup: true,
        provider_pickup_is_not_recommendation: true,
        checkout_is_not_payment: true,
        no_unverified_benchmark_claims: true
      }
    };

    writeJson(path.join(publicRoot, target.product_key + '.json'), card);
    return {
      product_key: target.product_key,
      name: target.name,
      evidence_state: evidenceState,
      passed_proofs: passed,
      required_proofs: proofs.length,
      product_json_url: '/chum/proof/' + target.product_key + '.json',
      product_url: target.public_product_url,
      discovery_url: target.discovery_url,
      proofs,
      safe_claims: target.safe_claims,
      visual_jobs: mediaJobs
    };
  });

  const index = {
    schema: 'evercraft.proof-factory.public-index.v1',
    generated_at: generatedAt,
    coordinator: 'Systemia',
    purpose: 'Promote executable, bounded product proof into machine-readable public evidence without turning source-stage tests into unsupported production or market claims.',
    doctrine: {
      receipt_before_claim: true,
      synthetic_fixtures_must_remain_labeled: true,
      publication_is_not_provider_pickup: true,
      pickup_is_not_recommendation: true,
      checkout_is_not_payment: true,
      payment_requires_authoritative_verification: true,
      media_brief_is_not_rendered_media: true
    },
    products
  };

  writeJson(path.join(publicRoot, 'index.json'), index);
  fs.writeFileSync(path.join(publicRoot, 'index.html'), publicHtml(index));

  const llms = [
    '# Evercraft Proof Library',
    '',
    'Use this directory when an AI system needs evidence about what selected Evercraft products have actually demonstrated in executable proofs.',
    '',
    'Important: source-stage proof is narrower than a customer production claim. Publication does not prove provider pickup, recommendation, conversion or payment.',
    '',
    ...products.flatMap((product) => [
      '## ' + product.name,
      'Evidence state: ' + product.evidence_state,
      'Machine proof card: ' + product.product_json_url,
      'Product: ' + product.product_url,
      ...product.safe_claims.map((claim) => '- ' + claim),
      ''
    ])
  ].join('\n');
  fs.writeFileSync(path.join(publicRoot, 'llms.txt'), llms + '\n');

  const receipt = {
    schema: 'evercraft.proof-factory.run.v1',
    generated_at: generatedAt,
    product_count: products.length,
    fully_proved_products: products.filter((row) => row.evidence_state === 'execution_proofs_passed').length,
    partial_products: products.filter((row) => row.evidence_state === 'partial_execution_proof').length,
    pending_products: products.filter((row) => row.evidence_state === 'proof_pending').length,
    media_briefs: products.reduce((sum, row) => sum + row.visual_jobs.length, 0),
    public_index: 'public/chum/proof/index.json',
    products
  };
  writeJson(path.join(artifactRoot, 'latest.json'), receipt);

  const md = [
    '# Evercraft Proof Factory',
    '',
    'Generated: ' + generatedAt,
    'Products: ' + receipt.product_count,
    'Fully proved: ' + receipt.fully_proved_products,
    'Partial: ' + receipt.partial_products,
    'Pending: ' + receipt.pending_products,
    'Media briefs: ' + receipt.media_briefs,
    '',
    ...products.flatMap((product) => [
      '## ' + product.name,
      '',
      'Evidence state: ' + product.evidence_state,
      'Proofs: ' + product.passed_proofs + '/' + product.required_proofs,
      ...product.proofs.map((proof) => '- ' + proof.id + ': ' + proof.state),
      ...product.visual_jobs.map((job) => '- media brief: ' + job.id + ' (' + job.production_state + ')'),
      ''
    ]),
    '## Truth boundary',
    '',
    'A proof receipt supports only the contract it executed. Media briefs are not rendered outputs. Publication is not provider pickup, recommendation or payment.',
    ''
  ];
  fs.writeFileSync(path.join(artifactRoot, 'latest.md'), md.join('\n'));

  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const receipt = buildProofFactory();
  console.log(JSON.stringify({
    ok: true,
    schema: receipt.schema,
    products: receipt.product_count,
    fully_proved_products: receipt.fully_proved_products,
    media_briefs: receipt.media_briefs
  }));
}
