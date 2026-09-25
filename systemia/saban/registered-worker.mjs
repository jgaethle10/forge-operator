import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  loadMultiplicationRegistry,
  resolveMultiplicationContract
} from './multiplier.mjs';
import { validateMultiplicationContract } from './admission.mjs';

export async function runRegisteredAssignment({
  software,
  assignment,
  rootDir = process.cwd()
}) {
  if (!assignment?.agent_id || !assignment?.role || !assignment?.work) {
    throw new Error('Registered Saban assignment is missing required fields.');
  }

  const registry = loadMultiplicationRegistry(
    path.join(rootDir, 'systemia/saban/multiplication-registry.json')
  );
  const contract = resolveMultiplicationContract(software, registry);
  const validation = validateMultiplicationContract(contract);
  if (!validation.valid) {
    throw new Error(`Registered Saban contract failed validation: ${validation.errors.join(', ')}`);
  }

  const adapterPath = path.resolve(rootDir, contract.adapter);
  const adapter = await import(pathToFileURL(adapterPath).href);
  if (typeof adapter.runAssignment !== 'function') {
    throw new Error(`Registered adapter does not export runAssignment(): ${contract.adapter}`);
  }

  const result = await adapter.runAssignment({
    assignment,
    plan: {
      software_id: contract.software_id,
      logical_agents: 1,
      physical_workers: 1,
      assignment_strategy: contract.assignment_strategy,
      roles: contract.roles
    },
    contract,
    rootDir
  });

  return {
    schema: 'evercraft.saban.registered-worker-receipt.v1',
    software_id: contract.software_id,
    adapter: contract.adapter,
    agent_id: assignment.agent_id,
    role: assignment.role,
    work: assignment.work,
    result
  };
}
