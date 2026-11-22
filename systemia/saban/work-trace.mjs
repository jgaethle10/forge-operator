// Non-executable, privacy-minimal diagnostics for Saban job state transitions.
// Never place prompts, model reasoning, output bodies, errors or paths in traces.

const EVENTS = new Set([
  'queued', 'leased', 'checkpointed', 'retry_queued',
  'lease_expired_queued', 'lease_expired_dead_letter',
  'failed_dead_letter', 'completed',
]);
const STATES = new Set(['queued', 'leased', 'dead_letter', 'completed']);
const REASONS = new Set(['adapter_error', 'worker_failed', 'lease_expired', 'validation_failed', 'timeout', 'other_error']);
export const MAX_TRACE_EVENTS = 16;

function safeReason(raw) {
  return REASONS.has(raw) ? raw : 'other_error';
}

export function appendWorkTrace(job, { event, at, reason = null } = {}) {
  if (!job || typeof job !== 'object' || !EVENTS.has(event) ||
      !STATES.has(job.state) || !Number.isInteger(job.attempts) || job.attempts < 0) {
    throw new Error('saban_work_trace_event_invalid');
  }
  const prior = job.trace?.schema === 'evercraft.saban.work-trace.v1' &&
    Array.isArray(job.trace.events) ? job.trace : { total_events: 0, events: [] };
  const total = prior.total_events + 1;
  const entry = {
    sequence: total,
    at: new Date(at).toISOString(),
    event,
    state: job.state,
    attempts: job.attempts,
    ...(reason === null ? {} : {reason_category: safeReason(reason)}),
  };
  // Fixed history budget: no unbounded log growth under repeated retries.
  job.trace = {
    schema: 'evercraft.saban.work-trace.v1',
    total_events: total,
    events: [...prior.events, entry].slice(-MAX_TRACE_EVENTS),
  };
  return entry;
}

export function projectWorkTraces(state, { maxJobs = 100 } = {}) {
  if (!Number.isSafeInteger(maxJobs) || maxJobs < 1 || maxJobs > 1000) {
    throw new Error('saban_work_trace_projection_limit_invalid');
  }
  const jobs = Object.values(state?.jobs || {}).sort((a,b) =>
    String(a.job_id).localeCompare(String(b.job_id)));
  const selection = jobs.slice(0, maxJobs);
  return {
    schema: 'evercraft.saban.work-trace-projection.v1',
    software_id: typeof state?.software_id === 'string' ? state.software_id : null,
    total_jobs: jobs.length,
    returned_jobs: selection.length,
    omitted_jobs: Math.max(0, jobs.length - selection.length),
    raw_prompts_included: false,
    raw_results_included: false,
    error_messages_included: false,
    execution_authorized: false,
    jobs: selection.map(job => ({
      job_id: job.job_id,
      current_state: STATES.has(job.state) ? job.state : 'unknown',
      attempts: Number.isInteger(job.attempts) ? job.attempts : null,
      trace_events_total: job.trace?.total_events || 0,
      trace_events_omitted: Math.max(0, (job.trace?.total_events || 0) -
        (Array.isArray(job.trace?.events) ? job.trace.events.length : 0)),
      events: Array.isArray(job.trace?.events) ? job.trace.events.map(item => ({
        sequence: item.sequence, at: item.at, event: item.event,
        state: item.state, attempts: item.attempts,
        ...(item.reason_category ? {reason_category: safeReason(item.reason_category)} : {}),
      })) : [],
    })),
  };
}
