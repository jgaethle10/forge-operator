import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_POLICY=path.join(
  HERE,"practice-rules","spread-abstention-v1-feed-portability.json"
);
const DEFAULT_RECENT=path.join(
  HERE,"paper-receipts","2026-10-07-sip-entitlement-diagnostic.json"
);
const DEFAULT_DELAYED=path.join(
  HERE,"paper-receipts","2026-10-07-delayed-sip-decision-audit.json"
);

function readJson(file){
  return JSON.parse(fs.readFileSync(file,"utf8"));
}

export function evaluatePracticeFeedPortability({
  policy,
  recentSip,
  delayedAudit,
}={}){
  const recentSipAvailable=
    recentSip?.sip_latest_quote_access==="AVAILABLE";
  const delayedSipAvailable=
    delayedAudit?.sip_quotes_available>0;
  const disagreementCount=
    Number(delayedAudit?.decision_disagreements||0);
  const disagreementFraction=
    Number(delayedAudit?.disagreement_fraction_available||0);
  const sourceFeed=policy?.source_decision_feed||null;

  const checks={
    decision_feed_explicit:sourceFeed==="iex",
    recent_consolidated_sip_available:recentSipAvailable,
    delayed_sip_validation_available:delayedSipAvailable,
    observed_decision_equivalence:delayedSipAvailable && disagreementCount===0,
    policy_cleared:policy?.status==="FEED_PORTABILITY_CLEARED",
  };

  const blocked=
    !checks.recent_consolidated_sip_available ||
    !checks.observed_decision_equivalence ||
    !checks.policy_cleared;

  return {
    schema:"evercraft.daytrade.practice-feed-portability-readiness.v1",
    generated_at:new Date().toISOString(),
    rule_id:policy?.rule_id||null,
    source_decision_feed:sourceFeed,
    checks,
    observed:{
      delayed_sip_quotes_available:
        Number(delayedAudit?.sip_quotes_available||0),
      audited_instrument_decisions:
        Number(delayedAudit?.instrument_decisions||0),
      decision_disagreements:disagreementCount,
      disagreement_fraction_available:disagreementFraction,
      iex_abstain_vs_sip_trade_count:
        Number(delayedAudit?.iex_abstain_vs_sip_trade_count||0),
      iex_trade_vs_sip_abstain_count:
        Number(delayedAudit?.iex_trade_vs_sip_abstain_count||0),
    },
    status:blocked
      ?"FEED_PORTABILITY_BLOCKED"
      :"FEED_PORTABILITY_CLEARED",
    pilot_readiness_blocked:blocked,
    interpretation:{
      delayed_sip_is_after_the_fact_only:true,
      iex_rule_must_not_be_assumed_equivalent_to_sip:true,
      observed_disagreement_blocks_equivalence_claim:true,
      current_recent_sip_entitlement_blocks_real_time_sip_decisioning:
        !recentSipAvailable,
      threshold_not_retuned:true,
      practice_not_signal_validation:true,
      live_trade_authority:false,
    },
    live_trade_authority:false,
  };
}

async function main(){
  const policy=readJson(
    process.env.DAYTRADE_FEED_PORTABILITY_POLICY||DEFAULT_POLICY
  );
  const recentSip=readJson(
    process.env.DAYTRADE_RECENT_SIP_RECEIPT||DEFAULT_RECENT
  );
  const delayedAudit=readJson(
    process.env.DAYTRADE_DELAYED_SIP_AUDIT||DEFAULT_DELAYED
  );
  const report=evaluatePracticeFeedPortability({
    policy,recentSip,delayedAudit
  });
  const output=process.env.DAYTRADE_FEED_PORTABILITY_OUTPUT||"";
  if(output){
    fs.mkdirSync(path.dirname(output),{recursive:true});
    fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
  }
  console.log(JSON.stringify(report,null,2));
  if(report.pilot_readiness_blocked) process.exitCode=0;
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
  main().catch(error=>{
    console.error(
      "Practice feed portability readiness failed:",
      error?.message||String(error)
    );
    process.exitCode=1;
  });
}
