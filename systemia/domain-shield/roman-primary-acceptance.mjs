/**
 * Exact-domain user-experience acceptance proof.
 * Read-only external GET of the URLs users actually type.
 * A healthy Evercraft mirror is NOT equivalent to original-domain recovery.
 */
export const ORIGINALS=Object.freeze([
  'https://voteroman.com/',
  'https://www.voteroman.com/',
]);
export const KNOWN_RECOVERY_URLS=Object.freeze([
  'https://fabric.systemiacommandcenters.com/campaigns/roman/',
  'https://headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com/',
  'https://jgaethle10.github.io/forge-operator/campaigns/roman/',
]);
const ACCEPTED_DESTINATION_HOSTS=new Set([
  'voteroman.com','www.voteroman.com',
  'fabric.systemiacommandcenters.com',
  'headless-jhpvqnpgxlh-sociallyguud-140c.wix-site-host.com',
  'jgaethle10.github.io',
]);
const DONATE='https://donate.voteroman.com/';
const CANDIDATE='Roman Kilinkaridis';
export function isAcceptedLandingUrl(raw){
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
    if(!ACCEPTED_DESTINATION_HOSTS.has(u.hostname)||u.search||u.hash)return false;
    if(u.hostname==='voteroman.com'||u.hostname==='www.voteroman.com')return true;
    return KNOWN_RECOVERY_URLS.includes(u.href);
  }catch{return false;}
}
export function inspectPrimaryResponse(original,response,html){
  const status=response?.status??null;
  const destination=response?.url||original;
  const htmlAllowed=typeof html==='string'&&Buffer.byteLength(html,'utf8')<=1024*1024;
  const pageValid=status===200&&
    String(response.headers?.get('content-type')||'').toLowerCase().includes('text/html')&&
    htmlAllowed&&html.includes(CANDIDATE)&&html.includes(DONATE)&&
    !/\[APP UNAVAILABLE\]|currently unavailable|Payment Required/i.test(html)&&
    isAcceptedLandingUrl(destination);
  return {
    original_url:original,
    final_url:destination,
    status,
    visitor_landing_verified:pageValid,
    candidate_and_donation_markers_verified:pageValid,
    problem:pageValid?null:
      status===402?'BASE44_ORIGIN_HTTP_402':
      status===null?'NETWORK_UNREACHABLE':
      !isAcceptedLandingUrl(destination)?'UNAPPROVED_OR_UNEXPECTED_DESTINATION':
      'LANDING_CONTENT_OR_STATUS_UNVERIFIED',
  };
}
export async function checkOriginalDomains({fetchImpl=fetch,timeoutMs=12500,at=new Date().toISOString()}={}){
  const landing=await Promise.all(ORIGINALS.map(async original=>{
    try {
      const response=await fetchImpl(original,{
        method:'GET',
        redirect:'follow',
        signal:AbortSignal.timeout(timeoutMs),
        headers:{accept:'text/html','user-agent':'Evercraft-Primary-Domain-Acceptance/1.0'},
      });
      const size=Number(response.headers.get('content-length')||0);
      const html=size>1024*1024?'':await response.text();
      return inspectPrimaryResponse(original,response,html);
    }catch{
      return {original_url:original,final_url:null,status:null,visitor_landing_verified:false,
        candidate_and_donation_markers_verified:false,problem:'NETWORK_UNREACHABLE'};
    }
  }));
  return {
    schema:'evercraft.roman.original-domain.acceptance.v1',
    checked_at:at,
    acceptance:'Visitors entering both the original apex and www must reach the expected informational page',
    mission_pass:landing.every(x=>x.visitor_landing_verified),
    page_alternatives_are_not_original_domain_recovery:true,
    live_donation_checkout_transaction_tested:false,
    original_domain_visits:landing,
    no_registrar_or_browser_write_authority:true,
    corrective_action:'Authorized root and www DNS or existing-host forwarding still required while this test fails',
  };
}
