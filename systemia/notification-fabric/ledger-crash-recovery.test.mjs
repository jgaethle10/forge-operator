import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createNotificationStore } from './store.mjs';

const execFileAsync = promisify(execFile);
const dirs = [];
function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evercraft-notification-ledger-integrity-'));
  dirs.push(dir);
  return dir;
}
test.after(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});
const delivery = (n) => ({
  schema: 'systemia.notification.delivery.v2',
  notification_id: 'local-proof-' + n,
  status: 'inboxed',
  at: '2026-10-21T19:00:00.000Z',
});

test('first write, process reconstruction and HMAC-linked history remain coherent', () => {
  const dir = sandbox();
  const options = {dataDir:dir, receiptSecret:'local-test-hmac-secret'};
  const writer = createNotificationStore(options);
  assert.equal(writer.verifyDeliveryLedger().valid,true);
  writer.recordDelivery(delivery(1));
  writer.recordDelivery(delivery(2));
  const restored = createNotificationStore(options);
  const proof = restored.verifyDeliveryLedger();
  assert.equal(proof.valid,true);
  assert.equal(proof.count,2);
  assert.equal(proof.mode,'hmac-sha256');
  assert.equal(restored.deliveryLedgerHead().state,'verified');
  assert.equal(restored.deliveryLedgerHead().count,2);
  assert.equal(restored.deliverySnapshot().integrity_verified,true);
  restored.recordDelivery(delivery(3));
  assert.equal(writer.verifyDeliveryLedger().count,3);
});

test('crash after append but before head update holds ledger, never rewrites history', () => {
  const dir = sandbox();
  const writer = createNotificationStore({dataDir:dir,receiptSecret:'private-test'});
  writer.recordDelivery(delivery(1));
  const file = path.join(dir,'delivery-ledger.ndjson');
  const prior = fs.readFileSync(file,'utf8');
  fs.appendFileSync(file, '{"unfinished":true');
  const check = writer.verifyDeliveryLedger();
  assert.equal(check.valid,false);
  assert.equal(check.reason,'torn_append');
  assert.equal(writer.deliveryLedgerHead().state,'held');
  assert.equal(writer.deliveryLedgerHead().count,null);
  assert.equal(writer.deliverySnapshot().state,'held');
  assert.equal(writer.deliverySnapshot().total,null);
  assert.throws(()=>writer.recordDelivery(delivery(2)),/notification_delivery_ledger_integrity_hold/);
  assert.equal(fs.readFileSync(file,'utf8'),prior+'{"unfinished":true');
});

test('orphaned head or missing journal never represents an empty healthy ledger', () => {
  const dir = sandbox();
  const writer = createNotificationStore({dataDir:dir});
  writer.recordDelivery(delivery(1));
  fs.unlinkSync(path.join(dir,'delivery-ledger-head.json'));
  assert.equal(writer.verifyDeliveryLedger().reason,'ledger_head_missing');
  assert.throws(()=>writer.recordDelivery(delivery(2)),/integrity_hold/);
  const dir2=sandbox();
  const writer2=createNotificationStore({dataDir:dir2});
  writer2.recordDelivery(delivery(1));
  fs.unlinkSync(path.join(dir2,'delivery-ledger.ndjson'));
  assert.equal(writer2.verifyDeliveryLedger().reason,'ledger_head_missing');
  assert.throws(()=>writer2.recordDelivery(delivery(2)),/integrity_hold/);
});

test('altered recorded event or wrong receipt secret stops new writes', () => {
  const dir=sandbox();
  const writer=createNotificationStore({dataDir:dir,receiptSecret:'correct-hmac-secret'});
  writer.recordDelivery(delivery(1));
  const wrongKey=createNotificationStore({dataDir:dir,receiptSecret:'incorrect-hmac-secret'});
  assert.equal(wrongKey.verifyDeliveryLedger().valid,false);
  assert.throws(()=>wrongKey.recordDelivery(delivery(2)),/integrity_hold/);
  const file=path.join(dir,'delivery-ledger.ndjson');
  const changed=fs.readFileSync(file,'utf8').replace('inboxed','pretend-delivered');
  fs.writeFileSync(file,changed);
  assert.equal(writer.verifyDeliveryLedger().reason,'hash_chain_mismatch');
  assert.throws(()=>writer.recordDelivery(delivery(2)),/integrity_hold/);
});

test('two independent Node processes append receipts without lost updates', async () => {
  const dir=sandbox();
  const moduleUrl=new URL('./store.mjs',import.meta.url).href;
  const script = "import { createNotificationStore } from " + JSON.stringify(moduleUrl) + ";\n" +
    "const writer=createNotificationStore({dataDir:process.argv[1],receiptSecret:'two-worker-local-test'});\n" +
    "const worker=process.argv[2];\n" +
    "for (let i=0;i<20;i++) writer.recordDelivery({schema:'systemia.notification.delivery.v2'," +
    "notification_id:worker+'-'+i,at:'2026-10-21T19:00:00.000Z',status:'inboxed'});\n";
  await Promise.all(['alpha','beta'].map(async name=>{
    await execFileAsync(process.execPath,['--input-type=module','-e',script,dir,name],
      {cwd:process.cwd(),timeout:15000,maxBuffer:1024*1024});
  }));
  const reader=createNotificationStore({dataDir:dir,receiptSecret:'two-worker-local-test'});
  const proof=reader.verifyDeliveryLedger();
  assert.equal(proof.valid,true,JSON.stringify(proof));
  assert.equal(proof.count,40);
  const ledger=fs.readFileSync(path.join(dir,'delivery-ledger.ndjson'),'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(new Set(ledger.map(x=>x.notification_id)).size,40);
});

test('ambiguous leftover writer lock fails closed without automatic stale-lock theft', () => {
  const dir=sandbox();
  const writer=createNotificationStore({dataDir:dir});
  fs.mkdirSync(path.join(dir,'.delivery-ledger.lock'));
  assert.throws(()=>writer.recordDelivery(delivery(1)),/notification_delivery_ledger_lock_held/);
  assert.equal(fs.existsSync(path.join(dir,'delivery-ledger.ndjson')),false);
});
