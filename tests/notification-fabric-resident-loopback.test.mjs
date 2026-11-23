import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {startNotificationRelayResident} from '../systemia/notification-fabric/resident-loopback.mjs';

const TOKEN='f'.repeat(64);
function privateRoot(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'evercraft-relay-loopback-test-'));
 fs.chmodSync(root,0o700);
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
}

test('resident reuses owned Notification Fabric, binds loopback only and authenticates ingestion',async t=>{
 const root=privateRoot(t);
 const relay=await startNotificationRelayResident({
   dataDir:root,port:0,ingestToken:TOKEN,sessionSecret:'s'.repeat(64),receiptSecret:'r'.repeat(64)
 });
 t.after(()=>relay.close());
 assert.equal(relay.address.address,'127.0.0.1');
 const origin='http://127.0.0.1:'+relay.address.port;
 const health=await fetch(origin+'/api/notifications/health');
 assert.equal(health.status,200);
 assert.equal((await health.json()).success,true);
 const withoutAuth=await fetch(origin+'/api/notifications/intents',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({product:'commercial-studio',purpose:'operational',
     title:'Internal test',body:'Private test payload',recipient_ids:['test-only-owner']})
 });
 assert.equal(withoutAuth.status,401);
 const valid=await fetch(origin+'/api/notifications/intents',{
   method:'POST',
   headers:{'content-type':'application/json',authorization:'Bearer '+TOKEN},
   body:JSON.stringify({schema:'systemia.notification.intent.v2',product:'commercial-studio',
     purpose:'operational',priority:'normal',title:'Test in isolated store',
     body:'Test never enters a real customer inbox.',recipient_ids:['test-only-owner'],
     dedupe_key:'isolated-run:1'})
 });
 assert.equal(valid.status,200);
 const result=await valid.json();
 assert.equal(result.inboxed,1);
 const metric=await fetch(origin+'/api/notifications/metrics',{
   headers:{authorization:'Bearer '+TOKEN}
 });
 assert.equal(metric.status,200);
 const stat=await metric.json();
 assert.equal(stat.ledger.valid,true);
 assert.ok(stat.ledger.count>=1);
 const unknown=await fetch(origin+'/api/not-found');
 assert.equal(unknown.status,404);
});

test('weak or absent credentials fail closed before opening a server',async t=>{
 const root=privateRoot(t);
 await assert.rejects(
   ()=>startNotificationRelayResident({dataDir:root,port:0,ingestToken:''}),
   /RELAY_INGEST_CREDENTIAL_MISSING_OR_WEAK/);
 await assert.rejects(
   ()=>startNotificationRelayResident({dataDir:root,port:0,ingestToken:'short'}),
   /RELAY_INGEST_CREDENTIAL_MISSING_OR_WEAK/);
});

test('symlinks and overly broad permissions are rejected',async t=>{
 const root=privateRoot(t);
 const link=root+'-link';
 fs.symlinkSync(root,link);
 t.after(()=>fs.rmSync(link,{force:true}));
 await assert.rejects(
   ()=>startNotificationRelayResident({dataDir:link,port:0,ingestToken:TOKEN}),
   /RELAY_PRIVATE_STORE_SAFETY_HOLD/);
 fs.chmodSync(root,0o755);
 await assert.rejects(
   ()=>startNotificationRelayResident({dataDir:root,port:0,ingestToken:TOKEN}),
   /RELAY_PRIVATE_STORE_SAFETY_HOLD/);
});

test('invalid listening port is rejected',async t=>{
 const root=privateRoot(t);
 await assert.rejects(
   ()=>startNotificationRelayResident({dataDir:root,port:70000,ingestToken:TOKEN}),
   /RELAY_LOOPBACK_PORT_INVALID/);
});
