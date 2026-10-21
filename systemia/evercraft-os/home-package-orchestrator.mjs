function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

export class EvercraftHomePackageOrchestrator {
  constructor({ lifecycle, packageStore, transitionLedger, recoveryController = null } = {}) {
    if (!lifecycle) throw new Error("home_package_lifecycle_required");
    if (!packageStore) throw new Error("home_package_store_required");
    if (!transitionLedger) throw new Error("home_package_transition_ledger_required");
    this.lifecycle = lifecycle;
    this.packageStore = packageStore;
    this.transitionLedger = transitionLedger;
    this.recoveryController = recoveryController;
  }

  status({ productKey, nodeId } = {}) {
    const product = required(productKey, "product_key");
    const node = required(nodeId, "node_id");
    // Check journal integrity before deriving desired state. The previous code
    // could throw on corruption, or report "aligned" from matching package
    // fingerprints even when the activation pointed at an obsolete transition.
    const transitionIntegrity = this.transitionLedger.verifyIntegrity();
    let desired = null;
    let transitionStateError = null;
    if (transitionIntegrity.state === "verified") {
      try {
        desired = this.transitionLedger.currentState(product, node);
      } catch (error) {
        transitionStateError = String(error?.message || error);
      }
    }
    const activation = this.packageStore.inspectActivation(product, node);
    const writer = typeof this.transitionLedger.writerLockState === "function"
      ? this.transitionLedger.writerLockState()
      : { schema: "evercraft.os.package-transition-writer-lock-state.v1", state: "unknown", active: null };
    const activeFingerprint = activation.integrity === "verified" ? activation.package_fingerprint : null;
    const desiredFingerprint = desired?.installed ? desired.package_fingerprint : null;
    const expectedTransitionReceipt = desired?.last_transition_receipt_hash || null;
    const fingerprintAligned = Boolean(desiredFingerprint && activeFingerprint && desiredFingerprint === activeFingerprint);
    const lineageAligned = Boolean(expectedTransitionReceipt &&
      activation.integrity === "verified" &&
      activation.transition_receipt_hash === expectedTransitionReceipt);
    let recovery = null;
    if (this.recoveryController && typeof this.recoveryController.inspect === "function") {
      try { recovery = this.recoveryController.inspect(); }
      catch (error) {
        recovery = {
          schema: "evercraft.home.os-package-recovery-state.v1",
          state: "held",
          reason: "recovery_inspection_failed:" + String(error?.message || error),
          mutation_performed: false,
          recovery_authority_granted: false,
        };
      }
    }
    const recoverySettled = recovery === null || recovery.state === "clean";
    const healthyWriter = writer.state === "free";
    const aligned = transitionIntegrity.state === "verified" && !transitionStateError &&
      fingerprintAligned && lineageAligned && healthyWriter && recoverySettled;
    const state = transitionIntegrity.state !== "verified"
      ? "held_transition_integrity"
      : transitionStateError
        ? "held_transition_state"
        : !desired?.installed
          ? "not_installed"
          : activation.integrity === "held"
            ? "held_activation_integrity"
            : writer.state !== "free"
              ? "held_transition_writer"
              : !recoverySettled
                ? "held_recovery_evidence"
                : fingerprintAligned && !lineageAligned
                ? "held_activation_lineage"
                : aligned
                  ? "aligned"
                  : "desired_active_drift";
    return {
      schema: "evercraft.home.os-package-runtime-state.v1",
      product_key: product,
      node_id: node,
      desired_package_fingerprint: desiredFingerprint,
      active_package_fingerprint: activeFingerprint,
      expected_transition_receipt_hash: expectedTransitionReceipt,
      activation_lineage_aligned: lineageAligned,
      desired_active_aligned: aligned,
      state,
      transition_state_error: transitionStateError,
      transition_integrity: transitionIntegrity,
      transition_writer: writer,
      transition_recovery: recovery,
      activation,
      process_started_claimed: false,
      runtime_health_claimed: false,
      execution_authority_granted: false,
    };
  }

  stageAndPrepareUpdate({
    productKey,
    nodeId,
    subjectRef,
    attestation,
    artifacts,
    expectedContractVersion = null,
    expectedReleaseRef = null,
    now = new Date(),
  } = {}) {
    const staged = this.packageStore.stage({
      attestation,
      artifacts,
      expectedContractVersion,
      expectedReleaseRef,
      now,
    });
    if (!['staged', 'already_staged'].includes(staged.state)) {
      return {
        schema: "evercraft.home.os-package-update-orchestration.v1",
        state: "held",
        phase: "stage",
        reason: staged.reason || "package_stage_held",
        stage: staged,
        permit_consumed: false,
        transition_recorded: false,
        activation_changed: false,
      };
    }
    const prepared = this.lifecycle.prepareUpdate({
      productKey,
      nodeId,
      subjectRef,
      attestation,
      expectedContractVersion,
      expectedReleaseRef,
      now,
    });
    if (prepared.state !== "prepared") {
      return {
        schema: "evercraft.home.os-package-update-orchestration.v1",
        state: "held",
        phase: "prepare",
        reason: prepared.reason || "update_prepare_held",
        stage: staged,
        preparation: prepared,
        permit_consumed: false,
        transition_recorded: false,
        activation_changed: false,
      };
    }
    return {
      schema: "evercraft.home.os-package-update-orchestration.v1",
      state: "prepared",
      phase: "permit_required",
      stage: staged,
      preparation: prepared,
      permit_consumed: false,
      transition_recorded: false,
      activation_changed: false,
      authority_granted: false,
    };
  }

  applyPreparedUpdate({ plan, permitId, actorRef } = {}) {
    if (plan?.schema !== "evercraft.os.package-update-plan.v1") {
      throw new Error("home_update_plan_invalid");
    }
    const staged = this.packageStore.inspect(plan.product_key, plan.next_package_fingerprint);
    if (staged.integrity !== "verified") {
      return {
        schema: "evercraft.home.os-package-update-orchestration.v1",
        state: "held",
        phase: "pre_transition_stage_recheck",
        reason: "target_package_not_verified_staged",
        staged,
        permit_consumed: false,
        transition_recorded: false,
        activation_changed: false,
      };
    }

    const transition = this.lifecycle.applyUpdate({ plan, permitId, actorRef });
    const activation = this.packageStore.reconcileActivation({
      productKey: plan.product_key,
      nodeId: plan.node_id,
      transitionLedger: this.transitionLedger,
    });
    const status = this.status({ productKey: plan.product_key, nodeId: plan.node_id });
    const activated = ['activated_metadata', 'already_active'].includes(activation.state) && status.desired_active_aligned;
    return {
      schema: "evercraft.home.os-package-update-orchestration.v1",
      state: activated ? "activated_metadata" : "held",
      phase: activated ? "activation_reconciled" : "post_transition_activation_hold",
      transition,
      activation,
      runtime_state: status,
      permit_consumed: transition.permit_consumed === true,
      transition_recorded: transition.ledger_mutation_performed === true || transition.state === "duplicate",
      activation_changed: activation.mutation_performed === true,
      package_materialized: staged.materialized === true,
      process_started: false,
      runtime_health_claimed: false,
      execution_authority_granted: false,
    };
  }

  prepareRollback({ productKey, nodeId, subjectRef } = {}) {
    return this.lifecycle.prepareRollback({ productKey, nodeId, subjectRef });
  }

  applyPreparedRollback({ plan, permitId, actorRef } = {}) {
    if (plan?.schema !== "evercraft.os.package-rollback-plan.v1") {
      throw new Error("home_rollback_plan_invalid");
    }
    const staged = this.packageStore.inspect(plan.product_key, plan.target_package_fingerprint);
    if (staged.integrity !== "verified") {
      return {
        schema: "evercraft.home.os-package-rollback-orchestration.v1",
        state: "held",
        phase: "pre_transition_stage_recheck",
        reason: "rollback_target_not_verified_staged",
        staged,
        permit_consumed: false,
        transition_recorded: false,
        activation_changed: false,
      };
    }

    const transition = this.lifecycle.applyRollback({ plan, permitId, actorRef });
    const activation = this.packageStore.reconcileActivation({
      productKey: plan.product_key,
      nodeId: plan.node_id,
      transitionLedger: this.transitionLedger,
    });
    const status = this.status({ productKey: plan.product_key, nodeId: plan.node_id });
    const activated = ['activated_metadata', 'already_active'].includes(activation.state) && status.desired_active_aligned;
    return {
      schema: "evercraft.home.os-package-rollback-orchestration.v1",
      state: activated ? "activated_metadata" : "held",
      phase: activated ? "activation_reconciled" : "post_transition_activation_hold",
      transition,
      activation,
      runtime_state: status,
      permit_consumed: transition.permit_consumed === true,
      transition_recorded: transition.ledger_mutation_performed === true || transition.state === "duplicate",
      activation_changed: activation.mutation_performed === true,
      process_started: false,
      runtime_health_claimed: false,
      execution_authority_granted: false,
    };
  }
}
