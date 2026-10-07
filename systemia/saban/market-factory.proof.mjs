import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildComputeMarketAdapters,
  discoverRemoteBrokerDeployment,
} from './market-factory.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-market-factory-'));
try{
  fs.writeFileSync(path.join(root,'broker.json'),JSON.stringify({
    deployment_id:'remote-capacity-broker-proof',
    state:'ready',
    updated_at:'2026-09-30T21:30:00Z',
    receipt:{
      workload_class:'systemia.remote-capacity-broker.v1',
      capacity_node_id:'proof-node',
    },
    result:{
      service_id:'remote_broker_service',
    },
  },null,2));

  assert.equal(
    discoverRemoteBrokerDeployment(root),
    'remote-capacity-broker-proof'
  );

  const internal=await buildComputeMarketAdapters({
    acquisition:{auto_discover_markets:true},
    env:{EVERCRAFT_YARD_STATE_DIR:root},
    cwd:root,
  });
  assert.ok(internal.markets.includes('evercraft-broker'));
  assert.equal(internal.paid_capacity_auto_authorized,false);

  const voluntary=await buildComputeMarketAdapters({
    acquisition:{auto_discover_markets:true},
    env:{EVERCRAFT_VOLUNTARY_COMPUTE_ENDPOINT:'http://127.0.0.1:9999'},
    cwd:root,
  });
  assert.ok(voluntary.markets.includes('evercraft-voluntary'));
  assert.equal(
    voluntary.inventory.find((row)=>row.market==='evercraft-voluntary')?.priority,
    20
  );

  const publicDiscovery=await buildComputeMarketAdapters({
    acquisition:{
      auto_discover_markets:true,
      public_market_discovery:true,
    },
    env:{},
    cwd:root,
  });
  assert.ok(publicDiscovery.markets.includes('akash'));
  assert.equal(
    publicDiscovery.diagnostics.find((row)=>row.market==='akash')?.source,
    'public_discovery_only'
  );

  const configuredAkash=await buildComputeMarketAdapters({
    acquisition:{auto_discover_markets:true},
    env:{AKASH_API_KEY:'proof-key'},
    cwd:root,
  });
  assert.ok(configuredAkash.markets.includes('akash'));
  assert.equal(
    configuredAkash.diagnostics.find((row)=>row.market==='akash')?.lease_credentials_present,
    true
  );

  const none=await buildComputeMarketAdapters({
    acquisition:{auto_discover_markets:true},
    env:{},
    cwd:path.join(root,'missing'),
  });
  assert.deepEqual(none.markets,[]);

  
const declarative=await buildComputeMarketAdapters({
  acquisition:{
    auto_discover_markets:true,
    zero_spend_only:true,
    markets:{
      evercraft_broker:{
        enabled_if_configured:true,
        state_dir_env:'PROOF_YARD_STATE',
        broker_deployment_id_env:'PROOF_BROKER_ID',
      },
      evercraft_voluntary:{
        enabled_if_configured:true,
        endpoint:'http://127.0.0.1:9999',
        control_token_env:'PROOF_VOLUNTARY_TOKEN',
      },
      golem:{enabled:false},
      akash:{enabled:false},
    },
  },
  env:{
    PROOF_YARD_STATE:root,
    PROOF_BROKER_ID:'remote-capacity-broker-proof',
    PROOF_VOLUNTARY_TOKEN:'declarative-market-proof',
  },
  cwd:root,
});
assert.equal(declarative.declarative_market_policy,true);
assert.ok(declarative.markets.includes('evercraft-broker'));
assert.ok(declarative.markets.includes('evercraft-voluntary'));
assert.equal(declarative.markets.includes('golem'),false);
assert.equal(declarative.markets.includes('akash'),false);
assert.equal(declarative.paid_capacity_auto_authorized,false);

console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.compute-market-factory-proof.v1',
    yard_broker_auto_discovered:true,
    voluntary_compute_auto_discovered:true,
    canonical_market_stack_priority_preserved:true,
    public_market_discovery_supported:true,
    configured_market_credentials_detected:true,
    no_paid_capacity_auto_authority:true,
    declarative_formation_market_policy_supported:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
