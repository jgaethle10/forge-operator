import fs from "node:fs";

const STATES = new Set(["observed", "verified", "inferred", "modeled", "unknown"]);
const OCCUPANCY = new Set(["occupied", "vacant", "unknown"]);
const DOOR = new Set(["open", "closed", "unknown"]);

const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const text = (value, fallback = "") => String(value ?? fallback).trim();

function evidenceState(value) {
  const state = text(value, "unknown").toLowerCase();
  return STATES.has(state) ? state : "unknown";
}

function rect(value = {}) {
  return {
    x: finite(value.x),
    y: finite(value.y),
    width: Math.max(0.1, finite(value.width, 1)),
    depth: Math.max(0.1, finite(value.depth, 1)),
    height: Math.max(0.1, finite(value.height, 2.6)),
  };
}

function normalizeRoom(room, floorId, index) {
  const id = text(room?.id, `room-${index + 1}`);
  const occupancy = text(room?.occupancy, "unknown").toLowerCase();
  return {
    id,
    floor_id: floorId,
    label: text(room?.label, id),
    geometry: rect(room?.geometry),
    occupancy: OCCUPANCY.has(occupancy) ? occupancy : "unknown",
    evidence_state: evidenceState(room?.evidence_state),
    source_refs: Array.isArray(room?.source_refs) ? room.source_refs.map(String) : [],
    telemetry: room?.telemetry && typeof room.telemetry === "object" ? { ...room.telemetry } : {},
  };
}

function normalizeDoor(door, floorId, index) {
  const id = text(door?.id, `door-${index + 1}`);
  const state = text(door?.state, "unknown").toLowerCase();
  return {
    id,
    floor_id: floorId,
    label: text(door?.label, id),
    connects: Array.isArray(door?.connects) ? door.connects.map(String).slice(0, 2) : [],
    position: {
      x: finite(door?.position?.x),
      y: finite(door?.position?.y),
      z: finite(door?.position?.z),
      rotation_deg: finite(door?.position?.rotation_deg),
    },
    state: DOOR.has(state) ? state : "unknown",
    evidence_state: evidenceState(door?.evidence_state),
    source_refs: Array.isArray(door?.source_refs) ? door.source_refs.map(String) : [],
    visual: {
      attention: state === "closed" ? "highlight" : "normal",
    },
  };
}

function normalizeDevice(device, floorId, index) {
  const id = text(device?.id, `device-${index + 1}`);
  return {
    id,
    floor_id: floorId,
    room_id: text(device?.room_id, ""),
    label: text(device?.label, id),
    kind: text(device?.kind, "sensor"),
    position: {
      x: finite(device?.position?.x),
      y: finite(device?.position?.y),
      z: finite(device?.position?.z),
    },
    state: device?.state && typeof device.state === "object" ? { ...device.state } : {},
    evidence_state: evidenceState(device?.evidence_state),
    source_refs: Array.isArray(device?.source_refs) ? device.source_refs.map(String) : [],
  };
}

function normalizeFloor(floor, index) {
  const id = text(floor?.id, `floor-${index + 1}`);
  return {
    id,
    label: text(floor?.label, id),
    level: finite(floor?.level, index),
    elevation_m: finite(floor?.elevation_m, index * 3),
    rooms: Array.isArray(floor?.rooms)
      ? floor.rooms.map((room, roomIndex) => normalizeRoom(room, id, roomIndex))
      : [],
    doors: Array.isArray(floor?.doors)
      ? floor.doors.map((door, doorIndex) => normalizeDoor(door, id, doorIndex))
      : [],
    devices: Array.isArray(floor?.devices)
      ? floor.devices.map((device, deviceIndex) => normalizeDevice(device, id, deviceIndex))
      : [],
  };
}

export function buildSpatialTwin(input = {}) {
  const floors = Array.isArray(input.floors)
    ? input.floors.map(normalizeFloor).sort((a, b) => a.level - b.level)
    : [];

  const roomIds = new Set(floors.flatMap((floor) => floor.rooms.map((room) => room.id)));
  for (const floor of floors) {
    for (const door of floor.doors) {
      door.connects = door.connects.filter((id) => roomIds.has(id));
    }
    for (const device of floor.devices) {
      if (device.room_id && !roomIds.has(device.room_id)) device.room_id = "";
    }
  }

  const privacy = {
    exact_address_included: false,
    person_identity_tracking: false,
    biometric_tracking: false,
    public_exposure_allowed: false,
    local_geometry_only: true,
  };

  return {
    schema: "evercraft.home.spatial-twin.v1",
    home_id: text(input.home_id, "home"),
    label: text(input.label, "Evercraft Home"),
    updated_at: text(input.updated_at, new Date().toISOString()),
    evidence_state: evidenceState(input.evidence_state),
    source_refs: Array.isArray(input.source_refs) ? input.source_refs.map(String) : [],
    floors,
    privacy,
    truth_boundary: {
      geometry_source_claimed: input.geometry_source ? text(input.geometry_source) : null,
      device_control_authority: false,
      occupancy_identity_inference: false,
      missing_state_is_unknown: true,
    },
  };
}

export function spatialTwinToWorldDefinition(scene) {
  if (!scene || scene.schema !== "evercraft.home.spatial-twin.v1") {
    throw new Error("spatial_twin_schema_invalid");
  }

  const entities = [];
  for (const floor of scene.floors || []) {
    for (const room of floor.rooms || []) {
      entities.push({
        id: `home:room:${floor.id}:${room.id}`,
        name: room.label,
        transform: {
          position: {
            x: room.geometry.x + room.geometry.width / 2,
            y: floor.elevation_m + room.geometry.height / 2,
            z: room.geometry.y + room.geometry.depth / 2,
          },
        },
        collider: {
          type: "box",
          halfExtents: {
            x: room.geometry.width / 2,
            y: room.geometry.height / 2,
            z: room.geometry.depth / 2,
          },
        },
        assetRefs: [],
        tags: ["evercraft-home", "room", `occupancy:${room.occupancy}`],
        properties: {
          floor_id: floor.id,
          room_id: room.id,
          occupancy: room.occupancy,
          evidence_state: room.evidence_state,
          source_refs: room.source_refs,
          telemetry: room.telemetry,
          interactive_control_authority: false,
        },
      });
    }

    for (const door of floor.doors || []) {
      entities.push({
        id: `home:door:${floor.id}:${door.id}`,
        name: door.label,
        transform: {
          position: {
            x: door.position.x,
            y: floor.elevation_m + door.position.z,
            z: door.position.y,
          },
          rotation: { x: 0, y: door.position.rotation_deg * Math.PI / 180, z: 0 },
        },
        assetRefs: [],
        tags: ["evercraft-home", "door", `state:${door.state}`],
        properties: {
          floor_id: floor.id,
          connects: door.connects,
          state: door.state,
          evidence_state: door.evidence_state,
          source_refs: door.source_refs,
          visual_attention: door.visual.attention,
          interactive_control_authority: false,
        },
      });
    }

    for (const device of floor.devices || []) {
      entities.push({
        id: `home:device:${floor.id}:${device.id}`,
        name: device.label,
        transform: {
          position: {
            x: device.position.x,
            y: floor.elevation_m + device.position.z,
            z: device.position.y,
          },
        },
        assetRefs: [],
        tags: ["evercraft-home", "device", `kind:${device.kind}`],
        properties: {
          floor_id: floor.id,
          room_id: device.room_id || null,
          kind: device.kind,
          state: device.state,
          evidence_state: device.evidence_state,
          source_refs: device.source_refs,
          interactive_control_authority: false,
        },
      });
    }
  }

  return {
    schema: "evercraft.world-engine.world.v1",
    id: `home:${scene.home_id}`,
    version: 1,
    tickRateHz: 30,
    gravity: { x: 0, y: 0, z: 0 },
    ground: { enabled: true, height: 0 },
    entities: entities.sort((a, b) => a.id.localeCompare(b.id)),
    metadata: {
      source: "evercraft-home",
      source_schema: scene.schema,
      source_home_id: scene.home_id,
      evidence_state: scene.evidence_state,
      render_authority: false,
      device_control_authority: false,
      person_identity_tracking: false,
      exact_address_included: false,
    },
  };
}

export function readSpatialTwinFile(filePath) {
  const target = text(filePath);
  if (!target) {
    return {
      ok: false,
      state: "not_configured",
      scene: null,
    };
  }

  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return {
      ok: false,
      state: "configured_source_unavailable",
      scene: null,
    };
  }

  if (!stat.isFile()) {
    return {
      ok: false,
      state: "configured_source_not_file",
      scene: null,
    };
  }
  if (stat.size > 2 * 1024 * 1024) {
    return {
      ok: false,
      state: "configured_source_too_large",
      scene: null,
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(target, "utf8"));
    const scene = buildSpatialTwin(raw);
    return {
      ok: true,
      state: "ready",
      scene,
      world: spatialTwinToWorldDefinition(scene),
    };
  } catch (error) {
    return {
      ok: false,
      state: error?.message || "configured_source_invalid",
      scene: null,
    };
  }
}
