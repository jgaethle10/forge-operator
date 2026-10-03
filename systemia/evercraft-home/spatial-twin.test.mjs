import assert from "node:assert/strict";
import { buildSpatialTwin, spatialTwinToWorldDefinition } from "./spatial-twin.mjs";

const scene = buildSpatialTwin({
  home_id: "demo-home",
  label: "Demo Home",
  evidence_state: "observed",
  geometry_source: "manual_floorplan",
  floors: [{
    id: "main",
    label: "Main floor",
    level: 0,
    elevation_m: 0,
    rooms: [
      {
        id: "living",
        label: "Living Room",
        geometry: { x: 0, y: 0, width: 5, depth: 4, height: 2.7 },
        occupancy: "occupied",
        evidence_state: "observed",
        telemetry: { temperature_c: 21.5, co2_ppm: 640 }
      },
      {
        id: "wc",
        label: "WC",
        geometry: { x: 5.2, y: 0, width: 2, depth: 2, height: 2.7 },
        occupancy: "unknown",
        evidence_state: "unknown"
      }
    ],
    doors: [{
      id: "wc-door",
      label: "WC Door",
      connects: ["living", "wc"],
      position: { x: 5.15, y: 1, z: 1, rotation_deg: 90 },
      state: "closed",
      evidence_state: "observed"
    }],
    devices: [{
      id: "living-co2",
      label: "Living CO2",
      room_id: "living",
      kind: "air_quality",
      position: { x: 2, y: 1.5, z: 1.3 },
      state: { co2_ppm: 640 },
      evidence_state: "observed"
    }]
  }]
});

assert.equal(scene.schema, "evercraft.home.spatial-twin.v1");
assert.equal(scene.privacy.exact_address_included, false);
assert.equal(scene.privacy.person_identity_tracking, false);
assert.equal(scene.floors[0].doors[0].visual.attention, "highlight");
assert.equal(scene.floors[0].rooms[1].occupancy, "unknown");

const world = spatialTwinToWorldDefinition(scene);
assert.equal(world.schema, "evercraft.world-engine.world.v1");
assert.equal(world.metadata.device_control_authority, false);
assert.equal(world.metadata.person_identity_tracking, false);

const wcDoor = world.entities.find((entity) => entity.id.endsWith(":wc-door"));
assert.equal(wcDoor.properties.state, "closed");
assert.equal(wcDoor.properties.visual_attention, "highlight");

const living = world.entities.find((entity) => entity.id.endsWith(":living"));
assert.equal(living.properties.telemetry.co2_ppm, 640);
assert.equal(living.properties.interactive_control_authority, false);

console.log(JSON.stringify({
  ok: true,
  scene_schema: scene.schema,
  world_schema: world.schema,
  entity_count: world.entities.length,
  closed_door_highlight: wcDoor.properties.visual_attention,
  privacy: scene.privacy
}, null, 2));
