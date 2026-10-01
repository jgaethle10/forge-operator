import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { normalizeMicroDeviceManifest } from '../systemia/saban/microseed-device-bridge.mjs';
import { createMicroSeedMqttAdapter } from '../systemia/saban/microseed-mqtt-adapter.mjs';
import { invokeMicroSeedCapability } from '../systemia/saban/microseed-capability-executor.mjs';

function encRemaining(n){
  const out=[];
  do{
    let d=n%128;
    n=Math.floor(n/128);
    if(n>0)d|=0x80;
    out.push(d);
  }while(n>0);
  return Buffer.from(out);
}
function pkt(first,body=Buffer.alloc(0)){
  return Buffer.concat([Buffer.from([first]),encRemaining(body.length),body]);
}
function mqttString(v){
  const b=Buffer.from(String(v));
  const out=Buffer.alloc(2+b.length);
  out.writeUInt16BE(b.length,0);
  b.copy(out,2);
  return out;
}
function parsePackets(socket,onPacket){
  let buffer=Buffer.alloc(0);
  socket.on('data',chunk=>{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=2){
      let mult=1,remain=0,idx=1,digit;
      do{
        if(idx>=buffer.length)return;
        digit=buffer[idx++];
        remain+=(digit&127)*mult;
        mult*=128;
      }while(digit&128);
      const total=idx+remain;
      if(buffer.length<total)return;
      const raw=buffer.subarray(0,total);
      buffer=buffer.subarray(total);
      onPacket({type:raw[0]>>4,flags:raw[0]&15,body:raw.subarray(idx),raw});
    }
  });
}
async function startBroker(handler){
  const server=net.createServer(socket=>parsePackets(socket,p=>handler(socket,p)));
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',resolve);
  });
  const {port}=server.address();
  return {
    url:'mqtt://127.0.0.1:'+port,
    close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())),
  };
}
function manifest(endpoint,kind='observation',mapping={}){
  return normalizeMicroDeviceManifest({
    device_id:'mqtt-device-01',
    device_class:'sensor-hub',
    bridge_mode:'mqtt',
    authorization_ref:'owner-mqtt',
    endpoint,
    capabilities:[{
      kind,
      operations:['op'],
      protocol:'mqtt',
      endpoint,
      metadata:{mqtt:{operations:{op:mapping}}},
    }],
    resources:{cpu_units:0,memory_mb:0,storage_gb:0},
    attestation:{mode:'gateway_bound',gateway_identity:'mqtt-gateway'},
  });
}

test('MQTT subscribe-once receives exact bounded topic message',async()=>{
  let broker;
  try{
    broker=await startBroker((socket,p)=>{
      if(p.type===1){
        socket.write(Buffer.from([0x20,0x02,0x00,0x00]));
      }else if(p.type===8){
        const packetId=p.body.readUInt16BE(0);
        socket.write(Buffer.from([0x90,0x03,(packetId>>8)&255,packetId&255,0x00]));
        const body=Buffer.concat([
          mqttString('home/fridge/temperature'),
          Buffer.from('36.5'),
        ]);
        socket.write(pkt(0x30,body));
      }
    });
    const adapter=createMicroSeedMqttAdapter({
      credentialResolver:async()=>({username:'evercraft',password:'local-secret'}),
      timeoutMs:1000,
    });
    const m=manifest(broker.url,'observation',{
      type:'subscribe_once',
      topic:'home/fridge/temperature',
    });
    const result=await adapter.invokeCapability({
      manifest:m,
      capability:m.declared_capabilities[0],
      operation:'op',
      payload:null,
      idempotency_key:'obs-1',
    });
    assert.equal(result.ok,true);
    assert.equal(result.type,'subscribe_once');
    assert.equal(result.topic,'home/fridge/temperature');
    assert.equal(result.payload_text,'36.5');
    assert.equal(result.wildcard_subscription,false);
    assert.equal(result.credential_exposed,false);
    assert.equal(JSON.stringify(result).includes('local-secret'),false);
  }finally{
    if(broker) await broker.close();
  }
});

test('MQTT QoS1 publish is approval-gated and injects explicit idempotency key',async()=>{
  let broker;
  let connections=0;
  let published=null;
  try{
    broker=await startBroker((socket,p)=>{
      if(p.type===1){
        connections+=1;
        socket.write(Buffer.from([0x20,0x02,0x00,0x00]));
      }else if(p.type===3){
        let offset=0;
        const len=p.body.readUInt16BE(offset); offset+=2;
        const topic=p.body.subarray(offset,offset+len).toString(); offset+=len;
        const packetId=p.body.readUInt16BE(offset); offset+=2;
        published={topic,payload:p.body.subarray(offset).toString()};
        socket.write(Buffer.from([0x40,0x02,(packetId>>8)&255,packetId&255]));
      }
    });
    const adapter=createMicroSeedMqttAdapter({timeoutMs:1000});
    const m=manifest(broker.url,'actuation',{
      type:'publish',
      topic:'home/thermostat/set',
      qos:1,
      payload_mode:'json',
      include_idempotency_key:true,
    });

    await assert.rejects(
      ()=>adapter.invokeCapability({
        manifest:m,
        capability:m.declared_capabilities[0],
        operation:'op',
        payload:{temperature_f:72},
        idempotency_key:'set-72',
      }),
      /actuation_approval_required/
    );
    assert.equal(connections,0);

    const result=await adapter.invokeCapability({
      manifest:m,
      capability:m.declared_capabilities[0],
      operation:'op',
      payload:{temperature_f:72},
      idempotency_key:'set-72',
      approval_ref:'approved-72',
    });
    assert.equal(result.ok,true);
    assert.equal(result.delivery_acknowledged,true);
    assert.equal(result.idempotency_key_in_payload,true);
    assert.equal(published.topic,'home/thermostat/set');
    assert.deepEqual(JSON.parse(published.payload),{
      temperature_f:72,
      _evercraft_idempotency_key:'set-72',
    });
  }finally{
    if(broker) await broker.close();
  }
});

test('MQTT wildcard topics are rejected before connecting',async()=>{
  const adapter=createMicroSeedMqttAdapter({timeoutMs:500});
  const m=manifest('mqtt://127.0.0.1:65530','observation',{
    type:'subscribe_once',
    topic:'home/+/temperature',
  });
  await assert.rejects(
    ()=>adapter.invokeCapability({
      manifest:m,
      capability:m.declared_capabilities[0],
      operation:'op',
      idempotency_key:'wild',
    }),
    /wildcarded/
  );
});

test('post-send MQTT uncertainty freezes consequential retry at capability layer',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'saban-mqtt-uncertain-'));
  let broker;
  let publishes=0;
  try{
    broker=await startBroker((socket,p)=>{
      if(p.type===1){
        socket.write(Buffer.from([0x20,0x02,0x00,0x00]));
      }else if(p.type===3){
        publishes+=1;
        // Deliberately never PUBACK. The physical/broker outcome is unknown.
      }
    });
    const adapter=createMicroSeedMqttAdapter({timeoutMs:550});
    const m=manifest(broker.url,'actuation',{
      type:'publish',
      topic:'charger/command',
      qos:1,
      payload_mode:'json',
      include_idempotency_key:true,
    });
    const request={
      device_id:'mqtt-device-01',
      capability_index:0,
      operation:'op',
      idempotency_key:'charger-command-1',
      payload:{command:'pause'},
      approval_ref:'approved-pause',
    };

    await assert.rejects(
      ()=>invokeMicroSeedCapability({
        manifest:m,
        trustDecision:{eligible:true,state:'active'},
        request,
        stateDir:root,
        bridgeAdapters:{mqtt:adapter},
      }),
      /outcome_unknown_manual_reconciliation_required/
    );
    assert.equal(publishes,1);

    await assert.rejects(
      ()=>invokeMicroSeedCapability({
        manifest:m,
        trustDecision:{eligible:true,state:'active'},
        request,
        stateDir:root,
        bridgeAdapters:{mqtt:adapter},
      }),
      /prior_outcome_unknown/
    );
    assert.equal(publishes,1);
  }finally{
    if(broker) await broker.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
