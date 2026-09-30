import assert from "node:assert/strict";
import {
  parseSecAcceptanceDateTime,
  secFilingToRockyObservation,
  observationsFromSecSubmissions,
  tickerMapIndex,
} from "./sec-filings-rocky.mjs";

const winter = parseSecAcceptanceDateTime("20260115160000");
assert.equal(winter, "2026-01-15T21:00:00.000Z");

const summer = parseSecAcceptanceDateTime("20260609172722");
assert.equal(summer, "2026-06-09T21:27:22.000Z");

const filing = {
  accessionNumber: "0000000000-26-000001",
  filingDate: "2026-09-15",
  reportDate: "2026-09-14",
  acceptanceDateTime: "20260915160500",
  form: "8-K",
  items: "2.02,9.01",
  primaryDocument: "proof-8k.htm",
};

const observation = secFilingToRockyObservation({
  ticker: "NVDA",
  company_title: "NVIDIA CORP",
  cik: 1045810,
  rockies_range: "semiconductors_compute",
  filing,
  publication_delay_buffer_minutes: 10,
});
assert.equal(observation.source_family, "sec_filings");
assert.equal(observation.evidence_state, "verified");
assert.deepEqual(observation.metadata.market_symbols, ["NVDA"]);
assert.equal(observation.metadata.public_availability_exact_time_known, false);
assert.equal(
  new Date(observation.observed_at).getTime() - new Date(observation.metadata.sec_acceptance_at).getTime(),
  10 * 60_000
);
assert.ok(observation.provenance_refs[0].includes("sec.gov/Archives/edgar/data/1045810/"));
assert.equal(observation.metadata.authority_class, "official_regulatory_filing");

const submissions = {
  cik: "1045810",
  name: "NVIDIA CORP",
  filings: {
    recent: {
      accessionNumber: [filing.accessionNumber, "x"],
      filingDate: [filing.filingDate, "2026-09-15"],
      reportDate: [filing.reportDate, "2026-09-14"],
      acceptanceDateTime: [filing.acceptanceDateTime, "20260915170000"],
      form: ["8-K", "S-8"],
      items: [filing.items, ""],
      primaryDocument: [filing.primaryDocument, "x.htm"],
    },
  },
};
const rows = observationsFromSecSubmissions({
  ticker: "NVDA",
  rockies_range: "semiconductors_compute",
  submissions,
  now: new Date("2026-09-30T00:00:00Z"),
  lookback_days: 120,
});
assert.equal(rows.length, 1);

const idx = tickerMapIndex({
  0: { cik_str: 1045810, ticker: "NVDA", title: "NVIDIA CORP" },
});
assert.equal(idx.get("NVDA").cik, 1045810);

console.log(JSON.stringify({
  ok: true,
  schema: "evercraft.rockies.sec-market-field-pack-proof.v1",
  exact_acceptance_timestamp_preserved: true,
  public_availability_buffered: true,
  unsupported_forms_filtered: true,
  direct_market_symbol_preserved: true,
  live_trade_authority: false,
}));
