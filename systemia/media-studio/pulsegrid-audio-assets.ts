import {
  pulseGridAudioAssetId,
  type PulseGridActor,
  type PulseGridAudioAssetRecord,
  type PulseGridOperation,
} from './pulsegrid-session.js';

export type PulseGridAudioAssetMetadata = {
  source_filename?: string | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  sample_rate?: number | null;
  channel_count?: number | null;
  provenance?: Record<string, unknown>;
  rights?: Record<string, unknown>;
  parent_asset_ids?: string[];
  created_at?: string;
};

export type PulseGridPreparedAudioAsset = {
  record: PulseGridAudioAssetRecord;
  registration: Extract<PulseGridOperation, { type: 'asset.register_audio' }>;
};

export interface PulseGridAudioAssetStore {
  put(record: PulseGridAudioAssetRecord, bytes: ArrayBuffer | ArrayBufferView | Blob): Promise<void>;
  get(assetId: string): Promise<ArrayBuffer | null>;
  has(assetId: string): Promise<boolean>;
  delete(assetId: string): Promise<void>;
}

function copyArrayBuffer(bytes: ArrayBuffer) {
  return bytes.slice(0);
}

async function toArrayBuffer(input: ArrayBuffer | ArrayBufferView | Blob) {
  if (input instanceof ArrayBuffer) return copyArrayBuffer(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) return input.arrayBuffer();
  const view = input as ArrayBufferView;
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

function requireWebCrypto() {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('PulseGrid audio assets require Web Crypto SHA-256 support.');
  return subtle;
}

export async function sha256Hex(input: ArrayBuffer | ArrayBufferView | Blob) {
  const bytes = await toArrayBuffer(input);
  const digest = await requireWebCrypto().digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

function optionalPositive(value: number | null | undefined, integer = false) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('PulseGrid audio asset metadata contains an invalid numeric value.');
  return integer ? Math.round(number) : number;
}

export async function preparePulseGridAudioAsset(
  input: ArrayBuffer | ArrayBufferView | Blob,
  metadata: PulseGridAudioAssetMetadata = {},
  actor: PulseGridActor = 'human',
): Promise<PulseGridPreparedAudioAsset> {
  const bytes = await toArrayBuffer(input);
  const contentHash = await sha256Hex(bytes);
  const record: PulseGridAudioAssetRecord = {
    id: pulseGridAudioAssetId(contentHash),
    kind: 'audio',
    content_hash: contentHash,
    content_hash_algorithm: 'sha256',
    source_filename: metadata.source_filename?.trim().slice(0, 512) || null,
    mime_type: metadata.mime_type?.trim().slice(0, 255) || 'application/octet-stream',
    byte_length: bytes.byteLength,
    duration_seconds: optionalPositive(metadata.duration_seconds),
    sample_rate: optionalPositive(metadata.sample_rate, true),
    channel_count: optionalPositive(metadata.channel_count, true),
    created_at: metadata.created_at || new Date().toISOString(),
    created_by: actor,
    provenance: structuredClone(metadata.provenance || {}),
    rights: structuredClone(metadata.rights || {}),
    parent_asset_ids: [...new Set(metadata.parent_asset_ids || [])].slice(0, 128),
  };
  return {
    record,
    registration: {
      type: 'asset.register_audio',
      asset: structuredClone(record),
    },
  };
}

export async function verifyPulseGridAudioAssetBytes(
  record: PulseGridAudioAssetRecord,
  input: ArrayBuffer | ArrayBufferView | Blob,
) {
  const bytes = await toArrayBuffer(input);
  if (bytes.byteLength !== record.byte_length) {
    throw new Error('PulseGrid audio asset byte length does not match the canonical record.');
  }
  const contentHash = await sha256Hex(bytes);
  if (contentHash !== record.content_hash || pulseGridAudioAssetId(contentHash) !== record.id) {
    throw new Error('PulseGrid audio asset bytes do not match the canonical SHA-256 identity.');
  }
  return bytes;
}

export class PulseGridMemoryAudioAssetStore implements PulseGridAudioAssetStore {
  private readonly bytesById = new Map<string, ArrayBuffer>();

  async put(record: PulseGridAudioAssetRecord, input: ArrayBuffer | ArrayBufferView | Blob) {
    const bytes = await verifyPulseGridAudioAssetBytes(record, input);
    this.bytesById.set(record.id, copyArrayBuffer(bytes));
  }

  async get(assetId: string) {
    const bytes = this.bytesById.get(assetId);
    return bytes ? copyArrayBuffer(bytes) : null;
  }

  async has(assetId: string) {
    return this.bytesById.has(assetId);
  }

  async delete(assetId: string) {
    this.bytesById.delete(assetId);
  }
}

type PulseGridStoredAudioBytes = {
  id: string;
  content_hash: string;
  bytes: ArrayBuffer;
};

export class PulseGridIndexedDbAudioAssetStore implements PulseGridAudioAssetStore {
  private readonly databaseName: string;
  private readonly storeName = 'audio-by-id';
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(databaseName = 'evercraft-fallen-pulsegrid-assets') {
    this.databaseName = databaseName;
  }

  private database() {
    if (this.databasePromise) return this.databasePromise;
    if (!globalThis.indexedDB) {
      throw new Error('IndexedDB is unavailable in this browser.');
    }
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = globalThis.indexedDB.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(this.storeName)) {
          database.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('PulseGrid audio asset database failed to open.'));
    });
    return this.databasePromise;
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
  ) {
    const database = await this.database();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      run(store, resolve, reject);
      transaction.onerror = () => reject(transaction.error || new Error('PulseGrid audio asset transaction failed.'));
    });
  }

  async put(record: PulseGridAudioAssetRecord, input: ArrayBuffer | ArrayBufferView | Blob) {
    const bytes = await verifyPulseGridAudioAssetBytes(record, input);
    await this.transaction<void>('readwrite', (store, resolve, reject) => {
      const request = store.put({
        id: record.id,
        content_hash: record.content_hash,
        bytes: copyArrayBuffer(bytes),
      } satisfies PulseGridStoredAudioBytes);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async get(assetId: string) {
    return this.transaction<ArrayBuffer | null>('readonly', (store, resolve, reject) => {
      const request = store.get(assetId);
      request.onsuccess = () => {
        const row = request.result as PulseGridStoredAudioBytes | undefined;
        resolve(row?.bytes ? copyArrayBuffer(row.bytes) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async has(assetId: string) {
    return this.transaction<boolean>('readonly', (store, resolve, reject) => {
      const request = store.count(assetId);
      request.onsuccess = () => resolve(request.result > 0);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(assetId: string) {
    await this.transaction<void>('readwrite', (store, resolve, reject) => {
      const request = store.delete(assetId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export function createPulseGridAudioAssetStore(): PulseGridAudioAssetStore {
  return globalThis.indexedDB
    ? new PulseGridIndexedDbAudioAssetStore()
    : new PulseGridMemoryAudioAssetStore();
}
