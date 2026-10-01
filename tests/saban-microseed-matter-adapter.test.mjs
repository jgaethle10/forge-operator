import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMatterCommand,
  createMicroSeedMatterAdapter,
} from '../systemia/saban/microseed-matter-adapter.mjs';
import {
  evaluateMicroSeedAdapterAvailability,
  buildMicroSeedAdapterHealth,
} from '../systemia/saban/microseed-adapter-catalog.mjs';

const observation={
  kind:'observation',
  operations:['observe'],
  metadata:{
    matter:{
      node_id:'1234',
      endpoint:'1',
      operations:{
        observe:{
          type:'read',
          cluster:'TemperatureMeasurement',
          attribute:'MeasuredValue',
        },
      },
    },
  },
};

const actuation={
  kind:'actuation',
  operations:['set_mode'],
  metadata:{
    consequential:true,
    matter:{
      node_id:'1234',
      endpoint:'1',
      operations:{
        set_mode:{
          type:'command',
          cluster:'Thermostat',
          command:'SetpointRaiseLower',
          args:['$payload.mode','$payload.amount'],
        },
      },
    },
  },
};

const manifest={
  schema:'evercraft.microseed.device-manifest.v1',
  device_id:'matter-device-01',
  bridge_mode:'matter',
};

test('Matter read command is exact argv with no shell construction',()=>{
  assert.deepEqual(buildMatterCommand({
    capability:observation,
    operation:'observe',
    payload:null,
  }),[
    'TemperatureMeasurement','read','MeasuredValue','1234','1'
  ]);
});

test('Matter command substitutes only explicitly declared payload fields',()=>{
  assert.deepEqual(buildMatterCommand({
    capability:actuation,
    operation:'set_mode',
    payload:{mode:'0',amount:'2',ignored:'must-not-appear'},
  }),[
    'Thermostat','SetpointRaiseLower','0','2','1234','1'
  ]);
});

test('Matter command builder rejects token and identifier injection',()=>{
  assert.throws(()=>buildMatterCommand({
    capability:{
      ...observation,
      metadata:{matter:{
        ...observation.metadata.matter,
        operations:{observe:{
          ...observation.metadata.matter.operations.observe,
          cluster:'TemperatureMeasurement;rm',
        }},
      }},
    },
    operation:'observe',
  }),/matter_cluster_invalid/);

  assert.throws(()=>buildMatterCommand({
    capability:{
      ...observation,
      metadata:{matter:{
        ...observation.metadata.matter,
        node_id:'1234 && whoami',
      }},
    },
    operation:'observe',
  }),/matter_node_id_invalid/);
});

test('Matter adapter uses execFile with shell false and approval-gates actuation',async()=>{
  const calls=[];
  const adapter=createMicroSeedMatterAdapter({
    chipTool:'/usr/bin/chip-tool',
    execFileImpl:async(executable,args,options)=>{
      calls.push({executable,args,options});
      return {stdout:'{"value":3500}\n',stderr:''};
    },
  });

  const read=await adapter.invokeCapability({
    manifest,
    capability:observation,
    operation:'observe',
    payload:null,
  });
  assert.equal(read.ok,true);
  assert.equal(read.shell_used,false);
  assert.equal(read.arbitrary_command_allowed,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].executable,'/usr/bin/chip-tool');
  assert.equal(calls[0].options.shell,false);
  assert.deepEqual(calls[0].args,[
    'TemperatureMeasurement','read','MeasuredValue','1234','1'
  ]);

  await assert.rejects(
    ()=>adapter.invokeCapability({
      manifest,
      capability:actuation,
      operation:'set_mode',
      payload:{mode:0,amount:2},
    }),
    /actuation_approval_required/
  );
  assert.equal(calls.length,1);

  const write=await adapter.invokeCapability({
    manifest,
    capability:actuation,
    operation:'set_mode',
    payload:{mode:0,amount:2},
    approval_ref:'approved-thermostat-change',
  });
  assert.equal(write.ok,true);
  assert.equal(calls.length,2);
  assert.deepEqual(calls[1].args,[
    'Thermostat','SetpointRaiseLower','0','2','1234','1'
  ]);
});

test('adapter catalog distinguishes implemented Matter code from missing runtime dependency',()=>{
  const absent=evaluateMicroSeedAdapterAvailability('matter',{
    runtime:{executables:{'chip-tool':false}},
  });
  assert.equal(absent.available,false);
  assert.equal(absent.reason,'runtime_dependency_missing:chip-tool');

  const present=evaluateMicroSeedAdapterAvailability('matter',{
    runtime:{executables:{'chip-tool':true}},
  });
  assert.equal(present.available,true);
  assert.equal(present.reason,'runtime_dependency_ready');

  const health=buildMicroSeedAdapterHealth({
    executables:{'chip-tool':true},
    observed_at:'2026-10-01T04:00:00.000Z',
  });
  assert.equal(health.adapters.native_agent.available,true);
  assert.equal(health.adapters.lan_api.available,true);
  assert.equal(health.adapters.matter.available,true);
  assert.equal(health.adapters.mqtt.available,false);
  assert.equal(health.adapters.mqtt.reason,'adapter_not_implemented');
  assert.match(health.receipt_hash,/^sha256:/);
});
