import crypto from 'node:crypto';
import {
  bootstrapEdge,
  originBalancedBootstrap,
  costStress,
  rollingWindowStress,
  permutationNullTest,
} from './edge-stress-lab.mjs';
import {
  DEFAULT_RISK,
  riskGate,
  runAdversarialDrills,
} from './practice-camp.mjs';

export const DAYTRADE_LENS_MCP = Object.freeze({
  slug: 'daytrade-lens',
  path: '/mcp/daytrade-lens',
  server_name: 'evercraft-daytrade-lens',
  title: 'DayTrade Lens',
  version: '0.1.0',
  truth_boundary: 'Research and paper-practice computation only. No personalized investment advice, brokerage access, order placement, autonomous trading, live-trading authority, performance guarantee, payment authority, or claim that a strategy has a real-world edge. Stress-test results describe only the caller-supplied sample and declared assumptions.',
});

const SAFE_ANNOTATIONS=Object.freeze({
  readOnlyHint:true,
  destructiveHint:false,
  idempotentHint:true,
  openWorldHint:false,
});

function rpcResult(id,result){ return {jsonrpc:'2.0',id:id??null,result}; }
function rpcError(id,code,message){ return {jsonrpc:'2.0',id:id??null,error:{code,message}}; }
function toolResult(payload){
  return {
    content:[{type:'text',text:JSON.stringify(payload,null,2)}],
    structuredContent:payload,
    isError:false,
  };
}
function finite(value,name,{min=-Infinity,max=Infinity}={}){
  const n=Number(value);
  if(!Number.isFinite(n)) throw new Error(name+'_must_be_finite');
  if(n<min||n>max) throw new Error(name+'_out_of_range');
  return n;
}
function integer(value,name,{min,max}){
  const n=finite(value,name,{min,max});
  if(!Number.isInteger(n)) throw new Error(name+'_must_be_integer');
  return n;
}
function hash(value){
  return 'sha256:'+crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function uniqueNumbers(values){
  return [...new Set(values.map(Number).filter(Number.isFinite))].sort((a,b)=>a-b);
}
function syntheticObservedAt(index){
  return new Date(index*1000).toISOString();
}

export function dayTradeLensTools(){
  return [
    {
      name:'get_daytrade_lens_capabilities',
      title:'Get DayTrade Lens machine capabilities',
      description:'Return the current bounded DayTrade Lens research and paper-practice machine surface and its safety/truth boundaries. Read-only.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:SAFE_ANNOTATIONS,
    },
    {
      name:'run_daytrade_risk_gate',
      title:'Run the DayTrade Lens paper-practice risk gate',
      description:'Evaluate caller-supplied paper-practice conditions against the current DayTrade Lens risk discipline gate. This does not place an order or recommend a trade.',
      inputSchema:{
        type:'object',
        required:[
          'data_source',
          'source_age_seconds',
          'reward_risk_ratio',
          'planned_risk_dollars',
          'trades_today',
          'open_position'
        ],
        properties:{
          data_source:{type:'string',minLength:1,maxLength:120,description:'Label for the data source used by the caller. MOCK is rejected by the practice gate.'},
          source_age_seconds:{type:'number',minimum:0,maximum:86400,description:'Age of the caller-supplied market-data observation in seconds.'},
          stale_after_seconds:{type:'number',minimum:1,maximum:86400,default:15,description:'Caller-selected staleness ceiling. Defaults to the DayTrade Lens practice value of 15 seconds.'},
          reward_risk_ratio:{type:'number',minimum:0,maximum:100,description:'Planned reward-to-risk ratio for the paper-practice setup.'},
          planned_risk_dollars:{type:'number',minimum:0,maximum:1000000,description:'Planned paper-practice dollar risk. The current default practice account is deliberately tiny and the gate enforces its configured limit.'},
          trades_today:{type:'integer',minimum:0,maximum:10000,description:'Number of paper-practice trades already taken in the session.'},
          open_position:{type:'boolean',description:'Whether the paper-practice session currently has an open position.'}
        },
        additionalProperties:false,
      },
      annotations:SAFE_ANNOTATIONS,
    },
    {
      name:'run_daytrade_adversarial_drills',
      title:'Run DayTrade Lens risk-control adversarial drills',
      description:'Exercise the built-in paper-practice safety gates against stale data, mock data, risk overruns, poor reward/risk, trade-count limits, and overlapping-position cases. No live market or brokerage action occurs.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:SAFE_ANNOTATIONS,
    },
    {
      name:'stress_test_return_series',
      title:'Stress-test a caller-supplied strategy return series',
      description:'Run bootstrap, cost, rolling-window, and permutation-null tests over caller-supplied strategy and optional benchmark returns. The output never claims a tradable edge and grants no live-trading authority.',
      inputSchema:{
        type:'object',
        required:['strategy_returns'],
        properties:{
          strategy_returns:{
            type:'array',minItems:2,maxItems:2000,
            items:{type:'number',minimum:-1,maximum:20},
            description:'Ordered decimal returns from the caller, for example 0.01 for +1%. These are treated as caller-supplied evidence, not independently verified market observations.'
          },
          benchmark_returns:{
            type:'array',minItems:2,maxItems:2000,
            items:{type:'number',minimum:-1,maximum:20},
            description:'Optional ordered benchmark returns aligned one-for-one with strategy_returns. Omit to use a zero benchmark.'
          },
          origin_refs:{
            type:'array',minItems:2,maxItems:2000,
            items:{type:'string',minLength:1,maxLength:200},
            description:'Optional evidence-origin identifiers aligned one-for-one with returns. Origin-balanced bootstrap is run only when every row has a supplied origin reference.'
          },
          expected_direction:{
            type:'string',enum:['positive','negative'],default:'positive',
            description:'Direction being tested. Negative tests whether negative excess returns are consistently present.'
          },
          transaction_cost_bps:{
            type:'number',minimum:0,maximum:500,default:5,
            description:'Round-trip cost assumption in basis points used in the primary bootstrap and rolling-window stress.'
          },
          bootstrap_iterations:{
            type:'integer',minimum:100,maximum:5000,default:2000,
            description:'Bootstrap iterations.'
          },
          null_iterations:{
            type:'integer',minimum:100,maximum:5000,default:2000,
            description:'Permutation-null iterations.'
          }
        },
        additionalProperties:false,
      },
      annotations:SAFE_ANNOTATIONS,
    },
  ];
}

export function runDayTradeReturnStress(args={}){
  if(!Array.isArray(args.strategy_returns)) throw new Error('strategy_returns_required');
  if(args.strategy_returns.length<2||args.strategy_returns.length>2000) throw new Error('strategy_returns_length_invalid');

  const strategy=args.strategy_returns.map((value,index)=>finite(value,'strategy_returns_'+index,{min:-1,max:20}));
  let benchmark;
  if(args.benchmark_returns===undefined){
    benchmark=strategy.map(()=>0);
  }else{
    if(!Array.isArray(args.benchmark_returns)||args.benchmark_returns.length!==strategy.length){
      throw new Error('benchmark_returns_must_match_strategy_returns');
    }
    benchmark=args.benchmark_returns.map((value,index)=>finite(value,'benchmark_returns_'+index,{min:-1,max:20}));
  }

  let origins=null;
  if(args.origin_refs!==undefined){
    if(!Array.isArray(args.origin_refs)||args.origin_refs.length!==strategy.length){
      throw new Error('origin_refs_must_match_strategy_returns');
    }
    origins=args.origin_refs.map((value,index)=>{
      const out=String(value??'').trim();
      if(!out||out.length>200) throw new Error('origin_ref_'+index+'_invalid');
      return out;
    });
  }

  const expectedDirection=args.expected_direction||'positive';
  if(!['positive','negative'].includes(expectedDirection)) throw new Error('expected_direction_invalid');
  const expectedSign=expectedDirection==='negative'?-1:1;
  const transactionCostBps=finite(args.transaction_cost_bps??5,'transaction_cost_bps',{min:0,max:500});
  const bootstrapIterations=integer(args.bootstrap_iterations??2000,'bootstrap_iterations',{min:100,max:5000});
  const nullIterations=integer(args.null_iterations??2000,'null_iterations',{min:100,max:5000});

  const rows=strategy.map((forward_return,index)=>({
    forward_return,
    benchmark_return:benchmark[index],
    observed_at:syntheticObservedAt(index),
    origin_entity_ref:origins?origins[index]:null,
  }));

  const seedBase=hash({
    strategy_returns:strategy,
    benchmark_returns:benchmark,
    origin_refs:origins,
    expected_direction:expectedDirection,
    transaction_cost_bps:transactionCostBps,
  });

  const bootstrap=bootstrapEdge(rows,{
    expected_sign:expectedSign,
    transaction_cost_bps:transactionCostBps,
    iterations:bootstrapIterations,
    seed:seedBase+':bootstrap',
  });
  const originBalanced=origins?originBalancedBootstrap(rows,{
    expected_sign:expectedSign,
    transaction_cost_bps:transactionCostBps,
    iterations:bootstrapIterations,
    seed:seedBase+':origin',
  }):null;
  const costs=uniqueNumbers([transactionCostBps,5,10,20,40,75]).filter((x)=>x<=500);
  const cost=costStress(rows,{expected_sign:expectedSign,costs_bps:costs});
  const rolling=rollingWindowStress(rows,{
    expected_sign:expectedSign,
    transaction_cost_bps:transactionCostBps,
    minimum_window:Math.min(15,Math.max(2,Math.floor(rows.length/2))),
  });
  const nullTest=permutationNullTest(rows,{
    expected_sign:expectedSign,
    transaction_cost_bps:transactionCostBps,
    iterations:nullIterations,
    seed:seedBase+':null',
  });

  const primaryCost=cost.find((row)=>row.transaction_cost_bps===transactionCostBps);
  const checks={
    bootstrap_p05_positive:bootstrap.p05>0,
    survives_declared_cost:Boolean(primaryCost&&primaryCost.mean_signed_net>0),
    rolling_positive_rate_at_least_75pct:rolling.positive_rate>=0.75,
    permutation_null_p_below_05:nullTest.null_p_value<0.05,
    origin_balanced_p05_positive:originBalanced?originBalanced.p05>0:null,
  };
  const required=[
    checks.bootstrap_p05_positive,
    checks.survives_declared_cost,
    checks.rolling_positive_rate_at_least_75pct,
    checks.permutation_null_p_below_05,
    ...(originBalanced?[checks.origin_balanced_p05_positive]:[]),
  ];
  const status=required.every(Boolean)
    ? 'RESEARCH_SIGNAL_SURVIVED_DECLARED_TESTS'
    : 'RESEARCH_MORE_REQUIRED';

  const result={
    schema:'evercraft.daytrade-lens.return-stress.v1',
    sample:{
      observations:rows.length,
      expected_direction:expectedDirection,
      benchmark_supplied:args.benchmark_returns!==undefined,
      origin_refs_supplied:Boolean(origins),
      ordering:'caller_sequence',
      temporal_claim:false,
    },
    assumptions:{
      transaction_cost_bps:transactionCostBps,
      bootstrap_iterations:bootstrapIterations,
      null_iterations:nullIterations,
    },
    bootstrap,
    origin_balanced_bootstrap:originBalanced,
    cost_stress:cost,
    rolling_window_stress:rolling,
    permutation_null:nullTest,
    checks,
    status,
    edge_claimed:false,
    live_trade_authority:false,
    personalized_investment_advice:false,
    broker_action_taken:false,
    external_action_taken:false,
    evidence_state:'modeled_from_caller_supplied_return_series',
    uncertainty:[
      'Caller-supplied returns are not independently verified by this tool.',
      'Passing statistical checks on a supplied sample does not establish future profitability or a real-world tradable edge.',
      ...(origins?[]:['Origin-balanced robustness is not tested because origin_refs were not supplied.']),
      'Sequence order is preserved, but the tool makes no claim that synthetic internal ordering timestamps are real market timestamps.'
    ],
    truth_boundary:DAYTRADE_LENS_MCP.truth_boundary,
  };
  return {
    ...result,
    receipt_id:hash({
      schema:result.schema,
      sample:result.sample,
      assumptions:result.assumptions,
      bootstrap:result.bootstrap,
      origin_balanced_bootstrap:result.origin_balanced_bootstrap,
      cost_stress:result.cost_stress,
      rolling_window_stress:result.rolling_window_stress,
      permutation_null:result.permutation_null,
      checks:result.checks,
      status:result.status,
    }),
  };
}

export async function executeDayTradeLensRpc(rpc){
  const method=String(rpc?.method||'');
  const id=rpc?.id??null;

  if(method==='initialize'){
    return rpcResult(id,{
      protocolVersion:'2025-03-26',
      capabilities:{tools:{}},
      serverInfo:{name:DAYTRADE_LENS_MCP.server_name,version:DAYTRADE_LENS_MCP.version},
      instructions:DAYTRADE_LENS_MCP.truth_boundary,
    });
  }
  if(method==='tools/list') return rpcResult(id,{tools:dayTradeLensTools()});
  if(method==='notifications/initialized') return null;

  if(method==='tools/call'){
    const tool=String(rpc?.params?.name||'');
    const args=rpc?.params?.arguments||{};

    try{
      if(tool==='get_daytrade_lens_capabilities'){
        return rpcResult(id,toolResult({
          ok:true,
          product:DAYTRADE_LENS_MCP.title,
          machine_surface:'read_only_research_and_paper_practice',
          tools:dayTradeLensTools().map((item)=>item.name),
          default_practice_risk:DEFAULT_RISK,
          live_trade_authority:false,
          broker_access:false,
          order_placement:false,
          autonomous_trading:false,
          payment_authority:false,
          external_action_taken:false,
          truth_boundary:DAYTRADE_LENS_MCP.truth_boundary,
        }));
      }

      if(tool==='run_daytrade_risk_gate'){
        const gate=riskGate({
          data_source:String(args.data_source||'').trim(),
          source_age_seconds:finite(args.source_age_seconds,'source_age_seconds',{min:0,max:86400}),
          stale_after_seconds:finite(args.stale_after_seconds??15,'stale_after_seconds',{min:1,max:86400}),
          reward_risk_ratio:finite(args.reward_risk_ratio,'reward_risk_ratio',{min:0,max:100}),
          planned_risk_dollars:finite(args.planned_risk_dollars,'planned_risk_dollars',{min:0,max:1000000}),
          trades_today:integer(args.trades_today,'trades_today',{min:0,max:10000}),
          open_position:args.open_position===true,
        },DEFAULT_RISK);
        return rpcResult(id,toolResult({
          ok:true,
          product:DAYTRADE_LENS_MCP.title,
          schema:'evercraft.daytrade-lens.paper-risk-gate.v1',
          gate,
          risk_policy:DEFAULT_RISK,
          live_trade_authority:false,
          broker_action_taken:false,
          external_action_taken:false,
          truth_boundary:DAYTRADE_LENS_MCP.truth_boundary,
        }));
      }

      if(tool==='run_daytrade_adversarial_drills'){
        const drills=runAdversarialDrills(DEFAULT_RISK);
        return rpcResult(id,toolResult({
          ok:true,
          product:DAYTRADE_LENS_MCP.title,
          schema:'evercraft.daytrade-lens.adversarial-risk-drills.v1',
          drills,
          all_expected_controls_held:drills.every((row)=>row.passed===true),
          live_trade_authority:false,
          broker_action_taken:false,
          external_action_taken:false,
          truth_boundary:DAYTRADE_LENS_MCP.truth_boundary,
        }));
      }

      if(tool==='stress_test_return_series'){
        return rpcResult(id,toolResult({
          ok:true,
          product:DAYTRADE_LENS_MCP.title,
          ...runDayTradeReturnStress(args),
        }));
      }

      return rpcError(id,-32602,'Unknown or unsupported DayTrade Lens tool.');
    }catch(error){
      return rpcError(id,-32602,error instanceof Error?error.message:'invalid_daytrade_lens_request');
    }
  }

  return rpcError(id,-32601,'Method not found.');
}
