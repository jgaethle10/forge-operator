import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { evercraftOsSha256 } from "./package-trust.mjs";
import { inspectPackageTransitionRecovery } from "./package-transition-recovery-inspector.mjs";
import { observeProcessInstance } from "./process-instance.mjs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function iso(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(field + "_invalid");
  return date.toISOString();
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

function fsyncDirectory(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, "r");
    fs.fsyncSync(fd);
  } catch {
    // Directory fsync is best-effort on platforms/filesystems that support it.
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = fs.openSync(tmp, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
  fsyncDirectory(path.dirname(file));
}

function planIntegrity(plan) {
  const { request_fingerprint, ...body } = plan || {};
  return request_fingerprint === evercraftOsSha256(body);
}

function recoveryStateRef(stateDir) {
  return evercraftOsSha256(`package-transition-state:${path.resolve(stateDir)}`);
}

function recoveryScope(operation) {
  if (operation === "repair_head_checkpoint") return "app.recover.head";
  if (operation === "clear_writer_lock") return "app.recover.writer";
  throw new Error("package_transition_recovery_operation_invalid");
}

function sealEvent(body) {
  return { ...body, receipt_hash: evercraftOsSha256(body) };
}

function allowedWriterObservation(observation) {
  return observation?.same_process_instance === false && [
    "process_absent",
    "pid_reused",
    "boot_changed",
  ].includes(observation?.state);
}

function writerAgeMs(writer, now) {
  const acquired = new Date(writer?.acquired_at || "");
  if (!Number.isFinite(acquired.getTime())) throw new Error("package_transition_writer_acquired_at_invalid");
  return now.getTime() - acquired.getTime();
}

export function buildPackageTransitionRecoveryPlan({
  stateDir,
  passport,
  actorRef,
  operation = "auto",
  now = new Date(),
  ttlSeconds = 300,
  minimumWriterAgeMs = 30_000,
  processObserver = observeProcessInstance,
} = {}) {
  if (!stateDir) throw new Error("package_transition_recovery_state_dir_required");
  const actor = required(actorRef, "actor_ref");
  const instant = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error("recovery_now_invalid");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 900) {
    throw new Error("recovery_plan_ttl_invalid");
  }
  if (!Number.isInteger(minimumWriterAgeMs) || minimumWriterAgeMs < 0) {
    throw new Error("minimum_writer_age_ms_invalid");
  }

  const inspection = inspectPackageTransitionRecovery({ stateDir, passport });
  if (inspection.raw_event_chain_verified !== true) {
    throw new Error("package_transition_recovery_history_not_verified");
  }
  if (inspection.state === "held") {
    throw new Error("package_transition_recovery_inspection_held:" + (inspection.reason || "unknown"));
  }

  let selected = operation;
  if (selected === "auto") {
    if (inspection.writer?.present) selected = "clear_writer_lock";
    else if (inspection.recovery_candidate) selected = "repair_head_checkpoint";
    else throw new Error("package_transition_recovery_not_required");
  }
  const scope = recoveryScope(selected);
  const resource = required(inspection.resource_ref, "recovery_resource_ref");
  const product = required(inspection.product_key, "recovery_product_key");
  const node = required(inspection.node_id, "recovery_node_id");

  let processObservation = null;
  let observedWriterAgeMs = null;
  if (selected === "repair_head_checkpoint") {
    if (!inspection.recovery_candidate || inspection.checkpoint_state !== "one_event_ahead_candidate") {
      throw new Error("package_transition_head_repair_not_candidate");
    }
    if (inspection.writer?.present) throw new Error("package_transition_head_repair_requires_writer_free");
    if (!inspection.last_event_permit?.verified) throw new Error("package_transition_head_repair_permit_evidence_required");
  } else if (selected === "clear_writer_lock") {
    const writer = inspection.writer;
    if (!writer?.present || writer.state !== "present") throw new Error("package_transition_writer_lock_not_present");
    if (!writer.recovery_process_identity_available || !writer.process_instance) {
      throw new Error("package_transition_writer_lock_process_identity_required");
    }
    observedWriterAgeMs = writerAgeMs(writer, instant);
    if (observedWriterAgeMs < minimumWriterAgeMs) {
      throw new Error("package_transition_writer_lock_too_fresh");
    }
    processObservation = processObserver(writer.process_instance);
    if (!allowedWriterObservation(processObservation)) {
      if (processObservation?.state === "same_process_alive") {
        throw new Error("package_transition_writer_still_alive");
      }
      throw new Error("package_transition_writer_liveness_unverified:" + (processObservation?.reason || processObservation?.state || "unknown"));
    }
  }

  const evidence = {
    schema: "evercraft.os.package-transition-recovery-evidence.v1",
    operation: selected,
    inspection_state: inspection.state,
    raw_event_chain_verified: inspection.raw_event_chain_verified,
    checkpoint_state: inspection.checkpoint_state,
    event_count: inspection.event_count,
    raw_head_receipt_hash: inspection.raw_head_receipt_hash,
    last_event_id: inspection.last_event_id,
    last_event_permit_consumption_receipt: inspection.last_event_permit?.consumption_receipt || null,
    writer_lock_file_sha256: inspection.writer?.lock_file_sha256 || null,
    writer_lock_schema: inspection.writer?.lock_schema || null,
    writer_process_instance: inspection.writer?.process_instance || null,
    writer_process_observation: processObservation,
    observed_writer_age_ms: observedWriterAgeMs,
    minimum_writer_age_ms: selected === "clear_writer_lock" ? minimumWriterAgeMs : null,
  };
  const evidenceReceiptHash = evercraftOsSha256(evidence);
  const createdAt = instant.toISOString();
  const expiresAt = new Date(instant.getTime() + ttlSeconds * 1000).toISOString();
  const body = {
    schema: "evercraft.os.package-transition-recovery-plan.v1",
    operation: selected,
    product_key: product,
    node_id: node,
    subject_ref: actor,
    resource_ref: resource,
    state_ref: recoveryStateRef(stateDir),
    required_passport_scope: scope,
    evidence,
    evidence_receipt_hash: evidenceReceiptHash,
    created_at: createdAt,
    expires_at: expiresAt,
    mutation_performed: false,
    recovery_authority_granted: false,
  };
  return { ...body, request_fingerprint: evercraftOsSha256(body) };
}

export class EvercraftOsPackageTransitionRecoveryExecutor {
  constructor({
    stateDir,
    passport,
    processObserver = observeProcessInstance,
    now = () => new Date(),
    faultInjector = null,
  } = {}) {
    if (!stateDir) throw new Error("package_transition_recovery_state_dir_required");
    if (!passport) throw new Error("package_transition_recovery_passport_required");
    this.stateDir = path.resolve(stateDir);
    this.passport = passport;
    this.processObserver = processObserver;
    this.now = now;
    this.faultInjector = faultInjector;
    this.transitionEventsFile = path.join(this.stateDir, "package-transition-events.jsonl");
    this.transitionHeadFile = path.join(this.stateDir, "package-transition-head.json");
    this.transitionWriterLockFile = path.join(this.stateDir, "package-transition-writer.lock");
    this.recoveryEventsFile = path.join(this.stateDir, "package-transition-recovery-events.jsonl");
    this.recoveryHeadFile = path.join(this.stateDir, "package-transition-recovery-head.json");
    this.recoveryWriterLockFile = path.join(this.stateDir, "package-transition-recovery-writer.lock");
  }

  #instant() {
    const value = this.now();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error("recovery_now_invalid");
    return date;
  }

  #withRecoveryLock(fn) {
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    const token = randomUUID();
    let fd;
    try {
      fd = fs.openSync(this.recoveryWriterLockFile, "wx", 0o600);
    } catch (error) {
      if (error?.code === "EEXIST") throw new Error("package_transition_recovery_writer_busy");
      throw error;
    }
    try {
      fs.writeFileSync(fd, JSON.stringify({
        schema: "evercraft.os.package-transition-recovery-writer-lock.v1",
        lock_token: token,
        pid: process.pid,
        acquired_at: this.#instant().toISOString(),
      }, null, 2) + "\n");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    try {
      return fn();
    } finally {
      try {
        const lock = JSON.parse(fs.readFileSync(this.recoveryWriterLockFile, "utf8"));
        if (lock?.lock_token === token) {
          fs.unlinkSync(this.recoveryWriterLockFile);
          fsyncDirectory(this.stateDir);
        }
      } catch {
        // Never delete a missing/replaced/corrupt recovery lock blindly.
      }
    }
  }

  #verifyRecoveryEvents() {
    const events = readJsonl(this.recoveryEventsFile);
    let previous = null;
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      if (event?.schema !== "evercraft.os.package-transition-recovery-event.v1") {
        throw new Error("package_transition_recovery_event_schema_invalid:" + index);
      }
      const { receipt_hash, ...body } = event;
      if (receipt_hash !== evercraftOsSha256(body)) {
        throw new Error("package_transition_recovery_event_hash_mismatch:" + index);
      }
      if ((event.previous_recovery_receipt_hash || null) !== (previous?.receipt_hash || null)) {
        throw new Error("package_transition_recovery_chain_mismatch:" + index);
      }
      previous = event;
    }

    const expectedCount = events.length;
    const expectedReceipt = previous?.receipt_hash || null;
    let head = null;
    if (fs.existsSync(this.recoveryHeadFile)) {
      head = JSON.parse(fs.readFileSync(this.recoveryHeadFile, "utf8"));
      if (head?.schema !== "evercraft.os.package-transition-recovery-head.v1") {
        throw new Error("package_transition_recovery_head_schema_invalid");
      }
      const { head_hash, ...body } = head;
      if (head_hash !== evercraftOsSha256(body)) {
        throw new Error("package_transition_recovery_head_hash_mismatch");
      }
    }

    const aligned = head && head.event_count === expectedCount && head.head_receipt_hash === expectedReceipt;
    if (!aligned) {
      // This head is a checkpoint over the already verified recovery event chain. It grants no OS authority.
      this.#writeRecoveryHead(events);
      head = JSON.parse(fs.readFileSync(this.recoveryHeadFile, "utf8"));
    }
    return { events, head };
  }

  #writeRecoveryHead(events) {
    const body = {
      schema: "evercraft.os.package-transition-recovery-head.v1",
      event_count: events.length,
      head_receipt_hash: events.at(-1)?.receipt_hash || null,
      updated_at: this.#instant().toISOString(),
    };
    atomicJson(this.recoveryHeadFile, { ...body, head_hash: evercraftOsSha256(body) });
  }

  #appendRecoveryEvent(body) {
    const verified = this.#verifyRecoveryEvents();
    const event = sealEvent({
      ...body,
      previous_recovery_receipt_hash: verified.events.at(-1)?.receipt_hash || null,
    });
    appendJsonl(this.recoveryEventsFile, event);
    this.#writeRecoveryHead([...verified.events, event]);
    return event;
  }

  #assertPlan(plan, actorRef, { allowExpired = false } = {}) {
    if (plan?.schema !== "evercraft.os.package-transition-recovery-plan.v1") {
      throw new Error("package_transition_recovery_plan_invalid");
    }
    if (!planIntegrity(plan)) throw new Error("package_transition_recovery_plan_integrity_mismatch");
    const actor = required(actorRef, "actor_ref");
    if (actor !== plan.subject_ref) throw new Error("package_transition_recovery_actor_subject_mismatch");
    if (plan.state_ref !== recoveryStateRef(this.stateDir)) throw new Error("package_transition_recovery_state_ref_mismatch");
    if (plan.required_passport_scope !== recoveryScope(plan.operation)) {
      throw new Error("package_transition_recovery_scope_contract_invalid");
    }
    if (plan.evidence_receipt_hash !== evercraftOsSha256(plan.evidence)) {
      throw new Error("package_transition_recovery_evidence_hash_mismatch");
    }
    if (!allowExpired && this.#instant() >= new Date(plan.expires_at)) {
      throw new Error("package_transition_recovery_plan_expired");
    }
    return actor;
  }

  #permitState(plan, permitId, actor, { allowConsumed = false } = {}) {
    const permit = this.passport.getActionPermitState(required(permitId, "permit_id"), {
      at: this.#instant().toISOString(),
    });
    if (permit.actor_ref !== actor) throw new Error("package_transition_recovery_permit_actor_mismatch");
    if (permit.product !== "evercraft-os") throw new Error("package_transition_recovery_permit_product_mismatch");
    if (permit.scope !== plan.required_passport_scope) throw new Error("package_transition_recovery_permit_scope_mismatch");
    if (permit.resource_ref !== plan.resource_ref) throw new Error("package_transition_recovery_permit_resource_mismatch");
    if (permit.request_fingerprint !== plan.request_fingerprint) throw new Error("package_transition_recovery_permit_request_mismatch");
    if (!permit.active && !(allowConsumed && permit.consumed)) {
      throw new Error(permit.consumed ? "package_transition_recovery_permit_already_consumed" : "package_transition_recovery_permit_not_active");
    }
    return permit;
  }

  #matchingRecovery(events, plan, permitId, actor) {
    const matches = events.filter((event) =>
      event.request_fingerprint === plan.request_fingerprint &&
      event.permit_id === permitId &&
      event.actor_ref === actor
    );
    return {
      intent: matches.find((event) => event.phase === "intent") || null,
      completion: matches.find((event) => event.phase === "completed") || null,
    };
  }

  #assertNoConflictingIncompleteIntent(events, plan, permitId, actor) {
    const intents = events.filter((event) => event.phase === "intent");
    for (const intent of intents) {
      const completed = events.some((event) => event.phase === "completed" && event.recovery_id === intent.recovery_id);
      if (!completed && !(
        intent.request_fingerprint === plan.request_fingerprint &&
        intent.permit_id === permitId &&
        intent.actor_ref === actor
      )) {
        throw new Error("package_transition_recovery_incomplete_intent_present");
      }
    }
  }

  #currentInspection() {
    return inspectPackageTransitionRecovery({ stateDir: this.stateDir, passport: this.passport });
  }

  #validateHeadRepairEvidence(plan, { permitAlreadyConsumed = false } = {}) {
    const inspection = this.#currentInspection();
    if (inspection.state === "clean" && inspection.checkpoint_state === "aligned") {
      const sameCount = inspection.event_count === plan.evidence.event_count;
      const sameReceipt = inspection.raw_head_receipt_hash === plan.evidence.raw_head_receipt_hash;
      if (permitAlreadyConsumed && sameCount && sameReceipt) {
        return { state: "already_applied", inspection };
      }
      throw new Error("package_transition_head_repair_plan_stale");
    }
    if (inspection.state !== "head_checkpoint_lag_candidate") throw new Error("package_transition_head_repair_not_candidate");
    if (inspection.writer?.present) throw new Error("package_transition_head_repair_requires_writer_free");
    if (inspection.event_count !== plan.evidence.event_count) throw new Error("package_transition_head_repair_event_count_changed");
    if (inspection.raw_head_receipt_hash !== plan.evidence.raw_head_receipt_hash) throw new Error("package_transition_head_repair_receipt_changed");
    if (inspection.last_event_permit?.consumption_receipt !== plan.evidence.last_event_permit_consumption_receipt) {
      throw new Error("package_transition_head_repair_permit_evidence_changed");
    }
    return { state: "ready", inspection };
  }

  #validateWriterClearEvidence(plan, { permitAlreadyConsumed = false } = {}) {
    const inspection = this.#currentInspection();
    if (!inspection.writer?.present) {
      if (permitAlreadyConsumed) return { state: "already_applied", inspection };
      throw new Error("package_transition_writer_clear_plan_stale");
    }
    const writer = inspection.writer;
    if (writer.state !== "present") throw new Error("package_transition_writer_lock_held");
    if (writer.lock_file_sha256 !== plan.evidence.writer_lock_file_sha256) {
      throw new Error("package_transition_writer_lock_changed");
    }
    if (!writer.process_instance || !writer.recovery_process_identity_available) {
      throw new Error("package_transition_writer_lock_process_identity_required");
    }
    const acquired = new Date(writer.acquired_at || "");
    const ageMs = this.#instant().getTime() - acquired.getTime();
    if (!Number.isFinite(ageMs) || ageMs < Number(plan.evidence.minimum_writer_age_ms || 0)) {
      throw new Error("package_transition_writer_lock_too_fresh");
    }
    const observation = this.processObserver(writer.process_instance);
    if (!allowedWriterObservation(observation)) {
      if (observation?.state === "same_process_alive") throw new Error("package_transition_writer_still_alive");
      throw new Error("package_transition_writer_liveness_unverified:" + (observation?.reason || observation?.state || "unknown"));
    }
    return { state: "ready", inspection, observation };
  }

  #performMutation(plan, { permitAlreadyConsumed = false } = {}) {
    if (plan.operation === "repair_head_checkpoint") {
      const check = this.#validateHeadRepairEvidence(plan, { permitAlreadyConsumed });
      if (check.state === "already_applied") return { mutationState: "observed_already_applied", postInspection: check.inspection };
      const body = {
        schema: "evercraft.os.package-transition-head.v1",
        event_count: plan.evidence.event_count,
        head_receipt_hash: plan.evidence.raw_head_receipt_hash,
        updated_at: this.#instant().toISOString(),
      };
      atomicJson(this.transitionHeadFile, { ...body, head_hash: evercraftOsSha256(body) });
      const post = this.#currentInspection();
      if (post.state !== "clean" || post.checkpoint_state !== "aligned") {
        throw new Error("package_transition_head_repair_postcondition_failed");
      }
      return { mutationState: "performed", postInspection: post };
    }

    if (plan.operation === "clear_writer_lock") {
      const check = this.#validateWriterClearEvidence(plan, { permitAlreadyConsumed });
      if (check.state === "already_applied") return { mutationState: "observed_already_applied", postInspection: check.inspection };
      const bytes = fs.readFileSync(this.transitionWriterLockFile);
      if (evercraftOsSha256(bytes) !== plan.evidence.writer_lock_file_sha256) {
        throw new Error("package_transition_writer_lock_changed_before_unlink");
      }
      fs.unlinkSync(this.transitionWriterLockFile);
      fsyncDirectory(this.stateDir);
      const post = this.#currentInspection();
      if (post.writer?.present) throw new Error("package_transition_writer_clear_postcondition_failed");
      return { mutationState: "performed", postInspection: post };
    }

    throw new Error("package_transition_recovery_operation_invalid");
  }

  execute({ plan, permitId, actorRef } = {}) {
    return this.#withRecoveryLock(() => {
      const actor = required(actorRef, "actor_ref");
      const permit = required(permitId, "permit_id");
      const verified = this.#verifyRecoveryEvents();
      const match = this.#matchingRecovery(verified.events, plan, permit, actor);
      if (match.completion) {
        return {
          state: "duplicate",
          recovery_id: match.completion.recovery_id,
          completion: match.completion,
          permit_consumed: true,
          mutation_performed: false,
          recovery_authority_granted: true,
        };
      }
      this.#assertNoConflictingIncompleteIntent(verified.events, plan, permit, actor);

      const resuming = Boolean(match.intent);
      this.#assertPlan(plan, actor, { allowExpired: resuming });
      let permitState = this.#permitState(plan, permit, actor, { allowConsumed: resuming });
      const recoveryId = match.intent?.recovery_id || "os_recovery_" + randomUUID();

      if (!match.intent) {
        // Validate evidence before creating authority intent or consuming the permit.
        if (plan.operation === "repair_head_checkpoint") this.#validateHeadRepairEvidence(plan);
        else this.#validateWriterClearEvidence(plan);
        this.#appendRecoveryEvent({
          schema: "evercraft.os.package-transition-recovery-event.v1",
          phase: "intent",
          recovery_id: recoveryId,
          operation: plan.operation,
          product_key: plan.product_key,
          node_id: plan.node_id,
          resource_ref: plan.resource_ref,
          actor_ref: actor,
          permit_id: permit,
          request_fingerprint: plan.request_fingerprint,
          evidence_receipt_hash: plan.evidence_receipt_hash,
          recorded_at: this.#instant().toISOString(),
          mutation_performed: false,
          recovery_authority_granted: false,
        });
      }

      let consumptionReceipt = permitState.consumption_receipt || null;
      if (!permitState.consumed) {
        const consumption = this.passport.consumeActionPermit({
          idempotency_key: "os-package-recovery:" + plan.request_fingerprint,
          permit_id: permit,
          actor_ref: actor,
          request_fingerprint: plan.request_fingerprint,
          evidence_ref: plan.evidence_receipt_hash,
        });
        consumptionReceipt = consumption.consumption.receipt_hash;
        permitState = this.passport.getActionPermitState(permit, { at: this.#instant().toISOString() });
      }

      if (typeof this.faultInjector === "function") {
        this.faultInjector({ phase: "after_permit_consumption", plan, permitState, recoveryId });
      }

      const mutation = this.#performMutation(plan, { permitAlreadyConsumed: true });
      if (typeof this.faultInjector === "function") {
        this.faultInjector({ phase: "after_mutation", plan, permitState, recoveryId, mutation });
      }

      const completion = this.#appendRecoveryEvent({
        schema: "evercraft.os.package-transition-recovery-event.v1",
        phase: "completed",
        recovery_id: recoveryId,
        operation: plan.operation,
        product_key: plan.product_key,
        node_id: plan.node_id,
        resource_ref: plan.resource_ref,
        actor_ref: actor,
        permit_id: permit,
        permit_consumption_receipt: consumptionReceipt,
        request_fingerprint: plan.request_fingerprint,
        evidence_receipt_hash: plan.evidence_receipt_hash,
        mutation_state: mutation.mutationState,
        post_inspection_state: mutation.postInspection.state,
        post_checkpoint_state: mutation.postInspection.checkpoint_state,
        recorded_at: this.#instant().toISOString(),
        mutation_performed: mutation.mutationState === "performed",
        recovery_authority_granted: true,
      });

      return {
        state: "recovery_completed",
        recovery_id: recoveryId,
        completion,
        permit_consumed: true,
        mutation_performed: mutation.mutationState === "performed",
        mutation_state: mutation.mutationState,
        recovery_authority_granted: true,
        post_inspection: mutation.postInspection,
      };
    });
  }
}
