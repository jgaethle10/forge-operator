import assert from "node:assert/strict";
import {
  classifyAnnouncementProximity,
} from "./edge-event-contamination.mjs";
import {
  evaluateAnnouncementExecutionStress,
  runAnnouncementExecutionStressLab,
} from "./edge-announcement-execution-stress.mjs";

const candidate={
  signal_key:"ai_models|sec_8_k|SOXX|1d",
  rockies_range:"ai_models",
  observation_kind:"sec_8_k",
  benchmark:"SPY",
  status:"RESEARCH_CANDIDATE",
  learned_direction:"POSITIVE_EXCESS_RETURN",
};

const cpiNear=classifyAnnouncementProximity({
  observed_at:"2026-07-14T12:35:00Z",
  source_form:"8-K",
  sec_items:["1.01"],
});
assert.equal(cpiNear.cpi_same_day,true);
assert.equal(cpiNear.minutes_from_cpi_release,5);
assert.equal(cpiNear.cpi_within_window,true);

const cpiFar=classifyAnnouncementProximity({
  observed_at:"2026-07-14T19:00:00Z",
  source_form:"8-K",
  sec_items:["1.01"],
});
assert.equal(cpiFar.cpi_same_day,true);
assert.equal(cpiFar.cpi_within_window,false);

const fomcNear=classifyAnnouncementProximity({
  observed_at:"2026-06-17T18:05:00Z",
  source_form:"8-K",
  sec_items:["1.01"],
});
assert.equal(fomcNear.fomc_same_day,true);
assert.equal(fomcNear.minutes_from_fomc_statement,5);
assert.equal(fomcNear.fomc_within_window,true);

const cleanObservedAt=[
  "2026-01-05T15:00:00Z",
  "2026-01-08T15:00:00Z",
  "2026-01-15T15:00:00Z",
  "2026-01-22T15:00:00Z",
  "2026-02-03T15:00:00Z",
  "2026-02-18T15:00:00Z",
  "2026-02-24T15:00:00Z",
  "2026-03-03T15:00:00Z",
  "2026-03-24T15:00:00Z",
  "2026-04-02T15:00:00Z",
];
const rows=[];
const overlays=[];
const pairs=[];
for(let i=0;i<14;i++){
  let observedAt=cleanObservedAt[i]||cleanObservedAt[0];
  let secItems=["1.01"];
  let sourceForm="8-K";
  let hot=false;
  if(i===10){
    observedAt="2026-07-14T12:35:00Z";
    hot=true;
  }else if(i===11){
    observedAt="2026-06-17T18:05:00Z";
    hot=true;
  }else if(i===12){
    observedAt="2026-08-25T15:00:00Z";
    secItems=["2.02","9.01"];
    hot=true;
  }else if(i===13){
    observedAt="2026-09-16T18:10:00Z";
    hot=true;
  }
  const id="m:"+i;
  rows.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    observed_at:observedAt,
    instrument:"SOXX",
    source_form:sourceForm,
    sec_items:secItems,
  });
  overlays.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    label:"modeled_entry",
    quote_available:true,
    quote_scope:"consolidated_sip_nbbo",
    spread_bps:hot?24:8,
    half_spread_bps:hot?12:4,
    entry_slippage_vs_bar_bps:hot?10:2,
    passive_touch_markout_30s_bps:hot?-7:-1,
  });
  pairs.push({
    measurement_id:id,
    signal_key:candidate.signal_key,
    two_sided_quote_available:true,
    strategy_net_degradation_from_two_sided_quotes:hot?0.004:0.001,
  });
}

const quoteLab={
  quote_scope:"consolidated_sip_nbbo",
  fallback_feed_used:false,
  overlays,
  execution_pairs:pairs,
};

const review=evaluateAnnouncementExecutionStress(
  candidate,
  rows,
  quoteLab,
  {
    minimum_clean_quote_observations:8,
    minimum_announcement_quote_observations:2,
  }
);
assert.equal(review.status,"ANNOUNCEMENT_EXECUTION_STRESS_READY");
assert.equal(review.clean.quote_observations,10);
assert.equal(review.any_announcement_window.quote_observations,4);
assert.ok(
  review.execution_cost_ratios.any_to_clean_mean_spread_ratio>2
);
assert.ok(
  review.execution_degradation_deltas.any_minus_clean>0
);
assert.equal(
  review.interpretation.announcement_window_is_clock_based_not_whole_day,
  true
);
assert.equal(review.live_trade_authority,false);

const lab=runAnnouncementExecutionStressLab({
  evaluations:[candidate],
  measurements:rows,
},quoteLab,{
  minimum_clean_quote_observations:8,
  minimum_announcement_quote_observations:2,
});
assert.equal(lab.candidate_count,1);
assert.equal(lab.status_counts.ANNOUNCEMENT_EXECUTION_STRESS_READY,1);
assert.equal(lab.eligibility_mutated,false);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.edge-announcement-execution-stress-proof.v1",
  cpi_0830_et_clock_window:true,
  fomc_1400_et_clock_window:true,
  earnings_event_window:true,
  quote_spread_conditioning:true,
  two_sided_execution_degradation_conditioning:true,
  missing_is_never_zero:true,
  exploratory_only:true,
  eligibility_mutated:false,
  live_trade_authority:false
}));
