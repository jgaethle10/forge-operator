import {
  emptyContextState,
  ingestContextObservation
} from '../worldstate/observation-fabric.mjs';
import { normalizeMachineObservation } from './machine-rockies.mjs';

export const MACHINE_ROCKY_SUBSCRIPTIONS = {
  schema: 'evercraft.context-fabric.subscriptions.v1',
  always: ['systemia_world_model', 'sentinel', 'systemia_radar'],
  by_domain: {
    machine_activity: ['portfolio_sentinel', 'chum', 'security'],
    machine_discovery: ['portfolio_sentinel', 'chum'],
    machine_probe: ['portfolio_sentinel', 'security'],
    commercial_outreach: ['portfolio_sentinel', 'security'],
    domain_birth: ['portfolio_sentinel', 'chum', 'opportunity_fabric'],
    business_registration: ['opportunity_fabric', 'saban'],
    permit: ['opportunity_fabric', 'rivet', 'saban'],
    hiring: ['opportunity_fabric', 'saban'],
    business_listing: ['opportunity_fabric', 'chum'],
    procurement: ['opportunity_fabric', 'saban'],
    facility_change: ['opportunity_fabric', 'rivet', 'saban'],
    ev_infrastructure: ['opportunity_fabric', 'rivet', 'saban']
  }
};

export function ingestMachineObservation(state = emptyContextState(), rawObservation, options = {}) {
  const observation = normalizeMachineObservation(rawObservation);
  return ingestContextObservation(state, observation, {
    ...options,
    subscriptions: options.subscriptions || MACHINE_ROCKY_SUBSCRIPTIONS
  });
}
