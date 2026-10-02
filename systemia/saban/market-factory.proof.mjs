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

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.saban.compute-market-factory-proof.v1',
    yard_broker_auto_discovered:true,
    voluntary_compute_auto_discovered:true,
    canonical_market_stack_priority_preserved:true,
    public_market_discovery_supported:true,
    configured_market_credentials_detected:true,
    no_paid_capacity_auto_authority:true,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
