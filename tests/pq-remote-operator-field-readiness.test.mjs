import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectPqOperatorField} from '../systemia/crypto/pq-remote-operator-field-readiness.mjs';

function fixture(fn) {
  const home=fs.mkdtempSync(path.join(os.tmpdir(),'pq-operator-ready-'));
  try {
    const stateRoot=path.join(home,'.local/state/evercraft/organism');
    fs.mkdirSync(path.join(stateRoot,'compute'),{recursive:true});
    return fn({home,stateRoot});
  } finally {
    fs.rmSync(home,{force:true,recursive:true});
  }
}

test('missing host configuration is unverified, no environment or remote probes required',async()=>{
  await fixture(async({home,stateRoot})=>{
    let called=false;
    const result=await inspectPqOperatorField({
      home,stateRoot,activeCheck:()=>false,fetchImpl:async()=>{called=true;throw Error('must not fetch');}
    });
    assert.equal(called,false);
    assert.equal(result.production_ready,false);
    assert.equal(result.field_courier_transfer_performed,false);
    assert.equal(result.broker_control_grant_for_this_node,'not_verified');
    assert.equal(result.remote_operator_enabled_in_receipt,false);
    assert.equal(result.loopback_endpoint_verified,false);
    assert.equal(result.local_remote_operator_capability_ready,false);
  });
});

test('existing local receipt proves readiness, never claims actual broker enrollment',async()=>{
  await fixture(async({home,stateRoot})=>{
    const cfg=path.join(home,'.config/evercraft');
    fs.mkdirSync(cfg,{recursive:true});
    fs.writeFileSync(path.join(cfg,'local-organism.env'),
      'EVERCRAFT_REMOTE_BROKER_URL="https://broker-secret.example"\nEVERCRAFT_ALLOCATOR_TOKEN=secret-should-not-print\n');
    fs.writeFileSync(path.join(stateRoot,'local-organism-receipt.json'),
      JSON.stringify({remote_operator:{enabled:true},remote_admission:{state:'connected-secret-do-not-print'}}));
    fs.writeFileSync(path.join(stateRoot,'compute/nodeseed-receipt.json'),
      JSON.stringify({endpoint:'http://127.0.0.1:45678',secrets:'should-not-print'}));
    const result=await inspectPqOperatorField({
      home,stateRoot,activeCheck:()=>true,fetchImpl:async(url,options)=>{
        assert.equal(url.toString(),'http://127.0.0.1:45678/v1/capacity');
        assert.equal(options.method,'GET');
        return {ok:true,json:async()=>({
          capacity_hint:{services:{remote_operator:{ready:true}}},
          secret:'should-not-print'
        })};
      }
    });
    assert.equal(result.remote_broker_origin_configured,true);
    assert.equal(result.local_remote_operator_capability_ready,true);
    assert.equal(result.production_ready,false);
    assert.equal(result.broker_control_grant_for_this_node,'not_verified');
    assert.ok(!JSON.stringify(result).includes('secret'));
    assert.ok(!JSON.stringify(result).includes('45678'));
  });
});

test('non-loopback receipt cannot trigger a remote request',async()=>{
  await fixture(async({home,stateRoot})=>{
    fs.writeFileSync(path.join(stateRoot,'compute/nodeseed-receipt.json'),
      JSON.stringify({endpoint:'https://untrusted.example:443',token:'never-show'}));
    let requests=0;
    const result=await inspectPqOperatorField({
      home,stateRoot,activeCheck:()=>true,fetchImpl:async()=>{
        requests++;return {ok:true,json:async()=>({})};
      }
    });
    assert.equal(requests,0);
    assert.equal(result.loopback_endpoint_verified,false);
    assert.equal(result.local_remote_operator_capability_ready,false);
    assert.equal(result.production_ready,false);
  });
});
