import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildContextBinding,
  buildExecutionGateInput,
  compileProductRuntimePolicy,
  renderRuntimePolicies,
} from './runtime.mjs';

test('AliEV contract compiles into a fail-closed runtime policy', () => {
  const policy = compileProductRuntimePolicy('aliev', process.cwd());

  assert.equal(policy.schema, 'evercraft.capability-mesh.runtime-policy.v1');
  assert.equal(policy.adoption_stage, 'shared_runtime');
  assert.equal(policy.authority.passport_product, 'rivet');
  assert.deepEqual(policy.authority.scopes, ['report.generate']);
  assert.equal(policy.context.namespace, 'aliev');
  assert.equal(policy.meter.product, 'rivet');
  assert.deepEqual(policy.meter.metrics, [{ metric: 'site_reports', unit: 'report' }]);
  assert.equal(policy.execution.gate_required, true);
  assert.equal(policy.route.specialist_slug, 'aliev');
  assert.equal(policy.route.direct_callable, true);
  assert.equal(policy.runtime_verified, false);
  assert.equal(policy.grants_authority, false);
});

test('one product action compiles into the exact Execution Gate input and Meter metric', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'aliev',
    actor_ref: 'agent:rivet-worker',
    scope: 'report.generate',
    resource_ref: 'site:yakima-001',
    request: { address: '6405 W Chestnut Ave, Yakima, WA', report: 'preliminary' },
    meter_subject_ref: 'org:demo',
    idempotency_key: 'capability-mesh:aliev:prepare:001',
    lease_id: 'lease_mesh_001',
    require_direct_specialist: true,
  });

  const input = prepared.execution_gate_input;
  assert.equal(input.passport_product, 'rivet');
  assert.equal(input.scope, 'report.generate');
  assert.equal(input.specialist_slug, 'aliev');
  assert.deepEqual(input.meter, {
    subject_ref: 'org:demo',
    product: 'rivet',
    metric: 'site_reports',
    quantity: 1,
    unit: 'report',
  });
  assert.equal(input.require_direct_specialist, true);
  assert.equal(prepared.grants_execution_authority, false);
  assert.equal(prepared.payment_state_inferred, false);
});

test('undeclared scope cannot be smuggled through a valid product contract', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'aliev',
        actor_ref: 'agent:rivet-worker',
        scope: 'payment.refund',
        request: { action: 'refund' },
        meter_subject_ref: 'org:demo',
        idempotency_key: 'capability-mesh:bad-scope',
      }),
    /scope_not_declared_in_authority_contract/
  );
});

test('caller cannot choose a different Meter metric because metric comes from the action contract', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'aliev',
    actor_ref: 'agent:rivet-worker',
    scope: 'report.generate',
    request: { report: 'preliminary' },
    meter_subject_ref: 'org:demo',
    idempotency_key: 'capability-mesh:metric-lock',
  });

  assert.equal(prepared.execution_gate_input.meter.metric, 'site_reports');
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.execution_gate_input, 'meter_metric'), false);
});

test('ForensiScope contract exposes only the currently proven route-classification action', () => {
  const policy = compileProductRuntimePolicy('forensiscope', process.cwd());
  assert.equal(policy.authority.passport_product, 'forensiscope');
  assert.deepEqual(policy.authority.scopes, ['classify_media_route']);
  assert.equal(policy.meter.state, 'not_required');
  assert.equal(policy.intake.state, 'not_required');
  assert.equal(policy.execution.gate_required, true);
  assert.deepEqual(policy.execution.actions, [{ scope: 'classify_media_route' }]);
  assert.equal(policy.route.specialist_slug, 'forensiscope');
  assert.equal(policy.route.direct_callable, true);
  assert.equal(policy.runtime_verified, false);
  assert.equal(policy.boundaries?.runtime_analysis_action_contracted, false);
});

test('ForensiScope route classification compiles without inventing a Meter charge or media upload', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'forensiscope',
    actor_ref: 'agent:media-router',
    scope: 'classify_media_route',
    request: {
      mediaType: 'video',
      assistantCanFullyProcess: false,
      failureCode: 'duration_exceeded',
    },
    idempotency_key: 'capability-mesh:forensiscope:route:001',
    require_direct_specialist: true,
  });

  const input = prepared.execution_gate_input;
  assert.equal(input.passport_product, 'forensiscope');
  assert.equal(input.scope, 'classify_media_route');
  assert.equal(input.specialist_slug, 'forensiscope');
  assert.equal(Object.prototype.hasOwnProperty.call(input, 'meter'), false);
  assert.equal(prepared.route_snapshot.direct_callable, true);
  assert.equal(prepared.grants_execution_authority, false);
});

test('ForensiScope does not expose an unverified machine media-analysis action', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'forensiscope',
        actor_ref: 'agent:media-router',
        scope: 'media.analyze',
        request: { content_ref: 'some-media' },
        idempotency_key: 'capability-mesh:forensiscope:unverified-analysis',
      }),
    /scope_not_declared_in_authority_contract/
  );
});

test('Evercraft Clip exposes only read-only discovery and planning actions', () => {
  const policy = compileProductRuntimePolicy('evercraft-clip', process.cwd());
  assert.equal(policy.authority.passport_product, 'evercraft-clip');
  assert.deepEqual(
    policy.authority.scopes,
    ['get_clip_capabilities', 'plan_clip_job']
  );
  assert.equal(policy.meter.state, 'not_required');
  assert.equal(policy.intake.state, 'not_required');
  assert.equal(policy.boundaries.private_media_upload_contracted, false);
  assert.equal(policy.boundaries.checkout_contracted, false);
  assert.equal(policy.boundaries.rendering_contracted, false);
  assert.equal(policy.boundaries.publishing_contracted, false);
  assert.equal(policy.boundaries.tiktok_verified, false);
});

test('Clip planning compiles without inventing rendering, publishing or payment state', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'evercraft-clip',
    actor_ref: 'agent:clip-planner',
    scope: 'plan_clip_job',
    request: {
      goal: 'Turn an authorized interview into three vertical clips',
      platforms: ['facebook', 'linkedin', 'instagram'],
    },
    idempotency_key: 'capability-mesh:clip:plan:001',
    require_direct_specialist: true,
  });

  const input = prepared.execution_gate_input;
  assert.equal(input.passport_product, 'evercraft-clip');
  assert.equal(input.scope, 'plan_clip_job');
  assert.equal(input.specialist_slug, 'evercraft-clip');
  assert.equal(Object.prototype.hasOwnProperty.call(input, 'meter'), false);
  assert.equal(prepared.payment_state_inferred, false);
  assert.equal(prepared.grants_execution_authority, false);
});

test('Clip cannot compile an uncontracted publish or render action', () => {
  for (const scope of ['publish_clip', 'render_clip', 'create_checkout']) {
    assert.throws(
      () =>
        buildExecutionGateInput({
          product_key: 'evercraft-clip',
          actor_ref: 'agent:clip-planner',
          scope,
          request: { scope },
          idempotency_key: 'capability-mesh:clip:blocked:' + scope,
        }),
      /scope_not_declared_in_authority_contract/
    );
  }
});

test('FindMyPart exposes only free triage through the shared runtime contract', () => {
  const policy = compileProductRuntimePolicy('findmypart', process.cwd());
  assert.equal(policy.adoption_stage, 'shared_runtime');
  assert.equal(policy.authority.passport_product, 'findmypart');
  assert.deepEqual(policy.authority.scopes, ['free_part_triage']);
  assert.equal(policy.meter.state, 'not_required');
  assert.equal(policy.boundaries.free_action_creates_charge, false);
  assert.equal(policy.boundaries.paid_hunts_contracted, false);
});

test('FindMyPart free triage compiles without inventing checkout, payment or purchasing authority', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'findmypart',
    actor_ref: 'agent:part-triage',
    scope: 'free_part_triage',
    request: { markings: 'ABC-123', equipment: 'legacy tractor' },
    idempotency_key: 'capability-mesh:findmypart:triage:001',
    require_direct_specialist: true,
  });
  assert.equal(prepared.execution_gate_input.passport_product, 'findmypart');
  assert.equal(prepared.execution_gate_input.scope, 'free_part_triage');
  assert.equal(prepared.execution_gate_input.specialist_slug, 'findmypart');
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.execution_gate_input, 'meter'), false);
  assert.equal(prepared.payment_state_inferred, false);
});

test('FindMyPart paid hunt is not silently exposed by the free-triage contract', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'findmypart',
        actor_ref: 'agent:part-triage',
        scope: 'paid_hunt',
        request: { tier: 'rescue' },
        idempotency_key: 'capability-mesh:findmypart:paid',
      }),
    /scope_not_declared_in_authority_contract/
  );
});

test('Systemia Remote Ops compiles only its proven read-only decision tools', () => {
  const policy = compileProductRuntimePolicy('systemia-remote-ops', process.cwd());
  assert.equal(policy.adoption_stage, 'shared_runtime');
  assert.equal(policy.authority.passport_product, 'systemia-remote-ops');
  assert.deepEqual(policy.authority.scopes, [
    'route_business_decision',
    'simulate_pricing_change',
    'simulate_business_scenario',
    'get_decision_lab_capabilities',
  ]);
  assert.equal(policy.route.specialist_slug, 'systemia-remote-ops');
  assert.equal(policy.route.direct_callable, false);
  assert.equal(policy.route.registry_published, false);
  assert.equal(policy.meter.state, 'not_required');
  assert.equal(policy.boundaries.production_mutation_enabled, false);
  assert.equal(policy.boundaries.external_action_taken, false);
  assert.equal(policy.boundaries.market_outcomes_inferred, false);
});

test('Remote Ops simulation compiles through the shared trust chain without claiming a public direct door', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'systemia-remote-ops',
    actor_ref: 'agent:decision-lab',
    scope: 'simulate_pricing_change',
    request: {
      current_price: 100,
      customers_per_month: 100,
      price_change_percent: 10,
    },
    idempotency_key: 'capability-mesh:remote-ops:pricing:001',
  });

  assert.equal(prepared.execution_gate_input.passport_product, 'systemia-remote-ops');
  assert.equal(prepared.execution_gate_input.specialist_slug, 'systemia-remote-ops');
  assert.equal(prepared.route_snapshot.direct_callable, false);
  assert.equal(prepared.route_snapshot.state, 'yard_runtime_proven_public_route_pending');
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.execution_gate_input, 'meter'), false);
  assert.equal(prepared.grants_execution_authority, false);
});

test('Remote Ops refuses a verified-direct requirement until its public edge is actually promoted', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'systemia-remote-ops',
        actor_ref: 'agent:decision-lab',
        scope: 'route_business_decision',
        request: { intent: 'Should I hire another employee?' },
        idempotency_key: 'capability-mesh:remote-ops:direct-held',
        require_direct_specialist: true,
      }),
    /direct_specialist_not_ready/
  );
});

test('Remote Ops contract cannot be stretched into a production mutation tool', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'systemia-remote-ops',
        actor_ref: 'agent:decision-lab',
        scope: 'remote_exec',
        request: { program: 'deploy' },
        idempotency_key: 'capability-mesh:remote-ops:mutation',
      }),
    /scope_not_declared_in_authority_contract/
  );
});

test('IBM i Rescue exposes only read-only offer and human handoff tools', () => {
  const policy = compileProductRuntimePolicy('ibmi-rescue', process.cwd());
  assert.equal(policy.adoption_stage, 'shared_runtime');
  assert.equal(policy.authority.passport_product, 'ibmi-rescue');
  assert.deepEqual(policy.authority.scopes, [
    'get_ibmi_rescue_offer',
    'prepare_ibmi_rescue_handoff',
  ]);
  assert.equal(policy.route.specialist_slug, 'ibmi-rescue');
  assert.equal(policy.route.direct_callable, false);
  assert.equal(policy.route.registry_published, false);
  assert.equal(policy.meter.state, 'not_required');
  assert.equal(policy.boundaries.checkout_contracted, false);
  assert.equal(policy.boundaries.payment_contracted, false);
  assert.equal(policy.boundaries.paid_fulfillment_contracted, false);
  assert.equal(policy.boundaries.production_access_authorized, false);
});

test('IBM i handoff compiles without checkout, payment or production authority', () => {
  const prepared = buildExecutionGateInput({
    product_key: 'ibmi-rescue',
    actor_ref: 'agent:legacy-rescue',
    scope: 'prepare_ibmi_rescue_handoff',
    request: {},
    idempotency_key: 'capability-mesh:ibmi:handoff:001',
  });

  assert.equal(prepared.execution_gate_input.passport_product, 'ibmi-rescue');
  assert.equal(prepared.execution_gate_input.specialist_slug, 'ibmi-rescue');
  assert.equal(prepared.route_snapshot.direct_callable, false);
  assert.equal(prepared.route_snapshot.state, 'yard_runtime_proven_public_route_pending');
  assert.equal(Object.prototype.hasOwnProperty.call(prepared.execution_gate_input, 'meter'), false);
  assert.equal(prepared.payment_state_inferred, false);
  assert.equal(prepared.grants_execution_authority, false);
});

test('IBM i Rescue refuses a verified-direct requirement until the public edge is proven', () => {
  assert.throws(
    () =>
      buildExecutionGateInput({
        product_key: 'ibmi-rescue',
        actor_ref: 'agent:legacy-rescue',
        scope: 'get_ibmi_rescue_offer',
        request: {},
        idempotency_key: 'capability-mesh:ibmi:direct-held',
        require_direct_specialist: true,
      }),
    /direct_specialist_not_ready/
  );
});

test('IBM i Rescue handoff contract cannot become checkout or production authority', () => {
  for (const scope of ['prepare_verified_checkout', 'get_verified_order_status', 'production.upgrade', 'production.cutover']) {
    assert.throws(
      () =>
        buildExecutionGateInput({
          product_key: 'ibmi-rescue',
          actor_ref: 'agent:legacy-rescue',
          scope,
          request: { scope },
          idempotency_key: 'capability-mesh:ibmi:blocked:' + scope,
        }),
      /scope_not_declared_in_authority_contract/
    );
  }
});

test('missing product contracts fail closed instead of inheriting another product defaults', () => {
  assert.throws(
    () => compileProductRuntimePolicy('buildflow', process.cwd()),
    /product_contract_missing/
  );
});

test('context binding describes scopes but grants no access', () => {
  const binding = buildContextBinding('aliev', process.cwd());
  assert.equal(binding.namespace, 'aliev');
  assert.equal(binding.read_scope, 'context.read.aliev');
  assert.equal(binding.write_scope, 'context.write.aliev');
  assert.equal(binding.grants_context_access, false);
  assert.equal(binding.grants_authority, false);
});

test('generated runtime policy artifact covers only explicitly contracted products', () => {
  const rendered = renderRuntimePolicies(process.cwd());
  assert.equal(rendered.policy_count, 9);
  assert.deepEqual(
    rendered.policies.map((row) => row.product_key),
    [
      'aliev',
      'forensiscope',
      'evercraft-clip',
      'evernest-atlas',
      'opportunity-fabric',
      'systemia-university',
      'findmypart',
      'systemia-remote-ops',
      'ibmi-rescue',
    ]
  );
  assert.equal(rendered.truth_boundary.non_shared_runtime_execution_fails_closed, true);
  assert.equal(rendered.truth_boundary.undeclared_scope_fails_closed, true);
  assert.equal(rendered.truth_boundary.undeclared_meter_metric_fails_closed, true);
});


test('discovery-only and private-runtime contracts cannot be compiled into shared Execution Gate actions', () => {
  assert.equal(
    compileProductRuntimePolicy('evernest-atlas', process.cwd()).adoption_stage,
    'discovery_only'
  );
  assert.equal(
    compileProductRuntimePolicy('opportunity-fabric', process.cwd()).adoption_stage,
    'private_runtime'
  );
  assert.equal(
    compileProductRuntimePolicy('systemia-university', process.cwd()).adoption_stage,
    'discovery_only'
  );

  for (const product_key of ['evernest-atlas', 'opportunity-fabric', 'systemia-university']) {
    assert.throws(
      () =>
        buildExecutionGateInput({
          product_key,
          actor_ref: 'agent:test',
          scope: 'anything',
          request: { test: true },
          idempotency_key: 'non-shared:' + product_key,
        }),
      /product_not_shared_runtime/
    );
  }
});
