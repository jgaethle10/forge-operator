import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  createCommissionedTeamGate,
  signedAgentEvidenceMessage,
  verifySignedAgentEvidence,
} from "../systemia/agent-continuity/signed-evidence.mjs";
import {
  createRavenTeamReviewExecutor,
  TEAM_REVIEW_ROLES,
} from "../systemia/raven/team-review-runtime.mjs";

const now = () => new Date("2026-10-28T21:02:00Z");
const roles = TEAM_REVIEW_ROLES.map((x, i) => "original-agent-" + (i + 1));
const assigned = Object.fromEntries(TEAM_REVIEW_ROLES.map((x, i) => [x.reviewer_id, roles[i]]));
const workerKeys = Object.fromEntries(roles.map((id) => [id, crypto.generateKeyPairSync("ed25519")]));
const WORKER_TEXT = "VERDICT: HOLD. Missing evidence.";
const keyPair = crypto.generateKeyPairSync("ed25519");
const other = crypto.generateKeyPairSync("ed25519");
const publicPem = keyPair.publicKey.export({ type: "spki", format: "pem" });
const trustedKeys = {
  dispatch_preflight: { "owned-preflight-key": publicPem },
  dispatch_completion: { "owned-completion-key": publicPem },
  worker_execution: Object.fromEntries(roles.map((id) => [
    id, workerKeys[id].publicKey.export({type:"spki",format:"pem"}),
  ])),
};

function sign(kind, payload, key = keyPair.privateKey, keyId = kind === "dispatch_preflight" ? "owned-preflight-key" : "owned-completion-key") {
  const envelope = {
    schema: "evercraft.agent-continuity.signed-evidence.v1",
    kind,
    key_id: keyId,
    issued_at: "2026-10-28T21:01:00Z",
    expires_at: "2026-10-28T21:04:00Z",
    payload,
  };
  return {
    ...envelope,
    signature: crypto.sign(null, signedAgentEvidenceMessage(envelope), key).toString("base64"),
  };
}

function signedWorkerResult({ request: r = request(), preflight = preflightPayload(), reviewerId, inference }) {
  const agentId = preflight.reviewer_assignments[reviewerId];
  const envelope = {
    schema: "evercraft.agent-continuity.signed-evidence.v1",
    kind: "worker_execution",
    key_id: agentId,
    issued_at: "2026-10-28T21:01:00Z",
    expires_at: "2026-10-28T21:04:00Z",
    payload: {
      request_id: r.request_id, mission_key: r.mission_key, work_key: r.work_key,
      preflight_id: preflight.preflight_id,
      registry_snapshot_hash: preflight.registry_snapshot_hash,
      reviewer_id: reviewerId, agent_id: agentId,
      inference_request_id: r.request_id + ":" + reviewerId,
      result_sha256: "sha256:" + crypto.createHash("sha256").update(inference.text).digest("hex"),
      provider_receipt: inference.provider_receipt,
      result_state: "completed",
      runtime_class: "evercraft-owned-commissioned-worker",
      worker_run_receipt_ref: "test-owned-worker:" + reviewerId,
      worker_instance_id: "test-node:" + agentId,
    },
  };
  return {
    ...envelope,
    signature: crypto.sign(null, signedAgentEvidenceMessage(envelope), workerKeys[agentId].privateKey)
      .toString("base64"),
  };
}
function request() {
  return {
    schema: "evercraft.nexus.team-review.request.v1",
    request_id: "commissioned-test-101",
    mission_key: "mission-101",
    work_key: "review",
    work_type: "analyze",
    objective: "Review an internal offer without external actions.",
    requested_team: "commissioned",
    assigned_agents: roles,
    constraints: {
      internal_analysis_only: true,
      read_only: true,
      no_external_messages: true,
      no_publication: true,
      no_deployment: true,
      no_purchase: true,
      no_payment: true,
      no_account_changes: true,
      no_credential_return: true,
    },
  };
}
function preflightPayload(req = request()) {
  return {
    request_id: req.request_id,
    mission_key: req.mission_key,
    work_key: req.work_key,
    preflight_id: "owned-preflight-once-101",
    role_ids: roles,
    reviewer_assignments: { ...assigned },
    registry_snapshot_hash: "sha256:" + "a".repeat(64),
    passport_receipt_ref: "passport:test-101",
    execution_gate_receipt_ref: "execution-gate:test-101",
    juniper: { memory_read: "passed", read_receipt_ref: "juniper:test-read-101" },
    sentinel: { guard: "passed", guard_receipt_ref: "sentinel:test-guard-101" },
  };
}
function makeExecutor(gate, counter) {
  return createRavenTeamReviewExecutor({
    now,
    commissionedGate: gate,
    inferenceAdapter: {
      async infer({role}) {
        counter.count += 1;
        return {
          text: role === "synthesis" ? "FINAL VERDICT: HOLD. Verify capacity." : "VERDICT: HOLD. Missing evidence.",
          provider: "owned-synthetic-proof",
          provider_receipt: "fake:" + role,
        };
      },
    },
  });
}

test("signed Ed25519 evidence rejects altered, expired and untrusted claims", () => {
  const good = sign("dispatch_preflight", preflightPayload());
  assert.equal(verifySignedAgentEvidence({ envelope: good, kind: "dispatch_preflight", trustedKeys, now: now() }), true);
  const mutated = structuredClone(good);
  mutated.payload.mission_key = "different-mission";
  assert.equal(verifySignedAgentEvidence({ envelope: mutated, kind: "dispatch_preflight", trustedKeys, now: now() }), false);
  const forged = sign("dispatch_preflight", preflightPayload(), other.privateKey);
  assert.equal(verifySignedAgentEvidence({ envelope: forged, kind: "dispatch_preflight", trustedKeys, now: now() }), false);
  assert.equal(verifySignedAgentEvidence({ envelope: good, kind: "dispatch_completion", trustedKeys, now: now() }), false);
  assert.equal(verifySignedAgentEvidence({ envelope: good, kind: "dispatch_preflight", trustedKeys, now: new Date("2026-10-28T22:00:00Z") }), false);
});

test("unconfigured commissioned team holds before any provider work", async () => {
  const counter = {count:0};
  const executor = makeExecutor(null, counter);
  const res = await executor(request());
  assert.equal(res.status, "blocked");
  assert.equal(res.blocked_reason, "commissioned_team_verifier_not_configured");
  assert.equal(counter.count, 0);
});

test("valid mission-bound signed preflight and signed Juniper writeback yield a bounded receipt", async () => {
  const seen = new Set();
  const gate = createCommissionedTeamGate({
    trustedKeys,
    now,
    verifyRoster: async ({preflightEvidence}) => ({verified:true,digest:preflightEvidence.payload.registry_snapshot_hash}),
    readPreflight: async () => sign("dispatch_preflight", preflightPayload()),
    readWorkerExecution: async ({request:r,preflight,reviewerId,inference}) =>
      signedWorkerResult({request:r,preflight:preflightPayload(),reviewerId,inference}),
    consumeNonce: async ({preflight_id}) => {
      if (seen.has(preflight_id)) return false;
      seen.add(preflight_id);
      return true;
    },
    readCompletion: async ({request: r, preflight, review_result_hash}) =>
      sign("dispatch_completion", {
        request_id:r.request_id, mission_key:r.mission_key, work_key:r.work_key,
        preflight_id:preflight.preflight_id,
        review_result_hash,
        juniper:{memory_writeback:"recorded",writeback_receipt_ref:"juniper:write-101"},
        completion_ref:"owned-completion-101",
      }),
  });
  const counter = {count:0};
  const run = makeExecutor(gate, counter);
  const result = await run(request());
  assert.equal(result.status, "completed");
  assert.equal(result.commissioned_identity_verified, true);
  assert.equal(result.raven_receipt.commissioned_completion_ref, "owned-completion-101");
  assert.equal(result.raven_receipt.actual_all_roster_liveness_verified, false);
  assert.equal(counter.count, 7);
  const replay = await run(request());
  assert.equal(replay.status, "blocked");
  assert.equal(replay.blocked_reason, "commissioned_preflight_nonce_not_claimed");
  assert.equal(counter.count, 7);
});

test("missing Juniper/Sentinel or identity map holds before inference", async () => {
  for (const tamper of [
    (p) => { delete p.juniper.read_receipt_ref; },
    (p) => { delete p.sentinel.guard_receipt_ref; },
    (p) => { p.reviewer_assignments.risk = "unknown-agent"; },
    (p) => { p.reviewer_assignments.risk = "sentinel"; },
  ]) {
    const payload = preflightPayload();
    tamper(payload);
    const gate = createCommissionedTeamGate({
      trustedKeys, now,
      verifyRoster: async ({preflightEvidence}) => ({verified:true,digest:preflightEvidence.payload.registry_snapshot_hash}),
      readPreflight: async () => sign("dispatch_preflight", payload),
      consumeNonce: async () => true,
    });
    const counter = {count:0};
    const result = await makeExecutor(gate, counter)(request());
    assert.equal(result.status, "blocked");
    assert.equal(counter.count, 0);
  }
});

test("completion without signed Juniper writeback cannot report success", async () => {
  const gate = createCommissionedTeamGate({
    trustedKeys, now,
    verifyRoster: async ({preflightEvidence}) => ({verified:true,digest:preflightEvidence.payload.registry_snapshot_hash}),
    readPreflight: async () => sign("dispatch_preflight", preflightPayload()),
    consumeNonce: async () => true,
    readWorkerExecution: async ({request:r,preflight,reviewerId,inference}) =>
      signedWorkerResult({request:r,preflight:preflightPayload(),reviewerId,inference}),
    readCompletion: async ({request:r,preflight,review_result_hash}) =>
      sign("dispatch_completion", {
        request_id:r.request_id, mission_key:r.mission_key, work_key:r.work_key,
        preflight_id:preflight.preflight_id,
        review_result_hash,
        juniper:{memory_writeback:"missing"},
      }),
  });
  const counter={count:0};
  const result=await makeExecutor(gate,counter)(request());
  assert.equal(result.status, "blocked");
  assert.equal(result.blocked_reason, "commissioned_completion_binding_or_writeback_invalid");
  assert.equal(counter.count,7);
});

test("committed roster without independent worker receipts is blocked before synthesis", async () => {
  const gate = createCommissionedTeamGate({
    trustedKeys, now,
    verifyRoster: async ({preflightEvidence}) => ({
      verified:true,digest:preflightEvidence.payload.registry_snapshot_hash,
    }),
    readPreflight: async () => sign("dispatch_preflight",preflightPayload()),
    consumeNonce: async () => true,
  });
  const counter={count:0};
  const outcome=await makeExecutor(gate,counter)(request());
  assert.equal(outcome.status,"blocked");
  assert.equal(outcome.blocked_reason,"commissioned_worker_execution_not_verified_for_all_reviewers");
  assert.equal(outcome.commissioned_identity_verified,false);
  assert.equal(counter.count,TEAM_REVIEW_ROLES.length);
});

test("role lenses remain useful without pretending to be commissioned identities", async () => {
  const counter={count:0};
  const generic=request();
  generic.requested_team="role_lenses";
  generic.assigned_agents=[];
  const result=await makeExecutor(null,counter)(generic);
  assert.equal(result.status,"completed");
  assert.equal(result.review_mode,"role_lenses");
  assert.equal(result.commissioned_identity_verified,false);
  assert.equal(result.raven_receipt.actual_all_roster_liveness_verified,false);
  assert.equal(counter.count,7);
});
