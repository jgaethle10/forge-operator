/* Work Saban: ordered evidence verification for localhost streams.
 * Uses Web Crypto, no remote API. This is unsigned integrity, not authentication.
 */
(() => {
  const GENESIS='sha256:'+'0'.repeat(64);
  const roles=['analyst','writer','designer','auditor','coordinator'];
  async function hashUtf8(input) {
    if (!globalThis.crypto?.subtle) throw new Error('secure_crypto_context_required');
    const bytes=new TextEncoder().encode(input);
    const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
    return 'sha256:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  function newVerifier(){
    let previous=GENESIS, traceId=null, sequence=0, status='waiting';
    const events=[],verified=new Map(),started=new Set();
    return {
      async accept(entry) {
        if(!entry||typeof entry!=='object'||Array.isArray(entry)||!entry.trace) {
          throw new Error('unsigned_or_missing_trace');
        }
        if (status==='completed'||status==='failed')throw new Error('trace_already_finished');
        const t=entry.trace;
        if(t.schema!=='evercraft.work-saban.event-trace.v1'||
           t.hash_algorithm!=='SHA-256'||t.authenticity!=='local_hash_chain_unsigned'||
           t.sequence!==sequence+1||t.previous_digest!==previous||
           typeof t.trace_id!=='string'||traceId!==null&&traceId!==t.trace_id){
          throw new Error('trace_chain_sequence_or_identity_mismatch');
        }
        const {trace:ignored,...event}=entry;
        const digest=await hashUtf8(JSON.stringify({
          trace_id:t.trace_id,sequence:t.sequence,previous_digest:t.previous_digest,event
        }));
        if(digest!==t.event_digest)throw new Error('trace_event_hash_mismatch');
        if(event.type==='accepted') {
          if(sequence!==0)throw new Error('accepted_not_first');
          status='running';
        }else if(event.type==='stage_started'){
          if(status!=='running'||!roles.includes(event.role)||
             event.role!==roles[verified.size]||started.has(event.role)){
            throw new Error('unexpected_stage_started');
          }
          started.add(event.role);
        }else if(event.type==='stage_verified'){
          if(status!=='running'||event.role!==roles[verified.size]||
             !started.has(event.role)||!event.receipt||
             event.receipt.role!==event.role||
             event.receipt.status!=='completed'||
             event.receipt.quality_status!=='pass'||
             !/^sha256:[0-9a-f]{64}$/.test(event.receipt.result_sha256||'')){
            throw new Error('unverified_stage_event');
          }
          verified.set(event.role,event.receipt);
        }else if(event.type==='completed'){
          const outcome=event.execution;
          if(status!=='running'||verified.size!==5||
             outcome?.status!=='verified_local'||
             outcome?.quality?.status!=='verified'||
             !Array.isArray(outcome.specialist_receipts)||
             outcome.specialist_receipts.length!==5||
             outcome.external_actions?.length!==0||
             outcome.model_inference!==false){
            throw new Error('incomplete_local_delivery');
          }
          for(let i=0;i<roles.length;i++){
            const receipt=outcome.specialist_receipts[i],observed=verified.get(roles[i]);
            if(receipt?.role!==roles[i]||
               receipt.result_sha256!==observed.result_sha256||
               receipt.idempotency_key!==observed.idempotency_key){
              throw new Error('delivery_does_not_match_observed_workers');
            }
          }
          if(!/^sha256:[0-9a-f]{64}$/.test(outcome.report_sha256||'')||
             await hashUtf8(outcome.report_markdown)!==outcome.report_sha256){
            throw new Error('audited_report_hash_mismatch');
          }
          status='completed';
        }else if(event.type==='failed_closed'){
          if(status!=='running')throw new Error('invalid_failure_state');
          status='failed';
        }else throw new Error('unknown_trace_event');
        sequence=t.sequence;
        previous=digest;traceId=t.trace_id;
        events.push(entry);
        return {status,trace_id:traceId,sequence,tail_digest:previous};
      },
      summary(){
        return {
          status,trace_id:traceId,event_count:sequence,tail_digest:previous,
          completed_roles:Array.from(verified.keys()),
          authenticity:'local_hash_chain_unsigned'
        };
      },
      export(){
        if(status!=='completed')throw new Error('only_completed_trace_can_be_exported');
        return {schema:'evercraft.work-saban.local-trace-export.v1', ...this.summary(),
          disclaimer:'Integrity hash chain only, unsigned. Includes the report and source fingerprint; keep private.',
          events:events.map(e=>structuredClone(e))
        };
      }
    };
  }
  window.WorkSabanTrace={create:newVerifier,hashUtf8};
})();