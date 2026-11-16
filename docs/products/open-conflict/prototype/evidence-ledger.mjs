/**
 * Open Conflict evidence ledger v0.1.
 * Append-only in-memory prototype. Persistence and trusted identity are NOT implemented.
 * Store only editorial metadata and broad-region public records, never raw sensitive reports.
 */
import {createHash} from "node:crypto";
const canonical = value => JSON.stringify(value);
const digest = value => createHash("sha256").update(canonical(value)).digest("hex");
const TYPES = new Set(["ingested","reviewed","approved","rejected","corrected","retracted"]);
export class EvidenceLedger {
  #entries = [];
  constructor(initial = []) {
    if (!Array.isArray(initial)) throw new TypeError("initial entries must be an array");
    if (initial.length && !EvidenceLedger.verify(initial)) throw new Error("invalid ledger history");
    this.#entries = structuredClone(initial);
  }
  append({event_id,type,actor,at,details={}}) {
    if (typeof event_id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(event_id)) throw new Error("invalid event id");
    if (!TYPES.has(type)) throw new Error("invalid transition type");
    if (typeof actor !== "string" || !actor.trim()) throw new Error("actor required");
    if (typeof at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(at) || !Number.isFinite(Date.parse(at))) throw new Error("invalid timestamp");
    if (!details || typeof details !== "object" || Array.isArray(details)) throw new Error("invalid details");
    const last = this.#entries.at(-1);
    if (last && Date.parse(at) < Date.parse(last.at)) throw new Error("out of order timestamp");
    const prior = this.#entries.filter(x => x.event_id === event_id);
    const previousType = prior.at(-1)?.type;
    if (!previousType && type !== "ingested") throw new Error("first transition must be ingested");
    if (previousType === "retracted") throw new Error("retracted event is terminal");
    if (type === "approved" && previousType !== "reviewed" && previousType !== "corrected") throw new Error("approval requires review");
    if (type === "corrected" && !["approved","corrected"].includes(previousType)) throw new Error("correction requires approved record");
    if (type === "retracted" && !["approved","corrected"].includes(previousType)) throw new Error("retraction requires approved record");
    const entry = {sequence:this.#entries.length+1,event_id,type,actor,at,details:structuredClone(details),previous_hash:last?.hash ?? null};
    entry.hash = digest(entry);
    this.#entries.push(entry);
    return structuredClone(entry);
  }
  entries() { return structuredClone(this.#entries); }
  static verify(entries) {
    if (!Array.isArray(entries)) return false;
    return entries.every((e,i)=>{
      if (!e || typeof e !== "object" || Array.isArray(e)) return false;
      const {hash,...body} = e;
      return e.sequence === i+1 && e.previous_hash === (i ? entries[i-1].hash : null) && hash === digest(body);
    });
  }
}
