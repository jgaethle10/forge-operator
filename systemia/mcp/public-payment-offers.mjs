// Fixed public offers approved in the buyer-door manifest. No inferred SKUs.
export const PUBLIC_PAYMENT_OFFERS=Object.freeze({
  "workflow-xray": {
    "offer_key": "workflow_foundry.xray_250.v1",
    "title": "Evercraft Workflow X-Ray",
    "intent": "Diagnose one business workflow and identify a bounded fix",
    "amount_cents": 25000,
    "currency": "usd"
  },
  "browser-diagnosis": {
    "offer_key": "browser_fabric_workflow_diagnosis_149",
    "title": "Browser Workflow Diagnosis",
    "intent": "Scope safe browser automation for one workflow",
    "amount_cents": 14900,
    "currency": "usd"
  },
  "payments-pilot": {
    "offer_key": "evercraft_payments_founding_integration_750",
    "title": "Evercraft Payments Founding Integration",
    "intent": "Connect one buyer-owned processor offer with verified order handling",
    "amount_cents": 75000,
    "currency": "usd"
  },
  "part-deep": {
    "offer_key": "findmypart.deep_hunt_49.v1",
    "title": "FindMyPart Deep Hunt",
    "intent": "Investigate sourcing and cross-reference alternatives",
    "amount_cents": 4900,
    "currency": "usd"
  },
  "part-rescue": {
    "offer_key": "findmypart.rescue_hunt_99.v1",
    "title": "FindMyPart Rescue Hunt",
    "intent": "Escalate a project-stopping part search",
    "amount_cents": 9900,
    "currency": "usd"
  },
  "legacy-xray": {
    "offer_key": "legacy_rescue_xray_250",
    "title": "Legacy Software X-Ray",
    "intent": "Assess authorized legacy software dependencies without production changes",
    "amount_cents": 25000,
    "currency": "usd"
  },
  "ibmi-xray": {
    "offer_key": "ibmi_74_deadline_xray_250",
    "title": "IBM i 7.4 Upgrade X-Ray",
    "intent": "Assess IBM i estate upgrade risks and dependencies",
    "amount_cents": 25000,
    "currency": "usd"
  },
  "sign-pilot": {
    "offer_key": "evercraft_sign_founding_pilot_250",
    "title": "Evercraft Sign Founding Pilot",
    "intent": "Prove one bounded signing workflow with identity controls",
    "amount_cents": 25000,
    "currency": "usd"
  },
  "towi-evidence": {
    "offer_key": "towi.rapid_evidence_750.v1",
    "title": "TOWI Rapid Evidence Scan",
    "intent": "Prepare a sourced evidence ledger for one decision",
    "amount_cents": 75000,
    "currency": "usd"
  },
  "event-boost": {
    "offer_key": "eventwave.event_boost_49.v1",
    "title": "EventWave Single Event Boost",
    "intent": "Review one eligible event for a promoted placement",
    "amount_cents": 4900,
    "currency": "usd"
  }
});
export function publicPaymentOffer(slug){return PUBLIC_PAYMENT_OFFERS[slug]||null;}
