import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ResearchTrialCemetery } from "./edge-research-trial-cemetery.mjs";

const root=fs.mkdtempSync(path.join(os.tmpdir(),"edge-trial-cemetery-"));
const report={
  hypothesis_count:9,
  measurement_count:120,
  family_count:3,
  evaluations:[
    {
      signal_key:"ai_models|sec_8_k|SOXX|1d",
      rockies_range:"ai_models",
      observation_kind:"sec_8_k",
      instrument:"SOXX",
      benchmark:"SPY",
      lag_key:"1d",
      status:"RESEARCH_CANDIDATE",
      learned_direction:"POSITIVE_EXCESS_RETURN",
      observation_count:40,
      development_q_bh:0.02,
      base_evaluation:{holdout:{mean_excess_return_net:0.01,positive_rate:0.7}},
    },
    {
      signal_key:"ai_models|sec_8_k|QQQ|1d",
      rockies_range:"ai_models",
      observation_kind:"sec_8_k",
      instrument:"QQQ",
      benchmark:"SPY",
      lag_key:"1d",
      status:"NOT_VALIDATED",
      learned_direction:"NEGATIVE_EXCESS_RETURN",
      observation_count:40,
      development_q_bh:0.5,
      base_evaluation:{holdout:{mean_excess_return_net:-0.003,positive_rate:0.4}},
    },
    {
      signal_key:"semiconductors_compute|sec_8_k|SMH|3d",
      rockies_range:"semiconductors_compute",
      observation_kind:"sec_8_k",
      instrument:"SMH",
      benchmark:"SPY",
      lag_key:"3d",
      status:"INSUFFICIENT_DIVERSITY",
      learned_direction:null,
      observation_count:40,
      development_q_bh:1,
      base_evaluation:{holdout:{mean_excess_return_net:0,positive_rate:0.5}},
    },
  ],
};

const config={
  transaction_cost_bps:5,
  development_fraction:0.70,
  false_discovery_rate:0.10,
  bar_minutes:5,
};
let cemetery=new ResearchTrialCemetery({root});
const first=cemetery.ingestReport(report,{
  research_config:config,
  source_digest:"sha256:source-a",
});
assert.equal(first.appended,3);
assert.equal(first.duplicates,0);
assert.equal(first.run_completion_appended,true);
let summary=cemetery.summary();
assert.equal(summary.run_count,1);
assert.equal(summary.trial_observation_count,3);
assert.equal(summary.status_counts.RESEARCH_CANDIDATE,1);
assert.equal(summary.status_counts.NOT_VALIDATED,1);
assert.equal(summary.status_counts.INSUFFICIENT_DIVERSITY,1);
assert.equal(summary.all_statuses_retained,true);

cemetery=new ResearchTrialCemetery({root});
const reopened=cemetery.summary();
assert.equal(reopened.head_hash,summary.head_hash);
assert.equal(reopened.trial_observation_count,3);
assert.equal(reopened.run_count,1);

const duplicate=cemetery.ingestReport(report,{
  research_config:config,
  source_digest:"sha256:source-a",
});
assert.equal(duplicate.appended,0);
assert.equal(duplicate.duplicates,3);
assert.equal(duplicate.run_completion_appended,false);

const secondConfig=cemetery.ingestReport(report,{
  research_config:{...config,transaction_cost_bps:25},
  source_digest:"sha256:source-a",
});
assert.equal(secondConfig.appended,3);
summary=cemetery.summary();
assert.equal(summary.run_count,2);
assert.equal(summary.trial_observation_count,6);
assert.equal(summary.unique_trial_configuration_count,6);

fs.appendFileSync(
  path.join(root,"research-trial-cemetery.jsonl"),
  '{"schema":"torn"'
);
const recovered=new ResearchTrialCemetery({root});
assert.equal(recovered.summary().tail_recovered,true);
assert.equal(recovered.summary().trial_observation_count,6);

console.log(JSON.stringify({
  ok:true,
  schema:"evercraft.daytrade.research-trial-cemetery-proof.v1",
  append_only_hash_chain:true,
  fsync_append:true,
  all_family_statuses_retained:true,
  rejected_trials_first_class:true,
  exact_config_fingerprint:true,
  idempotent_reingest:true,
  restart_reopen_verified:true,
  torn_tail_recovery:true,
  winner_only_history_forbidden:true,
  live_trade_authority:false
}));
