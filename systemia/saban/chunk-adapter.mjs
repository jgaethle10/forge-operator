export async function runAssignment({ assignment }) {
  return {
    status: 'planned',
    agent_id: assignment.agent_id,
    role: assignment.role,
    work: assignment.work,
    item: assignment.item?.raw || null
  };
}

export async function reconcile({ results }) {
  return {
    status: 'planned',
    result_count: Array.isArray(results) ? results.length : 0
  };
}
