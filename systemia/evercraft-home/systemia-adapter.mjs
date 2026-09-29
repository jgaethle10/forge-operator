import { admitMission, assertControlPlane, machineInventory } from "../control-plane/control-plane.mjs";

export function readSystemiaInventory(rootDir) {
  return machineInventory(rootDir);
}

export function planSystemiaMission(request, rootDir) {
  const plan = admitMission({ request, rootDir });
  assertControlPlane(plan);
  return {
    schema: "evercraft.home.systemia-plan.v1",
    state: "planned_not_executed",
    execution_authority_granted: false,
    plan,
  };
}
