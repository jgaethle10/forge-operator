import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { admitMission } from "../control-plane/control-plane.mjs";
import { buildExecutionGateInput, compileProductRuntimePolicy } from "../capability-mesh/runtime.mjs";
import { requestFingerprint } from "../execution-gate/gate.mjs";

function requiredText(value, field) {
  const text = String(value || "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function sha256(value) {
  return "sha256:" + createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.appendFileSync(file, JSON.stringify(value) + "\n", { mode: 0o600 });
}

function stableReceipt(body) {
  return { ...body, receipt_hash: sha256(body) };
}

function normalizeDispatcher(dispatcher, slug) {
  if (!dispatcher || typeof dispatcher.execute !== "function") {
    throw new Error("dispatcher_execute_required:" + slug);
  }
  return {
    specialist_slug: slug,
    execute: dispatcher.execute.bind(dispatcher)
  };
}

export class EvercraftOsSystemiaLauncher {
  constructor({
    capsules,
    executionGate,
    dispatchers = {},
    stateDir,
    rootDir = process.cwd()
  } = {}) {
    if (!capsules) throw new Error("os_launcher_capsules_required");
    if (!executionGate) throw new Error("os_launcher_execution_gate_required");
    if (!stateDir) throw new Error("os_launcher_state_dir_required");

    this.capsules = capsules;
    this.executionGate = executionGate;
    this.stateDir = path.resolve(stateDir);
    this.rootDir = path.resolve(rootDir);
    this.receiptsFile = path.join(this.stateDir, "launch-receipts.jsonl");
    this.dispatchers = new Map();

    for (const [slug, dispatcher] of Object.entries(dispatchers || {})) {
      this.dispatchers.set(slug, normalizeDispatcher(dispatcher, slug));
    }
  }

  registerDispatcher(slug, dispatcher) {
    const key = requiredText(slug, "specialist_slug");
    this.dispatchers.set(key, normalizeDispatcher(dispatcher, key));
    return this;
  }

  #writeReceipt(body) {
    const receipt = stableReceipt(body);
    appendJsonl(this.receiptsFile, receipt);
    return receipt;
  }

  prepare({
    productKey,
    nodeId,
    actorRef,
    scope,
    resourceRef = null,
    request,
    meterSubjectRef = null,
    idempotencyKey = null,
    requireDirectSpecialist = false
  } = {}) {
    const product = requiredText(productKey, "product_key");
    const node = requiredText(nodeId, "node_id");
    const actor = requiredText(actorRef, "actor_ref");
    const actionScope = requiredText(scope, "scope");

    const capsule = this.capsules.inspect(product, node);
    if (!capsule.materialized || capsule.integrity !== "verified") {
      throw new Error("os_launcher_capsule_not_verified");
    }

    const policy = compileProductRuntimePolicy(product, this.rootDir);
    if (policy.adoption_stage !== "shared_runtime") {
      throw new Error("os_launcher_product_not_shared_runtime");
    }

    const action = (policy.execution.actions || []).find((row) => row.scope === actionScope);
    if (!action) throw new Error("os_launcher_scope_not_declared");

    const workKey = "os-launch-" + product + "-" + actionScope.replace(/[^a-zA-Z0-9._-]/g, "_");
    const admission = admitMission({
      rootDir: this.rootDir,
      request: {
        mission_key: "evercraft-os:" + product + ":" + randomUUID(),
        objective: "Launch installed Evercraft OS capability " + product + " through Systemia",
        tasks: [{
          work_key: workKey,
          title: "Launch " + product + " " + actionScope,
          work_type: "execute",
          product_key: product,
          action_scope: actionScope,
          meter_metric: action.meter_metric || null,
          metered: Boolean(action.meter_metric),
          execution_gate_required: true
        }]
      }
    });

    const decision = admission.dispatch.find((row) => row.work_key === workKey) || null;
    if (!admission.receipt.admitted || !decision || decision.hold) {
      return {
        schema: "evercraft.os.systemia-launch-preparation.v1",
        state: "held",
        product_key: product,
        node_id: node,
        systemia_admission: admission.receipt,
        dispatch_decision: decision,
        execution_gate_prepared: false,
        execution_authority_granted: false,
        dispatch_performed: false
      };
    }

    const key = idempotencyKey || "evercraft-os-launch:" + product + ":" + sha256({
      node_id: node,
      actor_ref: actor,
      scope: actionScope,
      resource_ref: resourceRef,
      request
    }).slice(7, 31);

    const compiled = buildExecutionGateInput({
      product_key: product,
      actor_ref: actor,
      scope: actionScope,
      resource_ref: resourceRef,
      request,
      meter_subject_ref: meterSubjectRef,
      idempotency_key: key,
      require_direct_specialist: requireDirectSpecialist,
      root: this.rootDir
    });

    const prepared = this.executionGate.prepareExecution(compiled.execution_gate_input);
    if (prepared.state !== "prepared") {
      return {
        schema: "evercraft.os.systemia-launch-preparation.v1",
        state: prepared.state,
        product_key: product,
        node_id: node,
        systemia_admission: admission.receipt,
        dispatch_decision: decision,
        execution_gate: prepared,
        execution_authority_granted: false,
        dispatch_performed: false
      };
    }

    const ticketBody = {
      schema: "evercraft.os.systemia-launch-ticket.v1",
      product_key: product,
      node_id: node,
      actor_ref: actor,
      scope: actionScope,
      resource_ref: resourceRef,
      request,
      request_fingerprint: prepared.lease.request_fingerprint,
      specialist_slug: prepared.lease.specialist_slug,
      execution_gate_lease_id: prepared.lease.lease_id,
      capsule_manifest_hash: capsule.manifest_hash,
      package_fingerprint: capsule.package_fingerprint,
      systemia_admission_receipt_hash: admission.receipt.receipt_hash,
      execution_gate_prepared_receipt_hash: prepared.lease.receipt_hash,
      prepared_at: prepared.lease.recorded_at,
      dispatch_allowed: false,
      dispatch_performed: false
    };

    return {
      schema: "evercraft.os.systemia-launch-preparation.v1",
      state: "prepared",
      product_key: product,
      node_id: node,
      systemia_admission: admission.receipt,
      dispatch_decision: decision,
      execution_gate: prepared,
      ticket: {
        ...ticketBody,
        ticket_hash: sha256(ticketBody)
      },
      execution_authority_granted: false,
      dispatch_performed: false
    };
  }

  async execute({ ticket } = {}) {
    if (ticket?.schema !== "evercraft.os.systemia-launch-ticket.v1") {
      throw new Error("os_launcher_ticket_schema_invalid");
    }

    const { ticket_hash, ...ticketBody } = ticket;
    if (ticket_hash !== sha256(ticketBody)) throw new Error("os_launcher_ticket_integrity_mismatch");

    const capsule = this.capsules.inspect(ticket.product_key, ticket.node_id);
    if (capsule.manifest_hash !== ticket.capsule_manifest_hash) {
      throw new Error("os_launcher_capsule_changed_after_prepare");
    }
    if (capsule.package_fingerprint !== ticket.package_fingerprint) {
      throw new Error("os_launcher_package_changed_after_prepare");
    }

    const liveFingerprint = requestFingerprint({ request: ticket.request });
    if (liveFingerprint !== ticket.request_fingerprint) {
      throw new Error("os_launcher_request_integrity_mismatch");
    }

    const lease = this.executionGate.getLease(ticket.execution_gate_lease_id);
    if (!lease) throw new Error("os_launcher_execution_lease_missing");
    if (lease.state !== "prepared") throw new Error("os_launcher_execution_lease_not_prepared");
    if (lease.request_fingerprint !== ticket.request_fingerprint) {
      throw new Error("os_launcher_execution_lease_request_mismatch");
    }
    if (lease.specialist_slug !== ticket.specialist_slug) {
      throw new Error("os_launcher_execution_lease_route_mismatch");
    }

    const dispatcher = this.dispatchers.get(ticket.specialist_slug);
    if (!dispatcher) {
      return {
        schema: "evercraft.os.systemia-launch-result.v1",
        state: "held",
        reason: "specialist_dispatcher_not_registered",
        product_key: ticket.product_key,
        specialist_slug: ticket.specialist_slug,
        execution_gate_lease_id: lease.lease_id,
        permit_consumed: false,
        dispatch_performed: false
      };
    }

    const startEvidence = this.#writeReceipt({
      schema: "evercraft.os.systemia-launch-start-evidence.v1",
      product_key: ticket.product_key,
      node_id: ticket.node_id,
      capsule_manifest_hash: ticket.capsule_manifest_hash,
      systemia_admission_receipt_hash: ticket.systemia_admission_receipt_hash,
      ticket_hash,
      observed_at: new Date().toISOString()
    });

    const started = this.executionGate.startExecution({
      idempotency_key: "evercraft-os:start:" + lease.lease_id,
      lease_id: lease.lease_id,
      start_evidence_ref: startEvidence.receipt_hash
    });

    if (started.state !== "started" || started.dispatch_allowed !== true) {
      return {
        schema: "evercraft.os.systemia-launch-result.v1",
        state: started.state,
        product_key: ticket.product_key,
        execution_gate: started,
        permit_consumed: false,
        dispatch_performed: false
      };
    }

    let dispatchResult;
    try {
      dispatchResult = await dispatcher.execute({
        product_key: ticket.product_key,
        node_id: ticket.node_id,
        actor_ref: ticket.actor_ref,
        scope: ticket.scope,
        resource_ref: ticket.resource_ref,
        request: structuredClone(ticket.request),
        route: structuredClone(started.route),
        capsule: structuredClone(capsule),
        lease: structuredClone(started.lease)
      });
    } catch (error) {
      dispatchResult = {
        state: "blocked",
        receipt_ref: null,
        evidence_refs: [],
        output: null,
        error: String(error?.message || error)
      };
    }

    const outcomeState = String(dispatchResult?.state || "").trim().toLowerCase();
    if (!["completed", "blocked"].includes(outcomeState)) {
      throw new Error("os_launcher_dispatcher_state_invalid");
    }

    const dispatchReceipt = this.#writeReceipt({
      schema: "evercraft.os.systemia-dispatch-receipt.v1",
      product_key: ticket.product_key,
      node_id: ticket.node_id,
      actor_ref: ticket.actor_ref,
      scope: ticket.scope,
      specialist_slug: ticket.specialist_slug,
      execution_gate_lease_id: lease.lease_id,
      request_fingerprint: ticket.request_fingerprint,
      state: outcomeState,
      dispatcher_receipt_ref: dispatchResult?.receipt_ref || null,
      evidence_refs: Array.isArray(dispatchResult?.evidence_refs)
        ? dispatchResult.evidence_refs.map((value) => String(value))
        : [],
      output_hash: dispatchResult?.output == null ? null : sha256(dispatchResult.output),
      error: dispatchResult?.error ? String(dispatchResult.error) : null,
      dispatched_at: new Date().toISOString(),
      dispatch_performed: true
    });

    const completed = this.executionGate.completeExecution({
      idempotency_key: "evercraft-os:complete:" + lease.lease_id,
      lease_id: lease.lease_id,
      outcome_evidence_ref: dispatchReceipt.receipt_hash,
      outcome_state: outcomeState
    });

    const launchReceipt = this.#writeReceipt({
      schema: "evercraft.os.systemia-launch-receipt.v1",
      product_key: ticket.product_key,
      node_id: ticket.node_id,
      actor_ref: ticket.actor_ref,
      scope: ticket.scope,
      specialist_slug: ticket.specialist_slug,
      execution_gate_lease_id: lease.lease_id,
      ticket_hash,
      start_evidence_receipt_hash: startEvidence.receipt_hash,
      dispatch_receipt_hash: dispatchReceipt.receipt_hash,
      execution_gate_completion_receipt_hash: completed.lease.receipt_hash,
      outcome_state: outcomeState,
      dispatch_performed: true,
      completed_at: new Date().toISOString()
    });

    return {
      schema: "evercraft.os.systemia-launch-result.v1",
      state: outcomeState,
      product_key: ticket.product_key,
      node_id: ticket.node_id,
      specialist_slug: ticket.specialist_slug,
      execution_gate_lease_id: lease.lease_id,
      permit_consumed: true,
      dispatch_performed: true,
      runtime_output: dispatchResult?.output ?? null,
      dispatcher_receipt_ref: dispatchResult?.receipt_ref || null,
      evidence_refs: dispatchReceipt.evidence_refs,
      launch_receipt: launchReceipt,
      execution_gate_completion: completed
    };
  }
}
