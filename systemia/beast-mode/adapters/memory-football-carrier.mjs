function copyBytes(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  throw new Error('memory_football_carrier_binary_required');
}

export function createMemoryFootballCarrier() {
  const store = new Map();

  return {
    adapter_id: 'beast-memory-football-carrier-v1',
    async write({ football_id, bytes }) {
      const object_ref = `memory-football://${football_id}`;
      store.set(object_ref, copyBytes(bytes));
      return { object_ref };
    },
    async readBack({ object_ref }) {
      const value = store.get(object_ref);
      if (!value) throw new Error(`memory_football_missing:${object_ref}`);
      return copyBytes(value);
    },
    inspect(object_ref) {
      const value = store.get(object_ref);
      return value ? copyBytes(value) : null;
    }
  };
}
