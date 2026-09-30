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

test('missing product contracts fail closed instead of inheriting another product defaults', () => {
  assert.throws(
    () => compileProductRuntimePolicy('findmypart', process.cwd()),
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
  assert.equal(rendered.policy_count, 3);
  assert.deepEqual(
    rendered.policies.map((row) => row.product_key),
    ['aliev', 'forensiscope', 'evercraft-clip']
  );
  assert.equal(rendered.truth_boundary.undeclared_scope_fails_closed, true);
  assert.equal(rendered.truth_boundary.undeclared_meter_metric_fails_closed, true);
});
