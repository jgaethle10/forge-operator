import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore,readStored,saveStored,deleteStored,StorageHold} from '../app/storage.mjs';
import {blankJournal,addReading,backupJSON,validateJournal} from '../app/journal.mjs';
// A deterministic asynchronous fake to assert the transaction-level contract.
// It does not establish behavior on real Safari/WebKit IndexedDB.
function fakeIndexedDB(){
  const disk=new Map(),locks={};
  const db={
    objectStoreNames:{contains:name=>name==='state'},
    createObjectStore:()=>{},
    transaction(_name,mode){
      let pending=0,closed=false,aborted=false;
      const shadow=new Map(disk);
      const tx={oncomplete:null,onerror:null,onabort:null,abort(){if(aborted||closed)return;aborted=true;queueMicrotask(()=>tx.onabort?.());},
        objectStore(){return {
          get(key){return submit(()=>shadow.get(key));},
          put(value,key){return submit(()=>{if(mode!=='readwrite')throw Error('readonly');shadow.set(key,value);return key;});},
          delete(key){return submit(()=>{if(mode!=='readwrite')throw Error('readonly');shadow.delete(key);return undefined;});}
        }}
      };
      function tryFinish(){setTimeout(()=>{if(pending===0&&!closed&&!aborted){closed=true;if(mode==='readwrite'){disk.clear();for(const [k,v] of shadow)disk.set(k,v);}tx.oncomplete?.();}},0);}
      function submit(fn){const req={result:undefined,onsuccess:null,onerror:null};pending++;
        setTimeout(()=>{if(aborted)return;try{req.result=fn();}catch(e){req.error=e;req.onerror?.();tx.onerror?.();return;}pending--;req.onsuccess?.();tryFinish();},0);
        return req;}
      return tx;
    }
  };
  return {disk,api:{open(){const req={onsuccess:null,onupgradeneeded:null,onerror:null};queueMicrotask(()=>{req.result=db;req.onupgradeneeded?.();req.onsuccess?.();});return req;}}};
}
const empty=()=>blankJournal('WELL-A','L');
const one=()=>{const j=empty();addReading(j,{date:'2026-10-01',reading:'100'});return j;};
test('no IndexedDB holds rather than claiming a save',async()=>{await assert.rejects(openStore(undefined),StorageHold);});
test('empty store reads null; no invented notebook',async()=>{const {api}=fakeIndexedDB();const db=await openStore(api);assert.equal(await readStored(db),null);});
test('transactional save and read carry full validated backup',async()=>{const {api}=fakeIndexedDB();const db=await openStore(api);const j=one();await saveStored(db,j,null);assert.deepEqual(await readStored(db),j);});
test('reject stale writes from second tab: no last writer wins',async()=>{
  const {api}=fakeIndexedDB(),db=await openStore(api),initial=one();await saveStored(db,initial,null);
  const second=await readStored(db),first=await readStored(db);
  addReading(first,{date:'2026-10-02',reading:'150'});await saveStored(db,first,initial);
  addReading(second,{date:'2026-10-02',reading:'170'});
  await assert.rejects(saveStored(db,second,initial),/Another tab changed/);
  assert.deepEqual(await readStored(db),first);
});
test('two tabs cannot independently create notebook over first',async()=>{
  const {api}=fakeIndexedDB(),db=await openStore(api);
  await saveStored(db,one(),null);
  await assert.rejects(saveStored(db,empty(),null),/Another tab changed/);
});
test('delete requires exact current notebook state',async()=>{
  const {api}=fakeIndexedDB(),db=await openStore(api),first=one();await saveStored(db,first,null);
  await assert.rejects(deleteStored(db,null),/Another tab changed/);
  assert.deepEqual(await readStored(db),first);
  await deleteStored(db,first);assert.equal(await readStored(db),null);
});
test('corrupt stored value held, never silently dropped',async()=>{
  const {api,disk}=fakeIndexedDB();disk.set('notebook','{"schema":"tampered"}');const db=await openStore(api);
  await assert.rejects(readStored(db),/Stored journal invalid/);
  assert.ok(disk.has('notebook'));
});
test('valid backup integrity reflects source, not field authentication',async()=>{
  const {api}=fakeIndexedDB(),db=await openStore(api),a=one();await saveStored(db,a,null);
  const s=JSON.parse(backupJSON(await readStored(db)));
  assert.equal(s.evidence_state,'OPERATOR_SUPPLIED_UNVERIFIED');
  assert.equal(s.records.length,1);
});
