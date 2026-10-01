import assert from "node:assert/strict";
import {
  evaluateEventContamination,
  runEventContaminationLab,
  OFFICIAL_MACRO_CALENDAR_PROVENANCE,
} from "./edge-event-contamination.mjs";

const candidate = {
  signal_key: "ai_models|sec_8_k|SOXX|1d",
  rockies_range: "ai_models",
  observation_kind: "sec_8_k",
  benchmark: "SPY",
  status: "RESEARCH_CANDIDATE",
  learned_direction: "POSITIVE_EXCESS_RETURN",
};

const cleanDates = [
  "2026-01-05","2026-01-08","2026-01-15","2026-01-22",
  "2026-02-03","2026-02-18","2026-02-24","2026-03-03",
  "2026-03-24","2026-04-02","2026-04-16","2026-04-23",
  "2026-05-04","2026-05-19","2026-05-28","2026-06-02",
  "2026-06-25","2026-07-02","2026-07-21","2026-08-04",
  "2026-08-20","2026-09-01","2026-09-24","2026-09-29",
];

const cleanRows = cleanDates.map((date, i) => ({
  measurement_id: "clean:" + i,
  signal_key: candidate.signal_key,
  observed_at: date + "T15:00:00Z",
  origin_entity_ref: "issuer:" + (i % 6),
  source_form: "8-K",
  sec_items: ["1.01"],
  forward_return: 0.012,
  benchmark_return: 0.002,
}));

const contaminatedRows = [
  {
    measurement_id:"fomc",
    signal_key:candidate.signal_key,
    observed_at:"2026-06-17T15:00:00Z",
    origin_entity_ref:"issuer:0",
    source_form:"8-K",
    sec_items:["1.01"],
    forward_return:0.20,
    benchmark_return:0,
  },
  {
    measurement_id:"cpi",
    signal_key:candidate.signal_key,
    observed_at:"2026-07-14T15:00:00Z",
    origin_entity_ref:"issuer:1",
    source_form:"8-K",
    sec_items:["1.01"],
    forward_return:0.20,
    benchmark_return:0,
  },
  {
    measurement_id:"earnings",
    signal_key:candidate.signal_key,
    observed_at:"2026-08-25T15:00:00Z",
    origin_entity_ref:"issuer:2",
    source_form:"8-K",
    sec_items:["2.02","9.01"],
    forward_return:0.20,
    benchmark_return:0,
  },
];

const robust = evaluateEventContamination(
  candidate,
  [...cleanRows, ...contaminatedRows],
  { transaction_cost_bps:20, minimum_clean_events:20, minimum_clean_origins:5 }
);
assert.equal(robust.contamination_counts.fomc,1);
assert.equal(robust.contamination_counts.cpi,1);
assert.equal(robust.contamination_counts.earnings_related,1);
assert.equal(robust.contamination_counts.item_2_02,1);
assert.equal(robust.contamination_status,"CONTAMINATION_ROBUST_DIAGNOSTIC");

const periodicReportRows = [
  ...cleanRows,
  {
    measurement_id:"ten-q",
    signal_key:candidate.signal_key,
    observed_at:"2026-08-26T15:00:00Z",
    origin_entity_ref:"issuer:3",
    source_form:"10-Q",
    sec_items:[],
    forward_return:0.02,
    benchmark_return:0,
  },
  {
    measurement_id:"ten-k",
    signal_key:candidate.signal_key,
    observed_at:"2026-08-27T15:00:00Z",
    origin_entity_ref:"issuer:4",
    source_form:"10-K",
    sec_items:[],
    forward_return:0.02,
    benchmark_return:0,
  },
];
const periodicControl = evaluateEventContamination(
  candidate,
  periodicReportRows,
  { transaction_cost_bps:20, minimum_clean_events:20, minimum_clean_origins:5 }
);
assert.equal(periodicControl.contamination_counts.earnings_related,2);
assert.ok(robust.fully_clean.mean_signed_net > 0);

const earningsDriven = cleanRows.map((row) => ({
  ...row,
  forward_return:-0.004,
})).concat(
  Array.from({length:24},(_,i)=>({
    measurement_id:"earnings-driven:"+i,
    signal_key:candidate.signal_key,
    observed_at:cleanDates[i % cleanDates.length]+"T16:00:00Z",
    origin_entity_ref:"issuer:"+(i%6),
    source_form:"8-K",
    sec_items:["2.02"],
    forward_return:0.05,
    benchmark_return:0,
  }))
);
const fragile = evaluateEventContamination(
  candidate,
  earningsDriven,
  { transaction_cost_bps:20, minimum_clean_events:20, minimum_clean_origins:5 }
);
assert.equal(fragile.checks.survives_earnings_event_exclusion,false);
assert.equal(fragile.contamination_status,"CONTAMINATION_FRAGILE_DIAGNOSTIC");

assert.ok(
  OFFICIAL_MACRO_CALENDAR_PROVENANCE.fomc.dates.includes("2026-09-16")
);
assert.ok(
  OFFICIAL_MACRO_CALENDAR_PROVENANCE.cpi.dates.includes("2025-10-24")
);
assert.equal(
  OFFICIAL_MACRO_CALENDAR_PROVENANCE.cpi.dates.includes("2025-11-13"),
  false
);

const lab=runEventContaminationLab({
  evaluations:[candidate],
  measurements:[...cleanRows,...contaminatedRows],
},{
  transaction_cost_bps:20,
  minimum_clean_events:20,
  minimum_clean_origins:5,
});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.CONTAMINATION_ROBUST_DIAGNOSTIC,1);
assert.equal(lab.historical_exploratory_only,true);
assert.equal(lab.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-event-contamination-proof.v1",
  fomc_calendar_control:true,
  cpi_calendar_control:true,
  shutdown_rescheduled_cpi_handled:true,
  earnings_item_2_02_control:true,
  ten_q_ten_k_earnings_control:true,
  combined_clean_sample:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false,
}));
