import type { Express, Request, Response } from 'express';

export const SYSTEMIA_REMOTE_OPS_PATH = '/mcp/systemia-remote-ops';
const VERSION = 'systemia-remote-ops-yard-v0.2.0';

type JsonRpc = { jsonrpc?: string; id?: unknown; method?: string; params?: any };
type DecisionRoute = { decision_type: string; state: string; runnable: boolean; tool: string; note: string };

function jsonRpc(id: unknown, result: unknown) { return { jsonrpc: '2.0', id: id ?? null, result }; }
function jsonRpcError(id: unknown, code: number, message: string) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message } }; }
function toolResult(id: unknown, payload: unknown) {
  return jsonRpc(id, { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], structuredContent: payload, isError: false });
}
function normalizeIntent(value: unknown) { return String(value ?? '').trim().toLowerCase().slice(0, 5000); }

export function classifyBusinessDecision(intentRaw: unknown): DecisionRoute {
  const intent = normalizeIntent(intentRaw);
  const has = (...terms: string[]) => terms.some((term) => intent.includes(term));
  if (has('price','pricing','what should i charge','raise my rate','lower my rate','change my rate')) return {
    decision_type:'pricing', state:'native_deterministic_simulation', runnable:true, tool:'simulate_pricing_change',
    note:'Pricing has a dedicated simplified scenario model.'
  };
  if (has('hire','employee','staff','headcount','layoff','restructur')) return {
    decision_type:'hiring_or_staffing', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Supply expected revenue and recurring-cost changes rather than treating staffing outcomes as known.'
  };
  if (has('new product','new service','add a service','remove a service','launch a product','launch a service')) return {
    decision_type:'product_or_service', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Supply expected revenue, margin, recurring-cost and one-time-cash assumptions.'
  };
  if (has('expand','new location','new market','new territory','second location','another location')) return {
    decision_type:'expansion', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Expansion is simulated from user-supplied operating and cash assumptions.'
  };
  if (has('buy a business','acquire','acquisition','sell my business','sell the business','business sale')) return {
    decision_type:'business_transaction', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Transaction simulation is arithmetic scenario analysis only, not valuation, diligence, tax, legal, securities or financing advice.'
  };
  if (has('partner','partnership','ownership change','equity partner')) return {
    decision_type:'partnership_or_ownership', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Model only operational and cash assumptions supplied by the user. Ownership and legal consequences are outside this tool.'
  };
  if (has('equipment','vehicle','machine','capital purchase','buy this asset','lease this')) return {
    decision_type:'capital_purchase', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Model the purchase from explicit one-time cash, debt-service and operating assumptions.'
  };
  if (has('start a business','starting a business','new business','business idea','launch a business')) return {
    decision_type:'startup', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'Use a zero or early-stage baseline and explicit scenario assumptions. The tool does not infer market demand.'
  };
  return {
    decision_type:'other_business_decision', state:'native_assumption_driven_simulation', runnable:true, tool:'simulate_business_scenario',
    note:'General business decisions can be compared when the caller supplies the financial and operating assumption deltas.'
  };
}

function finiteNumber(value: unknown, field: string, options: { min?: number; max?: number } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(field + ' must be a finite number');
  if (options.min != null && number < options.min) throw new Error(field + ' must be >= ' + options.min);
  if (options.max != null && number > options.max) throw new Error(field + ' must be <= ' + options.max);
  return number;
}
function round2(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function retentionHeuristic(changePercent: number) {
  const abs = Math.abs(changePercent);
  let retention = abs < 5 ? 0.97 : abs < 10 ? 0.94 : abs < 20 ? 0.88 : 0.78;
  if (changePercent < 0) retention = Math.min(1, retention + 0.05);
  return retention;
}
function pricingRisk(changePercent: number) {
  const abs = Math.abs(changePercent);
  return abs < 10 ? 'Low' : abs < 20 ? 'Medium' : 'High';
}

export function simulatePricingChange(args: any) {
  const industry = String(args?.industry || 'Business').trim().slice(0, 200) || 'Business';
  const currentPrice = finiteNumber(args?.current_price, 'current_price', { min: 0 });
  const customers = finiteNumber(args?.customers_per_month, 'customers_per_month', { min: 0 });
  const changePercent = finiteNumber(args?.price_change_percent, 'price_change_percent', { min: -95, max: 500 });
  const newPrice = currentPrice * (1 + changePercent / 100);
  const retention = retentionHeuristic(changePercent);
  const newCustomers = Math.round(customers * retention);
  const currentRevenue = currentPrice * customers;
  const projectedRevenue = newPrice * newCustomers;
  const revenueDelta = projectedRevenue - currentRevenue;
  const revenueDeltaPercent = currentRevenue > 0 ? (revenueDelta / currentRevenue) * 100 : 0;
  return {
    schema:'systemia.remote-ops.pricing-simulation.v1', modeled:true, model_type:'simplified_heuristic', industry,
    current_state:{ price:round2(currentPrice), customers_per_month:round2(customers), monthly_revenue:round2(currentRevenue) },
    scenario_state:{ price:round2(newPrice), customers_per_month:newCustomers, monthly_revenue:round2(projectedRevenue), assumed_customer_retention_percent:round2(retention*100) },
    delta:{ monthly_revenue:round2(revenueDelta), monthly_revenue_percent:round2(revenueDeltaPercent) },
    risk_band:pricingRisk(changePercent), confidence:'low',
    assumptions:[
      'Customer retention is a transparent simplified heuristic based only on the size and direction of the proposed price change.',
      'The model does not use business-specific historical elasticity, competitor response, seasonality, acquisition changes, capacity changes, or cost changes.',
      'The scenario is arithmetic decision support, not a forecast or guarantee.'
    ],
    falsification_plan:'If the business changes pricing, compare actual customer count and revenue against the scenario over a defined review period and revise the retention assumption when observed results diverge.',
    external_action_taken:false, production_mutation_enabled:false
  };
}

export function simulateBusinessScenario(args: any) {
  const baseline=args?.baseline||{}; const adjustments=args?.adjustments||{};
  const monthlyRevenue=finiteNumber(baseline.monthly_revenue,'baseline.monthly_revenue',{min:0});
  const grossMarginPercent=finiteNumber(baseline.gross_margin_percent,'baseline.gross_margin_percent',{min:0,max:100});
  const fixedCosts=finiteNumber(baseline.fixed_costs_monthly??0,'baseline.fixed_costs_monthly',{min:0});
  const payroll=finiteNumber(baseline.payroll_monthly??0,'baseline.payroll_monthly',{min:0});
  const otherCosts=finiteNumber(baseline.other_monthly_costs??0,'baseline.other_monthly_costs',{min:0});
  const cashOnHand=finiteNumber(baseline.cash_on_hand??0,'baseline.cash_on_hand',{min:0});
  const revenueChangePercent=finiteNumber(adjustments.revenue_change_percent??0,'adjustments.revenue_change_percent',{min:-100,max:1000});
  const marginChangePoints=finiteNumber(adjustments.gross_margin_change_points??0,'adjustments.gross_margin_change_points',{min:-100,max:100});
  const fixedCostDelta=finiteNumber(adjustments.fixed_cost_delta_monthly??0,'adjustments.fixed_cost_delta_monthly');
  const payrollDelta=finiteNumber(adjustments.payroll_delta_monthly??0,'adjustments.payroll_delta_monthly');
  const otherCostDelta=finiteNumber(adjustments.other_cost_delta_monthly??0,'adjustments.other_cost_delta_monthly');
  const debtServiceDelta=finiteNumber(adjustments.debt_service_delta_monthly??0,'adjustments.debt_service_delta_monthly');
  const oneTimeCashOutlay=finiteNumber(adjustments.one_time_cash_outlay??0,'adjustments.one_time_cash_outlay',{min:0});

  const baselineGrossProfit=monthlyRevenue*(grossMarginPercent/100);
  const baselineRecurringCosts=fixedCosts+payroll+otherCosts;
  const baselineContribution=baselineGrossProfit-baselineRecurringCosts;
  const scenarioRevenue=monthlyRevenue*(1+revenueChangePercent/100);
  const scenarioMarginPercent=clamp(grossMarginPercent+marginChangePoints,0,100);
  const scenarioMarginRate=scenarioMarginPercent/100;
  const scenarioFixedCosts=Math.max(0,fixedCosts+fixedCostDelta);
  const scenarioPayroll=Math.max(0,payroll+payrollDelta);
  const scenarioOtherCosts=Math.max(0,otherCosts+otherCostDelta);
  const scenarioDebtService=Math.max(0,debtServiceDelta);
  const scenarioGrossProfit=scenarioRevenue*scenarioMarginRate;
  const scenarioRecurringCosts=scenarioFixedCosts+scenarioPayroll+scenarioOtherCosts+scenarioDebtService;
  const scenarioContribution=scenarioGrossProfit-scenarioRecurringCosts;
  const cashAfterOutlay=cashOnHand-oneTimeCashOutlay;
  const runwayMonths=scenarioContribution<0?Math.max(0,cashAfterOutlay)/Math.abs(scenarioContribution):null;
  const breakEvenRevenue=scenarioMarginRate>0?scenarioRecurringCosts/scenarioMarginRate:null;

  return {
    schema:'systemia.remote-ops.business-scenario.v1', modeled:true, model_type:'user_assumption_arithmetic',
    scenario_label:String(args?.scenario_label||'Scenario').trim().slice(0,200)||'Scenario',
    decision_type:classifyBusinessDecision(args?.decision_intent||'').decision_type,
    baseline:{
      monthly_revenue:round2(monthlyRevenue), gross_margin_percent:round2(grossMarginPercent),
      monthly_gross_profit:round2(baselineGrossProfit), recurring_costs_monthly:round2(baselineRecurringCosts),
      operating_contribution_monthly:round2(baselineContribution), cash_on_hand:round2(cashOnHand)
    },
    scenario:{
      monthly_revenue:round2(scenarioRevenue), gross_margin_percent:round2(scenarioMarginPercent),
      monthly_gross_profit:round2(scenarioGrossProfit), recurring_costs_monthly:round2(scenarioRecurringCosts),
      operating_contribution_monthly:round2(scenarioContribution), cash_after_one_time_outlay:round2(cashAfterOutlay),
      break_even_monthly_revenue:breakEvenRevenue==null?null:round2(breakEvenRevenue),
      runway_months_if_operating_contribution_negative:runwayMonths==null?null:round2(runwayMonths)
    },
    delta:{
      monthly_revenue:round2(scenarioRevenue-monthlyRevenue), monthly_gross_profit:round2(scenarioGrossProfit-baselineGrossProfit),
      recurring_costs_monthly:round2(scenarioRecurringCosts-baselineRecurringCosts),
      operating_contribution_monthly:round2(scenarioContribution-baselineContribution), cash_immediate:round2(-oneTimeCashOutlay)
    },
    assumptions_echo:{
      revenue_change_percent:round2(revenueChangePercent), gross_margin_change_points:round2(marginChangePoints),
      fixed_cost_delta_monthly:round2(fixedCostDelta), payroll_delta_monthly:round2(payrollDelta),
      other_cost_delta_monthly:round2(otherCostDelta), debt_service_delta_monthly:round2(debtServiceDelta),
      one_time_cash_outlay:round2(oneTimeCashOutlay)
    },
    confidence:'depends_on_user_assumptions',
    truth_boundary:'Systemia only performed arithmetic on the supplied assumptions. It did not infer demand, customer behavior, financing approval, valuation, legal consequences, tax consequences, competitor response, staffing performance or market outcomes.',
    external_action_taken:false, production_mutation_enabled:false
  };
}

function tools() {
  return [
    { name:'route_business_decision', title:'Route a consequential business decision',
      description:'Use first when a user is considering starting a business, pricing, staffing, a product/service change, expansion, a major capital purchase, partnership, acquisition, buying or selling a business, or another consequential move. Returns the smallest Systemia simulation lane without changing the real business.',
      inputSchema:{type:'object',required:['intent'],properties:{intent:{type:'string',minLength:3,maxLength:5000}},additionalProperties:false},
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false} },
    { name:'simulate_pricing_change', title:'Simulate a pricing change',
      description:'Run a transparent simplified pricing scenario. The customer-retention value is a heuristic assumption, not a business-specific prediction.',
      inputSchema:{type:'object',required:['current_price','customers_per_month','price_change_percent'],properties:{industry:{type:'string'},current_price:{type:'number',minimum:0},customers_per_month:{type:'number',minimum:0},price_change_percent:{type:'number',minimum:-95,maximum:500}},additionalProperties:false},
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false} },
    { name:'simulate_business_scenario', title:'Simulate a business scenario from explicit assumptions',
      description:'Compare a baseline business with a proposed scenario using only user-supplied financial and operating deltas. Useful for startup, hiring, product/service, expansion, acquisition, partnership, capital-purchase and other decisions. This tool does not infer market outcomes.',
      inputSchema:{type:'object',required:['baseline'],properties:{
        scenario_label:{type:'string'},decision_intent:{type:'string'},
        baseline:{type:'object',required:['monthly_revenue','gross_margin_percent'],properties:{monthly_revenue:{type:'number',minimum:0},gross_margin_percent:{type:'number',minimum:0,maximum:100},fixed_costs_monthly:{type:'number',minimum:0},payroll_monthly:{type:'number',minimum:0},other_monthly_costs:{type:'number',minimum:0},cash_on_hand:{type:'number',minimum:0}},additionalProperties:false},
        adjustments:{type:'object',properties:{revenue_change_percent:{type:'number',minimum:-100,maximum:1000},gross_margin_change_points:{type:'number',minimum:-100,maximum:100},fixed_cost_delta_monthly:{type:'number'},payroll_delta_monthly:{type:'number'},other_cost_delta_monthly:{type:'number'},debt_service_delta_monthly:{type:'number'},one_time_cash_outlay:{type:'number',minimum:0}},additionalProperties:false}
      },additionalProperties:false},
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false} },
    { name:'get_decision_lab_capabilities', title:'Get Systemia Remote Ops capabilities',
      description:'Return the current native Yard decision-simulation boundary and truth conditions.',
      inputSchema:{type:'object',properties:{},additionalProperties:false},
      annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false} }
  ];
}

export async function executeSystemiaRemoteOpsRpc(rpc: JsonRpc) {
  const method=String(rpc?.method||''); const id=rpc?.id??null;
  if(method==='initialize') return jsonRpc(id,{protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'systemia-remote-ops',version:VERSION},instructions:'Systemia Remote Ops is a read-only business decision laboratory. Simulate first, preserve assumptions and uncertainty, and leave real-world execution to the human.'});
  if(method==='tools/list') return jsonRpc(id,{tools:tools()});
  if(method==='notifications/initialized') return null;
  if(method!=='tools/call') return jsonRpcError(id,-32601,'Method not found.');
  const name=String(rpc?.params?.name||''); const args=rpc?.params?.arguments||{};
  try {
    if(name==='route_business_decision'){
      const intent=String(args.intent||'').trim();
      if(intent.length<3) return jsonRpcError(id,-32602,'intent must be at least 3 characters');
      return toolResult(id,{ok:true,product:'Systemia Remote Ops',...classifyBusinessDecision(intent),operating_pattern:'simulate first -> decide -> execute',external_action_taken:false,production_mutation_enabled:false});
    }
    if(name==='simulate_pricing_change') return toolResult(id,{ok:true,product:'Systemia Remote Ops',simulation:simulatePricingChange(args)});
    if(name==='simulate_business_scenario') return toolResult(id,{ok:true,product:'Systemia Remote Ops',simulation:simulateBusinessScenario(args)});
    if(name==='get_decision_lab_capabilities') return toolResult(id,{ok:true,product:'Systemia Remote Ops',version:VERSION,runtime:'yard_evercraft_compute',tools:tools().map((tool)=>tool.name),lanes:[
      {lane:'pricing',state:'native_deterministic_simulation',tool:'simulate_pricing_change'},
      {lane:'general_business_scenario',state:'native_assumption_driven_simulation',tool:'simulate_business_scenario'},
      {lane:'decision_routing',state:'native_read_only',tool:'route_business_decision'}
    ],production_mutation_enabled:false,payment_enabled:false,external_action_taken:false,truth_boundary:'Modeled outputs are decision support. Systemia does not guarantee results or authorize real-world business actions.'});
    return jsonRpcError(id,-32602,'Unknown or unsupported Systemia Remote Ops tool.');
  } catch(error) {
    return jsonRpcError(id,-32602,error instanceof Error?error.message:'Invalid simulation input.');
  }
}

export function registerSystemiaRemoteOpsMcp(app: Express) {
  app.get(SYSTEMIA_REMOTE_OPS_PATH,(req:Request,res:Response)=>{
    if(String(req.query.action||'')!=='health'){res.status(405).json({ok:false,error:'Use MCP Streamable HTTP POST or ?action=health.'});return;}
    res.setHeader('Cache-Control','no-store');
    res.json({ok:true,service:'Systemia Remote Ops',server:'systemia-remote-ops',version:VERSION,transport:'Streamable HTTP',runtime:'yard_evercraft_compute',tools:tools().map((tool)=>tool.name),production_mutation_enabled:false,payment_enabled:false,external_action_enabled:false,truth_boundary:'Simulation output is modeled decision support, not a guarantee or authoritative accounting, legal, tax, investment, valuation, financing, employment or operational result.'});
  });
  app.post(SYSTEMIA_REMOTE_OPS_PATH,async(req:Request,res:Response)=>{
    res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Cache-Control','no-store');
    const response=await executeSystemiaRemoteOpsRpc(req.body||{});
    if(response===null){res.status(202).end();return;}
    res.type('application/json').json(response);
  });
}
