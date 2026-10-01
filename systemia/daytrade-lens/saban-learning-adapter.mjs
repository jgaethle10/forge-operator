const ROLE_ATTACKS = Object.freeze({
  base_rate_skeptic: {
    question: "What does the unconditional base rate say before we look at survivors?",
    required_output: "base-rate threat, denominator requirement, kill condition"
  },
  microstructure_scout: {
    question: "What hidden spread, depth, order-flow, auction or venue state could explain the apparent edge?",
    required_output: "missing microstructure state and measurement requirement"
  },
  execution_cost_guard: {
    question: "What executable fill path replaces the convenient historical price?",
    required_output: "implementation-shortfall and fill-policy attack"
  },
  overfit_red_team: {
    question: "How many choices or trials were searched before this result was selected?",
    required_output: "multiple-testing, PBO/DSR, fold and selection attack"
  },
  regime_adversary: {
    question: "Which market, volatility, liquidity, macro or clock-time regime could be carrying the result?",
    required_output: "leave-one-regime-out and contamination attack"
  },
  behavioral_bias_guard: {
    question: "Could narrative salience, familiarity, confirmation or survivor attention be masquerading as information?",
    required_output: "narrative-blind or matched-control attack"
  },
  temporal_integrity_guard: {
    question: "Did every feature and price exist at the exact decision timestamp?",
    required_output: "availability, publication-delay, auction and lookahead attack"
  },
  sample_independence_guard: {
    question: "Are correlated siblings, overlapping horizons, repeated issuers or dense event days being counted as independent evidence?",
    required_output: "effective-n, cluster and event-density attack"
  },
  falsification_engineer: {
    question: "What synthetic fixture or counterexample should make a bad method fail?",
    required_output: "fake-alpha and true-edge falsification fixture"
  },
  evidence_provenance_guard: {
    question: "What is observed, modeled, inferred, missing or externally sourced, and can every claim be traced?",
    required_output: "evidence-state and provenance boundary"
  }
});

function clean(value) {
  return String(value ?? "").trim();
}

function lessonFromAssignment(assignment) {
  return assignment?.item?.raw || assignment?.work || {};
}

function attackSpec(role, lesson) {
  const id = clean(lesson.lesson_id);
  const attacks = Array.isArray(lesson.attacks) ? lesson.attacks.map(clean).filter(Boolean) : [];
  const base = {
    lesson_id: id,
    role,
    principle: clean(lesson.principle),
    role_question: ROLE_ATTACKS[role]?.question || "What could make this conclusion accidentally wrong?",
    required_output: ROLE_ATTACKS[role]?.required_output || "falsifiable challenge",
    source_count: Array.isArray(lesson.sources) ? lesson.sources.length : 0,
    evidence_urls: (lesson.sources || []).map((row) => clean(row?.url)).filter(Boolean),
    inherited_attacks: attacks,
    live_trade_authority: false
  };

  if (id === "base-rate-learning") {
    return {...base, proposed_tests:[
      "complete research-trial cemetery",
      "unconditional candidate-family denominator",
      "prospective sample-readiness gate"
    ]};
  }
  if (id === "backtest-overfitting") {
    return {...base, proposed_tests:[
      "full trial-count ledger",
      "CSCV/PBO diagnostic where structurally valid",
      "purged expanding walk-forward"
    ]};
  }
  if (id === "deflated-performance") {
    return {...base, proposed_tests:[
      "deflated Sharpe exploratory diagnostic",
      "skew-kurtosis-tail receipt",
      "family-wide trial penalty"
    ]};
  }
  if (id === "implementation-shortfall") {
    return {...base, proposed_tests:[
      "decision-to-fill implementation shortfall",
      "partial/unfilled order outcome",
      "signal-decay versus execution-cost decomposition"
    ]};
  }
  if (id === "impact-volatility-frontier") {
    return {...base, proposed_tests:[
      "execution-speed grid",
      "fill-path maximum adverse excursion",
      "capital-scale invariance challenge"
    ]};
  }
  if (id === "order-flow-information") {
    return {...base, proposed_tests:[
      "spread-depth-imbalance data contract",
      "aggressive-versus-passive execution comparison",
      "missing-microstructure-state hold"
    ]};
  }
  if (id === "announcement-liquidity") {
    return {...base, proposed_tests:[
      "announcement-proximity execution stress",
      "volatility-conditioned delay stress",
      "first-tradable-price realism check"
    ]};
  }
  if (id === "auction-clock") {
    return {...base, proposed_tests:[
      "auction-near event classifier",
      "opening-cross versus continuous-session split",
      "next-open versus immediate-post-open comparison"
    ]};
  }
  if (id === "liquidity-is-multidimensional") {
    return {...base, proposed_tests:[
      "volume-is-not-liquidity negative control",
      "spread/depth/impact separate fields",
      "low-depth high-volatility stress"
    ]};
  }
  if (id === "behavioral-salience") {
    return {...base, proposed_tests:[
      "narrative-blind label permutation",
      "AI versus matched non-AI filing control",
      "semantic-label incremental-information test"
    ]};
  }
  return {...base, proposed_tests:["explicit falsification requirement"]};
}

export async function runAssignment({assignment} = {}) {
  const role = clean(assignment?.role);
  const lesson = lessonFromAssignment(assignment);
  if (!ROLE_ATTACKS[role]) throw new Error("daytrade_learning_role_unknown:" + role);
  if (!clean(lesson?.lesson_id)) throw new Error("daytrade_learning_lesson_id_required");

  return {
    schema:"evercraft.daytrade.saban-learning-assignment.v1",
    mission_id:"daytrade-market-learning-attack-001",
    agent_id:assignment?.agent_id || null,
    role,
    lesson_id:clean(lesson.lesson_id),
    lesson_title:clean(lesson.title),
    attack:attackSpec(role, lesson),
    status:"completed",
    research_only:true,
    historical_diagnostics_do_not_mutate_frozen_protocols:true,
    autonomous_funding_authority:false,
    autonomous_order_authority:false,
    live_trade_authority:false
  };
}

export function reconcile({results=[]} = {}) {
  const rows=(Array.isArray(results)?results:[])
    .map((row)=>row?.result || row)
    .filter((row)=>row?.lesson_id && row?.role);
  const roles=[...new Set(rows.map((row)=>row.role))].sort();
  const lessons=[...new Set(rows.map((row)=>row.lesson_id))].sort();
  const attackMap=new Map();

  for (const row of rows) {
    for (const test of row?.attack?.proposed_tests || []) {
      const key=clean(test);
      if(!key) continue;
      if(!attackMap.has(key)) attackMap.set(key,{
        test:key,
        lesson_ids:new Set(),
        roles:new Set()
      });
      attackMap.get(key).lesson_ids.add(row.lesson_id);
      attackMap.get(key).roles.add(row.role);
    }
  }

  const attack_queue=[...attackMap.values()]
    .map((row)=>({
      test:row.test,
      lesson_ids:[...row.lesson_ids].sort(),
      roles:[...row.roles].sort(),
      support_count:row.lesson_ids.size,
      priority:row.roles.has("falsification_engineer") || row.roles.has("overfit_red_team")
        ? "P0"
        : "P1"
    }))
    .sort((a,b)=>
      a.priority.localeCompare(b.priority) ||
      b.support_count-a.support_count ||
      a.test.localeCompare(b.test)
    );

  return {
    schema:"evercraft.daytrade.saban-learning-reconciliation.v1",
    mission_id:"daytrade-market-learning-attack-001",
    status:"reconciled",
    assignments:rows.length,
    role_count:roles.length,
    lesson_count:lessons.length,
    roles,
    lessons,
    attack_queue,
    next_action:"Feed the reconciled attack queue into DayTrade Edge Lab as exploratory falsification work without mutating frozen forward-paper protocols.",
    research_only:true,
    eligibility_mutated:false,
    autonomous_funding_authority:false,
    autonomous_order_authority:false,
    live_trade_authority:false
  };
}

export { ROLE_ATTACKS };
