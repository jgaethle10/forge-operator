import assert from 'node:assert/strict';
import path from 'node:path';
import {
  buildMultiplicationPlan,
  loadMultiplicationRegistry,
  resolveMultiplicationContract,
} from './multiplier.mjs';
import { executeDistributedMultiplicationPlan } from './distributed-executor.mjs';
import { runRegisteredAssignment } from './registered-worker.mjs';
import { startVoluntaryComputeExchange } from './voluntary-exchange.mjs';
import {
  createEvercraftVoluntaryMarketAdapter,
  registerVoluntaryProvider,
} from './markets/evercraft-voluntary.mjs';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const exchange=await startVoluntaryComputeExchange({
  host:'127.0.0.1',
  port:0,
  providerOfferTtlMs:60000,
  maxLeaseSeconds:900,
});

let running=true;
let providerLoop=null;
try{
  const provider=await registerVoluntaryProvider({
    endpoint:exchange.endpoint,
    provider_id:'automatic-voluntary-chum-provider',
    resources:{
      cpu_units:4,
      memory_mb:4096,
      storage_gb:10,
      gpu_count:0,
    },
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{zero_cost:true,hourly_usd:0},
    trust:{uptime_7d:0.99,attested:false},
    terms_ref:'proof:automatic-voluntary-acquisition',
  });

  providerLoop=(async()=>{
    const handledProposals=new Set();
    while(running){
      const proposal=await provider.pollProposal();
      if(proposal&&!handledProposals.has(proposal.proposal_id)){
        handledProposals.add(proposal.proposal_id);
        await provider.respond(proposal,{decision:'accept'});
      }

      const job=await provider.pollJob();
      if(job){
        try{
          assert.equal(job.workload_class,'saban.multiplier-assignment.v1');
          const worker=await runRegisteredAssignment({
            software:job.input.software,
            assignment:job.input.assignment,
            rootDir:process.cwd(),
          });
          await provider.submitJobResult(job,{
            ok:true,
            result:worker,
            checkpoint:{
              step:1,
              state:'registered_assignment_completed',
            },
          });
        }catch(error){
          await provider.submitJobResult(job,{
            ok:false,
            error:String(error?.message||error),
          });
        }
      }
      await sleep(10);
    }
  })();

  const market=createEvercraftVoluntaryMarketAdapter({
    endpoint:exchange.endpoint,
    controlHeaders:exchange.controlHeaders,
    proposalPollMs:10,
    proposalTimeoutMs:3000,
  });

  const registry=loadMultiplicationRegistry(
    path.resolve(process.cwd(),'systemia/saban/multiplication-registry.json')
  );
  const contract=resolveMultiplicationContract('chum',registry);
  const workItems=[{
    kind:'product',
    key:'voluntary-auto-proof',
    source_file:null,
    raw:{
      canonical_url:'https://example.com/voluntary-auto-proof',
      intents:['discover','evaluate','route'],
      authority:'proof',
      boundaries:['public only'],
    },
  }];
  const plan=buildMultiplicationPlan({
    contract,
    logicalAgents:4,
    physicalWorkers:2,
    workItems,
  });

  const receipt=await executeDistributedMultiplicationPlan({
    contract,
    plan,
    workItems,
    rootDir:process.cwd(),
    reconcile:false,
    nodePool:{
      endpoints:[],
      discover:false,
      maxConcurrencyPerNode:2,
      assignmentTimeoutMs:5000,
      acquisition:{
        enabled:true,
        demand_id:'automatic-voluntary-acquisition-proof',
        negotiation_level:'lease',
        prefer_zero_cost:true,
        max_total_usd:0,
        max_hourly_usd:0,
        adapters:[market],
        quoteAuthority:{
          schema:'evercraft.saban.compute-authority.v1',
          approved:true,
          demand_id:'automatic-voluntary-acquisition-proof',
          allowed_markets:['evercraft-voluntary'],
        },
        leaseAuthority:{
          schema:'evercraft.saban.compute-authority.v1',
          approved:true,
          demand_id:'automatic-voluntary-acquisition-proof',
          allowed_markets:['evercraft-voluntary'],
          max_total_usd:0,
        },
      },
    },
  });

  assert.equal(receipt.scheduler_summary.counts.completed,4);
  assert.equal(
    receipt.execution_fabric,
    'evercraft.negotiated-adapter-pool.v1'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.market,
    'evercraft-voluntary'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.provider_id,
    'automatic-voluntary-chum-provider'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.execution_fabric,
    'evercraft.negotiated-adapter-pool.v1'
  );
  assert.equal(
    receipt.pool_summary.capacity_acquisition.execution_ready,
    true
  );
  assert.equal(receipt.node_pool_receipt.completed_assignments,4);
  assert.equal(receipt.node_pool_receipt.failed_assignments,0);
  assert.equal(receipt.sample_results.length,4);
  assert.ok(receipt.sample_results.every((row)=>row.status==='finding'));
  assert.ok(
    receipt.node_pool_receipt.results.every((row)=>
      row.compute_receipt?.startsWith('sha256:')
    )
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.automatic-voluntary-acquisition-proof.v1',
    configured_nodeseeds:0,
    acquisition_triggered:true,
    provider:'automatic-voluntary-chum-provider',
    execution_fabric:receipt.execution_fabric,
    assignments_completed:receipt.scheduler_summary.counts.completed,
    registered_worker_boundary_preserved:true,
    arbitrary_shell_required:false,
    negotiation_receipt:
      receipt.pool_summary.capacity_acquisition.negotiation_receipt,
    lease_receipt:
      receipt.pool_summary.capacity_acquisition.lease_receipt,
  },null,2));
}finally{
  running=false;
  if(providerLoop) await providerLoop.catch(()=>{});
  await exchange.close();
}
