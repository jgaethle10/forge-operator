import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAmbientFabricPlan } from '../systemia/saban/ambient-fabric-executor.mjs';

const device='test-authorized-device';
function fixture(){
  return {
    plan:{
      schema:'evercraft.saban.heterogeneous-fabric-plan.v1',
      receipt_hash:'sha256:'+'a'.repeat(64),
      placements:['bad','good'].map(id=>({
        unit_id:'unit-'+id,
        task_id:'task-'+id,
        market:'ambient-fabric',
        device_id:device,
        offer_id:'synthetic:'+id,
      })),
    },
    tasks:['bad','good'].map(id=>({
      task_id:'task-'+id,
      workload_class:'systemia.content-hash.v1',
      resources_per_execution:{memory_mb:64,cpu_units:0.1},
    })),
  };
}

function stubGateway(calls){
  return async (url,options)=>{
    calls.push({url:String(url),body:JSON.parse(options.body)});
    return {
      ok:true,
      status:200,
      text:async()=>JSON.stringify({
        ok:true,
        receipt_hash:'sha256:'+'b'.repeat(64),
        execution_location:'synthetic_test_gateway',
        result:{algorithm:'sha256',digest:'synthetic-only'},
      }),
    };
  };
}

test('input provider fault holds just its unit and never dispatches its payload',async()=>{
  const {plan,tasks}=fixture();
  const calls=[];
  const receipt=await executeAmbientFabricPlan({
    plan,tasks,
    gatewayUrl:'http://127.0.0.1:8797',
    gatewayToken:'test-only',
    fetchImpl:stubGateway(calls),
    inputProvider:async({task})=>{
      if(task.task_id==='task-bad') throw Error('private_provider_secret_must_not_escape');
      return {payload:{value:'allowed'}};
    },
  });
  assert.equal(receipt.completed_units,1);
  assert.equal(receipt.failed_units,0);
  assert.equal(receipt.held_units,1);
  assert.equal(receipt.replan_required,true);
  assert.equal(receipt.held[0].unit_id,'unit-bad');
  assert.equal(receipt.held[0].reason,'workload_input_provider_failed');
  assert.equal(JSON.stringify(receipt).includes('private_provider_secret_must_not_escape'),false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.request.idempotency_key.startsWith('ambient:'),true);
  assert.equal(calls[0].body.request.payload.value,'allowed');
  assert.equal(receipt.results.find(r=>r.unit_id==='unit-good').status,'completed');
});

test('telemetry provider fault is a safety hold, not a bypass or batch crash',async()=>{
  const {plan,tasks}=fixture();
  const calls=[];
  const receipt=await executeAmbientFabricPlan({
    plan,tasks,
    gatewayUrl:'http://127.0.0.1:8797',
    gatewayToken:'test-only',
    fetchImpl:stubGateway(calls),
    inputProvider:async()=>({payload:{value:'safe'}}),
    telemetryProvider:async({task})=>{
      if(task.task_id==='task-bad') throw Error('private_telemetry_token_must_not_escape');
      return {primary_function_busy:false};
    },
  });
  assert.equal(receipt.completed_units,1);
  assert.equal(receipt.failed_units,0);
  assert.equal(receipt.held_units,1);
  assert.equal(receipt.replan_required,true);
  assert.equal(receipt.held[0].reason,'telemetry_provider_failed');
  assert.equal(JSON.stringify(receipt).includes('private_telemetry_token_must_not_escape'),false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.request.device_id,device);
  assert.deepEqual(calls[0].body.telemetry,{primary_function_busy:false});
});

test('all provider faults yield a complete held receipt without contacting a gateway',async()=>{
  const {plan,tasks}=fixture();
  let called=false;
  const receipt=await executeAmbientFabricPlan({
    plan,tasks,
    gatewayUrl:'http://127.0.0.1:8797',
    gatewayToken:'test-only',
    fetchImpl:async()=>{called=true;throw Error('should_not_call');},
    inputProvider:async()=>{throw Error('not_available');},
  });
  assert.equal(called,false);
  assert.equal(receipt.completed_units,0);
  assert.equal(receipt.held_units,2);
  assert.equal(receipt.results.length,2);
  assert.equal(receipt.replan_required,true);
  assert.equal(receipt.gateway_token_exposed,false);
});
