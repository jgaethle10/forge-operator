import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { evercraftOsSha256 } from "./package-trust.mjs";
import { captureCurrentProcessInstance } from "./process-instance.mjs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function fingerprint(value, field = "package_fingerprint") {
  const text = required(value, field);
  if (!/^sha256:[a-f0-9]{64}$/.test(text)) throw new Error(field + "_invalid");
  return text;
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(file, "a", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = file + "." + process.pid + "." + randomUUID() + ".tmp";
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

function planIntegrity(plan) {
  const { request_fingerprint, ...body } = plan || {};
  return request_fingerprint === evercraftOsSha256(body);
}

function resourceRef(productKey, nodeId) {
  return `os-app:${required(productKey, "product_key")}:node:${required(nodeId, "node_id")}`;
}

function sealEvent(body) {
  return { ...body, receipt_hash: evercraftOsSha256(body) };
}

export function buildPackageRollbackPlan({
  productKey,
  nodeId,
  subjectRef,
  currentPackageFingerprint,
  targetPackageFingerprint,
  sourceTransitionReceiptHash,
} = {}) {
  const product = required(productKey, "product_key");
  const node = required(nodeId, "node_id");
  const subject = required(subjectRef, "subject_ref");
  const current = fingerprint(currentPackageFingerprint, "current_package_fingerprint");
  const target = fingerprint(targetPackageFingerprint, "target_package_fingerprint");
  if (current === target) throw new Error("rollback_target_unchanged");
  const sourceReceipt = fingerprint(sourceTransitionReceiptHash, "source_transition_receipt_hash");
  const body = {
    schema: "evercraft.os.package-rollback-plan.v1",
    operation: "rollback",
    product_key: product,
    node_id: node,
    subject_ref: subject,
    resource_ref: resourceRef(product, node),
    current_package_fingerprint: current,
    target_package_fingerprint: target,
    source_transition_receipt_hash: sourceReceipt,
    required_passport_scope: "app.rollback",
    mutation_performed: false,
    permit_minted: false,
    permit_consumed: false,
    rollback_authority_granted: false,
    execution_authority_granted: false,
  };
  return { ...body, request_fingerprint: evercraftOsSha256(body) };
}

export class EvercraftOsPackageTransitionLedger {
  constructor({ stateDir, passport, installedStateProvider } = {}) {
    if (!stateDir) throw new Error("package_transition_state_dir_required");
    if (!passport) throw new Error("package_transition_passport_required");
    if (!installedStateProvider || typeof installedStateProvider.currentState !== "function") {
      throw new Error("package_transition_installed_state_provider_required");
    }
    this.stateDir = path.resolve(stateDir);
    this.eventsFile = path.join(this.stateDir, "package-transition-events.jsonl");
    this.headFile = path.join(this.stateDir, "package-transition-head.json");
    this.writerLockFile = path.join(this.stateDir, "package-transition-writer.lock");
    this.passport = passport;
    this.installedStateProvider = installedStateProvider;
  }

  writerLockState() {
    if (!fs.existsSync(this.writerLockFile)) {
      return {
        schema: "evercraft.os.package-transition-writer-lock-state.v1",
        state: "free",
        active: false,
      };
    }
    try {
      const lock = JSON.parse(fs.readFileSync(this.writerLockFile, "utf8"));
      if (!["evercraft.os.package-transition-writer-lock.v1", "evercraft.os.package-transition-writer-lock.v2"].includes(lock?.schema) || !lock.lock_token) {
        throw new Error("package_transition_writer_lock_schema_invalid");
      }
      return {
        schema: "evercraft.os.package-transition-writer-lock-state.v1",
        state: "busy",
        active: true,
        operation: lock.operation || null,
        product_key: lock.product_key || null,
        node_id: lock.node_id || null,
        resource_ref: lock.resource_ref || null,
        pid: Number.isInteger(lock.pid) ? lock.pid : null,
        acquired_at: lock.acquired_at || null,
        process_instance: lock.process_instance || null,
        recovery_process_identity_available: lock.schema === "evercraft.os.package-transition-writer-lock.v2" && Boolean(lock.process_instance),
      };
    } catch (error) {
      return {
        schema: "evercraft.os.package-transition-writer-lock-state.v1",
        state: "held",
        active: true,
        reason: String(error?.message || error),
      };
    }
  }

  #withWriterLock({ operation, productKey, nodeId }, fn) {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const lockToken = randomUUID();
    const product = required(productKey, "writer_lock_product_key");
    const node = required(nodeId, "writer_lock_node_id");
    const lock = {
      schema: "evercraft.os.package-transition-writer-lock.v2",
      lock_token: lockToken,
      operation: required(operation, "writer_lock_operation"),
      product_key: product,
      node_id: node,
      resource_ref: resourceRef(product, node),
      pid: process.pid,
      process_instance: (() => {
        try { return captureCurrentProcessInstance(); } catch { return null; }
      })(),
      acquired_at: new Date().toISOString(),
    };
    let fd;
    try {
      fd = fs.openSync(this.writerLockFile, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("package_transition_writer_busy");
      throw error;
    }
    try {
      fs.writeFileSync(fd, JSON.stringify(lock, null, 2) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    try {
      return fn();
    } finally {
      try {
        const persisted = JSON.parse(fs.readFileSync(this.writerLockFile, "utf8"));
        if (persisted?.lock_token === lockToken) fs.unlinkSync(this.writerLockFile);
      } catch {
        // Fail closed: a missing/corrupt/replaced lock is never deleted blindly.
      }
    }
  }

  #verifyEventChain(rawEvents) {
    let previous = null;
    for (let index = 0; index < rawEvents.length; index += 1) {
      const event = rawEvents[index];
      if (event?.schema !== "evercraft.os.package-transition-event.v1") {
        throw new Error("package_transition_event_schema_invalid:" + index);
      }
      const { receipt_hash, ...body } = event;
      if (receipt_hash !== evercraftOsSha256(body)) {
        throw new Error("package_transition_event_hash_mismatch:" + index);
      }
      const expectedPrevious = previous?.receipt_hash || null;
      if ((event.previous_transition_receipt_hash || null) !== expectedPrevious) {
        throw new Error("package_transition_chain_mismatch:" + index);
      }
      previous = event;
    }

    const head = fs.existsSync(this.headFile)
      ? JSON.parse(fs.readFileSync(this.headFile, "utf8"))
      : null;
    if (rawEvents.length === 0) {
      if (head && (head.event_count !== 0 || head.head_receipt_hash !== null)) {
        throw new Error("package_transition_head_nonempty_without_events");
      }
      return { events: rawEvents, head: head || null };
    }
    if (!head) throw new Error("package_transition_head_missing");
    if (head.schema !== "evercraft.os.package-transition-head.v1") {
      throw new Error("package_transition_head_schema_invalid");
    }
    const { head_hash, ...headBody } = head;
    if (head_hash !== evercraftOsSha256(headBody)) {
      throw new Error("package_transition_head_hash_mismatch");
    }
    if (head.event_count !== rawEvents.length) {
      throw new Error("package_transition_head_count_mismatch");
    }
    if (head.head_receipt_hash !== previous.receipt_hash) {
      throw new Error("package_transition_head_receipt_mismatch");
    }
    return { events: rawEvents, head };
  }

  #writeHead(events) {
    const body = {
      schema: "evercraft.os.package-transition-head.v1",
      event_count: events.length,
      head_receipt_hash: events.at(-1)?.receipt_hash || null,
      updated_at: new Date().toISOString(),
    };
    atomicJson(this.headFile, { ...body, head_hash: evercraftOsSha256(body) });
  }

  #appendEvent(event) {
    const verified = this.#verifyEventChain(readJsonl(this.eventsFile));
    const previous = verified.events.at(-1)?.receipt_hash || null;
    if ((event.previous_transition_receipt_hash || null) !== previous) {
      throw new Error("package_transition_append_previous_mismatch");
    }
    appendJsonl(this.eventsFile, event);
    const nextEvents = [...verified.events, event];
    this.#writeHead(nextEvents);
  }

  events() {
    return this.#verifyEventChain(readJsonl(this.eventsFile)).events;
  }

  verifyIntegrity() {
    try {
      const verified = this.#verifyEventChain(readJsonl(this.eventsFile));
      return {
        schema: "evercraft.os.package-transition-integrity.v1",
        state: "verified",
        event_count: verified.events.length,
        head_receipt_hash: verified.events.at(-1)?.receipt_hash || null,
        mutation_performed: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.os.package-transition-integrity.v1",
        state: "held",
        reason: String(error?.message || error),
        mutation_performed: false,
      };
    }
  }

  eventsFor(productKey, nodeId) {
    const product = required(productKey, "product_key");
    const node = required(nodeId, "node_id");
    return this.events().filter((event) => event.product_key === product && event.node_id === node);
  }

  currentState(productKey, nodeId) {
    const product = required(productKey, "product_key");
    const node = required(nodeId, "node_id");
    const installed = this.installedStateProvider.currentState(product, node);
    if (!installed?.installed) {
      return {
        schema: "evercraft.os.package-transition-state.v1",
        product_key: product,
        node_id: node,
        installed: false,
        package_fingerprint: null,
        transition_count: 0,
      };
    }
    const base = fingerprint(installed.package_fingerprint, "installed_package_fingerprint");
    const events = this.eventsFor(product, node);
    const last = events.at(-1) || null;
    return {
      schema: "evercraft.os.package-transition-state.v1",
      product_key: product,
      node_id: node,
      installed: true,
      package_fingerprint: last?.to_package_fingerprint || base,
      baseline_package_fingerprint: base,
      transition_count: events.length,
      last_transition_event_id: last?.event_id || null,
      last_transition_receipt_hash: last?.receipt_hash || null,
      previous_package_fingerprint: last?.from_package_fingerprint || null,
      runtime_restarted_claimed: false,
      package_materialized_claimed: false,
    };
  }

  planRollback({ productKey, nodeId, subjectRef } = {}) {
    const state = this.currentState(productKey, nodeId);
    if (!state.installed) throw new Error("rollback_app_not_installed");
    const events = this.eventsFor(productKey, nodeId);
    const last = events.at(-1);
    if (!last) throw new Error("rollback_transition_history_required");
    return buildPackageRollbackPlan({
      productKey,
      nodeId,
      subjectRef,
      currentPackageFingerprint: state.package_fingerprint,
      targetPackageFingerprint: last.from_package_fingerprint,
      sourceTransitionReceiptHash: last.receipt_hash,
    });
  }

  #assertPermit({ permitId, actorRef, scope, resource, requestFingerprint }) {
    const permit = this.passport.getActionPermitState(required(permitId, "permit_id"));
    if (!permit.active) throw new Error("package_transition_permit_not_active");
    if (permit.actor_ref !== actorRef) throw new Error("package_transition_permit_actor_mismatch");
    if (permit.product !== "evercraft-os") throw new Error("package_transition_permit_product_mismatch");
    if (permit.scope !== scope) throw new Error("package_transition_permit_scope_mismatch");
    if (permit.resource_ref !== resource) throw new Error("package_transition_permit_resource_mismatch");
    if (permit.request_fingerprint !== requestFingerprint) throw new Error("package_transition_permit_request_mismatch");
  }

  #duplicate(plan, permitId, actorRef) {
    return this.events().find((event) =>
      event.request_fingerprint === plan.request_fingerprint &&
      event.permit_id === permitId &&
      event.actor_ref === actorRef
    ) || null;
  }

  applyUpdate({ plan, permitId, actorRef } = {}) {
    const actor = required(actorRef, "actor_ref");
    const permit = required(permitId, "permit_id");
    if (plan?.schema !== "evercraft.os.package-update-plan.v1" || plan.operation !== "update") {
      throw new Error("package_update_plan_invalid");
    }
    if (!planIntegrity(plan)) throw new Error("package_update_plan_integrity_mismatch");
    if (actor !== plan.subject_ref) throw new Error("package_update_actor_subject_mismatch");
    return this.#withWriterLock({ operation: "update", productKey: plan.product_key, nodeId: plan.node_id }, () => {
      const duplicate = this.#duplicate(plan, permit, actor);
      if (duplicate) {
        return { state: "duplicate", event: duplicate, permit_consumed: true, mutation_performed: false };
      }

      const current = this.currentState(plan.product_key, plan.node_id);
      if (!current.installed) throw new Error("package_update_app_not_installed");
      if (current.package_fingerprint !== plan.current_package_fingerprint) {
        throw new Error("package_update_current_fingerprint_mismatch");
      }
      fingerprint(plan.next_package_fingerprint, "next_package_fingerprint");
      fingerprint(plan.verification_receipt_hash, "verification_receipt_hash");
      const resource = resourceRef(plan.product_key, plan.node_id);
      if (resource !== plan.resource_ref) throw new Error("package_update_resource_mismatch");
      if (plan.required_passport_scope !== "app.update") throw new Error("package_update_scope_contract_invalid");

      this.#assertPermit({
        permitId: permit,
        actorRef: actor,
        scope: "app.update",
        resource,
        requestFingerprint: plan.request_fingerprint,
      });
      const consumption = this.passport.consumeActionPermit({
        idempotency_key: "os-package-update:" + plan.request_fingerprint,
        permit_id: permit,
        actor_ref: actor,
        request_fingerprint: plan.request_fingerprint,
        evidence_ref: plan.verification_receipt_hash,
      });

      const previousTransitionReceiptHash = this.events().at(-1)?.receipt_hash || null;
      const event = sealEvent({
        schema: "evercraft.os.package-transition-event.v1",
        event_id: "os_transition_" + randomUUID(),
        previous_transition_receipt_hash: previousTransitionReceiptHash,
        operation: "update",
        product_key: plan.product_key,
        node_id: plan.node_id,
        subject_ref: plan.subject_ref,
        resource_ref: resource,
        from_package_fingerprint: current.package_fingerprint,
        to_package_fingerprint: plan.next_package_fingerprint,
        verification_receipt_hash: plan.verification_receipt_hash,
        request_fingerprint: plan.request_fingerprint,
        permit_id: permit,
        permit_consumption_receipt: consumption.receipt.receipt_hash,
        permit_consumption_state_receipt: consumption.consumption.receipt_hash,
        actor_ref: actor,
        recorded_at: new Date().toISOString(),
        package_materialized_claimed: false,
        runtime_restarted_claimed: false,
        execution_authority_granted: false,
      });
      this.#appendEvent(event);
      return {
        state: "update_recorded",
        event,
        permit_consumed: true,
        mutation_performed: true,
        package_materialized_claimed: false,
        runtime_restarted_claimed: false,
      };
    });
  }

  applyRollback({ plan, permitId, actorRef } = {}) {
    const actor = required(actorRef, "actor_ref");
    const permit = required(permitId, "permit_id");
    if (plan?.schema !== "evercraft.os.package-rollback-plan.v1" || plan.operation !== "rollback") {
      throw new Error("package_rollback_plan_invalid");
    }
    if (!planIntegrity(plan)) throw new Error("package_rollback_plan_integrity_mismatch");
    if (actor !== plan.subject_ref) throw new Error("package_rollback_actor_subject_mismatch");
    return this.#withWriterLock({ operation: "rollback", productKey: plan.product_key, nodeId: plan.node_id }, () => {
      const duplicate = this.#duplicate(plan, permit, actor);
      if (duplicate) {
        return { state: "duplicate", event: duplicate, permit_consumed: true, mutation_performed: false };
      }

      const current = this.currentState(plan.product_key, plan.node_id);
      if (!current.installed) throw new Error("package_rollback_app_not_installed");
      if (current.package_fingerprint !== plan.current_package_fingerprint) {
        throw new Error("package_rollback_current_fingerprint_mismatch");
      }
      fingerprint(plan.target_package_fingerprint, "target_package_fingerprint");
      fingerprint(plan.source_transition_receipt_hash, "source_transition_receipt_hash");
      const resource = resourceRef(plan.product_key, plan.node_id);
      if (resource !== plan.resource_ref) throw new Error("package_rollback_resource_mismatch");
      if (plan.required_passport_scope !== "app.rollback") throw new Error("package_rollback_scope_contract_invalid");

      this.#assertPermit({
        permitId: permit,
        actorRef: actor,
        scope: "app.rollback",
        resource,
        requestFingerprint: plan.request_fingerprint,
      });
      const consumption = this.passport.consumeActionPermit({
        idempotency_key: "os-package-rollback:" + plan.request_fingerprint,
        permit_id: permit,
        actor_ref: actor,
        request_fingerprint: plan.request_fingerprint,
        evidence_ref: plan.source_transition_receipt_hash,
      });

      const previousTransitionReceiptHash = this.events().at(-1)?.receipt_hash || null;
      const event = sealEvent({
        schema: "evercraft.os.package-transition-event.v1",
        event_id: "os_transition_" + randomUUID(),
        previous_transition_receipt_hash: previousTransitionReceiptHash,
        operation: "rollback",
        product_key: plan.product_key,
        node_id: plan.node_id,
        subject_ref: plan.subject_ref,
        resource_ref: resource,
        from_package_fingerprint: current.package_fingerprint,
        to_package_fingerprint: plan.target_package_fingerprint,
        source_transition_receipt_hash: plan.source_transition_receipt_hash,
        request_fingerprint: plan.request_fingerprint,
        permit_id: permit,
        permit_consumption_receipt: consumption.receipt.receipt_hash,
        permit_consumption_state_receipt: consumption.consumption.receipt_hash,
        actor_ref: actor,
        recorded_at: new Date().toISOString(),
        package_materialized_claimed: false,
        runtime_restarted_claimed: false,
        execution_authority_granted: false,
      });
      this.#appendEvent(event);
      return {
        state: "rollback_recorded",
        event,
        permit_consumed: true,
        mutation_performed: true,
        package_materialized_claimed: false,
        runtime_restarted_claimed: false,
      };
    });
  }
}
