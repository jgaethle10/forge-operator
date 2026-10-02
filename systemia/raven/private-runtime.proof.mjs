import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startRavenPrivateRuntime } from "./private-runtime.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "raven-private-runtime-"));
const controlToken = "proof-raven-control-token-0123456789012345";
const headers = {
  authorization: "Bearer " + controlToken,
  "content-type": "application/json",
};

let runtime;
let sessionId;
let expectedEvidence;

try {
  runtime = await startRavenPrivateRuntime({
    stateDir: root,
    repoRoot: path.resolve("."),
    controlToken,
    trustedSubjectRef: "user:founder-proof",
  });

  const health = await fetch(runtime.url + "/health").then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.service, "raven-nexus-private");
  assert.equal(health.runtime, "Raven Private Runtime");
  assert.equal(health.workload_class, "systemia.raven-private-runtime.v1");
  assert.equal(health.provider_independent_boot, true);
  assert.equal(health.external_ai_required, false);
  assert.equal(health.ai_inference_enabled, false);
  assert.equal(health.base44_required, false);
  assert.equal(health.execution_authority_granted, false);
  assert.equal(health.identity_boundary, "bound_subject");
  assert.equal(health.direct_browser_auth_supported, false);

  const denied = await fetch(runtime.url + "/v1/teams");
  assert.equal(denied.status, 401);
  const deniedWrongToken = await fetch(runtime.url + "/v1/teams", {
    headers: { authorization: "Bearer definitely-wrong-token-012345678901" },
  });
  assert.equal(deniedWrongToken.status, 401);

  const teamsOne = await fetch(runtime.url + "/v1/teams", { headers }).then((r) => r.json());
  const teamsTwo = await fetch(runtime.url + "/v1/teams", { headers }).then((r) => r.json());
  assert.equal(teamsOne.ok, true);
  assert.deepEqual(teamsOne.teams, teamsTwo.teams);
  assert.ok(teamsOne.teams.some((row) => row.component_key === "yard-operator" && row.label === "The Yard"));
  assert.ok(teamsOne.teams.some((row) => row.component_key === "evercraft-capability-mesh" && row.label === "Capability Mesh"));

  const mismatch = await fetch(runtime.url + "/v1/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({ subject_ref: "user:not-the-founder", title: "Wrong subject" }),
  });
  assert.equal(mismatch.status, 400);

  const created = await fetch(runtime.url + "/v1/sessions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject_ref: "user:founder-proof",
      title: "Private founder command room",
      lane: "infrastructure",
      team_component_key: "yard-operator",
    }),
  });
  assert.equal(created.status, 201);
  const session = (await created.json()).session;
  sessionId = session.session_id;
  expectedEvidence = session.evidence_semantics;
  assert.equal(session.authenticated_subject_ref, "user:founder-proof");
  assert.equal(session.title, "Private founder command room");
  assert.equal(session.lane, "infrastructure");
  assert.equal(session.team_component_key, "yard-operator");
  assert.deepEqual(session.mission_refs, []);
  assert.deepEqual(session.receipt_hashes, []);

  const planned = await fetch(
    runtime.url + "/v1/sessions/" + encodeURIComponent(sessionId) + "/commands",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "Prepare a private Raven deployment plan." }),
    }
  );
  assert.equal(planned.status, 200);
  const body = await planned.json();
  assert.equal(body.state, "planned_not_executed");
  assert.equal(body.command.execution_authority_granted, false);
  assert.equal(body.command.ai_inference_used, false);
  assert.equal(body.command.model_provider_used, null);
  assert.equal(body.command.systemia_authority, "systemia-organism");
  assert.equal(body.command.lifecycle.requested, true);
  assert.equal(body.command.lifecycle.planned, true);
  assert.equal(body.command.lifecycle.authorized, false);
  assert.equal(body.command.lifecycle.executed, false);
  assert.equal(body.command.lifecycle.verified, false);
  assert.ok(body.command.routed_teams.some((row) => row.label === "The Yard"));

  const storedBeforeRestart = await fetch(
    runtime.url + "/v1/sessions/" + encodeURIComponent(sessionId),
    { headers }
  ).then((r) => r.json());
  assert.equal(storedBeforeRestart.session.commands.length, 1);
  assert.equal(storedBeforeRestart.session.commands[0].receipt_hash, body.command.receipt_hash);
  assert.ok(storedBeforeRestart.session.mission_refs.includes(body.command.mission_key));
  assert.ok(storedBeforeRestart.session.receipt_hashes.includes(body.command.plan_receipt_hash));
  assert.ok(storedBeforeRestart.session.receipt_hashes.includes(body.command.receipt_hash));
  assert.equal(storedBeforeRestart.session.evidence_semantics, expectedEvidence);
  assert.equal(JSON.stringify(storedBeforeRestart).includes(controlToken), false);

  const sessionFiles = fs.readdirSync(path.join(root, "sessions"));
  assert.equal(sessionFiles.length, 1);
  const persistedText = fs.readFileSync(path.join(root, "sessions", sessionFiles[0]), "utf8");
  assert.equal(persistedText.includes(controlToken), false);
  assert.equal(persistedText.includes(body.command.receipt_hash), true);
  assert.equal(persistedText.includes(body.command.plan_receipt_hash), true);
  assert.equal(persistedText.includes(expectedEvidence), true);

  await runtime.close();
  runtime = null;

  runtime = await startRavenPrivateRuntime({
    stateDir: root,
    repoRoot: path.resolve("."),
    controlToken,
    trustedSubjectRef: "user:founder-proof",
  });

  const storedAfterRestart = await fetch(
    runtime.url + "/v1/sessions/" + encodeURIComponent(sessionId),
    { headers }
  ).then((r) => r.json());
  assert.equal(storedAfterRestart.ok, true);
  assert.equal(storedAfterRestart.session.commands.length, 1);
  assert.deepEqual(storedAfterRestart.session.mission_refs, storedBeforeRestart.session.mission_refs);
  assert.deepEqual(storedAfterRestart.session.receipt_hashes, storedBeforeRestart.session.receipt_hashes);
  assert.equal(storedAfterRestart.session.evidence_semantics, expectedEvidence);

  runtime.setDeploymentReceipt("receipt:raven-private-proof");
  assert.equal(runtime.health().deployment_receipt_bound, true);

  console.log(JSON.stringify({
    ok: true,
    schema: "evercraft.raven.private-runtime-proof.v1",
    private_session_ledger: true,
    restart_preserves_state: true,
    deterministic_team_directory: true,
    systemia_routing: true,
    raw_control_token_persisted: false,
    ai_inference_enabled: false,
    execution_authority_granted: false,
    provider_independent_boot: true,
    standalone_runtime_truthful: true,
  }, null, 2));
} finally {
  if (runtime) await runtime.close();
  fs.rmSync(root, { recursive: true, force: true });
}
