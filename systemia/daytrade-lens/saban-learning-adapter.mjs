const ROLE_ATTACKS = Object.freeze({
  academic_source_hunter: {
    question: "What high-quality scholarly work should the team read next to challenge this lesson?",
    required_output: "read-only scholarly source candidates with DOI/title provenance"
  },
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

const DISCOVERY_PROFILES=Object.freeze({
  "base-rate-learning":{
    query:"day trading profitability individual traders performance persistence",
    required_groups:[["day","trading"],["profit","performance","return","skill"]],
  },
  "backtest-overfitting":{
    query:"backtest overfitting selection bias investment strategies multiple testing",
    required_groups:[["backtest","strategy","investment"],["overfit","selection","multiple","false"]],
  },
  "deflated-performance":{
    query:"deflated Sharpe ratio selection bias multiple testing non normal returns",
    required_groups:[["sharpe"],["deflat","selection","multiple","probabilistic"]],
  },
  "implementation-shortfall":{
    query:"implementation shortfall execution cost market impact equities",
    required_groups:[["execution","trading"],["cost","shortfall","impact","slippage"]],
  },
  "impact-volatility-frontier":{
    query:"optimal execution market impact volatility trading cost",
    required_groups:[["execution","trading"],["impact","volatility","cost","risk"]],
  },
  "order-flow-information":{
    query:"limit order book order flow price impact market microstructure",
    required_groups:[["order","microstructure","book"],["flow","impact","liquidity","price"]],
  },
  "announcement-liquidity":{
    query:"macroeconomic announcement liquidity bid ask spread volatility equity market",
    required_groups:[["announcement","news","macro"],["liquidity","spread","volatility","market"]],
  },
  "auction-clock":{
    query:"stock market opening auction price discovery imbalance",
    required_groups:[["auction","open","opening"],["market","price","imbalance","exchange"]],
  },
  "liquidity-is-multidimensional":{
    query:"liquidity bid ask spread market depth price impact equities",
    required_groups:[["liquidity","spread","depth"],["market","price","impact","trading"]],
  },
  "behavioral-salience":{
    query:"investor attention familiarity salience bias day trading market",
    required_groups:[["investor","trading","market"],["attention","familiarity","salience","bias"]],
  },
  "search-selection-identification":{
    query:"financial false discovery rate specification search selection bias investment research",
    required_groups:[["finance","financial","investment"],["false","discovery","selection","search","multiple"]],
  },
  "heavy-tail-dependence-inference":{
    query:"Sharpe ratio volatility clustering heavy tails dependence inference finance",
    required_groups:[["sharpe","signal"],["volatility","heavy","tail","dependence","garch"]],
  },
});

function normalizedText(value){
  return clean(value)
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .trim();
}

function discoveryProfile(lesson){
  return DISCOVERY_PROFILES[clean(lesson?.lesson_id)] || {
    query:[
      clean(lesson?.title),
      clean(lesson?.principle),
      "trading market microstructure quantitative finance",
    ].filter(Boolean).join(" "),
    required_groups:[["trading","market","finance"]],
  };
}

function relevanceForTitle(title,profile){
  const normalized=normalizedText(title);
  const groups=profile.required_groups || [];
  const matches=groups.map((group)=>
    group.some((term)=>normalized.includes(normalizedText(term)))
  );
  return {
    accepted:groups.length>0 && matches.every(Boolean),
    matched_groups:matches.filter(Boolean).length,
    required_groups:groups.length,
    score:groups.length?matches.filter(Boolean).length/groups.length:0,
  };
}

function discoveryQuery(lesson) {
  return discoveryProfile(lesson).query;
}

async function discoverScholarlySources(lesson, fetchImpl=fetch) {
  const profile=discoveryProfile(lesson);
  const query=profile.query;
  const url=new URL("https://api.crossref.org/works");
  url.searchParams.set("query.bibliographic",query);
  url.searchParams.set("rows","10");
  url.searchParams.set("select","DOI,title,publisher,published,URL,type,author");
  const response=await fetchImpl(url,{
    headers:{
      "accept":"application/json",
      "user-agent":"Evercraft-DayTrade-Learning-Lab/1.0 (research metadata discovery)"
    }
  });
  if(!response.ok) throw new Error("crossref_http_"+response.status);
  const payload=await response.json();
  const items=Array.isArray(payload?.message?.items)?payload.message.items:[];
  const reviewed=items.map((item)=>{
    const title=Array.isArray(item?.title)?clean(item.title[0]):clean(item?.title);
    const relevance=relevanceForTitle(title,profile);
    return {
      doi:clean(item?.DOI)||null,
      title,
      publisher:clean(item?.publisher)||null,
      type:clean(item?.type)||null,
      url:clean(item?.URL)||null,
      author_count:Array.isArray(item?.author)?item.author.length:0,
      publication_date_parts:
        item?.published?.["date-parts"]?.[0] || null,
      relevance,
      evidence_state:"metadata_discovered_not_reviewed",
    };
  }).filter((item)=>item.title||item.doi);
  const accepted=reviewed
    .filter((item)=>item.relevance.accepted)
    .slice(0,5);
  return {
    query,
    provider:"Crossref",
    provider_url:url.toString(),
    relevance_policy:{
      lesson_id:clean(lesson?.lesson_id),
      required_title_groups:profile.required_groups,
      all_groups_required:true,
      metadata_only:true,
    },
    candidates:accepted,
    rejected_candidate_count:reviewed.length-accepted.length,
    raw_candidate_count:reviewed.length,
  };
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
  if (id === "search-selection-identification") {
    return {...base, proposed_tests:[
      "durable lifetime research-trial cemetery",
      "reported-statistics FDR identification warning",
      "independent frozen validation over candidate-only significance"
    ]};
  }
  if (id === "heavy-tail-dependence-inference") {
    return {...base, proposed_tests:[
      "volatility-clustering and dependence diagnostic",
      "heavy-tail concentration diagnostic",
      "correlation-aware empirical null companion to DSR"
    ]};
  }
  return {...base, proposed_tests:["explicit falsification requirement"]};
}

export async function runAssignment({assignment, executionContext={}} = {}) {
  const role = clean(assignment?.role);
  const lesson = lessonFromAssignment(assignment);
  if (!ROLE_ATTACKS[role]) throw new Error("daytrade_learning_role_unknown:" + role);
  if (!clean(lesson?.lesson_id)) throw new Error("daytrade_learning_lesson_id_required");

  let sourceDiscovery=null;
  if(role==="academic_source_hunter"){
    try{
      sourceDiscovery=await discoverScholarlySources(
        lesson,
        executionContext.fetchImpl || fetch
      );
    }catch(error){
      sourceDiscovery={
        provider:"Crossref",
        status:"network_error",
        error:error instanceof Error?error.message:String(error),
        candidates:[]
      };
    }
  }

  return {
    schema:"evercraft.daytrade.saban-learning-assignment.v1",
    mission_id:"daytrade-market-learning-attack-001",
    agent_id:assignment?.agent_id || null,
    role,
    lesson_id:clean(lesson.lesson_id),
    lesson_title:clean(lesson.title),
    attack:attackSpec(role, lesson),
    source_discovery:sourceDiscovery,
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

  const discoveredByDoi=new Map();
  for(const row of rows){
    for(const candidate of row?.source_discovery?.candidates || []){
      const key=clean(candidate.doi)||clean(candidate.url)||clean(candidate.title);
      if(!key) continue;
      if(!discoveredByDoi.has(key)) discoveredByDoi.set(key,{
        ...candidate,
        discovered_from_lessons:new Set(),
      });
      discoveredByDoi.get(key).discovered_from_lessons.add(row.lesson_id);
    }
  }
  const discovered_sources=[...discoveredByDoi.values()]
    .map((row)=>({
      ...row,
      discovered_from_lessons:[...row.discovered_from_lessons].sort(),
    }))
    .sort((a,b)=>
      b.discovered_from_lessons.length-a.discovered_from_lessons.length ||
      String(a.title||"").localeCompare(String(b.title||""))
    );

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
    discovered_sources,
    discovered_source_count:discovered_sources.length,
    discovery_candidates_require_evidence_review:true,
    next_action:"Feed the reconciled attack queue into DayTrade Edge Lab as exploratory falsification work without mutating frozen forward-paper protocols.",
    research_only:true,
    eligibility_mutated:false,
    autonomous_funding_authority:false,
    autonomous_order_authority:false,
    live_trade_authority:false
  };
}

export { ROLE_ATTACKS, discoveryQuery, discoverScholarlySources };
