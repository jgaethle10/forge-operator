import net from 'node:net';
import crypto from 'node:crypto';

// Deliberately narrow synthetic-audio lab probe for a SECOND operator-controlled
// device. No public hosts, uploads, broadcast interfaces or emergency actions.
const sha = bytes => 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
const fail = reason => { throw Error(reason); };
const privateIPv4 = ip => {
  if (net.isIP(ip) !== 4) return false;
  const octets = ip.split('.').map(Number);
  return octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
};
export function validateCommunityRadioJoinUrl(joinUrl,{acknowledged=false}={}) {
  if (acknowledged !== true) fail('operator_listener_consent_required');
  if (typeof joinUrl !== 'string' || joinUrl.length > 512) fail('invalid_join_link');
  let parsed;
  try { parsed = new URL(joinUrl.trim()); } catch { fail('invalid_join_link'); }
  if (parsed.protocol !== 'http:' || !privateIPv4(parsed.hostname) ||
      !parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !/^\/join\/[a-f0-9]{64}$/.test(parsed.pathname)) {
    fail('only_explicit_private_synthetic_join_links_allowed');
  }
  return {origin:parsed.origin,joinUrl:parsed.href,host:parsed.hostname,port:Number(parsed.port)};
}
async function getBounded(url,opts,maxBytes,request) {
  const response=await request(url,{...opts,redirect:'manual',signal:AbortSignal.timeout(6000)});
  const advertised=Number(response.headers.get('content-length'));
  if (Number.isFinite(advertised) && advertised>maxBytes) {
    await response.body?.cancel();
    fail('probe_response_too_large');
  }
  if (!response.body) return {response,bytes:Buffer.alloc(0)};
  const reader=response.body.getReader(),chunks=[];
  let total=0;
  try {
    while (true) {
      const {done,value}=await reader.read();
      if (done) break;
      total+=value.byteLength;
      if (total>maxBytes) {
        await reader.cancel();fail('probe_response_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally { try {reader.releaseLock();} catch {} }
  return {response,bytes:Buffer.concat(chunks,total)};
}
export async function probeCommunityRadioSecondDevice({joinUrl,acknowledged=false,request=fetch}={}) {
  const input=validateCommunityRadioJoinUrl(joinUrl,{acknowledged});
  const origin=input.origin;
  const anonymous=await getBounded(origin+'/',{method:'GET'},4096,request);
  if (anonymous.response.status!==403) fail('synthetic_lab_anonymous_access_not_denied');
  const joined=await getBounded(input.joinUrl,{method:'GET'},4096,request);
  if (joined.response.status!==303 || joined.response.headers.get('location')!=='/') {
    fail('synthetic_lab_join_not_approved');
  }
  const cookie=joined.response.headers.get('set-cookie')||'';
  const cookieMatch=/^evercraft_lab=([a-f0-9]{64});/.exec(cookie);
  if (!cookieMatch || cookieMatch[1]!==input.joinUrl.split('/').at(-1)) {
    fail('unexpected_lab_session_cookie');
  }
  const authHeader={cookie:'evercraft_lab='+cookieMatch[1]};
  const page=await getBounded(origin+'/',{method:'GET',headers:authHeader},32768,request);
  const html=page.bytes.toString('utf8');
  if(page.response.status!==200 || !/text\/html/i.test(page.response.headers.get('content-type')||'') ||
    !html.includes('EVERCRAFT NETWORK | LOCAL EXPERIMENT ONLY') ||
    !html.includes('Locally cached recording') ||
    !html.includes('Simulated') || !html.includes('Simulation')) {
    fail('synthetic_lab_page_unverified');
  }
  const range=await getBounded(origin+'/audio',{method:'GET',headers:{...authHeader,range:'bytes=0-3'}},4096,request);
  if (range.response.status!==206 || range.bytes.toString('ascii')!=='RIFF' ||
    !/^bytes 0-3\/\d+$/.test(range.response.headers.get('content-range')||'')) {
    fail('synthetic_lab_audio_range_unverified');
  }
  const recording=await getBounded(origin+'/audio',{method:'GET',headers:authHeader},10*1024*1024,request);
  if(recording.response.status!==200 || recording.bytes.length<44 ||
    recording.bytes.toString('ascii',0,4)!=='RIFF' ||
    recording.bytes.toString('ascii',8,12)!=='WAVE' ||
    !/audio\/wav/i.test(recording.response.headers.get('content-type')||'')) {
    fail('synthetic_lab_audio_body_unverified');
  }
  const record={
    schema:'evercraft.radio.second-device-http-probe.v1',
    state:'observed_synthetic_lan_http_only',
    observed_at_utc:new Date().toISOString(),
    private_target_ipv4:input.host,
    private_target_port:input.port,
    anonymous_http_status:anonymous.response.status,
    invite_http_status:joined.response.status,
    page_http_status:page.response.status,
    audio_http_status:recording.response.status,
    audio_range_http_status:range.response.status,
    page_sha256:sha(page.bytes),
    audio_sha256:sha(recording.bytes),
    audio_length_bytes:recording.bytes.length,
    token_recorded:false,
    cookie_recorded:false,
    host_internet_outage_verified:false,
    client_internet_outage_verified:false,
    independently_verified_distinct_devices:false,
    audible_playback_verified:false,
    battery_or_rf_evidence:false,
    station_permission_verified:false,
    next_action:'operator_observed_playback_and_outage_measurements_plus_independent_witness_review'
  };
  return {...record,probe_receipt_sha256:sha(Buffer.from(JSON.stringify(record)))};
}
