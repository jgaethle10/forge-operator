import assert from "node:assert/strict";
import {evaluatePracticeFeedPortability} from "./edge-practice-feed-portability-readiness.mjs";

const blocked=evaluatePracticeFeedPortability({
  policy:{
    rule_id:"spread-abstention-v1",
    source_decision_feed:"iex",
    status:"FEED_PORTABILITY_BLOCKED",
  },
  recentSip:{
    sip_latest_quote_access:"UNAVAILABLE_OR_NOT_ENTITLED",
  },
  delayedAudit:{
    instrument_decisions:33,
    sip_quotes_available:30,
    decision_disagreements:12,
    disagreement_fraction_available:0.4,
    iex_abstain_vs_sip_trade_count:12,
    iex_trade_vs_sip_abstain_count:0,
  },
});
assert.equal(blocked.status,"FEED_PORTABILITY_BLOCKED");
assert.equal(blocked.pilot_readiness_blocked,true);
assert.equal(blocked.checks.recent_consolidated_sip_available,false);
assert.equal(blocked.checks.delayed_sip_validation_available,true);
assert.equal(blocked.checks.observed_decision_equivalence,false);
assert.equal(blocked.observed.decision_disagreements,12);
assert.equal(blocked.live_trade_authority,false);

const cleared=evaluatePracticeFeedPortability({
  policy:{
    rule_id:"spread-abstention-v1-sip",
    source_decision_feed:"iex",
    status:"FEED_PORTABILITY_CLEARED",
  },
  recentSip:{sip_latest_quote_access:"AVAILABLE"},
  delayedAudit:{
    instrument_decisions:60,
    sip_quotes_available:60,
    decision_disagreements:0,
    disagreement_fraction_available:0,
  },
});
assert.equal(cleared.status,"FEED_PORTABILITY_CLEARED");
assert.equal(cleared.pilot_readiness_blocked,false);
assert.equal(cleared.checks.observed_decision_equivalence,true);
assert.equal(cleared.live_trade_authority,false);

console.log(JSON.stringify({
  ok:true,
  observed_feed_disagreement_blocks_portability:true,
  recent_consolidated_sip_required:true,
  delayed_validation_alone_not_sufficient:true,
  clearance_does_not_authorize_live_trading:true,
  live_trade_authority:false
}));
