import { createHash, randomUUID } from 'node:crypto';

export const GENESIS = 'sha256:' + '0'.repeat(64);
export const sha256Text = input => 'sha256:' + createHash('sha256').update(input, 'utf8').digest('hex');

// The preview has no signing key. These hashes provide a tamper-evident
// ordered local trace, NOT a verified identity or third-party signature.
export function createLocalEventChain({ traceId = randomUUID() } = {}) {
  if (typeof traceId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(traceId)) {
    throw new Error('invalid_trace_id');
  }
  let previous = GENESIS;
  let sequence = 0;
  return {
    next(event) {
      if (!event || typeof event !== 'object' || Array.isArray(event)
          || typeof event.type !== 'string') throw new Error('invalid_trace_event');
      const seq = ++sequence;
      const body = { trace_id:traceId, sequence:seq, previous_digest:previous, event };
      const eventDigest = sha256Text(JSON.stringify(body));
      previous=eventDigest;
      return { ...event, trace: {
        schema:'evercraft.work-saban.event-trace.v1',
        trace_id:traceId,
        sequence:seq,
        previous_digest:body.previous_digest,
        event_digest:eventDigest,
        hash_algorithm:'SHA-256',
        authenticity:'local_hash_chain_unsigned'
      }};
    },
    summary() {
      return {
        trace_id:traceId, count:sequence, tail_digest:previous,
        authenticity:'local_hash_chain_unsigned'
      };
    }
  };
}

export function verifyLocalEventChain(events) {
  if (!Array.isArray(events) || !events.length || events.length > 64) {
    throw new Error('invalid_trace_length');
  }
  let prior=GENESIS, traceId=null;
  for (let i=0;i<events.length;i++) {
    const entry=events[i];
    const trace=entry?.trace;
    if (!trace || trace.schema!=='evercraft.work-saban.event-trace.v1'
        || trace.hash_algorithm!=='SHA-256' || trace.authenticity!=='local_hash_chain_unsigned'
        || trace.sequence!==i+1 || trace.previous_digest!==prior
        || typeof trace.trace_id!=='string'
        || traceId!==null && traceId!==trace.trace_id) throw new Error('invalid_trace_link');
    traceId=trace.trace_id;
    const {trace:ignored, ...event}=entry;
    const expected=sha256Text(JSON.stringify({
      trace_id:traceId,sequence:i+1,previous_digest:prior,event
    }));
    if (trace.event_digest!==expected) throw new Error('invalid_trace_hash');
    prior=expected;
  }
  return {valid:true, trace_id:traceId, count:events.length, tail_digest:prior,
    authenticity:'local_hash_chain_unsigned'};
}
