import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import {sealEnvelope} from '../systemia/network/secure-envelope.mjs';

const tool=fileURLToPath(new URL('../systemia/network/field-outage-lab.mjs',import.meta.url));
const run=(args,input='')=>{
  const r=spawnSync(process.execPath,[tool,...args],{input,encoding:'utf8',timeout:5000});
  assert.equal(r.status,0,`command failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
};
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const portAvailable=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const waitHello=async port=>{for(let i=0;i<35;i++){try{const r=await fetch(`http://127.0.0.1:${port}/v1/hello?challenge=${'f'.repeat(32)}`);if(r.ok)return;}catch{}await wait(60);}throw Error('listener_not_ready');};

test('two local processes: explicit trust, encrypted exchange, outage queue, restart and negative controls (NOT physical field evidence)',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-field-outage-'));
  fs.chmodSync(dir,0o700);
  const key=path.join(dir,'pair.key'),a=path.join(dir,'a'),b=path.join(dir,'b');
  fs.mkdirSync(a,{mode:0o700});fs.mkdirSync(b,{mode:0o700});
  const p=await portAvailable();let server=null;
  const baseA=['--id','alpha','--peer-id','beta','--state',a,'--key-file',key];
  const baseB=['--id','beta','--peer-id','alpha','--state',b,'--key-file',key];
  const start=async()=>{server=spawn(process.execPath,[tool,'serve',...baseB,'--port',String(p)],{stdio:'ignore'});await waitHello(p);};
  const stop=async()=>{if(!server)return;const child=server;server=null;child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));};
  try{
    run(['init-key','--key-file',key]);
    await start();
    const queue=run(['send',...baseA],'encrypted hello');assert.equal(queue.state,'QUEUED');
    const first=run(['flush',...baseA,'--peer-url',`http://127.0.0.1:${p}/`]);
    assert.equal(first.delivered,1);assert.equal(first.peer_authenticated,true);
    const sendLog=fs.readFileSync(path.join(a,'receipts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    const deliveredReceipt=sendLog.find(x=>x.event==='message.delivered');
    assert.match(deliveredReceipt?.envelope_hash||'',/^[0-9a-f]{64}$/);
    const received=run(['inbox','--id','beta','--state',b,'--key-file',key]);
    assert.equal(received.messages[0].message,'encrypted hello');
    assert.equal(run(['status','--state',a]).outbox,0);
    const saved=JSON.parse(fs.readFileSync(path.join(b,'inbox',`${queue.message_id}.json`),'utf8'));
    const duplicate=await fetch(`http://127.0.0.1:${p}/v1/envelope`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(saved)});
    assert.equal(duplicate.status,200);assert.equal((await duplicate.json()).duplicate,true);
    const changed=sealEnvelope({key:fs.readFileSync(key),key_id:'offline-paired-lab',source:'alpha',destination:'beta',kind:'continuity.message',message_id:queue.message_id,payload:{message:'conflicting ciphertext'},irreversible:false});
    const conflict=await fetch(`http://127.0.0.1:${p}/v1/envelope`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(changed)});
    assert.equal(conflict.status,409);
    assert.equal(run(['inbox','--id','beta','--state',b,'--key-file',key]).messages[0].message,'encrypted hello');

    // Attacker who cannot authenticate the secure envelope is refused.
    const rejected=await fetch(`http://127.0.0.1:${p}/v1/envelope`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({source:'intruder',destination:'beta',irreversible:false})});
    assert.equal(rejected.status,403);

    await stop();
    run(['send',...baseA],'queued during blackout');
    const offline=run(['flush',...baseA,'--peer-url',`http://127.0.0.1:${p}/`]);
    assert.equal(offline.state,'NO_ROUTE');
    assert.equal(run(['status','--state',a]).outbox,1);
    await start();
    const recovered=run(['flush',...baseA,'--peer-url',`http://127.0.0.1:${p}/`]);
    assert.equal(recovered.delivered,1);assert.equal(run(['status','--state',b]).inbox,2);
    const recvLog=fs.readFileSync(path.join(b,'receipts.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(recvLog.some(x=>x.event==='message.received'&&x.message_id===deliveredReceipt.message_id&&x.envelope_hash===deliveredReceipt.envelope_hash));
    assert.equal(run(['status','--state',a]).outbox,0);
    const sim=run(['simulate']);assert.equal(sim.simulation_only,true);
    assert.equal(sim.admissible.some(x=>x.id==='sim-stranger'),false);
    console.log(JSON.stringify({schema:'evercraft.network.offline-loopback-test.v1',result:'PASS',two_node_processes:true,distinct_physical_devices:false,initial_delivery:1,queued_during_loss:1,recovered_delivery:1,unauthorized_sender_rejected:true,conflicting_replay_rejected:true,duplicate_idempotent:true,unconsented_capacity_rejected:true,upstream_access_required:false}));
  }finally{await stop();fs.rmSync(dir,{force:true,recursive:true});}
});
