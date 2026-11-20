import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dgram from 'node:dgram';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {runRehearsalShadowBrokerTransaction}
  from '../systemia/yard/shadow-broker-transaction.mjs';

const INSTALLED_ROOT='/opt/evercraft/forge-operator';
const EXPECTED={
  'systemia/compute/runtime-node.mjs':
    '1d85a3bf25f9db02fee8f817e2fe337e32306447',
  'systemia/network/outbound-capacity-broker.mjs':
    '6a44cc2a6aca90693ba034100a9da6b75f29eee4',
  'systemia/yard/operator.mjs':
    'f36a121e8c872ca7d1f72990a2320266adda640b',
};
const TEST_TOKEN='synthetic-test-only-allocator-no-physical-authority';
const RELEASE='32656150e433db42d00e0725507601dfa1b5641e';

function installedFile(rel){
  const root=fs.realpathSync(INSTALLED_ROOT);
  const file=path.join(root,rel);
  if(!file.startsWith(root+path.sep))
    throw Error('file_outside_installed_root');
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)
    throw Error('untrusted_installed_source_file');
  return file;
}
function gitBlob(file){
  const data=fs.readFileSync(file);
  return createHash('sha1').update('blob '+data.length+'\0')
    .update(data).digest('hex');
}
function verifyInstalled(){
  for(const [rel,blob] of Object.entries(EXPECTED)){
    assert.equal(gitBlob(installedFile(rel)),blob,
      'Historical installed source hash changed: '+rel);
  }
  installedFile('systemia/compute/node-seed.mjs');
  installedFile('infra/evercraft-edge/dns/probe.mjs');
}
function tempRoot(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-old-compute-isolation-'));
  fs.chmodSync(root,0o700);
  return root;
}
async function freeUdpPort(){
  const socket=dgram.createSocket('udp4');
  await new Promise((resolve,reject)=>{
    socket.once('error',reject);
    socket.bind(0,'127.0.0.1',resolve);
  });
  const port=socket.address().port;
  await new Promise(resolve=>socket.close(resolve));
  return port;
}
async function requestJson(url,options={}){
  const res=await fetch(url,{
    ...options,
    signal:AbortSignal.timeout(4000),
  });
  const data=await res.json();
  assert.equal(res.ok,true,
    JSON.stringify({http_status:res.status,error:data?.error||null}));
  return data;
}
async function countServices(url){
  const result=await requestJson(url+'/v1/health');
  assert.equal(result.ok,true);
  return result.resident_services;
}
function healthSnapshot(){
  return {
    origin:'edge.invalid.',
    serial:1,
    default_ttl:60,
    primary_ns:'ns1.edge.invalid.',
    admin:'hostmaster.edge.invalid.',
    nameservers:['ns1.edge.invalid.','ns2.edge.invalid.'],
    records:[{
      name:'_evercraft',type:'TXT',
      value:'service=evercraft://isolation/test',
    }],
  };
}

test('installed historical Compute and broker source blobs match audited Penguin files',()=>{
  verifyInstalled();
});

test('installed historical NodeSeed preserves synthetic Edge DNS while shadow broker is started and released',
  {timeout:25_000},
  async()=>{
  // No production service, root, authorization or lease is used.
  // The only imported runtime is the already-installed, known historical source.
  verifyInstalled();

  const root=tempRoot();
  let seed=null;
  let dnsLease=null;
  try{
    const seedRoot=path.join(root,'disposable-node');
    const file=path.join(seedRoot,'test-edge-zone.json');
    fs.mkdirSync(seedRoot,{mode:0o700,recursive:true});
    fs.writeFileSync(file,JSON.stringify(healthSnapshot()),{mode:0o600});
    const journalParent=path.join(seedRoot,'shadow-journals');
    fs.mkdirSync(journalParent,{mode:0o700});
    const [{startNodeSeed},{probeUdp}]=await Promise.all([
      import(pathToFileURL(installedFile('systemia/compute/node-seed.mjs')).href),
      import(pathToFileURL(installedFile('infra/evercraft-edge/dns/probe.mjs')).href),
    ]);
    const dnsPort=await freeUdpPort();

    seed=await startNodeSeed({
      root:seedRoot,
      nodeId:'installed-old-compute-disposable-isolation',
      host:'127.0.0.1',
      port:0,
      advertiseHost:'127.0.0.1',
      allocatorToken:TEST_TOKEN,
      placementLabels:['operator-authorized','evercraft-edge-dns'],
      announce:false,
    });
    assert.ok(seed.endpoint.startsWith('http://127.0.0.1:'));
    assert.equal(await countServices(seed.endpoint),0);

    dnsLease=await requestJson(seed.endpoint+'/v1/leases',{
      method:'POST',
      headers:{
        'content-type':'application/json',
        authorization:'Bearer '+TEST_TOKEN,
      },
      body:JSON.stringify({
        workload_class:'systemia.evercraft-edge-dns.v1',
        requested_ttl_ms:60_000,
      }),
    });

    const dnsJob=await requestJson(seed.endpoint+'/v1/jobs',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        lease_id:dnsLease.lease_id,
        token:dnsLease.token,
        release_ref:RELEASE,
        workload_class:'systemia.evercraft-edge-dns.v1',
        input:{
          snapshot_path:file,
          dns_host:'127.0.0.1',
          dns_port:dnsPort,
          health_port:0,
        },
      }),
    });

    assert.equal(dnsJob?.result?.workload_class,'systemia.evercraft-edge-dns.v1');
    const dnsHealth=await requestJson(seed.endpoint+dnsJob.result.health_path);
    assert.equal(dnsHealth.service,'evercraft-edge-dns');
    assert.equal(dnsHealth.authoritative,true);
    assert.equal(dnsHealth.recursive,false);
    assert.equal(await countServices(seed.endpoint),1);

    const before=await probeUdp({
      server:'127.0.0.1',port:dnsPort,
      name:'_evercraft.edge.invalid.',timeout:3000,
    });
    assert.equal(before.aa,true);
    assert.equal(before.ra,false);
    assert.equal(before.answers,1);

    const transaction=await runRehearsalShadowBrokerTransaction({
      nodeSeedReceipt:seed,
      journalParent,
      allocatorToken:TEST_TOKEN,
    });
    assert.equal(transaction.ok,true,JSON.stringify(transaction));
    assert.equal(transaction.release_confirmed,true);
    assert.equal(transaction.authorized_devices,0);
    assert.equal(transaction.historical_grants_imported,false);
    assert.equal(transaction.public_route_created,false);

    // DNS is still the one live synthetic resident after broker teardown.
    assert.equal(await countServices(seed.endpoint),1);
    const after=await requestJson(seed.endpoint+dnsJob.result.health_path);
    assert.equal(after.instance_id,dnsHealth.instance_id);

    const proof=await probeUdp({
      server:'127.0.0.1',port:dnsPort,
      name:'_evercraft.edge.invalid.',timeout:3000,
    });
    assert.equal(proof.aa,true);
    assert.equal(proof.ra,false);
    assert.equal(proof.answers,1);

    const release=await requestJson(
      seed.endpoint+'/v1/leases/'+dnsLease.lease_id+'/release',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({token:dnsLease.token}),
      }
    );
    assert.equal(release.receipt?.type,'capacity.lease.released');
    dnsLease=null;
    assert.equal(await countServices(seed.endpoint),0);
  }finally{
    // All resources are synthetic. The NodeSeed close operation tears down
    // only this temporary process-local runtime and its private listeners.
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});


test('installed historical NodeSeed releases a broker after losing its startup response',
  {timeout:20_000},async()=>{
  verifyInstalled();
  const root=tempRoot();
  let seed=null;
  try{
    const seedRoot=path.join(root,'disposable-node');
    const journalParent=path.join(seedRoot,'shadow-journals');
    fs.mkdirSync(journalParent,{mode:0o700,recursive:true});
    const {startNodeSeed}=await import(
      pathToFileURL(installedFile('systemia/compute/node-seed.mjs')).href
    );
    seed=await startNodeSeed({
      root:seedRoot,
      nodeId:'installed-old-compute-lost-response',
      host:'127.0.0.1',port:0,advertiseHost:'127.0.0.1',
      allocatorToken:TEST_TOKEN,
      announce:false,
    });
    assert.equal(await countServices(seed.endpoint),0);
    let jobAccepted=false;
    const request=async(url,options)=>{
      const res=await fetch(url,options);
      if(String(url).endsWith('/v1/jobs')){
        assert.equal(res.status,200);
        jobAccepted=true;
        throw Error('synthetic_job_result_lost');
      }
      return res;
    };
    const result=await runRehearsalShadowBrokerTransaction({
      nodeSeedReceipt:seed,
      journalParent,
      allocatorToken:TEST_TOKEN,
      request,
    });
    assert.equal(jobAccepted,true);
    assert.equal(result.ok,false);
    assert.equal(result.broker_start_outcome_uncertain,true);
    assert.equal(result.release_confirmed,true);
    assert.equal(result.journal_phase,'released');
    assert.equal(result.manual_review_required,false);
    assert.equal(await countServices(seed.endpoint),0);
  }finally{
    if(seed)await seed.close();
    fs.rmSync(root,{recursive:true,force:true});
  }
});
