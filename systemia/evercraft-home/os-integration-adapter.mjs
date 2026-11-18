// Read-only integration truth surface for one Evercraft OS.
// This intentionally cannot turn source contracts into a live mission, settled order,
// delivered product, installed application, or verified external health.
import { readEvercraftOsStatus, readEvercraftOsApps } from "./os-adapter.mjs";
import { readExecutiveEvidence } from "./executive-evidence-adapter.mjs";
import { readLocalVaultReadiness } from "./continuity-adapter.mjs";

const stage = (key, title, state, detail) => ({ key, title, state, detail });

export function readEvercraftOsIntegration({ repoRoot, vaultDir = "", now = new Date() } = {}) {
  if (!repoRoot) throw new Error("os_integration_repo_root_required");
  const os = readEvercraftOsStatus();
  const apps = readEvercraftOsApps();
  const editorial = readExecutiveEvidence({ repoRoot, now });
  const continuity = readLocalVaultReadiness({ vaultDir });
  const bootProven = os.boot.source_preflight === "pass";
  const catalogProven = apps.contract_ready_count > 0;
  const journalSourceReceipt = editorial.journal.state === "source_receipt_verified";
  const vaultSourcePresent = continuity.state === "source_bundle_present_not_reverified";

  return {
    schema: "evercraft.home.os-integration.v1",
    observed_at: new Date(now).toISOString(),
    product: "Evercraft OS",
    overall_state: "held_pending_end_to_end_field_proof",
    evidence_basis: "local_source_and_declared_status_only",
    contracts: {
      os_source_preflight: bootProven ? "source_proven" : "held",
      app_catalog_contract_ready: apps.contract_ready_count,
      app_catalog_total: apps.product_count,
      journal_local_receipt: journalSourceReceipt ? "source_receipt_verified" : "held",
      journal_public_https_verified: false,
      clip_provider_publication_verified: false,
      continuity_source_bundle: vaultSourcePresent ? "source_present_not_reverified" : "held",
      continuity_independent_restore_verified: false,
    },
    stages: [
      stage("foundation", "OS foundation", bootProven ? "source_proven" : "held",
        bootProven
          ? "Boot contract passed source preflight; this is not evidence of a running or remotely reachable OS."
          : "Source boot contract has not passed preflight."),
      stage("apps", "Capability applications", catalogProven ? "source_proven" : "held",
        `${apps.contract_ready_count} capability contracts ready for install planning; none is proved installed or executing by this catalog.`),
      stage("admission", "Systemia mission admission", "unknown",
        "No authenticated, mission-specific Systemia admission receipt is joined to this view."),
      stage("execution", "Work Saban and specialist execution", "unknown",
        "No authorized, completed Saban/worker runtime receipt is joined to this view."),
      stage("commerce", "Evercraft Payments", "unknown",
        "No independently provider-verified paid order is joined to this view. Unknown is not zero."),
      stage("delivery", "Customer delivery", "unknown",
        "No real customer artifact, shipping receipt and verified outcome are joined to this view."),
      stage("publishing", "Journal and Evercraft Clip",
        journalSourceReceipt ? "source_proven" : "held",
        journalSourceReceipt
          ? "A local Journal article receipt matches source bytes. Public HTTPS and social provider publication remain unverified."
          : "A current local Journal source receipt is not verified; social provider publication remains unverified."),
      stage("recovery", "Continuity and recovery",
        vaultSourcePresent ? "source_present" : "held",
        vaultSourcePresent
          ? "A local source archive is present, but independent restore, field failover and external uptime are unverified."
          : "No currently trusted source vault readback; independent restore and field failover are unverified."),
    ],
    customer_outcomes_verified: null,
    production_runtime_verified: false,
    real_settlement_verified_by_this_read: false,
    external_delivery_verified_by_this_read: false,
    mission_admitted_by_this_read: false,
    execution_performed: false,
    payment_performed: false,
    authority_granted: false,
    private_tokens_returned: false,
  };
}
