/** Aqua RC15: explicit, transactional same-origin IndexedDB journal storage.
 * No remote endpoints and no encryption. Persistence is browser-controlled.
 * An invalid existing journal is never overwritten or treated as empty.
 */
import {backupJSON,restoreBackupText} from './journal.mjs';
const DB='evercraft-aqua-notebook-rc15';
const TABLE='state';
const KEY='notebook';
export class StorageHold extends Error {
  constructor(message){super('HOLD: '+message);this.name='StorageHold';}
}
export function openStore(idb=globalThis.indexedDB){
  if(!idb?.open)return Promise.reject(new StorageHold('IndexedDB unavailable. Open the hosted web app, not a file preview.'));
  return new Promise((resolve,reject)=>{
    let request;
    try{request=idb.open(DB,1);}catch{reject(new StorageHold('Unable to access on-device database'));return;}
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(TABLE))db.createObjectStore(TABLE);};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new StorageHold('Unable to open private notebook database'));
    request.onblocked=()=>reject(new StorageHold('Database upgrade blocked by another open tab'));
  });
}
function transaction(db,mode,operation){
  return new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(TABLE,mode);}catch{reject(new StorageHold('Database transaction unavailable'));return;}
    const store=tx.objectStore(TABLE), req=operation(store);
    let result;
    req.onsuccess=()=>{result=req.result;};
    tx.oncomplete=()=>resolve(result);
    tx.onerror=()=>reject(new StorageHold('Database operation failed; changes not confirmed saved'));
    tx.onabort=()=>reject(new StorageHold('Database operation aborted; changes not confirmed saved'));
  });
}
export async function readStored(db){
  const stored=await transaction(db,'readonly',table=>table.get(KEY));
  if(stored===undefined)return null;
  if(typeof stored!=='string')throw new StorageHold('Stored journal schema unknown. Do not overwrite before recovery.');
  try{return restoreBackupText(stored);}catch{throw new StorageHold('Stored journal invalid or checksum mismatch; no automatic reset. Use a known-good external backup and inspect data.');}
}
/** Optimistic consistency guard. Tabs cannot silently overwrite one another.
 * expectedPrevious: null for genuinely empty journal; existing journal otherwise.
 */
function checkedMutation(db,expectedPrevious,newBackup,action){
  const expected=expectedPrevious===null?null:backupJSON(expectedPrevious);
  return new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(TABLE,'readwrite');}catch{reject(new StorageHold('Database write transaction unavailable'));return;}
    const table=tx.objectStore(TABLE);
    const request=table.get(KEY);
    let mismatch=false;
    request.onsuccess=()=>{
      const actual=request.result===undefined?null:request.result;
      if(actual!==expected){mismatch=true;tx.abort();return;}
      if(action==='save')table.put(newBackup,KEY);
      else table.delete(KEY);
    };
    tx.oncomplete=()=>resolve(newBackup);
    tx.onerror=()=>reject(new StorageHold('Write did not complete; no save confirmed'));
    tx.onabort=()=>reject(new StorageHold(mismatch?'Another tab changed this notebook. Export your current readings, reopen and compare before restoring.':'Storage write aborted; no save confirmed'));
  });
}
export async function saveStored(db,journal,expectedPrevious){
  const backup=backupJSON(journal);
  await checkedMutation(db,expectedPrevious,backup,'save');
  return backup;
}
export async function deleteStored(db,expectedPrevious){
  await checkedMutation(db,expectedPrevious,null,'delete');
}
export const STORAGE_INFO={database:DB,store:TABLE,encrypted:false,sync:false,optimisticConcurrency:true};
