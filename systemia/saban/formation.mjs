#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
  loadWorkItems,
  loadPrivateInventory,
  expandPartitionedWorkItems,
  buildMultiplicationPlan,
  executeMultiplicationPlan
} from './multiplier.mjs';
import { recommendFormation } from './autoscaler.mjs';
import { admitMultiplicationRequest } from './admission.mjs';
import { executeDistributedMultiplicationPlan } from './distributed-executor.mjs';
import { buildSabanComputeMarketStack } from './market-stack.mjs';
import { YardOperator } from '../yard/operator.mjs';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function argValue(argv, flag, fallback = null) {
  const index = argv.indexOf(flag);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function hasFlag(argv, flag) {
  return argv.includes(flag);
}

function safeId(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'formation';
}

function stringList(value){
  return Array.isArray(value)
    ? [...new Set(value.map((row)=>String(row||'').trim()).filter(Boolean))]
    : [];
}

function envValue(name){
  const key=String(name||'').trim();
  return key ? String(process.env[key]||'').trim() : '';
}

export async function buildFormationAcquisition({
  formationId,
  nodeId,
  execution,
  rootDir=process.cwd(),
}={}){
  const config=execution?.acquisition;
  if(config?.enabled!==true) return null;

  const markets=config.markets||{};
  const brokerCfg=markets.evercraft_broker||{};
  const voluntaryCfg=markets.evercraft_voluntary||{};
  const golemCfg=markets.golem||{};
  const akashCfg=markets.akash||{};

  if(
    Object.hasOwn(voluntaryCfg,'control_token') ||
    Object.hasOwn(akashCfg,'api_key') ||
    Object.hasOwn(golemCfg,'app_key')
  ){
    throw new Error('formation_acquisition_secrets_must_use_runtime_environment');
  }

  let yard=null;
  let brokerDeploymentId='';
  if(brokerCfg.enabled===true){
    const stateDir=
      brokerCfg.state_dir ||
      envValue(brokerCfg.state_dir_env||'EVERCRAFT_YARD_STATE_DIR');
    brokerDeploymentId=
      String(brokerCfg.broker_deployment_id||'').trim() ||
      envValue(
        brokerCfg.broker_deployment_id_env||
        'EVERCRAFT_REMOTE_CAPACITY_BROKER_DEPLOYMENT_ID'
      );
    if(!stateDir) throw new Error('formation_acquisition_yard_state_dir_required');
    if(!brokerDeploymentId){
      throw new Error('formation_acquisition_broker_deployment_id_required');
    }
    yard=new YardOperator({
      stateDir:path.resolve(rootDir,stateDir),
    });
  }

  const voluntaryEndpoint=
    String(voluntaryCfg.endpoint||'').trim() ||
    envValue(
      voluntaryCfg.endpoint_env||
      'EVERCRAFT_VOLUNTARY_COMPUTE_ENDPOINT'
    );
  if(voluntaryCfg.enabled===true&&!voluntaryEndpoint){
    throw new Error('formation_acquisition_voluntary_endpoint_required');
  }
  const voluntaryToken=voluntaryCfg.enabled===true
    ? envValue(
        voluntaryCfg.control_token_env||
        'EVERCRAFT_VOLUNTARY_CONTROL_TOKEN'
      )
    : '';
  if(voluntaryCfg.enabled===true&&!voluntaryToken){
    throw new Error('formation_acquisition_voluntary_control_token_required');
  }

  const stack=await buildSabanComputeMarketStack({
    yard,
    brokerDeploymentId,
    voluntaryEndpoint:
      voluntaryCfg.enabled===true ? voluntaryEndpoint : '',
    voluntaryControlHeaders:
      voluntaryCfg.enabled===true
        ? {authorization:`Bearer ${voluntaryToken}`}
        : null,
    includeGolem:golemCfg.enabled===true,
    golem:{
      clientOptions:{
        apiKey:envValue(golemCfg.app_key_env||'YAGNA_APPKEY'),
        url:
          envValue(golemCfg.api_url_env||'YAGNA_API_BASEPATH')||
          'http://127.0.0.1:7465',
      },
      scanTimeoutMs:Number(golemCfg.scan_timeout_ms||5000),
    },
    includeAkash:akashCfg.enabled===true,
    akash:{
      apiKey:envValue(akashCfg.api_key_env||'AKASH_API_KEY'),
      baseUrl:
        String(akashCfg.base_url||'').trim()||
        'https://console-api.akash.network',
      quoteTimeoutMs:Number(akashCfg.quote_timeout_ms||45000),
    },
  });

  const demandId=
    String(config.demand_id||'').trim() ||
    `formation:${safeId(formationId)}:${safeId(nodeId)}`;
  const zeroSpendOnly=config.zero_spend_only!==false;
  const availableMarkets=stack.adapters.map((adapter)=>adapter.market);
  const zeroSpendMarkets=availableMarkets.filter((market)=>
    market==='evercraft-broker'||
    market==='evercraft-voluntary'
  );

  const quoteCfg=config.quote||{};
  const leaseCfg=config.lease||{};
  const quoteAllowed=stringList(quoteCfg.allowed_markets);
  const leaseAllowed=stringList(leaseCfg.allowed_markets);

  const quoteAuthority=(
    quoteCfg.approved===true ||
    (zeroSpendOnly&&zeroSpendMarkets.length>0)
  ) ? {
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demandId,
    allowed_markets:
      quoteAllowed.length
        ? quoteAllowed
        : zeroSpendOnly
          ? zeroSpendMarkets
          : availableMarkets,
    allow_market_orders:quoteCfg.allow_market_orders===true,
    expires_at:quoteCfg.expires_at||null,
    akash_uact_per_block_ceiling:
      quoteCfg.akash_uact_per_block_ceiling??null,
  } : null;

  const leaseAuthority=(
    leaseCfg.approved===true ||
    (zeroSpendOnly&&zeroSpendMarkets.length>0)
  ) ? {
    schema:'evercraft.saban.compute-authority.v1',
    approved:true,
    demand_id:demandId,
    allowed_markets:
      leaseAllowed.length
        ? leaseAllowed
        : zeroSpendOnly
          ? zeroSpendMarkets
          : availableMarkets,
    allow_spend:leaseCfg.allow_spend===true,
    max_total_usd:
      zeroSpendOnly
        ? 0
        : leaseCfg.max_total_usd??config.max_total_usd??null,
    max_total_glm:
      zeroSpendOnly
        ? 0
        : leaseCfg.max_total_glm??null,
    expires_at:leaseCfg.expires_at||null,
  } : null;

  return {
    enabled:true,
    demand_id:demandId,
    negotiation_level:config.negotiation_level||'lease',
    prefer_zero_cost:config.prefer_zero_cost!==false,
    max_total_usd:
      zeroSpendOnly ? 0 : config.max_total_usd??null,
    max_hourly_usd:
      zeroSpendOnly ? 0 : config.max_hourly_usd??null,
    market_price_ceiling:config.market_price_ceiling||{},
    duration_seconds:config.duration_seconds||null,
    cpu_units:config.cpu_units||null,
    memory_mb:config.memory_mb||null,
    storage_gb:config.storage_gb||null,
    gpu_count:config.gpu_count||0,
    gpu_models:config.gpu_models||[],
    regions:config.regions||[],
    countries:config.countries||[],
    require_public_ingress:config.require_public_ingress===true,
    require_persistent_storage:config.require_persistent_storage===true,
    minimum_uptime_7d:config.minimum_uptime_7d||0,
    audited_only:config.audited_only===true,
    valid_version_only:config.valid_version_only!==false,
    adapters:stack.adapters,
    quoteAuthority,
    leaseAuthority,
    market_inventory:stack.inventory,
    zero_spend_only:zeroSpendOnly,
  };
}

export function topologicalOrder(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map(nodes.map((node) => [node.id, []]));

  for (const node of nodes) {
    for (const dependency of node.depends_on || []) {
      if (!byId.has(dependency)) {
        throw new Error(`Unknown dependency ${dependency} for node ${node.id}`);
      }
      indegree.set(node.id, indegree.get(node.id) + 1);
      children.get(dependency).push(node.id);
    }
  }

  const queue = [...nodes]
    .filter((node) => indegree.get(node.id) === 0)
    .map((node) => node.id)
    .sort();

  const ordered = [];
  while (queue.length) {
    const id = queue.shift();
    ordered.push(id);
    for (const child of children.get(id) || []) {
      indegree.set(child, indegree.get(child) - 1);
      if (indegree.get(child) === 0) {
        queue.push(child);
        queue.sort();
      }
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('Formation dependency graph contains a cycle.');
  }
  return ordered;
}

export function topologicalWaves(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(nodes.map((node) => node.id));
  const completed = new Set();
  const waves = [];

  while (remaining.size) {
    const wave = [...remaining]
      .filter((id) =>
        (byId.get(id)?.depends_on || []).every((dependency) => completed.has(dependency))
      )
      .sort();

    if (!wave.length) {
      throw new Error('Formation dependency graph contains a cycle or unresolved dependency.');
    }

    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      completed.add(id);
    }
  }

  return waves;
}

export function planFormation({ request, rootDir = process.cwd() }) {
  if (!request || !Array.isArray(request.nodes) || request.nodes.length === 0) {
    throw new Error('Formation request must contain nodes.');
  }

  const ids = request.nodes.map((node) => node.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new Error('Formation node ids must be present and unique.');
  }

  const registry = loadMultiplicationRegistry();
  const order = topologicalOrder(request.nodes);
  const waves = topologicalWaves(request.nodes);
  const nodesById = new Map(request.nodes.map((node) => [node.id, node]));

  const planned = order.map((nodeId) => {
    const node = nodesById.get(nodeId);
    const contract = resolveMultiplicationContract(node.software, registry);
    const extra = node.inventory ? loadPrivateInventory(path.resolve(rootDir, node.inventory), { privacy: contract.inventory_privacy || null }) : [];
    const workItems = expandPartitionedWorkItems(
      contract,
      loadWorkItems(contract, rootDir, extra)
    );

    const shouldAuto = node.auto === true || (node.auto !== false && node.logical_agents == null);
    const recommendation = shouldAuto
      ? recommendFormation({
          contract,
          workItemCount: workItems.length,
          requestedLogicalAgents: node.logical_agents ?? null,
          requestedPhysicalWorkers: node.physical_workers ?? null,
          telemetry: node.telemetry || {}
        })
      : null;

    const admission = admitMultiplicationRequest({
      contract,
      requestedLogicalAgents: recommendation?.logical_agents ?? node.logical_agents ?? contract.default_logical_agents,
      requestedPhysicalWorkers: recommendation?.physical_workers ?? node.physical_workers ?? contract.default_physical_workers,
      requestedWorkItems: workItems.length,
      requestedAttempts: node.max_attempts_per_job ?? contract.max_attempts_per_job ?? 3,
      budget: contract.budget || {}
    });

    if (!admission.admitted) {
      throw new Error(`Formation node ${nodeId} denied: ${admission.reason}`);
    }

    const plan = buildMultiplicationPlan({
      contract,
      logicalAgents: admission.grant.logical_agents,
      physicalWorkers: admission.grant.physical_workers,
      workItems
    });
    plan.admission = admission;
    plan.formation_recommendation = recommendation;

    return {
      node_id: nodeId,
      software: node.software,
      depends_on: node.depends_on || [],
      reconcile: node.reconcile === true,
      execution: node.execution || { mode: 'local' },
      work_items: workItems,
      contract,
      plan
    };
  });

  return {
    schema: 'evercraft.saban.formation-plan.v1',
    formation_id: safeId(request.formation_id || `formation-${Date.now()}`),
    generated_at: new Date().toISOString(),
    execution_order: order,
    execution_waves: waves,
    nodes: planned
  };
}

export async function executeFormation({ formation, rootDir = process.cwd() }) {
  const receipts = [];
  const receiptByNode = new Map();
  const byNode = new Map(formation.nodes.map((node) => [node.node_id, node]));
  const waves = formation.execution_waves || topologicalWaves(
    formation.nodes.map((node) => ({
      id: node.node_id,
      depends_on: node.depends_on || []
    }))
  );

  async function executeNode(nodeId) {
    const node = byNode.get(nodeId);
    const dependencyReceipts = (node.depends_on || [])
      .map((dependency) => receiptByNode.get(dependency))
      .filter(Boolean);
    const blocked = dependencyReceipts.some((receipt) => receipt.status !== 'completed');

    if (blocked) {
      return {
        node_id: nodeId,
        software_id: node.plan.software_id,
        status: 'blocked_by_dependency'
      };
    }

    const statePath = path.join(
      'artifacts',
      'saban-multiplier',
      'formations',
      formation.formation_id,
      `${safeId(nodeId)}-state.json`
    );

    try {
      const distributed = node.execution?.mode === 'nodeseed_pool';
      const acquisition=distributed
        ? await buildFormationAcquisition({
            formationId:formation.formation_id,
            nodeId,
            execution:node.execution,
            rootDir,
          })
        : null;
      const receipt = distributed
        ? await executeDistributedMultiplicationPlan({
            contract: node.contract,
            plan: node.plan,
            workItems: node.work_items,
            rootDir,
            reconcile: node.reconcile,
            nodePool: {
              endpoints: node.execution?.endpoints || [],
              discover: node.execution?.discover === true,
              discoveryOptions: node.execution?.discovery_options || {},
              allocatorToken: process.env.EVERCRAFT_ALLOCATOR_TOKEN || '',
              maxAttempts: node.execution?.max_attempts,
              maxConcurrencyPerNode: node.execution?.max_concurrency_per_node,
              timeoutMs: node.execution?.timeout_ms,
              assignmentTimeoutMs: node.execution?.assignment_timeout_ms,
              requestedTtlMs: node.execution?.requested_ttl_ms,
              acquisition
            }
          })
        : await executeMultiplicationPlan({
            contract: node.contract,
            plan: node.plan,
            workItems: node.work_items,
            rootDir,
            reconcile: node.reconcile,
            statePath,
            resume: false
          });

      const status = receipt.quality?.status === 'fail'
        ? 'failed_quality'
        : receipt.scheduler_summary?.counts?.dead_letter
          ? 'completed_with_dead_letter'
          : 'completed';

      return {
        node_id: nodeId,
        software_id: node.plan.software_id,
        execution_mode: distributed ? 'nodeseed_pool' : 'local',
        status,
        receipt
      };
    } catch (error) {
      return {
        node_id: nodeId,
        software_id: node.plan.software_id,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  for (const wave of waves) {
    const waveReceipts = await Promise.all(wave.map((nodeId) => executeNode(nodeId)));
    for (const receipt of waveReceipts) {
      receipts.push(receipt);
      receiptByNode.set(receipt.node_id, receipt);
    }
  }

  return {
    schema: 'evercraft.saban.formation-receipt.v1',
    formation_id: formation.formation_id,
    generated_at: new Date().toISOString(),
    execution_order: formation.execution_order,
    execution_waves: waves,
    nodes: receipts,
    summary: {
      total: receipts.length,
      completed: receipts.filter((row) => row.status === 'completed').length,
      completed_with_dead_letter: receipts.filter((row) => row.status === 'completed_with_dead_letter').length,
      blocked: receipts.filter((row) => row.status === 'blocked_by_dependency').length,
      failed_quality: receipts.filter((row) => row.status === 'failed_quality').length,
      failed: receipts.filter((row) => row.status === 'failed').length
    }
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const requestPath = argValue(argv, '--request');
  if (!requestPath) throw new Error('--request is required');

  const rootDir = process.cwd();
  const request = readJson(path.resolve(rootDir, requestPath));
  const formation = planFormation({ request, rootDir });
  const execute = hasFlag(argv, '--execute');

  const receipt = execute
    ? await executeFormation({ formation, rootDir })
    : {
        schema: 'evercraft.saban.formation-receipt.v1',
        formation_id: formation.formation_id,
        generated_at: new Date().toISOString(),
        mode: 'plan_only',
        execution_order: formation.execution_order,
        execution_waves: formation.execution_waves,
        nodes: formation.nodes.map((node) => ({
          node_id: node.node_id,
          software_id: node.plan.software_id,
          logical_agents: node.plan.logical_agents,
          physical_workers: node.plan.physical_workers,
          work_item_count: node.plan.work_item_count,
          depends_on: node.depends_on,
          execution_mode: node.execution?.mode || 'local'
        }))
      };

  const outDir = path.join('artifacts', 'saban-multiplier', 'formations', formation.formation_id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'latest.json'),
    JSON.stringify(receipt, null, 2) + '\n'
  );

  if (
    execute &&
    (
      Number(receipt.summary?.failed || 0) > 0 ||
      Number(receipt.summary?.failed_quality || 0) > 0 ||
      Number(receipt.summary?.blocked || 0) > 0 ||
      Number(receipt.summary?.completed_with_dead_letter || 0) > 0
    )
  ) {
    process.exitCode = 2;
  }

  console.log(JSON.stringify({
    formation_id: formation.formation_id,
    nodes: formation.nodes.length,
    mode: execute ? 'execute' : 'plan_only',
    execution_waves: formation.execution_waves || null,
    summary: receipt.summary || null
  }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
