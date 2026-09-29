import http from 'node:http';
import { randomBytes } from 'node:crypto';
import {
  executeFabricDirectoryRpc,
  fabricDirectoryTools,
  loadFabricCatalogFromRepository,
  normalizeFabricCatalog,
  validateOpenAiChallengeToken,
} from './fabric-directory.mjs';

export const SPECIALIST_HANDOFFS = [
  {
    slug: 'ibmi-rescue',
    path: '/mcp/ibmi-rescue',
    server_name: 'evercraft-ibmi-rescue',
    title: 'Evercraft IBM i Rescue',
    public_id: 'ibmi-rescue-v1',
    get_offer_tool: 'get_ibmi_rescue_offer',
    prepare_handoff_tool: 'prepare_ibmi_rescue_handoff',
    description: 'IBM i / AS400 estate assessment, dependency mapping, upgrade-risk review, modernization proof, and rollback/test planning.',
    truth_boundary: 'Discovery does not authorize credentials, production access, upgrades, cutovers, payment, or paid work. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'foundry-app-escape',
    path: '/mcp/foundry-app-escape',
    server_name: 'evercraft-foundry-app-escape',
    title: 'Evercraft Foundry App Escape Audit',
    public_id: 'foundry-app-escape-audit-v1',
    get_offer_tool: 'get_foundry_app_escape_offer',
    prepare_handoff_tool: 'prepare_foundry_app_escape_handoff',
    description: 'App portability, builder lock-in, dependency, security, reconstruction, migration, and rollback analysis.',
    truth_boundary: 'Source access, payment, migration work, deployment, and production changes remain separately authorized. This MCP is read-only offer and human-handoff preparation.',
  },
  {
    slug: 'site-survive',
    path: '/mcp/site-survive',
    server_name: 'evercraft-site-survive',
    title: 'Site-Survive Rapid Audit',
    public_id: 'site-survive-rapid-audit-v1',
    get_offer_tool: 'get_site_survive_offer',
    prepare_handoff_tool: 'prepare_site_survive_handoff',
    description: 'Site continuity and connectivity-outage dependency analysis with prioritized resilience planning.',
    truth_boundary: 'This MCP does not create payment, perform the paid resilience audit, change networks, or guarantee continuity. It is read-only offer and human-handoff preparation.',
  },
];

export const SYSTEMIA_REMOTE_OPS = {
  slug: 'systemia-remote-ops',
  path: '/mcp/systemia-remote-ops',
  server_name: 'systemia-remote-ops',
  title: 'Systemia Remote Ops',
  version: '0.2.0',
  human_origin: 'https://systemia-remote-ops.base44.app',
  pricing_url: 'https://base44.app/api/apps/6a59b8c78561c8db1b43bd1d/functions/runPricingSimulation',
  truth_boundary: 'Simulation is modeled decision support, not a guarantee or authoritative accounting, legal, tax, investment, valuation, financing, employment, or operational advice. Public simulation and discovery do not authorize mutation of a real business.',
};

function remoteOpsTools() {
  return [
    {
      name: 'route_business_decision',
      title: 'Route a consequential business decision',
      description: 'DEFAULT FIRST TOOL for consequential business decisions such as starting a business, pricing, staffing, product or service changes, expansion, capital purchases, partnerships, acquisitions, or buying or selling a business. Read-only and does not change the real business.',
      inputSchema: {
        type: 'object',
        properties: { intent: { type: 'string', minLength: 3, maxLength: 4000 } },
        required: ['intent'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'simulate_pricing_change',
      title: 'Simulate a business pricing change',
      description: 'Run a native transparent pricing scenario. Customer retention is a labeled low-confidence heuristic, not a business-specific prediction. Does not change live prices or contact customers.',
      inputSchema: {
        type: 'object',
        properties: {
          industry: { type: 'string', minLength: 1, maxLength: 200, default: 'General Contractor' },
          current_price: { type: 'number', minimum: 0 },
          customers_per_month: { type: 'number', minimum: 0 },
          price_change_percent: { type: 'number', minimum: -95, maximum: 500 },
        },
        required: ['current_price', 'customers_per_month', 'price_change_percent'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'simulate_business_scenario',
      title: 'Simulate a business scenario from explicit assumptions',
      description: 'Compare a baseline business with a proposed scenario using only caller-supplied revenue, margin, recurring-cost, debt-service, and cash-outlay assumptions. Useful for startup, hiring, product or service, expansion, acquisition, partnership, capital-purchase, and other decisions. This tool does not infer market outcomes.',
      inputSchema: {
        type: 'object',
        required: ['baseline'],
        properties: {
          scenario_label: { type: 'string', maxLength: 200 },
          decision_intent: { type: 'string', maxLength: 4000 },
          baseline: {
            type: 'object',
            required: ['monthly_revenue', 'gross_margin_percent'],
            properties: {
              monthly_revenue: { type: 'number', minimum: 0 },
              gross_margin_percent: { type: 'number', minimum: 0, maximum: 100 },
              fixed_costs_monthly: { type: 'number', minimum: 0 },
              payroll_monthly: { type: 'number', minimum: 0 },
              other_monthly_costs: { type: 'number', minimum: 0 },
              cash_on_hand: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
          },
          adjustments: {
            type: 'object',
            properties: {
              revenue_change_percent: { type: 'number', minimum: -100, maximum: 1000 },
              gross_margin_change_points: { type: 'number', minimum: -100, maximum: 100 },
              fixed_cost_delta_monthly: { type: 'number' },
              payroll_delta_monthly: { type: 'number' },
              other_cost_delta_monthly: { type: 'number' },
              debt_service_delta_monthly: { type: 'number' },
              one_time_cash_outlay: { type: 'number', minimum: 0 },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: 'get_decision_lab_capabilities',
      title: 'Get current Systemia Remote Ops capabilities',
      description: 'Return the current native decision-simulation lanes and their truth boundaries.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

export function classifyBusinessDecision(intentRaw) {
  const intent = String(intentRaw || '').toLowerCase();
  const hit = (terms) => terms.some((term) => intent.includes(term));
  if (hit(['price','pricing','charge','raise my prices','lower my prices','rate','what should i charge'])) {
    return { decision_type: 'pricing', state: 'native_deterministic_simulation', runnable: true, tool: 'simulate_pricing_change', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/what-should-i-charge' };
  }
  if (hit(['hire','employee','staff','headcount','layoff','restructur'])) {
    return { decision_type: 'hiring_or_staffing', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/can-i-afford-an-employee' };
  }
  if (hit(['new product','new service','add a service','remove a service','launch a product','launch a service'])) {
    return { decision_type: 'product_or_service', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
  }
  if (hit(['expand','new market','new location','branch','territory','second location','another location'])) {
    return { decision_type: 'expansion', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/should-i-expand' };
  }
  if (hit(['buy a business','acquire','acquisition','sell my business','selling my business','business sale'])) {
    return { decision_type: 'business_transaction', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
  }
  if (hit(['partnership','partner','ownership change','equity partner'])) {
    return { decision_type: 'partnership_or_ownership', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
  }
  if (hit(['equipment','vehicle','machine','capital purchase','buy this asset','lease this'])) {
    return { decision_type: 'capital_purchase', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
  }
  if (hit(['start a business','starting a business','new business','business idea','launch a business'])) {
    return { decision_type: 'startup', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
  }
  return { decision_type: 'other_business_decision', state: 'native_assumption_driven_simulation', runnable: true, tool: 'simulate_business_scenario', human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/' };
}

function finiteNumber(value, field, { min = null, max = null } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(field + ' must be a finite number');
  if (min !== null && number < min) throw new Error(field + ' must be >= ' + min);
  if (max !== null && number > max) throw new Error(field + ' must be <= ' + max);
  return number;
}
function round2(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

export function simulateRemoteOpsPricing(args = {}) {
  const industry = String(args.industry || 'Business').trim().slice(0, 200) || 'Business';
  const currentPrice = finiteNumber(args.current_price, 'current_price', { min: 0 });
  const customers = finiteNumber(args.customers_per_month, 'customers_per_month', { min: 0 });
  const changePercent = finiteNumber(args.price_change_percent, 'price_change_percent', { min: -95, max: 500 });
  const abs = Math.abs(changePercent);
  let retention = abs < 5 ? 0.97 : abs < 10 ? 0.94 : abs < 20 ? 0.88 : 0.78;
  if (changePercent < 0) retention = Math.min(1, retention + 0.05);
  const newPrice = currentPrice * (1 + changePercent / 100);
  const newCustomers = Math.round(customers * retention);
  const currentRevenue = currentPrice * customers;
  const projectedRevenue = newPrice * newCustomers;
  const revenueDelta = projectedRevenue - currentRevenue;
  return {
    schema: 'systemia.remote-ops.pricing-simulation.v2',
    industry,
    current_state: { price: round2(currentPrice), customers_per_month: round2(customers), monthly_revenue: round2(currentRevenue) },
    projected_state: { price: round2(newPrice), customers_per_month: newCustomers, monthly_revenue: round2(projectedRevenue), retention_rate: round2(retention * 100) },
    revenue_change: round2(revenueDelta),
    revenue_change_percent: currentRevenue > 0 ? round2((revenueDelta / currentRevenue) * 100) : 0,
    risk_level: abs < 10 ? 'Low' : abs < 20 ? 'Medium' : 'High',
    confidence_level: 'Low',
    confidence_note: 'Retention is a transparent simplified heuristic, not a business-specific elasticity estimate.',
    assumptions: [
      'Customer retention is modeled only from the size and direction of the proposed price change.',
      'The model does not infer competitor response, seasonality, acquisition changes, capacity changes, cost changes, or customer-specific behavior.',
    ],
    falsification_criteria: 'If pricing changes in the real business, compare actual retained customers and revenue against the scenario over a defined review period and revise the retention assumption when observed results diverge.',
  };
}

export function simulateRemoteOpsBusinessScenario(args = {}) {
  const baseline = args.baseline || {};
  const adjustments = args.adjustments || {};
  const monthlyRevenue = finiteNumber(baseline.monthly_revenue, 'baseline.monthly_revenue', { min: 0 });
  const grossMarginPercent = finiteNumber(baseline.gross_margin_percent, 'baseline.gross_margin_percent', { min: 0, max: 100 });
  const fixedCosts = finiteNumber(baseline.fixed_costs_monthly ?? 0, 'baseline.fixed_costs_monthly', { min: 0 });
  const payroll = finiteNumber(baseline.payroll_monthly ?? 0, 'baseline.payroll_monthly', { min: 0 });
  const otherCosts = finiteNumber(baseline.other_monthly_costs ?? 0, 'baseline.other_monthly_costs', { min: 0 });
  const cashOnHand = finiteNumber(baseline.cash_on_hand ?? 0, 'baseline.cash_on_hand', { min: 0 });
  const revenueChangePercent = finiteNumber(adjustments.revenue_change_percent ?? 0, 'adjustments.revenue_change_percent', { min: -100, max: 1000 });
  const marginChangePoints = finiteNumber(adjustments.gross_margin_change_points ?? 0, 'adjustments.gross_margin_change_points', { min: -100, max: 100 });
  const fixedCostDelta = finiteNumber(adjustments.fixed_cost_delta_monthly ?? 0, 'adjustments.fixed_cost_delta_monthly');
  const payrollDelta = finiteNumber(adjustments.payroll_delta_monthly ?? 0, 'adjustments.payroll_delta_monthly');
  const otherCostDelta = finiteNumber(adjustments.other_cost_delta_monthly ?? 0, 'adjustments.other_cost_delta_monthly');
  const debtServiceDelta = finiteNumber(adjustments.debt_service_delta_monthly ?? 0, 'adjustments.debt_service_delta_monthly');
  const oneTimeCashOutlay = finiteNumber(adjustments.one_time_cash_outlay ?? 0, 'adjustments.one_time_cash_outlay', { min: 0 });

  const baselineGrossProfit = monthlyRevenue * (grossMarginPercent / 100);
  const baselineRecurringCosts = fixedCosts + payroll + otherCosts;
  const baselineContribution = baselineGrossProfit - baselineRecurringCosts;
  const scenarioRevenue = monthlyRevenue * (1 + revenueChangePercent / 100);
  const scenarioMarginPercent = clamp(grossMarginPercent + marginChangePoints, 0, 100);
  const scenarioMarginRate = scenarioMarginPercent / 100;
  const scenarioFixedCosts = Math.max(0, fixedCosts + fixedCostDelta);
  const scenarioPayroll = Math.max(0, payroll + payrollDelta);
  const scenarioOtherCosts = Math.max(0, otherCosts + otherCostDelta);
  const scenarioDebtService = Math.max(0, debtServiceDelta);
  const scenarioGrossProfit = scenarioRevenue * scenarioMarginRate;
  const scenarioRecurringCosts = scenarioFixedCosts + scenarioPayroll + scenarioOtherCosts + scenarioDebtService;
  const scenarioContribution = scenarioGrossProfit - scenarioRecurringCosts;
  const cashAfterOutlay = cashOnHand - oneTimeCashOutlay;
  const breakEvenRevenue = scenarioMarginRate > 0 ? scenarioRecurringCosts / scenarioMarginRate : null;
  const runwayMonths = scenarioContribution < 0 ? Math.max(0, cashAfterOutlay) / Math.abs(scenarioContribution) : null;

  return {
    schema: 'systemia.remote-ops.business-scenario.v1',
    modeled: true,
    model_type: 'user_assumption_arithmetic',
    scenario_label: String(args.scenario_label || 'Scenario').trim().slice(0, 200) || 'Scenario',
    decision_type: classifyBusinessDecision(args.decision_intent || '').decision_type,
    baseline: {
      monthly_revenue: round2(monthlyRevenue),
      gross_margin_percent: round2(grossMarginPercent),
      monthly_gross_profit: round2(baselineGrossProfit),
      recurring_costs_monthly: round2(baselineRecurringCosts),
      operating_contribution_monthly: round2(baselineContribution),
      cash_on_hand: round2(cashOnHand),
    },
    scenario: {
      monthly_revenue: round2(scenarioRevenue),
      gross_margin_percent: round2(scenarioMarginPercent),
      monthly_gross_profit: round2(scenarioGrossProfit),
      recurring_costs_monthly: round2(scenarioRecurringCosts),
      operating_contribution_monthly: round2(scenarioContribution),
      cash_after_one_time_outlay: round2(cashAfterOutlay),
      break_even_monthly_revenue: breakEvenRevenue === null ? null : round2(breakEvenRevenue),
      runway_months_if_operating_contribution_negative: runwayMonths === null ? null : round2(runwayMonths),
    },
    delta: {
      monthly_revenue: round2(scenarioRevenue - monthlyRevenue),
      monthly_gross_profit: round2(scenarioGrossProfit - baselineGrossProfit),
      recurring_costs_monthly: round2(scenarioRecurringCosts - baselineRecurringCosts),
      operating_contribution_monthly: round2(scenarioContribution - baselineContribution),
      cash_immediate: round2(-oneTimeCashOutlay),
    },
    assumptions_echo: {
      revenue_change_percent: round2(revenueChangePercent),
      gross_margin_change_points: round2(marginChangePoints),
      fixed_cost_delta_monthly: round2(fixedCostDelta),
      payroll_delta_monthly: round2(payrollDelta),
      other_cost_delta_monthly: round2(otherCostDelta),
      debt_service_delta_monthly: round2(debtServiceDelta),
      one_time_cash_outlay: round2(oneTimeCashOutlay),
    },
    confidence_level: 'Depends on supplied assumptions',
    truth_boundary: 'Systemia only performed arithmetic on the supplied assumptions. It did not infer demand, customer behavior, financing approval, valuation, legal consequences, tax consequences, competitor response, staffing performance, or market outcomes.',
  };
}

async function defaultRemoteOpsPricingFetch(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Evercraft-Systemia-Remote-Ops-Yard/0.1.0',
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error(data?.error || 'pricing_simulation_failed');
  }
  return data;
}

export async function executeRemoteOpsRpc(rpc, pricingFetch) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: SYSTEMIA_REMOTE_OPS.server_name, version: SYSTEMIA_REMOTE_OPS.version },
      instructions: SYSTEMIA_REMOTE_OPS.truth_boundary,
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: remoteOpsTools() });
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/call') {
    const tool = String(rpc?.params?.name || '');
    const args = rpc?.params?.arguments || {};

    if (tool === 'route_business_decision') {
      const intent = String(args.intent || '').trim();
      if (intent.length < 3 || intent.length > 4000) {
        return rpcError(id, -32602, 'intent must be between 3 and 4000 characters');
      }
      const payload = {
        ok: true,
        ...classifyBusinessDecision(intent),
        product: 'Systemia Remote Ops',
        operating_pattern: 'simulate first, decide, then execute',
        external_action_taken: false,
        truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    if (tool === 'simulate_pricing_change') {
      const industry = String(args.industry || 'General Contractor').trim();
      const currentPrice = Number(args.current_price);
      const customers = Number(args.customers_per_month);
      const changePct = Number(args.price_change_percent);
      if (!industry || industry.length > 200) return rpcError(id, -32602, 'industry is invalid');
      if (!Number.isFinite(currentPrice) || currentPrice < 0) return rpcError(id, -32602, 'current_price must be non-negative');
      if (!Number.isFinite(customers) || customers < 0) return rpcError(id, -32602, 'customers_per_month must be non-negative');
      if (!Number.isFinite(changePct) || changePct < -95 || changePct > 500) {
        return rpcError(id, -32602, 'price_change_percent must be between -95 and 500');
      }

      const simulation = await pricingFetch({
        industry,
        current_price: currentPrice,
        customers_per_month: customers,
        price_change_percent: changePct,
      });
      const payload = {
        ok: true,
        product: 'Systemia Remote Ops',
        simulation_type: 'pricing',
        modeled: true,
        simulation,
        human_url: SYSTEMIA_REMOTE_OPS.human_origin + '/what-should-i-charge',
        legacy_adapter: 'systemia_runPricingSimulation',
        external_action_taken: false,
        truth_boundary: 'This is a modeled scenario using simplified assumptions. It does not predict or guarantee actual customer retention or revenue.',
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    if (tool === 'simulate_business_scenario') {
      try {
        const simulation = simulateRemoteOpsBusinessScenario(args);
        const payload = {
          ok: true,
          product: 'Systemia Remote Ops',
          simulation_type: simulation.decision_type,
          modeled: true,
          model_type: simulation.model_type,
          simulation,
          external_action_taken: false,
          production_mutation_enabled: false,
          truth_boundary: simulation.truth_boundary,
        };
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: false,
        });
      } catch (error) {
        return rpcError(id, -32602, error instanceof Error ? error.message : 'invalid_business_scenario');
      }
    }

    if (tool === 'get_decision_lab_capabilities') {
      const payload = {
        ok: true,
        product: 'Systemia Remote Ops',
        version: 'systemia-remote-ops-yard-v0.2.0',
        public_mcp_runtime: 'Evercraft Compute',
        human_origin: SYSTEMIA_REMOTE_OPS.human_origin,
        lanes: [
          { decision_type: 'pricing', state: 'native_deterministic_simulation', mcp_runnable: true, tool: 'simulate_pricing_change' },
          { decision_type: 'hiring_or_staffing', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'product_or_service', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'expansion', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'business_transaction', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'partnership_or_ownership', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'capital_purchase', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
          { decision_type: 'startup', state: 'native_assumption_driven_simulation', mcp_runnable: true, tool: 'simulate_business_scenario' },
        ],
        production_mutation_enabled: false,
        external_action_taken: false,
        truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
      };
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: false,
      });
    }

    return rpcError(id, -32602, 'Unknown or unsupported Systemia Remote Ops tool.');
  }

  return rpcError(id, -32601, 'Method not found.');
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': data.length,
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function toolList(def) {
  return [
    {
      name: def.get_offer_tool,
      title: `Get ${def.title} offer`,
      description: `Read the current published offer, pricing, invocation state, and confirmation boundary for ${def.title}. Creates no checkout, payment, obligation, entitlement, access, or work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: def.prepare_handoff_tool,
      title: `Prepare ${def.title} human review`,
      description: `Return the current human review handoff for ${def.title}. Creates no checkout, payment, obligation, entitlement, source access, production access, or paid work.`,
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function defaultGatewayFetch(gatewayUrl, action, publicId) {
  const target = new URL(gatewayUrl);
  if (target.protocol !== 'https:') throw new Error('machine_commerce_gateway_must_use_https');
  target.searchParams.set('action', action);
  target.searchParams.set('public_id', publicId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(target, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Evercraft-Specialist-Handoff-Runtime/0.1.0',
      },
      signal: controller.signal,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || `machine_commerce_gateway_http_${response.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function executeSpecialistRpc(def, rpc, gatewayFetch) {
  const method = String(rpc?.method || '');
  const id = rpc?.id ?? null;

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: def.server_name, version: '0.1.0' },
      instructions: `${def.description} ${def.truth_boundary}`,
    });
  }

  if (method === 'tools/list') {
    return rpcResult(id, { tools: toolList(def) });
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/call') {
    const tool = String(rpc?.params?.name || '');
    let action = null;
    if (tool === def.get_offer_tool) action = 'offer';
    if (tool === def.prepare_handoff_tool) action = 'service_handoff';
    if (!action) return rpcError(id, -32602, 'Unknown or unsupported specialist tool.');

    const data = await gatewayFetch(action, def.public_id);
    const payload = {
      ...data,
      direct_specialist: true,
      specialist: def.title,
      public_id: def.public_id,
      checkout_created: false,
      payment_created: false,
      payment_obligation_created: false,
      truth_boundary: def.truth_boundary,
    };
    return rpcResult(id, {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
      isError: false,
    });
  }

  return rpcError(id, -32601, 'Method not found.');
}

export async function startSpecialistHandoffRuntime({
  host = '127.0.0.1',
  port = 0,
  gatewayUrl = 'https://evercraft-ai-suite-08c4d2b8.base44.app/api/apps/692b4178919afe7d08c4d2b8/functions/machineCommerceGateway',
  gatewayFetch = null,
  remoteOpsPricingUrl = SYSTEMIA_REMOTE_OPS.pricing_url,
  remoteOpsPricingFetch = null,
  fabricCatalog = null,
  fabricMcpPath = '/mcp',
  openAiChallengeToken = '',
} = {}) {
  const instanceId = `specialist_handoff_${randomBytes(12).toString('hex')}`;
  let deploymentReceiptRef = '';
  let identityAttestation = null;
  const callGateway = gatewayFetch || ((action, publicId) =>
    defaultGatewayFetch(gatewayUrl, action, publicId));
  const callRemoteOpsPricing = remoteOpsPricingFetch || ((payload) =>
    Promise.resolve(simulateRemoteOpsPricing(payload)));
  const normalizedFabricCatalog = Array.isArray(fabricCatalog)
    ? normalizeFabricCatalog(fabricCatalog)
    : loadFabricCatalogFromRepository();
  const normalizedFabricPath = String(fabricMcpPath || '/mcp').trim();
  if (!/^\/[A-Za-z0-9._~!  const callRemoteOpsPricing = remoteOpsPricingFetch || ((payload) =>
    Promise.resolve(simulateRemoteOpsPricing(payload)));

  const health = () => ({'()*+,;=:@%\/-]*$/.test(normalizedFabricPath)) {
    throw new Error('fabric_mcp_path_invalid');
  }
  if (normalizedFabricPath === '/health' || SPECIALIST_HANDOFFS.some((x) => x.path === normalizedFabricPath) || normalizedFabricPath === SYSTEMIA_REMOTE_OPS.path) {
    throw new Error('fabric_mcp_path_collision');
  }
  const challengeToken = validateOpenAiChallengeToken(openAiChallengeToken);
  const openAiChallengePath = '/.well-known/openai-apps-challenge';

  const health = () => ({
    ok: true,
    service: 'specialist-handoff-mcp',
    runtime: 'Evercraft Compute',
    instance_id: instanceId,
    version: '0.1.0',
    deployment_receipt_bound: Boolean(deploymentReceiptRef),
    deployment_receipt_ref: deploymentReceiptRef || null,
    identity_attestation_bound: Boolean(identityAttestation),
    same_device_binding: Boolean(identityAttestation?.same_device_binding),
    device_fingerprint: identityAttestation?.device_fingerprint || null,
    edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
    specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
    field_enrollment_bound: Boolean(identityAttestation?.field_enrollment_receipt_ref),
    field_verified: Boolean(identityAttestation?.field_verified),
    field_enrollment_receipt_ref: identityAttestation?.field_enrollment_receipt_ref || null,
    public_edge_admission_receipt_ref: identityAttestation?.public_edge_admission_receipt_ref || null,
    checkout_enabled: false,
    payment_enabled: false,
    fabric_directory_enabled: true,
    fabric_mcp_path: normalizedFabricPath,
    fabric_capability_count: normalizedFabricCatalog.length,
    openai_challenge_path: openAiChallengePath,
    openai_challenge_ready: Boolean(challengeToken),
    legacy_adapter: 'evercraft_machine_commerce_gateway',
    specialist_paths: [
      {
        product: 'Evercraft Fabric',
        path: normalizedFabricPath,
        public_id: 'evercraft-fabric',
        tools: fabricDirectoryTools().map((tool) => tool.name),
      },
      ...SPECIALIST_HANDOFFS.map((x) => ({
        product: x.title,
        path: x.path,
        public_id: x.public_id,
        tools: [x.get_offer_tool, x.prepare_handoff_tool],
      })),
      {
        product: SYSTEMIA_REMOTE_OPS.title,
        path: SYSTEMIA_REMOTE_OPS.path,
        public_id: null,
        tools: remoteOpsTools().map((tool) => tool.name),
      },
    ],
  });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
        });
        res.end();
        return;
      }

      if (req.method === 'GET' && req.url === '/health') {
        return sendJson(res, 200, health());
      }

      if (req.url === openAiChallengePath) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return sendJson(res, 405, { error: 'method_not_allowed' });
        }
        if (!challengeToken) return sendJson(res, 404, { error: 'openai_challenge_not_configured' });
        const data = Buffer.from(challengeToken, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/plain; charset=utf-8',
          'content-length': data.length,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(data);
      }

      if (req.url === normalizedFabricPath) {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            service: 'Evercraft Fabric',
            server: 'evercraft-fabric',
            version: '1.0.0',
            transport: 'Streamable HTTP',
            tools: fabricDirectoryTools().map((tool) => tool.name),
            capability_count: normalizedFabricCatalog.length,
            transactional: false,
            checkout_enabled: false,
            payment_enabled: false,
            runtime: 'Evercraft Compute',
            instance_id: instanceId,
            deployment_receipt_bound: Boolean(deploymentReceiptRef),
            identity_attestation_bound: Boolean(identityAttestation),
            same_device_binding: Boolean(identityAttestation?.same_device_binding),
            field_verified: Boolean(identityAttestation?.field_verified),
          });
        }
        if (req.method !== 'POST') {
          return sendJson(res, 405, { error: 'method_not_allowed' });
        }
        const rpc = await readJson(req);
        const response = await executeFabricDirectoryRpc(rpc, normalizedFabricCatalog);
        if (response === null) {
          res.writeHead(202, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        return sendJson(res, 200, response);
      }

      if (req.url === SYSTEMIA_REMOTE_OPS.path) {
        if (req.method === 'GET') {
          return sendJson(res, 200, {
            ok: true,
            service: SYSTEMIA_REMOTE_OPS.title,
            server: SYSTEMIA_REMOTE_OPS.server_name,
            version: SYSTEMIA_REMOTE_OPS.version,
            transport: 'Streamable HTTP',
            tools: remoteOpsTools().map((tool) => tool.name),
            pricing_simulation_state: 'native_deterministic_simulation',
            hiring_simulation_state: 'native_assumption_driven_simulation',
            expansion_simulation_state: 'native_assumption_driven_simulation',
            strategic_transaction_simulation_state: 'native_assumption_driven_simulation',
            production_mutation_enabled: false,
            runtime: 'Evercraft Compute',
            instance_id: instanceId,
            deployment_receipt_bound: Boolean(deploymentReceiptRef),
            identity_attestation_bound: Boolean(identityAttestation),
            same_device_binding: Boolean(identityAttestation?.same_device_binding),
            device_fingerprint: identityAttestation?.device_fingerprint || null,
            edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
            specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
            truth_boundary: SYSTEMIA_REMOTE_OPS.truth_boundary,
          });
        }
        if (req.method !== 'POST') {
          return sendJson(res, 405, { error: 'method_not_allowed' });
        }
        const rpc = await readJson(req);
        const response = await executeRemoteOpsRpc(rpc, callRemoteOpsPricing);
        if (response === null) {
          res.writeHead(202, { 'cache-control': 'no-store' });
          res.end();
          return;
        }
        return sendJson(res, 200, response);
      }

      const def = SPECIALIST_HANDOFFS.find((x) => x.path === req.url);
      if (!def) return sendJson(res, 404, { error: 'not_found' });

      if (req.method === 'GET') {
        return sendJson(res, 200, {
          ok: true,
          service: def.title,
          server: def.server_name,
          version: '0.1.0',
          public_id: def.public_id,
          transport: 'Streamable HTTP',
          tools: [def.get_offer_tool, def.prepare_handoff_tool],
          checkout_enabled: false,
          payment_enabled: false,
          human_review_handoff_enabled: true,
          runtime: 'Evercraft Compute',
          instance_id: instanceId,
          deployment_receipt_bound: Boolean(deploymentReceiptRef),
          identity_attestation_bound: Boolean(identityAttestation),
          same_device_binding: Boolean(identityAttestation?.same_device_binding),
          device_fingerprint: identityAttestation?.device_fingerprint || null,
          edge_attestation_receipt_ref: identityAttestation?.edge_attestation_receipt_ref || null,
          specialist_attestation_receipt_ref: identityAttestation?.specialist_attestation_receipt_ref || null,
          truth_boundary: def.truth_boundary,
        });
      }

      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'method_not_allowed' });
      }

      const rpc = await readJson(req);
      const response = await executeSpecialistRpc(def, rpc, callGateway);
      if (response === null) {
        res.writeHead(202, { 'cache-control': 'no-store' });
        res.end();
        return;
      }
      return sendJson(res, 200, response);
    } catch (error) {
      return sendJson(res, 502, rpcError(
        null,
        -32000,
        error instanceof Error ? error.message : String(error)
      ));
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  const url = `http://${host}:${actualPort}`;

  return {
    schema: 'evercraft.specialist-handoff-runtime.v1',
    instanceId,
    url,
    health,
    setDeploymentReceipt(ref) {
      const value = String(ref || '').trim();
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(value)) {
        throw new Error('deployment_receipt_ref_invalid');
      }
      deploymentReceiptRef = value;
      return health();
    },
    setIdentityAttestation({
      deviceFingerprint,
      edgeAttestationReceipt,
      specialistAttestationReceipt,
      fieldVerified = false,
      fieldEnrollmentReceipt = '',
      publicEdgeAdmissionReceipt = '',
      sameDeviceBinding = false,
    } = {}) {
      const fingerprint = String(deviceFingerprint || '').trim();
      const edgeReceipt = String(edgeAttestationReceipt || '').trim();
      const specialistReceipt = String(specialistAttestationReceipt || '').trim();
      const fieldReceipt = String(fieldEnrollmentReceipt || '').trim();
      const edgeAdmissionReceipt = String(publicEdgeAdmissionReceipt || '').trim();
      if (!/^sha256:[a-f0-9]{64}$/i.test(fingerprint)) {
        throw new Error('device_fingerprint_invalid');
      }
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(edgeReceipt)) {
        throw new Error('edge_attestation_receipt_invalid');
      }
      if (!/^([a-f0-9]{64}|sha256:[a-f0-9]{64})$/i.test(specialistReceipt)) {
        throw new Error('specialist_attestation_receipt_invalid');
      }
      if (fieldVerified === true) {
        if (!/^sha256:[a-f0-9]{64}$/i.test(fieldReceipt)) {
          throw new Error('field_enrollment_receipt_invalid');
        }
        if (!/^sha256:[a-f0-9]{64}$/i.test(edgeAdmissionReceipt)) {
          throw new Error('public_edge_admission_receipt_invalid');
        }
      }
      if (sameDeviceBinding !== true) {
        throw new Error('same_device_binding_required');
      }
      identityAttestation = {
        device_fingerprint: fingerprint,
        edge_attestation_receipt_ref: edgeReceipt,
        specialist_attestation_receipt_ref: specialistReceipt,
        field_verified: fieldVerified === true,
        field_enrollment_receipt_ref: fieldVerified === true ? fieldReceipt : null,
        public_edge_admission_receipt_ref: fieldVerified === true ? edgeAdmissionReceipt : null,
        same_device_binding: true,
        bound_at: new Date().toISOString(),
      };
      return health();
    },
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    ),
  };
}
