import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EvercraftPassport } from "../passport/passport.mjs";
import { EvercraftMeter } from "../meter/meter.mjs";
import { EvercraftExecutionGate } from "../execution-gate/gate.mjs";
import {
  EvercraftOsInstallLedger,
  appResourceRef,
  buildAppInstallRequest
} from "./install-ledger.mjs";
import { EvercraftOsCapabilityCapsules } from "./runtime-capsule.mjs";
import { EvercraftOsSystemiaLauncher } from "./systemia-launcher.mjs";
import { createOwnedRivetReportDispatcher } from "./dispatchers/rivet-report.mjs";
import { startAliEvSourceRuntime } from "../aliev/source-runtime.mjs";
import { startRivetReportRuntime } from "../rivet/report-runtime.mjs";

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "evercraft-os-launch-"));
}

function writeRoutes(root) {
  const file = path.join(root, "routes.json");
  fs.writeFileSync(file, JSON.stringify({
    schema: "evercraft.direct-door-readiness.v2",
    universal_fallback: {
      registry_name: "io.github.jgaethle10/evercraft-machine-commerce",
      remote_mcp: "https://example.test/universal"
    },
    products: [{
      slug: "aliev",
      name: "AliEV",
      state: "owned_runtime_proof",
      direct_callable: true,
      registry_published: true,
      blocking_gates: [],
      preferred_route: {
        mode: "registered_internal_specialist",
        hops_before_specialist: 0,
        use_universal_router_first: false,
        registry_name: "io.github.jgaethle10/aliev",
        registered_dispatcher: "aliev"
      }
    }]
  }, null, 2));
  return file;
}

function setupAuthority(root, { actor, nodeId, siteRef }) {
  const passportStateDir = path.join(root, "passport");
  const meterStateDir = path.join(root, "meter");
  const passport = new EvercraftPassport({ stateDir: passportStateDir });
  const meter = new EvercraftMeter({ stateDir: meterStateDir });

  const starts = "2026-01-01T00:00:00.000Z";
  const ends = "2030-01-01T00:00:00.000Z";

  passport.issueGrant({
    idempotency_key: "os-install-grant",
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "evercraft-os",
    scopes: ["app.install"],
    resource_refs: [appResourceRef("aliev", nodeId)],
    starts_at: starts,
    ends_at: ends,
    max_delegation_depth: 0,
    authority_state: "system_policy_authorized",
    authority_receipt_ref: "proof:os-install-authority"
  });

  const rivetGrant = passport.issueGrant({
    idempotency_key: "rivet-report-grant",
    subject_ref: actor,
    issuer_ref: "proof:identity",
    product: "rivet",
    scopes: ["report.generate"],
    resource_refs: [siteRef],
    starts_at: starts,
    ends_at: ends,
    max_delegation_depth: 0,
    authority_state: "verified_identity_authority",
    authority_receipt_ref: "proof:rivet-report-authority"
  }).grant;

  meter.registerEntitlement({
    entitlement_id: "ent_os_launch_rivet",
    idempotency_key: "ent:os-launch:rivet",
    subject_ref: "org:os-launch-proof",
    product: "rivet",
    metric: "site_reports",
    limit: 5,
    starts_at: starts,
    ends_at: ends,
    authority_state: "authoritative_verified",
    authority_receipt_ref: "proof:verified-payment"
  });

  return { passport, meter, passportStateDir, meterStateDir, rivetGrant };
}

function installAndMaterialize(root, { passport, actor, nodeId }) {
  const installLedger = new EvercraftOsInstallLedger({
    stateDir: path.join(root, "install-ledger"),
    passport
  });

  const request = buildAppInstallRequest({
    productKey: "aliev",
    subjectRef: actor,
    nodeId
  });
  const auth = passport.authorize({
    subject_ref: actor,
    product: "evercraft-os",
    scope: "app.install",
    resource_ref: appResourceRef("aliev", nodeId),
    at: new Date().toISOString()
  });
  assert.equal(auth.decision, "allow");

  const permit = passport.mintActionPermit({
    idempotency_key: "os-install-permit",
    grant_id: auth.grant_id,
    actor_ref: actor,
    scope: "app.install",
    resource_ref: appResourceRef("aliev", nodeId),
    request_fingerprint: request.request_fingerprint,
    ttl_seconds: 900
  }).permit;

  installLedger.install({
    request,
    permitId: permit.permit_id,
    actorRef: actor
  });

  const capsules = new EvercraftOsCapabilityCapsules({
    rootDir: path.join(root, "capsules"),
    installLedger
  });
  const materialized = capsules.materialize("aliev", nodeId);
  assert.equal(materialized.state, "materialized");
  return { installLedger, capsules };
}

test("installed AliEV capsule launches through Systemia + Execution Gate into owned RIVET runtime", async () => {
  const root = tempRoot();
  const actor = "subject:os-launch-proof";
  const nodeId = "node-os-launch-proof";
  const siteRef = "site:os-launch-proof";
  const machineKey = "proof-systemia-machine-key-123456789";
  const teamToken = "proof-rivet-team-token-123456789";
  let aliev = null;
  let rivet = null;

  try {
    const authority = setupAuthority(root, { actor, nodeId, siteRef });
    const { capsules } = installAndMaterialize(root, {
      passport: authority.passport,
      actor,
      nodeId
    });

    aliev = await startAliEvSourceRuntime({
      stateDir: path.join(root, "aliev-runtime"),
      systemiaMachineKey: machineKey,
      ingestToken: "proof-aliev-ingest-token-123456789",
      geocode: async (address) => ({
        matched_address: String(address),
        latitude: 46.6021,
        longitude: -120.5059,
        state: "WA",
        postal_code: "98901",
        city: "Yakima",
        source_name: "OS Launch Proof Geocoder",
        source_url: "https://example.test/os-proof-geocoder",
        evidence_state: "OFFICIAL_GEOCODE"
      }),
      refreshDomains: async () => ({
        schema: "evercraft.os.launch-proof-refresh.v1",
        collectors: {}
      })
    });

    rivet = await startRivetReportRuntime({
      stateDir: path.join(root, "rivet-runtime"),
      sourceUrl: aliev.source_url,
      systemiaMachineKey: machineKey,
      teamToken
    });

    const tokenFile = path.join(root, "rivet-team-token");
    fs.writeFileSync(tokenFile, teamToken + "\n", { mode: 0o600 });

    const gate = new EvercraftExecutionGate({
      stateDir: path.join(root, "execution-gate"),
      passportStateDir: authority.passportStateDir,
      meterStateDir: authority.meterStateDir,
      routeLedgerPath: writeRoutes(root)
    });

    const launcher = new EvercraftOsSystemiaLauncher({
      capsules,
      executionGate: gate,
      stateDir: path.join(root, "launcher"),
      rootDir: process.cwd(),
      dispatchers: {
        aliev: createOwnedRivetReportDispatcher({
          serviceUrl: rivet.service_url,
          tokenFile
        })
      }
    });

    const prepared = launcher.prepare({
      productKey: "aliev",
      nodeId,
      actorRef: actor,
      scope: "report.generate",
      resourceRef: siteRef,
      request: {
        address: "123 Evercraft Way, Yakima, WA 98901",
        report_type: "full_site_opportunity"
      },
      meterSubjectRef: "org:os-launch-proof",
      idempotencyKey: "os-launch:aliev:proof"
    });

    assert.equal(prepared.state, "prepared");
    assert.equal(prepared.systemia_admission.admitted, true);
    assert.equal(prepared.systemia_admission.execution_authority_granted, false);
    assert.equal(prepared.dispatch_decision.execution_gate_required, true);
    assert.equal(prepared.dispatch_decision.contract_action_scope, "report.generate");
    assert.equal(prepared.ticket.specialist_slug, "aliev");
    assert.equal(prepared.ticket.dispatch_route_mode, "registered_internal_specialist");
    assert.equal(prepared.ticket.public_direct_route_claimed, false);
    assert.equal(prepared.ticket.dispatch_allowed, false);
    assert.equal(gate.getLease(prepared.ticket.execution_gate_lease_id).state, "prepared");

    const result = await launcher.execute({ ticket: prepared.ticket });

    assert.equal(result.state, "completed");
    assert.equal(result.permit_consumed, true);
    assert.equal(result.dispatch_performed, true);
    assert.equal(result.runtime_output.schema, "evercraft.os.rivet-dispatch-output.v1");
    assert.equal(result.runtime_output.generation_state, "ready");
    assert.equal(result.runtime_output.report_type, "full_site_opportunity");
    assert.equal(result.runtime_output.raw_team_token_exposed, false);
    assert.equal(result.runtime_output.runtime_verification.full_source_snapshot_persisted, true);
    assert.equal(result.runtime_output.runtime_verification.report_generation_state, "ready");
    assert.match(result.launch_receipt.receipt_hash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(
      gate.getLease(prepared.ticket.execution_gate_lease_id).state,
      "completed"
    );

    const reportResponse = await fetch(
      rivet.service_url + "/v1/reports/" + encodeURIComponent(result.runtime_output.report_id),
      { headers: { authorization: "Bearer " + teamToken } }
    );
    assert.equal(reportResponse.status, 200);
    const report = await reportResponse.json();
    assert.equal(report.generation_state, "ready");
    assert.equal(report.report.body.address, "123 Evercraft Way, Yakima, WA 98901");
    assert.equal(report.report.body.source.source_snapshot_preserved, true);
  } finally {
    if (rivet) await rivet.close();
    if (aliev) await aliev.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("missing specialist dispatcher holds before execution permit consumption", async () => {
  const root = tempRoot();
  try {
    const actor = "subject:no-dispatcher";
    const nodeId = "node-no-dispatcher";
    const siteRef = "site:no-dispatcher";
    const authority = setupAuthority(root, { actor, nodeId, siteRef });
    const { capsules } = installAndMaterialize(root, {
      passport: authority.passport,
      actor,
      nodeId
    });

    const gate = new EvercraftExecutionGate({
      stateDir: path.join(root, "execution-gate"),
      passportStateDir: authority.passportStateDir,
      meterStateDir: authority.meterStateDir,
      routeLedgerPath: writeRoutes(root)
    });

    const launcher = new EvercraftOsSystemiaLauncher({
      capsules,
      executionGate: gate,
      stateDir: path.join(root, "launcher"),
      rootDir: process.cwd()
    });

    const prepared = launcher.prepare({
      productKey: "aliev",
      nodeId,
      actorRef: actor,
      scope: "report.generate",
      resourceRef: siteRef,
      request: {
        address: "456 Hold Ave, Yakima, WA 98901",
        report_type: "preliminary_site_opportunity"
      },
      meterSubjectRef: "org:os-launch-proof",
      idempotencyKey: "os-launch:no-dispatcher"
    });

    assert.equal(prepared.state, "held");
    assert.equal(prepared.reason, "specialist_dispatcher_not_registered");
    assert.equal(prepared.execution_gate_prepared, false);
    assert.equal(prepared.execution_authority_granted, false);
    assert.equal(prepared.dispatch_performed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tampered launch ticket fails before execution starts", async () => {
  const root = tempRoot();
  try {
    const actor = "subject:tamper";
    const nodeId = "node-tamper";
    const siteRef = "site:tamper";
    const authority = setupAuthority(root, { actor, nodeId, siteRef });
    const { capsules } = installAndMaterialize(root, {
      passport: authority.passport,
      actor,
      nodeId
    });
    const gate = new EvercraftExecutionGate({
      stateDir: path.join(root, "execution-gate"),
      passportStateDir: authority.passportStateDir,
      meterStateDir: authority.meterStateDir,
      routeLedgerPath: writeRoutes(root)
    });
    const launcher = new EvercraftOsSystemiaLauncher({
      capsules,
      executionGate: gate,
      stateDir: path.join(root, "launcher"),
      rootDir: process.cwd(),
      dispatchers: {
        aliev: { async execute() { throw new Error("must_not_dispatch"); } }
      }
    });

    const prepared = launcher.prepare({
      productKey: "aliev",
      nodeId,
      actorRef: actor,
      scope: "report.generate",
      resourceRef: siteRef,
      request: {
        address: "789 Original Ave, Yakima, WA 98901",
        report_type: "preliminary_site_opportunity"
      },
      meterSubjectRef: "org:os-launch-proof",
      idempotencyKey: "os-launch:tamper"
    });

    const tampered = {
      ...prepared.ticket,
      request: {
        ...prepared.ticket.request,
        address: "999 Tampered Ave, Yakima, WA 98901"
      }
    };

    await assert.rejects(
      () => launcher.execute({ ticket: tampered }),
      /os_launcher_ticket_integrity_mismatch/
    );
    assert.equal(gate.getLease(prepared.ticket.execution_gate_lease_id).state, "prepared");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
