import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LedgerStore } from "./ledger-store.mjs";
import { EvidenceLedger } from "./evidence-ledger.mjs";

test("ledger persists across store instances", async () => {
 const dir=await mkdtemp(join(tmpdir(),"open-conflict-"));
 try {
  const path=join(dir,"evidence.json");
  const store=new LedgerStore(path);
  await store.append({event_id:"sample",type:"ingested",actor:"editor",at:"2026-11-09T10:00:00Z"});
  const reopened=new LedgerStore(path);
  assert.equal((await reopened.read()).entries().length,1);
  assert.equal(EvidenceLedger.verify(JSON.parse(await readFile(path,"utf8"))),true);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test("same-process concurrent appends are serialized",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"open-conflict-"));
 try {
  const store=new LedgerStore(join(dir,"evidence.json"));
  await Promise.all([
   store.append({event_id:"a",type:"ingested",actor:"editor",at:"2026-11-09T10:00:00Z"}),
   store.append({event_id:"b",type:"ingested",actor:"editor",at:"2026-11-09T10:00:01Z"})
  ]);
  assert.equal((await store.read()).entries().length,2);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
test("corrupted ledger fails closed",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"open-conflict-"));
 try {
  const store=new LedgerStore(join(dir,"evidence.json"));
  await store.append({event_id:"a",type:"ingested",actor:"editor",at:"2026-11-09T10:00:00Z"});
  const path=join(dir,"evidence.json");
  const data=JSON.parse(await readFile(path,"utf8"));data[0].actor="intruder";
  const {writeFile}=await import("node:fs/promises");
  await writeFile(path,JSON.stringify(data));
  await assert.rejects(()=>store.read(),/invalid ledger history/);
 } finally { await rm(dir,{recursive:true,force:true}); }
});
