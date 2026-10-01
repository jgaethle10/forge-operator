function groupCount(rows,keyFn){
  const out={};
  for(const row of rows||[]){
    const key=String(keyFn(row)??"unknown");
    out[key]=Number(out[key]||0)+1;
  }
  return out;
}

export function summarizeResearchSearchBurden(report,{
  reference_alpha=0.05,
}={}){
  const evaluations=report?.evaluations||[];
  const candidates=evaluations.filter((row)=>row.status==="RESEARCH_CANDIDATE");
  const families=evaluations.length;
  const alpha=Number(reference_alpha);
  const bonferroni=families>0?alpha/families:null;
  const sidak=families>0?1-Math.pow(1-alpha,1/families):null;
  const independentAtLeastOne=families>0?1-Math.pow(1-alpha,families):null;

  return {
    schema:"evercraft.daytrade.edge-search-burden.v1",
    generated_at:new Date().toISOString(),
    signal_family_count:families,
    research_candidate_count:candidates.length,
    candidate_share:families?candidates.length/families:0,
    variants_per_candidate:candidates.length?families/candidates.length:null,
    family_structure:{
      by_rockies_range:groupCount(evaluations,(row)=>row.rockies_range),
      by_observation_kind:groupCount(evaluations,(row)=>row.observation_kind),
      by_instrument:groupCount(evaluations,(row)=>row.instrument),
      by_lag_key:groupCount(evaluations,(row)=>row.lag_key),
      by_status:groupCount(evaluations,(row)=>row.status),
    },
    multiple_testing_reference:{
      reference_alpha:alpha,
      bonferroni_per_family_alpha:bonferroni,
      sidak_per_family_alpha_if_independent:sidak,
      probability_at_least_one_false_positive_if_all_families_independent:
        independentAtLeastOne,
      independence_assumption_is_not_claimed:true,
      correlated_signal_families_make_independence_reference_non_authoritative:true,
      authoritative_family_control:"existing Benjamini-Hochberg development-screen q-values plus prospective frozen validation",
    },
    doctrine:{
      survivor_count_is_never_the_search_denominator:true,
      failed_and_rejected_families_remain_part_of_research_history:true,
      historical_diagnostic_only:true,
      eligibility_mutated:false,
      live_trade_authority:false,
    }
  };
}
