import test from 'node:test';
import assert from 'node:assert/strict';
import { compileKssWorldHandoff, KSS_SPATIAL_INGRESS_SCHEMA } from './kss-spatial-ingress.mjs';
import { geometryFromFallenAsset } from '../world-engine/fallen-geometry.ts';

test('KSS handoff imports as geometry through the ACTUAL World Engine parser', () => {
  const plan = compileKssWorldHandoff({
    schema: KSS_SPATIAL_INGRESS_SCHEMA,
    projectId: 'world-smoke',
    units: 'meters',
    coordinateSystem: 'local_x_east_z_north_y_up',
    provenance: {
      rightsState: 'owned',
      license: 'evercraft-synthetic-test-only',
      sourceRef: 'synthetic:world-smoke',
      evidenceState: 'synthetic'
    },
    parcel: { x: 0, z: 0, width: 60, depth: 40 },
    objects: [
      { id: 'warehouse', kind: 'building', x: 5, z: 5, width: 14, depth: 10, height: 7 },
      { id: 'cabinet', kind: 'equipment', x: 31, z: 20, width: 2, depth: 2, height: 2.5 }
    ]
  });
  const imported = plan.geometryAssets.map(geometryFromFallenAsset);
  assert.equal(imported.length, 2);
  for (const { geometry, receipt } of imported) {
    assert.equal(geometry.schema, 'evercraft.world-engine.geometry.v1');
    assert.equal(receipt.schema, 'evercraft.world-engine.fallen-geometry-import.v1');
    assert.equal(receipt.units, 'meters');
    assert.equal(receipt.tangentSource, 'generated');
    assert.equal(receipt.vertexCount, 24);
    assert.equal(receipt.triangleCount, 12);
    assert.match(receipt.geometryDigest, /^[0-9a-f]{64}$/);
    assert.match(receipt.digest, /^[0-9a-f]{64}$/);
  }
  assert.equal(plan.publicationAuthority, false);
});
