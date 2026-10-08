const DEFAULT_CONFIG = Object.freeze({
  tickSeconds: 1,
  excavatorLoadRateTonsPerSecond: 2.5,
  loaderProcessRateTonsPerSecond: 1.5,
  haulDistanceMeters: 240,
  returnDistanceMeters: 220,
  approachDistanceMeters: 45,
  dumpSeconds: 3,
});

const MACHINE_DEFAULTS = Object.freeze({
  excavator: { maxSpeedMps: 2.0 },
  haul_truck: { maxSpeedMps: 8.0 },
  front_loader: { maxSpeedMps: 4.0 },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertMachine(machine) {
  if (!machine?.id || !machine?.kind) throw new Error('machine requires id and kind');
  if (!MACHINE_DEFAULTS[machine.kind]) throw new Error(`unsupported machine kind: ${machine.kind}`);
}

export function makeDemoFleet() {
  return [
    { id: 'EX-01', kind: 'excavator', zone: 'dig-face', state: 'ready', payloadTons: 0 },
    { id: 'HT-01', kind: 'haul_truck', zone: 'queue', state: 'queue', payloadTons: 0, capacityTons: 18, queueAge: 3 },
    { id: 'HT-02', kind: 'haul_truck', zone: 'queue', state: 'queue', payloadTons: 0, capacityTons: 18, queueAge: 2 },
    { id: 'HT-03', kind: 'haul_truck', zone: 'queue', state: 'queue', payloadTons: 0, capacityTons: 18, queueAge: 1 },
    { id: 'FL-01', kind: 'front_loader', zone: 'stockpile', state: 'manage-stockpile', payloadTons: 0 },
  ];
}

export function validateActuation(machine, command) {
  assertMachine(machine);
  const limit = machine.maxSpeedMps ?? MACHINE_DEFAULTS[machine.kind].maxSpeedMps;
  if (command.speedMps != null && (command.speedMps < 0 || command.speedMps > limit)) {
    return { ok: false, reason: `speed ${command.speedMps} exceeds ${machine.id} envelope ${limit}` };
  }
  if (command.targetZone && !['dig-face', 'queue', 'haul-road', 'dump-pad', 'return-road', 'stockpile', machine.zone].includes(command.targetZone)) {
    return { ok: false, reason: `target zone ${command.targetZone} is outside site geofence` };
  }
  return { ok: true };
}

export function createFleetController(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.config ?? {}) };
  const fleet = clone(options.fleet ?? makeDemoFleet());
  fleet.forEach((machine) => {
    assertMachine(machine);
    machine.maxSpeedMps ??= MACHINE_DEFAULTS[machine.kind].maxSpeedMps;
    machine.commandedSpeedMps = 0;
    machine.hold = false;
    machine.progress = machine.progress ?? 0;
  });

  const state = {
    version: 'earthworks-autonomy.v1',
    mode: 'running',
    simSeconds: 0,
    tonsMoved: 0,
    tonsProcessed: 0,
    stockpileTons: 0,
    cyclesCompleted: 0,
    safetyInterventions: 0,
    currentLoadTruckId: null,
    eventLog: [],
    fleet,
  };

  const planner = options.plannerAdapter ?? ((snapshot) => {
    const queued = snapshot.fleet
      .filter((m) => m.kind === 'haul_truck' && m.state === 'queue' && !m.hold)
      .sort((a, b) => (b.queueAge ?? 0) - (a.queueAge ?? 0) || a.id.localeCompare(b.id));
    return queued[0]?.id ?? null;
  });

  function log(type, message, data = {}) {
    state.eventLog.push({ t: state.simSeconds, type, message, ...data });
    if (state.eventLog.length > 80) state.eventLog.shift();
  }

  function safeCommand(machine, command) {
    const result = validateActuation(machine, command);
    if (!result.ok) {
      machine.hold = true;
      machine.commandedSpeedMps = 0;
      state.safetyInterventions += 1;
      log('safety', result.reason, { machineId: machine.id });
      return false;
    }
    if (command.speedMps != null) machine.commandedSpeedMps = command.speedMps;
    if (command.targetZone) machine.zone = command.targetZone;
    return true;
  }

  function assignLoadSlot() {
    if (state.currentLoadTruckId) return;
    const candidateId = planner(clone(state));
    if (!candidateId) return;
    const truck = state.fleet.find((m) => m.id === candidateId && m.kind === 'haul_truck');
    if (!truck || truck.state !== 'queue' || truck.hold) {
      log('planner-reject', 'planner proposed unavailable truck', { candidateId });
      return;
    }
    state.currentLoadTruckId = truck.id;
    truck.state = 'approach';
    truck.progress = 0;
    truck.queueAge = 0;
    safeCommand(truck, { speedMps: Math.min(4, truck.maxSpeedMps), targetZone: 'dig-face' });
    log('dispatch', `${truck.id} admitted to excavator load slot`, { truckId: truck.id });
  }

  function updateTruck(truck, dt) {
    if (truck.hold || state.mode !== 'running') {
      truck.commandedSpeedMps = 0;
      return;
    }
    if (truck.state === 'queue') {
      truck.queueAge = (truck.queueAge ?? 0) + dt;
      truck.commandedSpeedMps = 0;
      return;
    }
    if (truck.state === 'approach') {
      truck.progress += (truck.commandedSpeedMps * dt) / config.approachDistanceMeters;
      if (truck.progress >= 1) {
        truck.progress = 0;
        truck.state = 'loading';
        truck.commandedSpeedMps = 0;
        log('arrive', `${truck.id} positioned under EX-01`);
      }
      return;
    }
    if (truck.state === 'loading') {
      truck.payloadTons = Math.min(truck.capacityTons, truck.payloadTons + config.excavatorLoadRateTonsPerSecond * dt);
      if (truck.payloadTons >= truck.capacityTons) {
        truck.state = 'haul';
        truck.progress = 0;
        safeCommand(truck, { speedMps: Math.min(7, truck.maxSpeedMps), targetZone: 'haul-road' });
        state.currentLoadTruckId = null;
        log('loaded', `${truck.id} released with ${truck.payloadTons.toFixed(1)} t`);
      }
      return;
    }
    if (truck.state === 'haul') {
      truck.progress += (truck.commandedSpeedMps * dt) / config.haulDistanceMeters;
      if (truck.progress >= 1) {
        truck.progress = 0;
        truck.state = 'dump';
        truck.dumpElapsed = 0;
        safeCommand(truck, { speedMps: 0, targetZone: 'dump-pad' });
        log('arrive', `${truck.id} reached dump pad`);
      }
      return;
    }
    if (truck.state === 'dump') {
      truck.dumpElapsed = (truck.dumpElapsed ?? 0) + dt;
      if (truck.dumpElapsed >= config.dumpSeconds) {
        const payload = truck.payloadTons;
        state.tonsMoved += payload;
        state.stockpileTons += payload;
        state.cyclesCompleted += 1;
        truck.payloadTons = 0;
        truck.state = 'return';
        truck.progress = 0;
        safeCommand(truck, { speedMps: Math.min(7.5, truck.maxSpeedMps), targetZone: 'return-road' });
        log('dump', `${truck.id} dumped ${payload.toFixed(1)} t`, { payloadTons: payload });
      }
      return;
    }
    if (truck.state === 'return') {
      truck.progress += (truck.commandedSpeedMps * dt) / config.returnDistanceMeters;
      if (truck.progress >= 1) {
        truck.progress = 0;
        truck.state = 'queue';
        safeCommand(truck, { speedMps: 0, targetZone: 'queue' });
        log('queue', `${truck.id} returned to queue`);
      }
    }
  }

  function updateExcavator(excavator) {
    excavator.commandedSpeedMps = 0;
    excavator.state = state.currentLoadTruckId ? 'loading-truck' : 'waiting-for-truck';
  }

  function updateLoader(loader, dt) {
    loader.commandedSpeedMps = 0;
    loader.state = state.stockpileTons > 0 ? 'manage-stockpile' : 'idle';
    const processed = Math.min(state.stockpileTons, config.loaderProcessRateTonsPerSecond * dt);
    state.stockpileTons -= processed;
    state.tonsProcessed += processed;
  }

  function step(dt = config.tickSeconds) {
    if (!Number.isFinite(dt) || dt <= 0) throw new Error('dt must be a positive finite number');
    if (state.mode !== 'running') return snapshot();
    state.simSeconds += dt;
    assignLoadSlot();
    for (const machine of state.fleet) {
      if (machine.kind === 'haul_truck') updateTruck(machine, dt);
      else if (machine.kind === 'excavator') updateExcavator(machine);
      else if (machine.kind === 'front_loader') updateLoader(machine, dt);
    }
    return snapshot();
  }

  function stopAll(reason = 'operator e-stop') {
    state.mode = 'stopped';
    for (const machine of state.fleet) {
      machine.hold = true;
      machine.commandedSpeedMps = 0;
    }
    log('e-stop', `STOP ALL: ${reason}`);
    return snapshot();
  }

  function resume() {
    state.mode = 'running';
    for (const machine of state.fleet) machine.hold = false;
    log('resume', 'fleet resumed under safety kernel');
    return snapshot();
  }

  function injectUnsafeCommand(machineId, command) {
    const machine = state.fleet.find((m) => m.id === machineId);
    if (!machine) throw new Error(`unknown machine: ${machineId}`);
    safeCommand(machine, command);
    return snapshot();
  }

  function snapshot() {
    return clone(state);
  }

  log('boot', 'EarthWorks Autonomy controller online');
  return { step, stopAll, resume, snapshot, injectUnsafeCommand };
}
