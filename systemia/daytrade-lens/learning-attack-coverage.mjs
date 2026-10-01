import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ATTACK_IMPLEMENTATION_MAP=Object.freeze({
  "complete research-trial cemetery":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-search-burden.mjs"],
    gap:"Current signal-family denominator is retained, but a durable lifetime ledger of every historical research configuration remains required."
  },
  "unconditional candidate-family denominator":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-search-burden.mjs"]
  },
  "prospective sample-readiness gate":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-forward-paper.mjs",
      "systemia/daytrade-lens/edge-forward-paper-cluster.mjs"
    ]
  },
  "full trial-count ledger":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-search-burden.mjs"],
    gap:"Current batch trial count exists; persistent lifetime search-history lineage remains incomplete."
  },
  "CSCV/PBO diagnostic where structurally valid":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-cscv-pbo.mjs"]
  },
  "purged expanding walk-forward":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-walk-forward.mjs"]
  },
  "deflated Sharpe exploratory diagnostic":{
    status:"missing",
    evidence:[],
    gap:"No Deflated Sharpe implementation yet."
  },
  "skew-kurtosis-tail receipt":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-breaker-lab.mjs"],
    gap:"Tail, median and winsorized diagnostics exist; explicit skew and kurtosis are not yet emitted."
  },
  "family-wide trial penalty":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-family-max-null.mjs",
      "systemia/daytrade-lens/edge-search-burden.mjs"
    ]
  },
  "decision-to-fill implementation shortfall":{
    status:"partial",
    evidence:[
      "systemia/daytrade-lens/edge-quote-microstructure.mjs",
      "systemia/daytrade-lens/edge-execution-translation.mjs"
    ],
    gap:"Quote-at-entry spread is now measured, but full decision-to-fill and exit touch reconstruction remains."
  },
  "partial/unfilled order outcome":{
    status:"missing",
    evidence:[],
    gap:"No queue-position or fill-probability model yet."
  },
  "signal-decay versus execution-cost decomposition":{
    status:"partial",
    evidence:[
      "systemia/daytrade-lens/edge-timing-fragility.mjs",
      "systemia/daytrade-lens/edge-stress-lab.mjs"
    ],
    gap:"Timing decay and cost stress are separate receipts; decomposition is not yet unified."
  },
  "execution-speed grid":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-timing-fragility.mjs"],
    gap:"Delay grid exists; participation-rate/impact execution speeds do not."
  },
  "fill-path maximum adverse excursion":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-research-factory.mjs",
      "systemia/daytrade-lens/edge-regime-fragility.mjs"
    ]
  },
  "capital-scale invariance challenge":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"],
    gap:"Historical SIP observations with quote sizes explicitly in shares now compare hypothetical order notionals against displayed marketable NBBO touch notional, but market impact, hidden liquidity, replenishment, routing and participation-rate effects remain unmodeled."
  },
  "spread-depth-imbalance data contract":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"],
    gap:"Spread, visible top-of-book size, and top-of-book size imbalance are scored on the selected feed; full depth and richer order-flow features remain unobserved."
  },
  "aggressive-versus-passive execution comparison":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"],
    gap:"Immediate marketable entry is compared with passive touch evidence from historical quotes/trades, but queue priority and order-specific fill probability remain unobserved; a touched limit is never labeled a fill."
  },
  "missing-microstructure-state hold":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"]
  },
  "announcement-proximity execution stress":{
    status:"partial",
    evidence:[
      "systemia/daytrade-lens/edge-event-contamination.mjs",
      "systemia/daytrade-lens/edge-clock-structure.mjs"
    ],
    gap:"Calendar/clock contamination exists; quote-cost response conditional on announcement proximity remains."
  },
  "volatility-conditioned delay stress":{
    status:"partial",
    evidence:[
      "systemia/daytrade-lens/edge-regime-fragility.mjs",
      "systemia/daytrade-lens/edge-timing-fragility.mjs"
    ],
    gap:"Both dimensions exist, but their interaction is not yet crossed."
  },
  "first-tradable-price realism check":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"]
  },
  "auction-near event classifier":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-research-factory.mjs",
      "systemia/daytrade-lens/edge-clock-structure.mjs"
    ]
  },
  "opening-cross versus continuous-session split":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-clock-structure.mjs"]
  },
  "next-open versus immediate-post-open comparison":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-timing-fragility.mjs",
      "systemia/daytrade-lens/edge-clock-structure.mjs"
    ]
  },
  "volume-is-not-liquidity negative control":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-research-factory.mjs",
      "systemia/daytrade-lens/edge-quote-microstructure.mjs"
    ]
  },
  "spread/depth/impact separate fields":{
    status:"partial",
    evidence:["systemia/daytrade-lens/edge-quote-microstructure.mjs"],
    gap:"Spread and top-of-book size are observable; impact remains unmeasured."
  },
  "low-depth high-volatility stress":{
    status:"partial",
    evidence:[
      "systemia/daytrade-lens/edge-research-factory.mjs",
      "systemia/daytrade-lens/edge-quote-microstructure.mjs"
    ],
    gap:"Realized volatility is crossed with visible top-of-book size and quote-adjusted entry returns, but visible touch size is not full market depth."
  },
  "narrative-blind label permutation":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-label-permutation.mjs",
      "systemia/daytrade-lens/edge-narrative-blind-control.mjs"
    ]
  },
  "AI versus matched non-AI filing control":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-narrative-blind-control.mjs"]
  },
  "semantic-label incremental-information test":{
    status:"implemented",
    evidence:["systemia/daytrade-lens/edge-narrative-blind-control.mjs"]
  },
  "explicit falsification requirement":{
    status:"implemented",
    evidence:[
      "systemia/daytrade-lens/edge-breaker-lab.mjs",
      "systemia/daytrade-lens/edge-adversarial-fixtures.test.mjs"
    ]
  }
});

export function reconcileLearningAttackCoverage(sabanReceipt){
  const attacks=sabanReceipt?.reconciliation?.attack_queue||[];
  const rows=attacks.map((attack)=>{
    const mapped=ATTACK_IMPLEMENTATION_MAP[attack.test]||{
      status:"missing",
      evidence:[],
      gap:"No implementation mapping exists for this reconciled attack."
    };
    return {
      ...attack,
      implementation_status:mapped.status,
      implementation_evidence:[...(mapped.evidence||[])],
      remaining_gap:mapped.gap||null,
    };
  });
  const counts={implemented:0,partial:0,missing:0};
  for(const row of rows){
    const key=Object.prototype.hasOwnProperty.call(counts,row.implementation_status)
      ?row.implementation_status
      :"missing";
    counts[key]+=1;
  }
  const frontier=rows
    .filter((row)=>row.implementation_status!=="implemented")
    .sort((a,b)=>
      a.priority.localeCompare(b.priority) ||
      (a.implementation_status==="missing"?-1:1) -
      (b.implementation_status==="missing"?-1:1) ||
      b.support_count-a.support_count ||
      a.test.localeCompare(b.test)
    );

  return {
    schema:"evercraft.daytrade.learning-attack-coverage.v1",
    generated_at:new Date().toISOString(),
    mission_id:sabanReceipt?.reconciliation?.mission_id||null,
    source_saban_schema:sabanReceipt?.schema||null,
    attack_count:rows.length,
    counts,
    coverage_ratio:rows.length?counts.implemented/rows.length:0,
    attacks:rows,
    frontier,
    next_frontier:frontier[0]||null,
    mapping_is_explicit_not_inferred:true,
    historical_diagnostics_do_not_mutate_frozen_protocols:true,
    autonomous_order_authority:false,
    live_trade_authority:false,
  };
}

async function main(){
  const argv=process.argv.slice(2);
  const value=(flag)=>{
    const i=argv.indexOf(flag);
    return i>=0?argv[i+1]:null;
  };
  const receiptPath=value("--receipt");
  const outPath=value("--out");
  if(!receiptPath) throw new Error("--receipt_required");
  if(!outPath) throw new Error("--out_required");
  const receipt=JSON.parse(fs.readFileSync(path.resolve(receiptPath),"utf8"));
  const result=reconcileLearningAttackCoverage(receipt);
  fs.mkdirSync(path.dirname(path.resolve(outPath)),{recursive:true});
  fs.writeFileSync(path.resolve(outPath),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({
    attack_count:result.attack_count,
    counts:result.counts,
    coverage_ratio:result.coverage_ratio,
    next_frontier:result.next_frontier?.test||null,
  }));
}

if(import.meta.url===pathToFileURL(process.argv[1]||"").href){
  main().catch((error)=>{
    console.error(error);
    process.exitCode=1;
  });
}
