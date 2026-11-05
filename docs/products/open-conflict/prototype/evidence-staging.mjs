/**
 * Open Conflict: source-neutral, offline evidence staging.
 * Input: already obtained public reports. No scraping, live polling or publishing.
 * Output: review queue and publication candidates, never an automatic release.
 */
import { reviewEvent } from "./publication-gate.mjs";

function normalizeText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}
function stableKey(item) {
  const urls = (Array.isArray(item.sources) ? item.sources : [])
    .map(source => source?.url).filter(Boolean).sort();
  return JSON.stringify([item.category, normalizeText(item.headline).toLowerCase(), urls]);
}
export function stageReports(reports) {
  if (!Array.isArray(reports)) throw new TypeError("reports must be an array");
  const seen = new Set();
  const reviewQueue = [];
  const duplicateRecords = [];
  const candidates = [];
  for (const [index, raw] of reports.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      reviewQueue.push({ index, reasons: ["invalid_event"], event: null });
      continue;
    }
    const event = {
      ...raw,
      headline: normalizeText(raw.headline),
      summary: normalizeText(raw.summary),
      sources: Array.isArray(raw.sources) ? raw.sources.map(s => ({...s})) : [],
      // Ingestion cannot grant editorial approval.
      safety_review: { approved: false, reason: "pending_editorial_review" },
      published_at_utc: null
    };
    const key = stableKey(event);
    if (seen.has(key)) {
      duplicateRecords.push({index, headline:event.headline});
      continue;
    }
    seen.add(key);
    const gate = reviewEvent(event);
    reviewQueue.push({index, event, reasons:gate.reasons});
    // Only non-sensitive records can advance to human review; none are published.
    if (!gate.reasons.some(r=>["possible_operational_intelligence","precise_location_requires_review"].includes(r))) {
      candidates.push({index, event, review_required:true});
    }
  }
  return {reviewQueue, duplicateRecords, candidates, published:[]};
}
