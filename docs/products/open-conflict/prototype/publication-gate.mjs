/**
 * Open Conflict v0.2 publication eligibility checks.
 * Conservative first-pass gate, NOT a substitute for editorial/security review.
 * Pure JS, no external dependencies. Does not fetch, publish or track anything.
 */
export const CATEGORIES = Object.freeze(["diplomacy","humanitarian","official_statement","historical_incident"]);
export const STATUSES = Object.freeze(["reported","corroborated","disputed","corrected"]);
const OPERATIONAL = /\b(?:live|real[- ]time|current|ongoing|en route|departing|arriving|tracking)\b.{0,90}\b(?:troop|unit|convoy|warship|destroyer|carrier|submarine|fighter|bomber|aircraft|drone|missile|strike|target|base)\b|\b(?:troop|unit|convoy|warship|destroyer|carrier|submarine|fighter|bomber|aircraft|drone|missile|strike|target|base)\b.{0,90}\b(?:live|real[- ]time|current|ongoing|en route|departing|arriving|tracking)\b/i;
const PRECISE_LOCATION = /\b(?:coordinates?|latitude|longitude|GPS|grid reference|exact location|precise location|target location)\b/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
function validTime(value) { return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)); }
function validUrl(value) { try { const u = new URL(value); return u.protocol === "https:" && !!u.hostname && !u.username && !u.password; } catch { return false; } }
export function reviewEvent(event) {
  const reasons = [];
  if (!event || typeof event !== "object" || Array.isArray(event)) return {eligible:false,requiresHumanReview:true,reasons:["invalid_event"]};
  if (!CATEGORIES.includes(event.category)) reasons.push("invalid_category");
  if (!STATUSES.includes(event.status)) reasons.push("invalid_status");
  if (typeof event.headline !== "string" || !event.headline.trim()) reasons.push("missing_headline");
  if (typeof event.summary !== "string" || !event.summary.trim()) reasons.push("missing_summary");
  if (!validTime(event.reported_at_utc)) reasons.push("invalid_report_time");
  if (event.event_time_utc != null && !validTime(event.event_time_utc)) reasons.push("invalid_event_time");
  if (event.verified_at_utc != null && !validTime(event.verified_at_utc)) reasons.push("invalid_verification_time");
  if (event.published_at_utc != null && !validTime(event.published_at_utc)) reasons.push("invalid_publication_time");
  if (!Array.isArray(event.sources) || !event.sources.length || !event.sources.every(s => s && typeof s.publisher === "string" && !!s.publisher.trim() && validUrl(s.url) && validTime(s.published_at_utc) && ["official","independent","humanitarian"].includes(s.claim_type))) reasons.push("missing_or_invalid_sources");
  if (event.status === "corroborated" && new Set((event.sources || []).map(s=>s.publisher.trim().toLowerCase())).size < 2) reasons.push("corroboration_requires_independent_publishers");
  const text = [event.headline,event.summary,event.region].filter(x=>typeof x === "string").join(" ");
  if (OPERATIONAL.test(text)) reasons.push("possible_operational_intelligence");
  if (PRECISE_LOCATION.test(text) || (event.location && typeof event.location === "object") || typeof event.latitude === "number" || typeof event.longitude === "number") reasons.push("precise_location_requires_review");
  if (!event.safety_review || event.safety_review.approved !== true) reasons.push("safety_approval_missing");
  if (event.status === "corrected" && (!Array.isArray(event.corrections) || !event.corrections.length)) reasons.push("correction_history_missing");
  // Every record needs editorial review even if the automated checks pass.
  return {eligible:reasons.length === 0,requiresHumanReview:true,reasons};
}
