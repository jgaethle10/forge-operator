import assert from 'node:assert/strict';
import {
  planFormation,
  executeFormation,
} from './formation.mjs';
import { runRegisteredAssignment } from './registered-worker.mjs';
import { startVoluntaryComputeExchange } from './voluntary-exchange.mjs';
import { registerVoluntaryProvider } from './markets/evercraft-voluntary.mjs';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const exchange=await startVoluntaryComputeExchange({
  host:'127.0.0.1',
  port:0,
  providerOfferTtlMs:60000,
  maxLeaseSeconds:900,
});

const previousToken=process.env.EVERCRAFT_VOLUNTARY_CONTROL_TOKEN;
let running=true;
let providerLoop=null;

try{
  const auth=exchange.controlHeaders().authorization;
  const controlToken=String(auth||'').replace(/^Bearer\s+/,'');
  assert.ok(controlToken);
  process.env.EVERCRAFT_VOLUNTARY_CONTROL_TOKEN=controlToken;

  const provider=await registerVoluntaryProvider({
    endpoint:exchange.endpoint,
    provider_id:'formation-auto-voluntary-provider',
    resources:{
      cpu_units:4,
      memory_mb:4096,
      storage_gb:10,
      gpu_count:0,
    },
    workload_classes:['saban.multiplier-assignment.v1'],
    economics:{zero_cost:true,hourly_usd:0},
    trust:{uptime_7d:0.99,attested:false},
    terms_ref:'proof:formation-auto-acquisition',
  });

  providerLoop=(async()=>{
    const handled=new Set();
    while(running){
      const proposal=await provider.pollProposal();
      if(proposal&&!handled.has(proposal.proposal_id)){
        handled.add(proposal.proposal_id);
        await provider.respond(proposal,{decision:'accept'});
      }
      const job=await provider.pollJob();
      if(job){
        try{
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
              state:'formation_registered_assignment_completed',
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

  const request={
    schema:'evercraft.saban.formation-request.v1',
    formation_id:'formation-auto-acquisition-proof',
    nodes:[{
      id:'chum-auto-acquire',
      software:'chum',
      logical_agents:4,
      physical_workers:2,
      reconcile:false,
      execution:{
        mode:'nodeseed_pool',
        endpoints:[],
        discover:false,
        max_concurrency_per_node:2,
        assignment_timeout_ms:5000,
        acquisition:{
          enabled:true,
          zero_spend_only:true,
          negotiation_level:'lease',
          markets:{
            evercraft_broker:{enabled:false},
            evercraft_voluntary:{
              enabled:true,
              endpoint:exchange.endpoint,
              control_token_env:'EVERCRAFT_VOLUNTARY_CONTROL_TOKEN',
            },
            golem:{enabled:false},
            akash:{enabled:false},
          },
        },
      },
    }],
  };

  const formation=planFormation({
    request,
    rootDir:process.cwd(),
  });
  const receipt=await executeFormation({
    formation,
    rootDir:process.cwd(),
  });

  assert.equal(receipt.summary.total,1);
  assert.equal(receipt.summary.completed,1);
  assert.equal(receipt.summary.failed,0);

  const node=receipt.nodes[0];
  assert.equal(node.status,'completed');
  assert.equal(node.execution_mode,'nodeseed_pool');
  assert.equal(
    node.receipt.execution_fabric,
    'evercraft.negotiated-adapter-pool.v1'
  );
  assert.equal(
    node.receipt.pool_summary.capacity_acquisition.market,
    'evercraft-voluntary'
  );
  assert.equal(
    node.receipt.pool_summary.capacity_acquisition.provider_id,
    'formation-auto-voluntary-provider'
  );
  assert.equal(node.receipt.scheduler_summary.counts.completed,4);
  assert.equal(node.receipt.node_pool_receipt.failed_assignments,0);
  assert.equal(
    JSON.stringify(receipt).includes(controlToken),
    false
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.formation-auto-acquisition-proof.v1',
    formation_id:receipt.formation_id,
    configured_nodeseeds:0,
    acquisition_policy_declared_in_formation:true,
    adapters_built_at_runtime:true,
    zero_spend_authority_generated:true,
    provider:'formation-auto-voluntary-provider',
    market:'evercraft-voluntary',
    assignments_completed:node.receipt.scheduler_summary.counts.completed,
    runtime_secret_not_serialized:true,
    arbitrary_shell_required:false,
    negotiation_receipt:
      node.receipt.pool_summary.capacity_acquisition.negotiation_receipt,
  },null,2));
}finally{
  running=false;
  if(providerLoop) await providerLoop.catch(()=>{});
  if(previousToken==null){
    delete process.env.EVERCRAFT_VOLUNTARY_CONTROL_TOKEN;
  }else{
    process.env.EVERCRAFT_VOLUNTARY_CONTROL_TOKEN=previousToken;
  }
  await exchange.close();
}
