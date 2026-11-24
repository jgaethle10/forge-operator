/**
 * Pure, fail-closed physical one-shot evidence evaluator.
 * Never opens sockets, reads secrets, requests a lease, or activates a broker.
 * Inputs must come from independently verified observations.
 */
const DNS='systemia.evercraft-edge-dns.v1';
const NODE_PORT=42420, DNS_PORT=1053;
const BROKER='systemia.remote-capacity-broker.v1';
const EXPECTED_UNITS={
  nodeseed:{active:'active',enabled:'enabled'},
  broker:{active:'inactive',enabled:'disabled'},
  saban:{active:'active',enabled:'enabled'},
};
const DNS_ID=/^edge_dns_[a-f0-9]{16}$/i;
const BROKER_ID=/^remote_broker_[a-f0-9]{24}$/i;
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validInt=n=>Number.isSafeInteger(n)&&n>=0;

function validPortList(ports){
  return Array.isArray(ports)&&ports.length<=32&&
    ports.every(p=>validInt(p)&&p>0&&p<=65535)&&
    new Set(ports).size===ports.length;
}
function strictLoopback(value){
  try{
    const url=new URL(String(value||''));
    return url.protocol==='http:'&&url.hostname==='127.0.0.1'&&
      /^\d+$/.test(url.port)&&Number(url.port)>0&&Number(url.port)<=65535&&
      !url.username&&!url.password&&
      (url.pathname==='/'||url.pathname==='')&&
      !url.search&&!url.hash&&
      Number(url.port)!==NODE_PORT&&Number(url.port)!==DNS_PORT;
  }catch{return false}
}
function expectedUnits(units){
  return plain(units)&&Object.entries(EXPECTED_UNITS).every(
    ([name,expected])=>units[name]?.active===expected.active&&
      units[name]?.enabled===expected.enabled
  );
}
function dnsValid(s){
  return plain(s?.dns)&&s.dns.service==='evercraft-edge-dns'&&
    s.dns.workload_class===DNS&&
    DNS_ID.test(String(s.dns.instance_id||''))&&
    /^sha256:[a-f0-9]{64}$/i.test(String(s.dns.snapshot_sha256||''))&&
    s.dns.authoritative===true&&s.dns.recursive===false&&
    s.dns.dns_tcp===true&&s.dns.dns_udp===true&&
    s.dns.dns_tcp_port===DNS_PORT&&
    validInt(s.dns.health_http_port)&&s.dns.health_http_port>0&&
    s.dns.health_http_port!==NODE_PORT&&
    s.dns.health_http_port!==DNS_PORT&&
    plain(s.dns_probe)&&
    s.dns_probe.aa===true&&s.dns_probe.ra===false&&
    s.dns_probe.rcode===0&&validInt(s.dns_probe.answers)&&
    s.dns_probe.answers>=1;
}
function basicSnapshot(s){
  return plain(s)&&s.node_port===NODE_PORT&&
    /^[A-Za-z0-9._-]{1,128}$/.test(String(s.node_id||''))&&
    /^sha256:[a-f0-9]{64}$/i.test(String(s.device_fingerprint||''))&&
    validInt(s.resident_services)&&validPortList(s.owner_tcp_ports)&&
    s.owner_tcp_ports.includes(NODE_PORT)&&
    s.owner_tcp_ports.includes(DNS_PORT)&&
    dnsValid(s)&&s.owner_tcp_ports.includes(s.dns.health_http_port)&&
    expectedUnits(s.protected_units)&&
    s.legacy_authority_imported===false&&
    s.public_route_created===false;
}
function brokerValid(b){
  return plain(b)&&b.service==='remote-capacity-broker'&&
    BROKER_ID.test(String(b.instance_id||''))&&
    strictLoopback(b.endpoint)&&
    b.loopback_listener_verified===true&&
    b.authorized_devices===0&&b.registered_nodes===0&&
    b.pending_enrollment_requests===0&&
    b.deployment_receipt_bound===false&&
    b.public_route_created===false;
}
function samePorts(a,b){
  if(!validPortList(a)||!validPortList(b)||a.length!==b.length)return false;
  return [...a].sort((x,y)=>x-y).every((x,i)=>
    x===[...b].sort((m,n)=>m-n)[i]
  );
}
function sameUnits(a,b){
  return ['nodeseed','broker','saban'].every(
    name=>a?.[name]?.active===b?.[name]?.active&&
      a?.[name]?.enabled===b?.[name]?.enabled
  );
}

/**
 * The release receipt verifier and health/DNS probes are independent of this
 * structural gate. A caller's untrusted true flags alone prove nothing.
 */
export function evaluatePhysicalShadowCanaryEvidence({
  before,during,after,release,
}={}){
  const hold=[];
  if(!basicSnapshot(before))hold.push('before_baseline_unverified');
  if(!basicSnapshot(during))hold.push('during_baseline_unverified');
  if(!basicSnapshot(after))hold.push('after_baseline_unverified');
  if(hold.length===0){
    if(![during,after].every(s=>
      s.node_id===before.node_id&&
      s.device_fingerprint===before.device_fingerprint))
      hold.push('nodeseed_identity_changed');
    if(![during,after].every(s=>
      s.dns.instance_id===before.dns.instance_id&&
      s.dns.health_http_port===before.dns.health_http_port))
      hold.push('existing_dns_replaced_or_rebound');
    if(![during,after].every(s=>
      s.dns.snapshot_sha256===before.dns.snapshot_sha256))
      hold.push('existing_dns_snapshot_changed');
    if(before.resident_services!==1||
       during.resident_services!==2||
       after.resident_services!==1)
      hold.push('resident_count_not_1_2_1');
    if(before.broker!==null||after.broker!==null||
       !brokerValid(during.broker))
      hold.push('zero_authority_broker_not_exclusive');
    if(!samePorts(before.owner_tcp_ports,after.owner_tcp_ports))
      hold.push('listener_baseline_not_restored');
    if(brokerValid(during.broker)&&
       !during.owner_tcp_ports.includes(
         Number(new URL(during.broker.endpoint).port)))
      hold.push('broker_listener_not_owned_by_nodeseed');
    if(!sameUnits(before.protected_units,during.protected_units)||
       !sameUnits(before.protected_units,after.protected_units))
      hold.push('protected_unit_state_changed');
  }
  if(!plain(release)||release.ok!==true||
     release.journal_phase!=='released'||
     release.release_receipt_verified!==true||
     release.node_id!==before?.node_id||
     release.workload_class!==BROKER||
     release.secret_token_erased!==true||
     release.manual_reconciliation_required!==false)
    hold.push('broker_lease_release_not_independently_verified');
  return {
    schema:'evercraft.yard.physical-shadow-broker-acceptance.v1',
    accepted:hold.length===0,
    hold_reasons:hold,
    dns_before_during_after_required:true,
    resident_count_transition_required:'1->2->1',
    manual_reconciliation_required:hold.length!==0,
    broker_activation_authorized:false,
    remote_device_enrollment_authorized:false,
    saban_dispatcher_change_authorized:false,
    automatically_retry_job:false,
  };
}
