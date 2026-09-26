import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const address=socket.address();
  const port=typeof address==='object'?address.port:0;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-organism-proof-'));
const out=path.join(root,'artifacts');
const state=path.join(root,'state');
const port=await freeUdpPort();

const env={
  ...process.env,
  EVERCRAFT_RELEASE_REF:'9768cc2548afe0da33e3dac2440c8afabe0c41a1',
  EVERCRAFT_PUBLIC_EDGE_ARTIFACT_DIR:out,
  EVERCRAFT_PUBLIC_EDGE_STATE_DIR:state,
  EVERCRAFT_DISCOVERY_BIND_ADDRESS:'127.0.0.1',
  EVERCRAFT_DISCOVERY_MULTICAST_ADDRESS:'127.0.0.1',
  EVERCRAFT_DISCOVERY_PORT:String(port),
  EVERCRAFT_DISCOVERY_TIMEOUT_MS:'150',
  EVERCRAFT_DISCOVERY_JOIN_MULTICAST:'false',
};

try{
  const first=JSON.parse(execFileSync(
    process.execPath,
    ['systemia/organism/public-edge-activation-watch-runner.mjs'],
    {encoding:'utf8',env}
  ));
  assert.equal(first.ok,true);
  assert.equal(first.action,'hold');
  assert.equal(first.reason,'no_edge_ready_compute_node');
  assert.equal(first.founder_action_required,false);
  assert.equal(first.public_https_verified,false);
  assert.equal(first.material_change,true);

  const latest1=JSON.parse(fs.readFileSync(path.join(out,'latest.json'),'utf8'));
  const snapshot1=JSON.parse(fs.readFileSync(path.join(out,'mission-snapshot.json'),'utf8'));
  assert.equal(latest1.action,'hold');
  assert.equal(latest1.founder_action_required,false);
  assert.equal(snapshot1.schema,'evercraft.kaidance.mission-snapshot.v1');
  assert.equal(snapshot1.workflow_key,'public-edge-activation-watch');
  assert.equal(snapshot1.material_change,true);
  assert.equal(snapshot1.counts.admitted,0);
  assert.equal(snapshot1.counts.held,1);

  const second=JSON.parse(execFileSync(
    process.execPath,
    ['systemia/organism/public-edge-activation-watch-runner.mjs'],
    {encoding:'utf8',env}
  ));
  assert.equal(second.ok,true);
  assert.equal(second.action,'hold');
  assert.equal(second.reason,'no_edge_ready_compute_node');
  assert.equal(second.founder_action_required,false);
  assert.equal(second.material_change,false);

  const snapshot2=JSON.parse(fs.readFileSync(path.join(out,'mission-snapshot.json'),'utf8'));
  assert.equal(snapshot2.material_change,false);
  assert.equal(snapshot2.counts.changed,0);
  assert.equal(snapshot2.counts.held,1);

  const stateText=fs.existsSync(path.join(state,'public-edge-activation-watch.json'))
    ? fs.readFileSync(path.join(state,'public-edge-activation-watch.json'),'utf8')
    : '';
  assert.equal(stateText.includes('allocator'),false);

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.activation-watch-organism-proof.v1',
    cadence_seconds:300,
    first_cycle_hold:true,
    founder_action_required:false,
    second_identical_cycle_material_change:false,
    kaidance_snapshot:true,
    allocator_authority_persisted:false,
    public_https_verified:false,
    first_receipt:first.receipt,
    second_receipt:second.receipt,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
