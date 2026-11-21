/**
 * End-to-end lab proof uses the REAL owned broker, two outbound NodeSeed agents,
 * remote operator reads/writes, and our PQ offline courier. All processes
 * are disposable and loopback-only on GitHub CI, NOT actual physical nodes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNodeSeed} from '../systemia/compute/node-seed.mjs';
import {startOutboundCapacityBroker} from '../systemia/network/outbound-capacity-broker.mjs';
import {startOutboundNodeAgent} from '../systemia/network/outbound-node-agent.mjs';
import {
  initializeCourierNode,sendSyntheticCourierMessage,receiveSyntheticCourierMessage
} from '../systemia/crypto/pq-offline-courier.mjs';
import {bridgePqPublicBundle,bridgePqCiphertext}
  from '../systemia/crypto/pq-remote-operator-bridge.mjs';

function grantGateway(grant) {
  assert.ok(grant?.capacity_endpoint);
  assert.ok(grant?.allocator_token);
  return {
    async invoke(route,{body}={}) {
      const response=await fetch(grant.capacity_endpoint+route,{
        method:'POST',
        headers:{'content-type':'application/json',
          authorization:'Bearer '+grant.allocator_token},
        body:JSON.stringify(body),
        signal:AbortSignal.timeout(15000)
      });
      const result=await response.json();
      if(!response.ok) throw new Error('Broker operator request denied');
      return result;
    }
  };
}

test('owned outbound broker conveys pinned public keys and ciphertext without any private-key transfer',
  {timeout:90000},async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'systemia-pq-broker-'));
  let broker,agent1,agent2,seed1,seed2;
  try {
    const aHome=path.join(temp,'node001-home');
    const bHome=path.join(temp,'node002-home');
    fs.mkdirSync(aHome,{mode:0o700});
    fs.mkdirSync(bHome,{mode:0o700});
    const aDir=path.join(aHome,'evercraft-pq-courier-node001');
    const bDir=path.join(bHome,'evercraft-pq-courier-node002');
    const a=initializeCourierNode({directory:aDir,nodeId:'node001'});
    const b=initializeCourierNode({directory:bDir,nodeId:'node002'});
    const allocator1='pq-broker-test-node001-allocator',allocator2='pq-broker-test-node002-allocator';
    seed1=await startNodeSeed({
      root:path.join(temp,'node001-compute'),nodeId:'node001',host:'127.0.0.1',port:0,
      advertiseHost:'127.0.0.1',allocatorToken:allocator1,
      placementLabels:['private','outbound-only','lab'],remoteOperatorRoots:{home:aHome},
      remoteOperatorStateDir:path.join(temp,'node001-operator'),announce:false
    });
    seed2=await startNodeSeed({
      root:path.join(temp,'node002-compute'),nodeId:'node002',host:'127.0.0.1',port:0,
      advertiseHost:'127.0.0.1',allocatorToken:allocator2,
      placementLabels:['private','outbound-only','lab'],remoteOperatorRoots:{home:bHome},
      remoteOperatorStateDir:path.join(temp,'node002-operator'),announce:false
    });
    broker=await startOutboundCapacityBroker({
      host:'127.0.0.1',port:0,stateDir:path.join(temp,'broker'),
      authorizedDevices:{
        [seed1.device_fingerprint]:'node001',
        [seed2.device_fingerprint]:'node002'
      },commandTimeoutMs:20000,pollWaitMs:40
    });
    agent1=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,localCapacityEndpoint:seed1.endpoint,
      localAllocatorToken:allocator1,pollBackoffMs:20
    });
    agent2=await startOutboundNodeAgent({
      brokerUrl:broker.endpoint,localCapacityEndpoint:seed2.endpoint,
      localAllocatorToken:allocator2,pollBackoffMs:20
    });
    const opA=grantGateway(broker.controlGrant('node001'));
    const opB=grantGateway(broker.controlGrant('node002'));
    const aPin={recipientKeyId:a.recipient_key_id,senderKeyId:a.sender_key_id};
    const bPin={recipientKeyId:b.recipient_key_id,senderKeyId:b.sender_key_id};

    // A compromised transferred bundle cannot change the independently observed pins.
    await assert.rejects(bridgePqPublicBundle({
      sourceGateway:opA,destinationGateway:opB,sourceNode:'node001',
      destinationNode:'node002',expectedIdentity:{...aPin,senderKeyId:'f'.repeat(64)},
      approvalRef:'proof:approved-file-transfer'
    }),/denied/);
    assert.equal(fs.existsSync(path.join(bHome,'evercraft-pq-inbox','node001-public.json')),false);

    const pubAB=await bridgePqPublicBundle({
      sourceGateway:opA,destinationGateway:opB,sourceNode:'node001',
      destinationNode:'node002',expectedIdentity:aPin,
      approvalRef:'proof:approved-file-transfer'
    });
    const pubBA=await bridgePqPublicBundle({
      sourceGateway:opB,destinationGateway:opA,sourceNode:'node002',
      destinationNode:'node001',expectedIdentity:bPin,
      approvalRef:'proof:approved-file-transfer'
    });
    assert.equal(pubAB.production_ready,false);
    assert.equal(pubBA.transport,'evercraft.remote-operator.outbound-only.v1');
    assert.equal(pubAB.receiver_authenticated,false);

    const first=sendSyntheticCourierMessage({
      directory:aDir,
      peerPublicFile:path.join(aHome,'evercraft-pq-inbox','node002-public.json'),
      expectedRecipientKeyId:b.recipient_key_id
    });
    const filename=path.basename(first.outgoing_file);
    const transferred=await bridgePqCiphertext({
      sourceGateway:opA,destinationGateway:opB,sourceNode:'node001',
      destinationNode:'node002',messageFilename:filename,
      expectedIdentity:{senderKeyId:a.sender_key_id,recipientKeyId:b.recipient_key_id},
      approvalRef:'proof:approved-encrypted-transfer'
    });
    assert.equal(transferred.kind,'ciphertext');
    const received=receiveSyntheticCourierMessage({
      directory:bDir,
      peerPublicFile:path.join(bHome,'evercraft-pq-inbox','node001-public.json'),
      expectedSenderKeyId:a.sender_key_id,
      messageFile:path.join(bHome,'evercraft-pq-inbox','node001-'+filename)
    });
    assert.equal(received.accepted,true);
    await assert.rejects(async()=>receiveSyntheticCourierMessage({
      directory:bDir,
      peerPublicFile:path.join(bHome,'evercraft-pq-inbox','node001-public.json'),
      expectedSenderKeyId:a.sender_key_id,
      messageFile:path.join(bHome,'evercraft-pq-inbox','node001-'+filename)
    }),/rejected/);

    const response=sendSyntheticCourierMessage({
      directory:bDir,
      peerPublicFile:path.join(bHome,'evercraft-pq-inbox','node001-public.json'),
      expectedRecipientKeyId:a.recipient_key_id
    });
    const backName=path.basename(response.outgoing_file);
    await bridgePqCiphertext({
      sourceGateway:opB,destinationGateway:opA,sourceNode:'node002',
      destinationNode:'node001',messageFilename:backName,
      expectedIdentity:{senderKeyId:b.sender_key_id,recipientKeyId:a.recipient_key_id},
      approvalRef:'proof:approved-reply-transfer'
    });
    const reply=receiveSyntheticCourierMessage({
      directory:aDir,
      peerPublicFile:path.join(aHome,'evercraft-pq-inbox','node002-public.json'),
      expectedSenderKeyId:b.sender_key_id,
      messageFile:path.join(aHome,'evercraft-pq-inbox','node002-'+backName)
    });
    assert.equal(reply.message,'EVERCRAFT SYNTHETIC FIELD PROOF node002 TO node001');
    assert.equal(fs.readFileSync(path.join(bHome,'evercraft-pq-inbox','node001-public.json'),'utf8')
      .includes('PRIVATE KEY'),false);
    await assert.rejects(bridgePqPublicBundle({
      sourceGateway:opA,destinationGateway:opB,sourceNode:'node001',
      destinationNode:'node002',expectedIdentity:aPin,
      approvalRef:'proof:approved-file-transfer'
    }),/denied/); // no overwrites
    console.log('PQ_EXISTING_BROKER_PROOF: loopback_only=true outbound_only=true two_way=true pinned_public_keys=true signed_ciphertext=true replay_denied=true private_keys_transferred=false');
  }finally{
    if(agent1) await agent1.close();
    if(agent2) await agent2.close();
    if(broker) await broker.close();
    if(seed1) await seed1.close();
    if(seed2) await seed2.close();
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
