import type {
  AspectRatio,
  CreativeRequirement,
  CreativeTaskKind,
  ProductionNeed,
} from './types.js';

export type DepartmentExecutionState = 'declared' | 'verified';

export interface CreativeDepartmentCapability {
  kind: CreativeTaskKind;
  requirements: CreativeRequirement[];
  maxDurationSec?: number;
  aspectRatios?: AspectRatio[];
  languages?: string[];
  qualityTier: 1 | 2 | 3 | 4 | 5;
  costTier: 1 | 2 | 3 | 4 | 5;
  latencyTier: 1 | 2 | 3 | 4 | 5;
}

export interface CreativeDepartment {
  id: string;
  name: string;
  enabled: boolean;
  executionState: DepartmentExecutionState;
  capabilities: CreativeDepartmentCapability[];
}

export interface ProductionRoute {
  needId: string;
  status: 'routed' | 'blocked';
  departmentId?: string;
  departmentName?: string;
  score?: number;
  reason: string;
}

function supportsRequirements(
  capability: CreativeDepartmentCapability,
  required: CreativeRequirement[],
) {
  const supported = new Set(capability.requirements);
  return required.every((requirement) => supported.has(requirement));
}

function supportsShape(
  capability: CreativeDepartmentCapability,
  need: ProductionNeed,
) {
  if (
    need.durationSec !== undefined &&
    capability.maxDurationSec !== undefined &&
    need.durationSec > capability.maxDurationSec
  ) {
    return false;
  }

  if (
    need.aspectRatio &&
    capability.aspectRatios &&
    !capability.aspectRatios.includes(need.aspectRatio)
  ) {
    return false;
  }

  if (
    need.language &&
    capability.languages &&
    !capability.languages.includes('*') &&
    !capability.languages.includes(need.language)
  ) {
    return false;
  }

  return true;
}

function routeScore(capability: CreativeDepartmentCapability) {
  return (
    capability.qualityTier * 100 -
    capability.costTier * 10 -
    capability.latencyTier
  );
}

export function routeProductionNeed(
  need: ProductionNeed,
  departments: CreativeDepartment[],
): ProductionRoute {
  const candidates = departments
    .filter(
      (department) =>
        department.enabled && department.executionState === 'verified',
    )
    .flatMap((department) =>
      department.capabilities
        .filter((capability) => capability.kind === need.kind)
        .filter((capability) =>
          supportsRequirements(capability, need.requires),
        )
        .filter((capability) => supportsShape(capability, need))
        .map((capability) => ({
          department,
          capability,
          score: routeScore(capability),
        })),
    )
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.department.id.localeCompare(b.department.id),
    );

  const selected = candidates[0];
  if (!selected) {
    return {
      needId: need.id,
      status: 'blocked',
      reason:
        'No verified creative department satisfies the task kind, continuity requirements, rights/provenance controls and requested media shape.',
    };
  }

  return {
    needId: need.id,
    status: 'routed',
    departmentId: selected.department.id,
    departmentName: selected.department.name,
    score: selected.score,
    reason:
      'Selected from verified departments that satisfy every declared requirement. Quality, cost and latency tiers break ties without changing the continuity contract.',
  };
}

export function routeProductionPlan(
  needs: ProductionNeed[],
  departments: CreativeDepartment[],
): ProductionRoute[] {
  return needs.map((need) => routeProductionNeed(need, departments));
}
