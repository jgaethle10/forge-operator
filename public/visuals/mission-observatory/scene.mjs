// Evercraft Living Intelligence / Mission Observatory
// Deterministic, synthetic replay data. This module does NOT connect to production.
export const STAGES = Object.freeze([
  { id: "intake", label: "INTAKE", eyebrow: "01 / SIGNAL", tint: "#67d8ee", detail: "The friction becomes visible." },
  { id: "context", label: "CONTEXT", eyebrow: "02 / UNDERSTAND", tint: "#80b3ff", detail: "Constraints and evidence enter the room." },
  { id: "plan", label: "CHOREOGRAPHY", eyebrow: "03 / ROUTE", tint: "#e7bd71", detail: "Roles, dependencies and gates take shape." },
  { id: "execute", label: "EXECUTION", eyebrow: "04 / BUILD", tint: "#e5a0dc", detail: "Bounded work advances through checks." },
  { id: "verify", label: "VERIFICATION", eyebrow: "05 / PROVE", tint: "#8fe5b2", detail: "The result is tested against its claim." },
  { id: "deliver", label: "DELIVERY", eyebrow: "06 / SHIP", tint: "#f0d28c", detail: "Only receipted value reaches the customer." }
]);

export const DEMO_MISSION = Object.freeze({
  key: "example-file-delivery-001",
  name: "The file that couldn't travel",
  customer_problem: "A customer needs to send an oversized project file that standard messaging rejects.",
  desired_outcome: "Prepare an appropriate delivery route, confirm receipt and show what changed.",
  mode: "SYNTHETIC_REPLAY",
  duration_seconds: 28,
  safety_note: "Illustrative motion and events only. No real file transfer, customer, payment, agent dispatch, or production verification occurred."
});

export const DEMO_EVENTS = Object.freeze([
  { id:"ev-01", seconds:1.1, stage:"intake", title:"Delivery problem detected", detail:"Oversized attachment is rejected by the channel.", kind:"signal", evidence_state:"synthetic", source_ref:"fixture://input/oversized-file", parent_ids:[] },
  { id:"ev-02", seconds:3.0, stage:"intake", title:"Outcome defined", detail:"Preserve file integrity and make delivery demonstrable.", kind:"objective", evidence_state:"synthetic", source_ref:"fixture://objective/delivery", parent_ids:["ev-01"] },
  { id:"ev-03", seconds:5.2, stage:"context", title:"Channel limits mapped", detail:"Recipient constraints and supported formats are inventoried.", kind:"context", evidence_state:"synthetic", source_ref:"fixture://context/constraints", parent_ids:["ev-02"] },
  { id:"ev-04", seconds:7.0, stage:"context", title:"Integrity requirements attached", detail:"Byte-for-byte identity and explicit receiver confirmation are required.", kind:"rule", evidence_state:"synthetic", source_ref:"fixture://context/integrity", parent_ids:["ev-03"] },
  { id:"ev-05", seconds:9.0, stage:"plan", title:"Systemia routes work", detail:"Illustrative work is split into packaging, transport and receipt steps.", kind:"route", evidence_state:"synthetic", source_ref:"fixture://plan/route", parent_ids:["ev-03","ev-04"] },
  { id:"ev-06", seconds:11.4, stage:"plan", title:"Human permissions preserved", detail:"No external side effect is allowed by the simulation.", kind:"gate", evidence_state:"synthetic", source_ref:"fixture://plan/authority", parent_ids:["ev-05"] },
  { id:"ev-07", seconds:14.1, stage:"execute", title:"Package strategy modeled", detail:"Illustrative manifest proposes a compatible transport route.", kind:"build", evidence_state:"synthetic", source_ref:"fixture://execution/manifest", parent_ids:["ev-05","ev-06"] },
  { id:"ev-08", seconds:16.2, stage:"execute", title:"Receiver workflow rehearsed", detail:"A local-only handoff sequence is represented visually.", kind:"build", evidence_state:"synthetic", source_ref:"fixture://execution/receiver", parent_ids:["ev-07"] },
  { id:"ev-09", seconds:19.1, stage:"verify", title:"Integrity check simulated", detail:"Synthetic source and reconstructed content identifiers are compared.", kind:"check", evidence_state:"synthetic", source_ref:"fixture://verification/check", parent_ids:["ev-08"] },
  { id:"ev-10", seconds:21.8, stage:"verify", title:"Claim boundary enforced", detail:"A modeled passing check is not a real-world delivery receipt.", kind:"gate", evidence_state:"synthetic", source_ref:"fixture://verification/claim-boundary", parent_ids:["ev-09"] },
  { id:"ev-11", seconds:24.4, stage:"deliver", title:"Customer view assembled", detail:"Show the before/after and explicit next confirmation step.", kind:"output", evidence_state:"synthetic", source_ref:"fixture://delivery/summary", parent_ids:["ev-10"] },
  { id:"ev-12", seconds:26.8, stage:"deliver", title:"Proof required before payment", detail:"Payment and delivery remain unverified until real receipts exist.", kind:"gate", evidence_state:"synthetic", source_ref:"fixture://delivery/payment-gate", parent_ids:["ev-11"] }
]);

export const VALID_STATES = Object.freeze(["synthetic","declared","observed","receipted","inferred","modeled"]);

export function validateEventStream(events, options = {}) {
  if (!Array.isArray(events)) throw new TypeError("Event stream must be an array");
  if (events.length > 5000) throw new RangeError("Event stream too large");
  const allowedStages = new Set(STAGES.map(stage => stage.id));
  const validEvidence = new Set(VALID_STATES);
  const seen = new Set();
  let last = -Infinity;
  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new TypeError("Invalid event");
    if (typeof event.id !== "string" || !/^[a-zA-Z0-9_-]{2,100}$/.test(event.id)) throw new Error("Invalid event ID");
    if (seen.has(event.id)) throw new Error("Duplicate event ID: " + event.id);
    if (!Number.isFinite(event.seconds) || event.seconds < 0 || event.seconds < last) throw new Error("Unsorted event time");
    if (!allowedStages.has(event.stage)) throw new Error("Unknown stage: " + event.stage);
    if (!validEvidence.has(event.evidence_state)) throw new Error("Unknown evidence state");
    if (typeof event.title !== "string" || !event.title.trim() || event.title.length > 180) throw new Error("Invalid title");
    if (typeof event.detail !== "string" || event.detail.length > 650) throw new Error("Invalid detail");
    if (typeof event.source_ref !== "string" || !event.source_ref.trim()) throw new Error("Missing source");
    if (!Array.isArray(event.parent_ids) || event.parent_ids.some(p => !seen.has(p))) throw new Error("Invalid parent order");
    if (event.evidence_state === "receipted" && !/^https:\/\//.test(event.source_ref) && !/^urn:sha256:[a-f0-9]{64}$/.test(event.source_ref)) {
      throw new Error("Receipted event must carry a verifiable evidence reference");
    }
    if (options.syntheticOnly && event.evidence_state !== "synthetic") throw new Error("Synthetic replay cannot contain real-evidence claims");
    seen.add(event.id); last = event.seconds;
  }
  return true;
}

export function frameAt(seconds, events = DEMO_EVENTS) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const visible = events.filter(e => e.seconds <= time);
  const active = visible[visible.length - 1] || null;
  const stageIndex = active ? STAGES.findIndex(s => s.id === active.stage) : 0;
  return { time, visible, active, stageIndex, stage: STAGES[stageIndex], claims: visible.filter(e => e.kind === "check").length, gates: visible.filter(e => e.kind === "gate").length, links: visible.reduce((sum,e) => sum+e.parent_ids.length, 0) };
}

validateEventStream(DEMO_EVENTS, { syntheticOnly:true });
