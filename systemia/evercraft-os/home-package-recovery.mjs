import { inspectPackageTransitionRecovery } from "./package-transition-recovery-inspector.mjs";
import {
  buildPackageTransitionRecoveryPlan,
  EvercraftOsPackageTransitionRecoveryExecutor,
} from "./package-transition-recovery.mjs";
import { observeProcessInstance } from "./process-instance.mjs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

export class EvercraftHomePackageRecovery {
  constructor({
    stateDir,
    passport,
    processObserver = observeProcessInstance,
    minimumWriterAgeMs = 30_000,
    now = () => new Date(),
  } = {}) {
    if (!stateDir) throw new Error("home_package_recovery_state_dir_required");
    if (!passport) throw new Error("home_package_recovery_passport_required");
    if (!Number.isInteger(minimumWriterAgeMs) || minimumWriterAgeMs < 0) {
      throw new Error("home_package_recovery_minimum_writer_age_invalid");
    }
    this.stateDir = stateDir;
    this.passport = passport;
    this.processObserver = processObserver;
    this.minimumWriterAgeMs = minimumWriterAgeMs;
    this.now = now;
  }

  inspect() {
    const inspection = inspectPackageTransitionRecovery({
      stateDir: this.stateDir,
      passport: this.passport,
    });
    return {
      schema: "evercraft.home.os-package-recovery-state.v1",
      state: inspection.state,
      inspection,
      authority: {
        home_grants_recovery: false,
        home_mints_recovery_permit: false,
        passport_permit_required_for_mutation: true,
        automatic_repair_allowed: false,
      },
      mutation_performed: false,
      recovery_authority_granted: false,
    };
  }

  prepare({ actorRef, operation = "auto", ttlSeconds = 300 } = {}) {
    const actor = required(actorRef, "actor_ref");
    try {
      const plan = buildPackageTransitionRecoveryPlan({
        stateDir: this.stateDir,
        passport: this.passport,
        actorRef: actor,
        operation,
        now: this.now(),
        ttlSeconds,
        minimumWriterAgeMs: this.minimumWriterAgeMs,
        processObserver: this.processObserver,
      });
      return {
        schema: "evercraft.home.os-package-recovery-preparation.v1",
        state: "prepared",
        operation: plan.operation,
        plan,
        passport: {
          product: "evercraft-os",
          scope: plan.required_passport_scope,
          resource_ref: plan.resource_ref,
          request_fingerprint: plan.request_fingerprint,
          single_use_permit_required: true,
        },
        permit_minted: false,
        mutation_performed: false,
        recovery_authority_granted: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.home.os-package-recovery-preparation.v1",
        state: "held",
        operation: operation === "auto" ? null : operation,
        reason: String(error?.message || error),
        permit_minted: false,
        mutation_performed: false,
        recovery_authority_granted: false,
      };
    }
  }

  execute({ plan, permitId, actorRef } = {}) {
    const executor = new EvercraftOsPackageTransitionRecoveryExecutor({
      stateDir: this.stateDir,
      passport: this.passport,
      processObserver: this.processObserver,
      now: this.now,
    });
    const result = executor.execute({
      plan,
      permitId: required(permitId, "permit_id"),
      actorRef: required(actorRef, "actor_ref"),
    });
    return {
      schema: "evercraft.home.os-package-recovery-result.v1",
      state: result.state,
      operation: plan?.operation || null,
      recovery_id: result.recovery_id || null,
      recovery_receipt_hash: result.completion?.receipt_hash || null,
      permit_consumed: result.permit_consumed === true,
      mutation_performed: result.mutation_performed === true,
      mutation_state: result.mutation_state || result.completion?.mutation_state || null,
      post_inspection: result.post_inspection || null,
      recovery_authority_granted: result.recovery_authority_granted === true,
      install_authority_granted: false,
      execution_authority_granted: false,
      payment_authority_granted: false,
    };
  }
}
