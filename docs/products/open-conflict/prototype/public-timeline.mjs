/**
 * Open Conflict v0.4: public timeline projection.
 * Offline, read-only export of explicitly approved editorial records.
 * Never serves raw intake, private notes, exact locations, or operational feeds.
 * An independent safety review is still required before real-world deployment.
 */
import { EvidenceLedger } from "./evidence-ledger.mjs";
import { reviewEvent } from "./publication-gate.mjs";

const allowedCategories = new Set(["diplomacy","humanitarian","official_statement","historical_incident"]);
const allowedStatuses = new Set(["reported","corroborated","disputed","corrected"]);
const validTime = s => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(s) && Number.isFinite(Date.parse(s));
const safeSource = s => ({publisher:s.publisher,url:s.url,published_at_utc:s.published_at_utc,claim_type:s.claim_type});
export function projectPublicTimeline(records, ledgerEntries, {asOf} = {}) {
  if (!Array.isArray(records) || !Array.isArray(ledgerEntries)) throw new TypeError("records and ledgerEntries must be arrays");
  if (!EvidenceLedger.verify(ledgerEntries)) throw new Error("ledger integrity check failed");
  if (asOf !== undefined && !validTime(asOf)) throw new Error("invalid asOf");
  const lastById = new Map();
  for (const entry of ledgerEntries) lastById.set(entry.event_id,entry);
  const events = [];
  const withheld = [];
  for (const record of records) {
    const id = record?.id;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {withheld.push({id:null,reason:"invalid_id"});continue;}
    const last = lastById.get(id);
    if (!last || !["approved","corrected"].includes(last.type)) {withheld.push({id,reason:"not_currently_approved"});continue;}
    if (asOf && Date.parse(last.at) > Date.parse(asOf)) {withheld.push({id,reason:"approval_after_snapshot"});continue;}
    if (!allowedCategories.has(record.category) || !allowedStatuses.has(record.status)) {withheld.push({id,reason:"invalid_classification"});continue;}
    const checked = reviewEvent(record);
    if (!checked.eligible) {withheld.push({id,reason:"failed_publication_gate"});continue;}
    if (!validTime(record.published_at_utc) || Date.parse(record.published_at_utc) < Date.parse(last.at)) {withheld.push({id,reason:"invalid_publication_time"});continue;}
    // Explicit allowlist. No spread of untrusted record fields.
    events.push({
      id,category:record.category,status:record.status,
      headline:record.headline,summary:record.summary,
      region:record.region ?? null,
      event_time_utc:record.event_time_utc ?? null,
      reported_at_utc:record.reported_at_utc,
      verified_at_utc:record.verified_at_utc ?? null,
      published_at_utc:record.published_at_utc,
      sources:record.sources.map(safeSource),
      corrections:Array.isArray(record.corrections) ? record.corrections.map(c=>({
        at:c.at ?? null,reason:c.reason ?? null
      })) : []
    });
  }
  events.sort((a,b)=>Date.parse(b.published_at_utc)-Date.parse(a.published_at_utc));
  return {status:"offline_snapshot",generated_at_utc:asOf ?? null,events,withheld};
}
