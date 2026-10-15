import {
  buildPackageUpdatePlan,
  verifyPackageAttestation,
} from "./package-trust.mjs";
import { EvercraftOsPublisherTrustEpochStore } from "./publisher-trust-epoch.mjs";

function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(field + "_required");
  return text;
}

function publicVerification(result) {
  if (!result || typeof result !== "object") return null;
  return {
    schema: result.schema,
    state: result.state,
    reason: result.reason || null,
    provenance_verified: result.provenance_verified === true,
    product_key: result.product_key || null,
    package_fingerprint: result.package_fingerprint || null,
    verification_receipt_hash: result.receipt?.receipt_hash || null,
    install_authority_granted: false,
    update_authority_granted: false,
    execution_authority_granted: false,
    payment_authority_granted: false,
  };
}

export class EvercraftHomePackageLifecycle {
  constructor({ transitionLedger, trustProvider } = {}) {
    if (!transitionLedger) throw new Error("home_package_transition_ledger_required");
    if (!(trustProvider instanceof EvercraftOsPublisherTrustEpochStore)) {
      throw new Error("home_package_root_anchored_trust_provider_required");
    }
    this.transitionLedger = transitionLedger;
    this.trustProvider = trustProvider;
  }

  inspect({ productKey, nodeId } = {}) {
    const state = this.transitionLedger.currentState(
      required(productKey, "product_key"),
      required(nodeId, "node_id")
    );
    return {
      schema: "evercraft.home.os-package-state.v1",
      state,
      authority: {
        home_grants_install: false,
        home_grants_update: false,
        home_grants_rollback: false,
        passport_permit_required_for_mutation: true,
      },
    };
  }

  prepareUpdate({
    productKey,
    nodeId,
    subjectRef,
    attestation,
    expectedContractVersion = null,
    expectedReleaseRef = null,
    now = new Date(),
  } = {}) {
    const product = required(productKey, "product_key");
    const node = required(nodeId, "node_id");
    const subject = required(subjectRef, "subject_ref");
    const current = this.transitionLedger.currentState(product, node);
    if (!current.installed) {
      return {
        schema: "evercraft.home.os-package-update-preparation.v1",
        state: "held",
        reason: "app_not_installed",
        mutation_performed: false,
        authority_granted: false,
      };
    }

    const trustState = this.trustProvider.current();
    if (trustState.state !== "verified" || !trustState.trust_store) {
      return {
        schema: "evercraft.home.os-package-update-preparation.v1",
        state: "held",
        reason: "publisher_trust_epoch_not_verified",
        mutation_performed: false,
        authority_granted: false,
      };
    }
    const verification = verifyPackageAttestation({
      attestation,
      trustStore: trustState.trust_store,
      expectedProductKey: product,
      expectedPackageFingerprint: attestation?.body?.package_fingerprint || null,
      expectedContractVersion,
      expectedReleaseRef,
      now,
    });
    if (verification.state !== "verified") {
      return {
        schema: "evercraft.home.os-package-update-preparation.v1",
        state: "held",
        reason: verification.reason,
        verification: publicVerification(verification),
        mutation_performed: false,
        authority_granted: false,
      };
    }

    const plan = buildPackageUpdatePlan({
      productKey: product,
      nodeId: node,
      subjectRef: subject,
      currentPackageFingerprint: current.package_fingerprint,
      nextVerification: verification,
    });

    return {
      schema: "evercraft.home.os-package-update-preparation.v1",
      state: "prepared",
      verification: {
        ...publicVerification(verification),
        publisher_trust_epoch: trustState.epoch,
        publisher_trust_epoch_hash: trustState.epoch_hash,
      },
      plan,
      passport: {
        product: "evercraft-os",
        scope: "app.update",
        resource_ref: plan.resource_ref,
        request_fingerprint: plan.request_fingerprint,
        single_use_permit_required: true,
      },
      mutation_performed: false,
      permit_minted: false,
      authority_granted: false,
    };
  }

  prepareRollback({ productKey, nodeId, subjectRef } = {}) {
    try {
      const plan = this.transitionLedger.planRollback({ productKey, nodeId, subjectRef });
      return {
        schema: "evercraft.home.os-package-rollback-preparation.v1",
        state: "prepared",
        plan,
        passport: {
          product: "evercraft-os",
          scope: "app.rollback",
          resource_ref: plan.resource_ref,
          request_fingerprint: plan.request_fingerprint,
          single_use_permit_required: true,
        },
        mutation_performed: false,
        permit_minted: false,
        authority_granted: false,
      };
    } catch (error) {
      return {
        schema: "evercraft.home.os-package-rollback-preparation.v1",
        state: "held",
        reason: String(error?.message || error),
        mutation_performed: false,
        authority_granted: false,
      };
    }
  }

  applyUpdate({ plan, permitId, actorRef } = {}) {
    const result = this.transitionLedger.applyUpdate({ plan, permitId, actorRef });
    return {
      schema: "evercraft.home.os-package-update-result.v1",
      state: result.state,
      transition_receipt_hash: result.event?.receipt_hash || null,
      package_fingerprint: result.event?.to_package_fingerprint || null,
      permit_consumed: result.permit_consumed === true,
      ledger_mutation_performed: result.mutation_performed === true,
      package_materialized: false,
      capsule_reconciliation_required: result.state !== "duplicate",
      runtime_restarted: false,
      execution_authority_granted: false,
    };
  }

  applyRollback({ plan, permitId, actorRef } = {}) {
    const result = this.transitionLedger.applyRollback({ plan, permitId, actorRef });
    return {
      schema: "evercraft.home.os-package-rollback-result.v1",
      state: result.state,
      transition_receipt_hash: result.event?.receipt_hash || null,
      package_fingerprint: result.event?.to_package_fingerprint || null,
      permit_consumed: result.permit_consumed === true,
      ledger_mutation_performed: result.mutation_performed === true,
      package_materialized: false,
      capsule_reconciliation_required: result.state !== "duplicate",
      runtime_restarted: false,
      execution_authority_granted: false,
    };
  }
}
