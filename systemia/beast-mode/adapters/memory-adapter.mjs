function copyBytes(value) {
  return new Uint8Array(value);
}

export function createMemorySource(records = {}) {
  const store = new Map(
    Object.entries(records).map(([key, value]) => [key, copyBytes(value)])
  );
  return {
    adapter_id: 'beast-memory-source-v1',
    async read({ artifact }) {
      const bytes = store.get(artifact.artifact_id);
      if (!bytes) throw new Error(`memory_source_missing:${artifact.artifact_id}`);
      return copyBytes(bytes);
    }
  };
}

export function createMemoryDestination({ corruptArtifactId = null } = {}) {
  const store = new Map();
  const metadata = new Map();

  return {
    adapter_id: 'beast-memory-destination-v1',
    async write({ artifact, bytes }) {
      let stored = copyBytes(bytes);
      if (corruptArtifactId && artifact.artifact_id === corruptArtifactId && stored.length) {
        stored = copyBytes(stored);
        stored[0] = stored[0] ^ 0xff;
      }
      const object_ref = `memory://${artifact.artifact_id}`;
      store.set(object_ref, stored);
      metadata.set(object_ref, {
        provenance_present: Boolean(artifact.provenance?.source_asset_key),
        permissions_match: artifact.permissions?.customer_visible === false
      });
      return { object_ref };
    },
    async readBack({ object_ref }) {
      const bytes = store.get(object_ref);
      if (!bytes) throw new Error(`memory_destination_missing:${object_ref}`);
      return copyBytes(bytes);
    },
    async verifyMetadata({ object_ref }) {
      return metadata.get(object_ref) || {
        provenance_present: false,
        permissions_match: false
      };
    },
    inspect(object_ref) {
      const bytes = store.get(object_ref);
      return bytes ? copyBytes(bytes) : null;
    }
  };
}
