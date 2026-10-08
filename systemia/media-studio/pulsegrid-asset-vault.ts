import {
  pulseGridAudioAssetId,
  type PulseGridAudioAsset,
  type PulseGridAudioAssetRights,
  type PulseGridAudioAssetSourceState,
} from './pulsegrid-session.js';

export type PulseGridAudioAssetIngestOptions = {
  source_name?: string | null;
  source_refs: string[];
  source_state: PulseGridAudioAssetSourceState;
  rights: PulseGridAudioAssetRights;
  parent_asset_ids?: string[];
};

type StoredAudioBlob = {
  id:string;
  digest:string;
  byte_length:number;
  mime_type:string;
  blob:Blob;
};

const DATABASE_NAME='fallen-pulsegrid-audio-assets-v1';
const STORE_NAME='audio-by-content-digest';

function bytesToHex(bytes:Uint8Array){
  return Array.from(bytes,(value)=>value.toString(16).padStart(2,'0')).join('');
}

export async function pulseGridSha256Hex(data:ArrayBuffer){
  if(!globalThis.crypto?.subtle){
    throw new Error('PulseGrid content addressing requires Web Crypto SHA-256 support.');
  }
  const digest=await globalThis.crypto.subtle.digest('SHA-256',data);
  return bytesToHex(new Uint8Array(digest));
}

function requestResult<T>(request:IDBRequest<T>){
  return new Promise<T>((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('PulseGrid IndexedDB request failed.'));
  });
}

function transactionDone(transaction:IDBTransaction){
  return new Promise<void>((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onerror=()=>reject(transaction.error||new Error('PulseGrid IndexedDB transaction failed.'));
    transaction.onabort=()=>reject(transaction.error||new Error('PulseGrid IndexedDB transaction aborted.'));
  });
}

export class PulseGridBrowserAudioAssetVault {
  constructor(private readonly databaseName=DATABASE_NAME){}

  async ingest(blob:Blob,options:PulseGridAudioAssetIngestOptions):Promise<PulseGridAudioAsset>{
    if(!(blob instanceof Blob)) throw new Error('PulseGrid audio ingest requires a Blob.');
    if(blob.size<=0) throw new Error('PulseGrid refuses to ingest an empty audio asset.');
    const sourceRefs=[...new Set(options.source_refs.map((value)=>String(value||'').trim()).filter(Boolean))];
    if(!sourceRefs.length) throw new Error('PulseGrid audio ingest requires at least one source reference.');

    const bytes=await blob.arrayBuffer();
    const digest=await pulseGridSha256Hex(bytes);
    const id=pulseGridAudioAssetId(digest);
    const decoded=await this.inspectAudio(bytes);
    const asset:PulseGridAudioAsset={
      id,
      digest,
      kind:'audio',
      mime_type:blob.type||'application/octet-stream',
      byte_length:blob.size,
      duration_sec:decoded.duration,
      sample_rate:decoded.sampleRate,
      channels:decoded.numberOfChannels,
      source_name:options.source_name??null,
      source_refs:sourceRefs,
      source_state:options.source_state,
      rights:options.rights,
      created_at:new Date().toISOString(),
      parent_asset_ids:[...new Set(options.parent_asset_ids||[])].filter((parentId)=>parentId!==id),
    };
    await this.putVerifiedBlob(asset,blob);
    return asset;
  }

  async putVerifiedBlob(asset:PulseGridAudioAsset,blob:Blob){
    const bytes=await blob.arrayBuffer();
    const digest=await pulseGridSha256Hex(bytes);
    if(digest!==asset.digest||pulseGridAudioAssetId(digest)!==asset.id){
      throw new Error('PulseGrid audio bytes do not match the canonical asset digest.');
    }
    if(blob.size!==asset.byte_length){
      throw new Error('PulseGrid audio byte length does not match canonical metadata.');
    }

    const db=await this.open();
    try{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      const record:StoredAudioBlob={
        id:asset.id,
        digest:asset.digest,
        byte_length:asset.byte_length,
        mime_type:asset.mime_type,
        blob,
      };
      transaction.objectStore(STORE_NAME).put(record);
      await transactionDone(transaction);
    }finally{
      db.close();
    }
  }

  async getVerifiedBlob(asset:PulseGridAudioAsset):Promise<Blob|null>{
    const db=await this.open();
    try{
      const transaction=db.transaction(STORE_NAME,'readonly');
      const request=transaction.objectStore(STORE_NAME).get(asset.id) as IDBRequest<StoredAudioBlob|undefined>;
      const record=await requestResult(request);
      await transactionDone(transaction);
      if(!record)return null;
      if(record.digest!==asset.digest||record.byte_length!==asset.byte_length){
        throw new Error('PulseGrid stored audio metadata does not match the canonical asset.');
      }
      const bytes=await record.blob.arrayBuffer();
      const digest=await pulseGridSha256Hex(bytes);
      if(digest!==asset.digest){
        throw new Error('PulseGrid stored audio bytes failed SHA-256 verification.');
      }
      return record.blob;
    }finally{
      db.close();
    }
  }

  async has(assetId:string){
    const db=await this.open();
    try{
      const transaction=db.transaction(STORE_NAME,'readonly');
      const key=await requestResult(transaction.objectStore(STORE_NAME).getKey(assetId));
      await transactionDone(transaction);
      return key!==undefined;
    }finally{
      db.close();
    }
  }

  async remove(assetId:string){
    const db=await this.open();
    try{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      transaction.objectStore(STORE_NAME).delete(assetId);
      await transactionDone(transaction);
    }finally{
      db.close();
    }
  }

  private async inspectAudio(bytes:ArrayBuffer){
    const Context=globalThis.AudioContext;
    if(!Context) throw new Error('PulseGrid audio ingest requires Web Audio decoding support.');
    const context=new Context();
    try{
      return await context.decodeAudioData(bytes.slice(0));
    }finally{
      if(context.state!=='closed') await context.close();
    }
  }

  private open(){
    if(!globalThis.indexedDB){
      return Promise.reject(new Error('PulseGrid local audio storage requires IndexedDB.'));
    }
    return new Promise<IDBDatabase>((resolve,reject)=>{
      const request=globalThis.indexedDB.open(this.databaseName,1);
      request.onupgradeneeded=()=>{
        const db=request.result;
        if(!db.objectStoreNames.contains(STORE_NAME)){
          db.createObjectStore(STORE_NAME,{keyPath:'id'});
        }
      };
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('PulseGrid could not open the local audio asset vault.'));
      request.onblocked=()=>reject(new Error('PulseGrid audio asset vault upgrade is blocked by another tab.'));
    });
  }
}
