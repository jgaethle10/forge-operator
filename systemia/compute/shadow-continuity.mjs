// Pure, provider-neutral shadow observation. Not an execution or key authority.
const HEX32=/^[a-f0-9]{32}$/,HEX64=/^[a-f0-9]{64}$/;
const t=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const rnd=n=>Number(n.toFixed(3));
function suffix(value,prefix){if(typeof value!=='string'||!value.startsWith(prefix))return null;const s=value.slice(prefix.length);return HEX32.test(s)?s:null;}
function evidence(refs){
 if(!Array.isArray(refs)||refs.length>50)return null;
 const e=refs.filter(x=>typeof x==='string'&&x.startsWith('signed-envelope-sha256:'));
 const s=refs.filter(x=>typeof x==='string'&&x.startsWith('signed-statement-sha256:'));
 if(e.length!==1||s.length!==1)return null;
 const ev=e[0].slice(23),st=s[0].slice(24);
 return HEX64.test(ev)&&HEX64.test(st)?ev:null;
}
export function assessShadowContinuity({
 nodeKey,sourceAdapter,samplePrefix,noncePrefix,samples=[],nonces=[],
 registry=null,authority=null,leaseCount=0,now=Date.now(),windows=[2,6,24],reviewGapSeconds=330
}={}){
 if(typeof nodeKey!=='string'||nodeKey.length<3||nodeKey.length>160
 ||typeof sourceAdapter!=='string'||!sourceAdapter
 ||typeof samplePrefix!=='string'||!samplePrefix||samplePrefix.length>80
 ||typeof noncePrefix!=='string'||!noncePrefix||noncePrefix.length>80
 ||!Number.isFinite(now)||!Number.isFinite(reviewGapSeconds)||reviewGapSeconds<300
 ||!Array.isArray(samples)||!Array.isArray(nonces)||samples.length>2000||nonces.length>2000
 ||!Array.isArray(windows)||windows.length>4||windows.some(h=>![2,6,24].includes(h)))
 throw Error('invalid_or_unbounded_observer_input');
 const sampleCounts=new Map(),nonceCounts=new Map();
 for(const row of samples)if(typeof row?.sample_key==='string')sampleCounts.set(row.sample_key,(sampleCounts.get(row.sample_key)||0)+1);
 for(const row of nonces)if(typeof row?.nonce_key==='string')nonceCounts.set(row.nonce_key,(nonceCounts.get(row.nonce_key)||0)+1);
 const byNonce=new Map(nonces.filter(x=>typeof x?.nonce_key==='string').map(x=>[x.nonce_key,x]));
 const valid=[];
 for(const row of samples){
  if(!row||row.node_key!==nodeKey||row.source_adapter!==sourceAdapter||row.collection_state!=='observed')continue;
  const s=suffix(row.sample_key,samplePrefix),when=t(row.observed_at);
  if(!s||when===null||when>now+30000||sampleCounts.get(row.sample_key)!==1
    ||!Number.isFinite(row.memory_pct)||row.memory_pct<0||row.memory_pct>100
    ||!Number.isSafeInteger(row.uptime_seconds)||row.uptime_seconds<0)continue;
  const nk=noncePrefix+s,n=byNonce.get(nk),digest=evidence(row.evidence_refs);
  const linked=Boolean(digest&&nonceCounts.get(nk)===1&&n?.node_key===nodeKey&&n.request_fingerprint==='sha256:'+digest);
  valid.push({when,key:row.sample_key,uptime:row.uptime_seconds,linked});
 }
 valid.sort((a,b)=>a.when-b.when);
 const latest=valid.at(-1)||null;
 const registryLinked=Boolean(latest&&registry?.node_key===nodeKey&&registry.last_sample_key===latest.key
  &&registry.last_seen_at===new Date(latest.when).toISOString());
 const held=registry?.node_key===nodeKey&&registry.status==='shadow'&&registry.execution_allowed===false
  &&authority?.mode==='quarantined'&&authority.allowed_execution===false&&leaseCount===0;
 const views=windows.map(hours=>{
  const w=valid.filter(x=>x.when>=now-hours*3600000&&x.when<=now);
  const gaps=[],events=[];
  for(let i=1;i<w.length;i++){
   const a=w[i-1],b=w[i],seconds=(b.when-a.when)/1000,reversal=b.uptime<a.uptime;
   gaps.push(seconds);
   if(seconds>reviewGapSeconds||reversal)events.push({
    before_at:new Date(a.when).toISOString(),after_at:new Date(b.when).toISOString(),
    interval_seconds:rnd(seconds),reported_uptime_reversed:reversal,cause:'unverified'});
  }
  const sorted=[...gaps].sort((a,b)=>a-b),p=q=>sorted.length?rnd(sorted[Math.ceil(sorted.length*q)-1]):null;
  return {hours,sample_count:w.length,interval_count:gaps.length,
   linked_stored_hash_count:w.filter(x=>x.linked).length,
   median_interval_seconds:p(.5),p95_interval_seconds:p(.95),
   longest_interval_seconds:sorted.length?rnd(sorted.at(-1)):null,
   gaps_over_review_threshold:gaps.filter(x=>x>reviewGapSeconds).length,
   reported_uptime_reversals:events.filter(x=>x.reported_uptime_reversed).length,
   largest_incidents:events.sort((a,b)=>b.interval_seconds-a.interval_seconds).slice(0,12),
   coverage:'server_receipts_only_not_device_availability'};
 });
 return Object.freeze({schema:'evercraft.compute.shadow-continuity.v1',
  input_sample_count:samples.length,accepted_unique_sample_count:valid.length,
  excluded_sample_count:samples.length-valid.length,
  duplicate_sample_keys:[...sampleCounts.values()].filter(n=>n>1).length,
  duplicate_nonce_keys:[...nonceCounts.values()].filter(n=>n>1).length,
  latest_sample_at:latest?new Date(latest.when).toISOString():null,
  last_sample_registry_linked:registryLinked,
  fresh_observation:latest?now-latest.when<=600000&&registryLinked:false,
  authority_state:held?'shadow_quarantined':'unknown_or_changed',
  independent_signature_verification:false,host_restart_cause_verified:false,
  source_custody_verified:false,work_execution_authorized:false,windows:views,
  limitations:['Stored hash agreement does not reverify raw Ed25519 signature',
   'Nonce claims are not proven atomic','Gap cause and true host uptime remain unknown',
   'No machine-source receipt, independent witness or work permit']});
}
