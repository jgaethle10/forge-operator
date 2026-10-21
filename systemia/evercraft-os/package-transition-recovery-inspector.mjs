import fs from "node:fs";
import path from "node:path";
import { evercraftOsSha256 } from "./package-trust.mjs";

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(JSON.parse);
}

function verifyRawEventChain(events) {
  let previous = null;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
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
  return events;
}

function inspectHead(file) {
  if (!fs.existsSync(file)) {
    return { state: "not_present", present: false, head: null };
  }
  try {
    const head = JSON.parse(fs.readFileSync(file, "utf8"));
    if (head?.schema !== "evercraft.os.package-transition-head.v1") {
      throw new Error("package_transition_head_schema_invalid");
    }
    const { head_hash, ...body } = head;
    if (head_hash !== evercraftOsSha256(body)) {
      throw new Error("package_transition_head_hash_mismatch");
    }
    return { state: "verified", present: true, head };
  } catch (error) {
    return { state: "held", present: true, head: null, reason: String(error?.message || error) };
  }
}

function inspectWriterLock(file) {
  if (!fs.existsSync(file)) return { state: "free", present: false };
  const bytes = fs.readFileSync(file);
  try {
    const lock = JSON.parse(bytes.toString("utf8"));
    if (!["evercraft.os.package-transition-writer-lock.v1", "evercraft.os.package-transition-writer-lock.v2"].includes(lock?.schema) || !lock.lock_token) {
      throw new Error("package_transition_writer_lock_schema_invalid");
    }
    return {
      state: "present",
      present: true,
      lock_file_sha256: evercraftOsSha256(bytes),
      operation: lock.operation || null,
      product_key: lock.product_key || null,
      node_id: lock.node_id || null,
      resource_ref: lock.resource_ref || null,
      pid: Number.isInteger(lock.pid) ? lock.pid : null,
      acquired_at: lock.acquired_at || null,
      lock_schema: lock.schema,
      process_instance: lock.process_instance || null,
      recovery_process_identity_available: lock.schema === "evercraft.os.package-transition-writer-lock.v2" && Boolean(lock.process_instance),
    };
  } catch (error) {
    return {
      state: "held",
      present: true,
      lock_file_sha256: evercraftOsSha256(bytes),
      reason: String(error?.message || error),
    };
  }
}

function expectedScope(event) {
  if (event?.operation === "update") return "app.update";
  if (event?.operation === "rollback") return "app.rollback";
  return null;
}

function verifyLastEventPermit(passport, event) {
  if (!event) return { state: "not_applicable", verified: false };
  if (!passport || typeof passport.getActionPermitState !== "function") {
    return { state: "held", verified: false, reason: "passport_required_for_recovery_evidence" };
  }
  if (!event.permit_consumption_state_receipt) {
    return { state: "held", verified: false, reason: "permit_consumption_state_receipt_missing" };
  }
  try {
    const permit = passport.getActionPermitState(event.permit_id);
    const scope = expectedScope(event);
    if (!scope) throw new Error("transition_operation_not_recoverable");
    if (!permit.consumed) throw new Error("transition_permit_not_consumed");
    if (permit.product !== "evercraft-os") throw new Error("transition_permit_product_mismatch");
    if (permit.scope !== scope) throw new Error("transition_permit_scope_mismatch");
    if (permit.actor_ref !== event.actor_ref) throw new Error("transition_permit_actor_mismatch");
    if (permit.resource_ref !== event.resource_ref) throw new Error("transition_permit_resource_mismatch");
    if (permit.request_fingerprint !== event.request_fingerprint) throw new Error("transition_permit_request_mismatch");
    if (permit.consumption_receipt !== event.permit_consumption_state_receipt) {
      throw new Error("transition_permit_consumption_receipt_mismatch");
    }
    return {
      state: "verified",
      verified: true,
      permit_id: event.permit_id,
      consumption_receipt: permit.consumption_receipt,
    };
  } catch (error) {
    return { state: "held", verified: false, reason: String(error?.message || error) };
  }
}

export function inspectPackageTransitionRecovery({ stateDir, passport } = {}) {
  if (!stateDir) throw new Error("package_transition_recovery_state_dir_required");
  const root = path.resolve(stateDir);
  const eventsFile = path.join(root, "package-transition-events.jsonl");
  const headFile = path.join(root, "package-transition-head.json");
  const writerLockFile = path.join(root, "package-transition-writer.lock");
  const writer = inspectWriterLock(writerLockFile);
  const head = inspectHead(headFile);

  let events;
  try {
    events = verifyRawEventChain(readJsonl(eventsFile));
  } catch (error) {
    return {
      schema: "evercraft.os.package-transition-recovery-inspection.v1",
      state: "held",
      reason: String(error?.message || error),
      writer,
      head,
      raw_event_chain_verified: false,
      automatic_repair_allowed: false,
      recovery_authority_granted: false,
      mutation_performed: false,
    };
  }

  const eventCount = events.length;
  const rawHeadReceipt = events.at(-1)?.receipt_hash || null;
  const priorReceipt = eventCount > 1 ? events.at(-2).receipt_hash : null;
  const lastPermit = eventCount ? verifyLastEventPermit(passport, events.at(-1)) : { state: "not_applicable", verified: false };

  let checkpointState = "aligned";
  let recoveryCandidate = false;
  let reason = null;

  if (eventCount === 0) {
    if (head.state === "verified" && (head.head.event_count !== 0 || head.head.head_receipt_hash !== null)) {
      checkpointState = "held";
      reason = "head_nonempty_without_events";
    } else if (head.state === "held") {
      checkpointState = "held";
      reason = head.reason;
    }
  } else if (head.state === "not_present") {
    if (eventCount === 1 && lastPermit.verified) {
      checkpointState = "one_event_ahead_candidate";
      recoveryCandidate = true;
    } else {
      checkpointState = "held";
      reason = eventCount === 1
        ? "head_missing_last_event_permit_unverified"
        : "head_missing_with_multiple_events";
    }
  } else if (head.state === "held") {
    checkpointState = "held";
    reason = head.reason;
  } else if (head.head.event_count === eventCount && head.head.head_receipt_hash === rawHeadReceipt) {
    checkpointState = "aligned";
  } else if (
    head.head.event_count === eventCount - 1 &&
    head.head.head_receipt_hash === priorReceipt &&
    lastPermit.verified
  ) {
    checkpointState = "one_event_ahead_candidate";
    recoveryCandidate = true;
  } else {
    checkpointState = "held";
    reason = "head_and_event_chain_diverge_ambiguously";
  }

  let state = "clean";
  if (writer.present) state = writer.state === "present" ? "writer_lock_present" : "held";
  if (checkpointState === "held") state = "held";
  if (recoveryCandidate && !writer.present) state = "head_checkpoint_lag_candidate";
  if (recoveryCandidate && writer.present) state = "writer_lock_and_head_lag_candidate";

  const lastEvent = events.at(-1) || null;
  return {
    schema: "evercraft.os.package-transition-recovery-inspection.v1",
    state,
    reason,
    event_count: eventCount,
    raw_head_receipt_hash: rawHeadReceipt,
    product_key: lastEvent?.product_key || writer.product_key || null,
    node_id: lastEvent?.node_id || writer.node_id || null,
    resource_ref: lastEvent?.resource_ref || writer.resource_ref || null,
    last_event_id: lastEvent?.event_id || null,
    raw_event_chain_verified: true,
    checkpoint_state: checkpointState,
    writer,
    last_event_permit: lastPermit,
    recovery_candidate: recoveryCandidate,
    recovery_requires_explicit_authority: recoveryCandidate || writer.present,
    automatic_repair_allowed: false,
    recovery_authority_granted: false,
    mutation_performed: false,
  };
}
