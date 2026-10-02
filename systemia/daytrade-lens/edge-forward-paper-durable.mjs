import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateFrozenProtocol, scoreForwardPaperCohort } from "./edge-forward-paper.mjs";
import { scoreForwardPaperClusters } from "./edge-forward-paper-cluster.mjs";

function sha(value) {
  return crypto.createHash("sha256").update(
    typeof value === "string" ? value : JSON.stringify(value)
  ).digest("hex");
}

function ensurePrivateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

function appendDurable(file, value) {
  ensurePrivateDir(path.dirname(file));
  const fd = fs.openSync(file, "a", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(value) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readJournal(file) {
  if (!fs.existsSync(file)) return { records: [], head_hash: "GENESIS", tail_recovered: false };
  const raw = fs.readFileSync(file, "utf8");
  const endsWithNewline = raw.endsWith("\n");
  const lines = raw.split("\n");
  if (endsWithNewline) lines.pop();

  let tailRecovered = false;
  if (!endsWithNewline && lines.length) {
    try { JSON.parse(lines[lines.length - 1]); }
    catch {
      lines.pop();
      tailRecovered = true;
    }
  }

  const records = [];
  let previous = "GENESIS";
  let seq = 1;

  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); }
    catch { throw new Error("edge_forward_paper_journal_corrupt_json"); }

    if (record.schema !== "evercraft.daytrade.forward-paper-journal.record.v1") {
      throw new Error("edge_forward_paper_journal_schema_mismatch");
    }
    if (record.seq !== seq) throw new Error("edge_forward_paper_journal_sequence_gap");
    if (record.previous_hash !== previous) throw new Error("edge_forward_paper_journal_chain_break");

    const body = { ...record };
    delete body.record_hash;
    const expected = sha(body);
    if (record.record_hash !== expected) throw new Error("edge_forward_paper_journal_hash_mismatch");

    records.push(record);
    previous = record.record_hash;
    seq += 1;
  }

  return { records, head_hash: previous, tail_recovered: tailRecovered };
}

function appendRecord(state, file, type, payload) {
  const body = {
    schema: "evercraft.daytrade.forward-paper-journal.record.v1",
    seq: state.records.length + 1,
    type,
    at: new Date().toISOString(),
    previous_hash: state.head_hash,
    ...payload,
  };
  const record = { ...body, record_hash: sha(body) };
  appendDurable(file, record);
  state.records.push(record);
  state.head_hash = record.record_hash;
  return record;
}

export class ForwardPaperDurableState {
  constructor({ root } = {}) {
    if (!root) throw new Error("edge_forward_paper_durable_root_required");
    this.root = path.resolve(root);
    ensurePrivateDir(this.root);
    this.file = path.join(this.root, "forward-paper-journal.jsonl");
    this.state = readJournal(this.file);
    this.cohorts = new Map();
    this.cohortBySignal = new Map();
    this.measurements = new Map();

    for (const record of this.state.records) {
      if (record.type === "cohort.enrolled") {
        validateFrozenProtocol(record.protocol);
        if (!this.cohorts.has(record.protocol.cohort_id)) {
          const existingSignalCohort = this.cohortBySignal.get(record.protocol.signal_key);
          if (existingSignalCohort && existingSignalCohort.cohort_id !== record.protocol.cohort_id) {
            throw new Error("edge_forward_paper_duplicate_signal_cohort");
          }
          this.cohorts.set(record.protocol.cohort_id, record.protocol);
          this.cohortBySignal.set(record.protocol.signal_key, record.protocol);
        }
      }
      if (record.type === "measurement.appended") {
        const list = this.measurements.get(record.cohort_id) || [];
        list.push(record.measurement);
        this.measurements.set(record.cohort_id, list);
      }
    }
  }

  enroll(protocol) {
    validateFrozenProtocol(protocol);

    const bySignal = this.cohortBySignal.get(protocol.signal_key);
    if (bySignal) {
      if (bySignal.cohort_id === protocol.cohort_id) {
        if (bySignal.protocol_hash !== protocol.protocol_hash) {
          throw new Error("edge_forward_paper_cohort_conflict");
        }
        return { state: "duplicate", cohort: bySignal, receipt: null };
      }
      return {
        state: "existing_signal_cohort",
        cohort: bySignal,
        rejected_new_cohort_id: protocol.cohort_id,
        receipt: null,
      };
    }

    const existing = this.cohorts.get(protocol.cohort_id);
    if (existing) {
      if (existing.protocol_hash !== protocol.protocol_hash) {
        throw new Error("edge_forward_paper_cohort_conflict");
      }
      this.cohortBySignal.set(existing.signal_key, existing);
      return { state: "duplicate", cohort: existing, receipt: null };
    }

    const receipt = appendRecord(this.state, this.file, "cohort.enrolled", { protocol });
    this.cohorts.set(protocol.cohort_id, protocol);
    this.cohortBySignal.set(protocol.signal_key, protocol);
    return { state: "enrolled", cohort: protocol, receipt };
  }

  getBySignal(signalKey) {
    return this.cohortBySignal.get(String(signalKey || "")) || null;
  }

  ingestResearchReport(report) {
    const rows = Array.isArray(report?.measurements) ? report.measurements : [];
    const results = [];

    for (const protocol of this.cohorts.values()) {
      let appended = 0;
      let duplicates = 0;
      for (const row of rows) {
        if (row?.signal_key !== protocol.signal_key) continue;
        const observed = new Date(row?.observed_at).getTime();
        const cutoff = new Date(protocol.observation_cutoff).getTime();
        if (!Number.isFinite(observed) || observed <= cutoff) continue;

        const result = this.appendMeasurement(protocol.cohort_id, row);
        if (result.state === "appended") appended += 1;
        if (result.state === "duplicate") duplicates += 1;
      }

      results.push({
        cohort_id: protocol.cohort_id,
        signal_key: protocol.signal_key,
        appended,
        duplicates,
        score: this.score(protocol.cohort_id),
      });
    }

    return {
      schema: "evercraft.daytrade.forward-paper-ingest-receipt.v1",
      cohort_count: results.length,
      measurement_rows_seen: rows.length,
      cohorts: results,
      live_trade_authority: false,
    };
  }

  appendMeasurement(cohortId, measurement) {
    const id = String(cohortId || "");
    const protocol = this.cohorts.get(id);
    if (!protocol) throw new Error("edge_forward_paper_unknown_cohort");
    if (measurement?.signal_key !== protocol.signal_key) {
      throw new Error("edge_forward_paper_measurement_signal_mismatch");
    }
    const observed = new Date(measurement?.observed_at).getTime();
    const cutoff = new Date(protocol.observation_cutoff).getTime();
    if (!Number.isFinite(observed) || observed <= cutoff) {
      throw new Error("edge_forward_paper_retroactive_measurement");
    }

    const list = this.measurements.get(id) || [];
    const measurementId = String(measurement.measurement_id || sha(measurement));
    if (list.some((row) => String(row.measurement_id || sha(row)) === measurementId)) {
      return { state: "duplicate", measurement_id: measurementId, receipt: null };
    }

    const normalized = { ...measurement, measurement_id: measurementId };
    const receipt = appendRecord(this.state, this.file, "measurement.appended", {
      cohort_id: id,
      measurement: normalized,
    });
    list.push(normalized);
    this.measurements.set(id, list);
    return { state: "appended", measurement_id: measurementId, receipt };
  }

  score(cohortId) {
    const protocol = this.cohorts.get(String(cohortId || ""));
    if (!protocol) throw new Error("edge_forward_paper_unknown_cohort");
    return scoreForwardPaperCohort(
      protocol,
      this.measurements.get(protocol.cohort_id) || []
    );
  }

  scoreClusters() {
    return scoreForwardPaperClusters(
      [...this.cohorts.values()],
      this.measurements
    );
  }

  summary() {
    return {
      schema: "evercraft.daytrade.forward-paper-durable-summary.v1",
      cohort_count: this.cohorts.size,
      measurement_count: [...this.measurements.values()].reduce((n, rows) => n + rows.length, 0),
      journal_records: this.state.records.length,
      head_hash: this.state.head_hash,
      tail_recovered: this.state.tail_recovered,
      live_trade_authority: false,
    };
  }
}
