import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TARGETS,
  evaluateContinuity,
  markdownSummary,
  probeGuardian,
} from './roman-domain-guardian.mjs';

function item({status=200, valid=true, source=''} = {}) {
  return {
    state: 'observed',
    status,
    campaign_valid:valid,
    evercraft_source_header:source,
    candidate_marker:valid,
    donation_link_marker:valid,
  };
}
const DNS = {
  apex_nameservers: { state:'observed', values:['ns09.domaincontrol.com','ns10.domaincontrol.com'] },
  apex_ipv4: { state:'observed', values:['216.24.57.1'] },
  www_cname: { state:'observed', values:['base44.onrender.com'] },
  donation_cname: { state:'observed', values:['pointing.wixdns.net'] },
};
const source = 'owned-fabric-static';
const pages = () => ({
  original:item({status:402,valid:false}),
  www:item({status:402,valid:false}),
  evercraft:item({source}),
  funnel:item({source}),
  pages:item(),
  backup:item(),
  donation:item(),
});

test('402 on root never becomes a fictional redirect even when backup and Evercraft are live',()=>{
  const decision = evaluateContinuity({pages:pages(),dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(decision.state,'ORIGINAL_DOMAIN_BROKEN_ROUTING_BLOCKED');
  assert.equal(decision.original_domain_verified_on_evercraft,false);
  assert.equal(decision.automatic_original_domain_failover_active,false);
  assert.equal(decision.autonomous_original_domain_cutover_performed,false);
  assert.equal(decision.autonomous_dns_write_enabled,false);
  assert.equal(decision.next_step,'AUTHORIZED_ORIGINAL_DOMAIN_DNS_OR_HOSTING_CUTOVER_REQUIRED');
  assert.equal(decision.recommended_public_fallback,TARGETS.evercraft);
  assert.deepEqual(decision.dns_public_observations,DNS);
  assert.match(markdownSummary(decision),/no automatic redirect performed/);
});

test('a verified owned front door requires the real original URL, proper body, and correct host marker',()=>{
  const casePages=pages();
  casePages.original=item({source});
  const yes=evaluateContinuity({pages:casePages,dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(yes.state,'ORIGINAL_DOMAIN_VERIFIED_ON_EVERCRAFT');
  assert.equal(yes.automatic_original_domain_failover_active,true);
  const noPages=pages();
  noPages.original=item();
  const no=evaluateContinuity({pages:noPages,dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(no.state,'ORIGINAL_DOMAIN_CAMPAIGN_LIVE_HOST_NOT_VERIFIED');
  assert.equal(no.automatic_original_domain_failover_active,false);
});

test('independent Wix backup remains the recommended public fallback if Fabric fails',()=>{
  const d=pages();
  d.evercraft=item({status:503,valid:false});
  const res=evaluateContinuity({pages:d,dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(res.recommended_public_fallback,TARGETS.backup);
  assert.equal(res.evercraft_mirror_healthy,false);
  assert.equal(res.independent_backup_healthy,true);
});

test('third independent GitHub Pages host is chosen when Fabric and Wix both fail',()=>{
  const d=pages();
  d.evercraft=item({status:503,valid:false});
  d.funnel=item({status:503,valid:false});
  d.backup=item({status:402,valid:false});
  const res=evaluateContinuity({pages:d,dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(res.independent_github_pages_healthy,true);
  assert.equal(res.recommended_public_fallback,TARGETS.pages);
  assert.equal(res.original_domain_verified_on_evercraft,false);
  assert.equal(res.autonomous_dns_write_enabled,false);
});
test('no fallback yields a safe blocked state, not a DNS change',()=>{
  const d=pages();
  d.evercraft=item({status:500,valid:false});
  d.backup=item({status:500,valid:false});
  d.pages=item({status:500,valid:false});
  const res=evaluateContinuity({pages:d,dnsRecords:DNS,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(res.recommended_public_fallback,null);
  assert.equal(res.next_step,'RECOVER_INDEPENDENT_PUBLIC_HOSTING_BEFORE_CUTOVER');
});

test('run uses public DNS reads and HTTP GET, without provider logins or writes',async()=>{
  const lookups=[];
  const resolver={
    async resolveNs(d){lookups.push(['NS',d]);return ['ns09.domaincontrol.com'];},
    async resolve4(d){lookups.push(['A',d]);return ['216.24.57.1'];},
    async resolveCname(d){lookups.push(['CNAME',d]);return ['pointing.wixdns.net'];},
  };
  const fetches=[];
  const fetchImpl=async (url, options)=>{
    fetches.push({url,options});
    let status=200;
    let html='<!doctype html><html>Roman Kilinkaridis https://donate.voteroman.com/</html>';
    let headers={ 'content-type':'text/html; charset=utf-8' };
    if(url===TARGETS.original || url===TARGETS.www){
      status=402;html='<html>[APP UNAVAILABLE]</html>';
    }
    if(url===TARGETS.evercraft)headers['x-evercraft-campaign-source']=source;
    return new Response(html,{status,headers});
  };
  const result=await probeGuardian({fetchImpl,resolver,observedAt:'2026-10-18T00:00:00.000Z'});
  assert.equal(fetches.length,7);
  assert.equal(lookups.length,4);
  assert.ok(fetches.every(x=>x.options.method==='GET'));
  assert.equal(result.original_domain_http_status,402);
  assert.equal(result.evercraft_mirror_healthy,true);
  assert.equal(result.donation_page_healthy,true);
  assert.equal(result.external_checkout_transaction_tested,false);
  assert.equal(result.restrictions.no_registrar_api_calls,true);
  assert.equal(result.autonomous_dns_write_enabled,false);
});

test('HTML lookalikes without donation link do not get treated as healthy campaigns',async()=>{
  const resolver={
    async resolveNs(){return ['ns09.domaincontrol.com'];},
    async resolve4(){return ['216.24.57.1'];},
    async resolveCname(){return ['base44.onrender.com'];}
  };
  const fetchImpl=async(url)=>{
    if(url===TARGETS.donation)return new Response('<html>Roman Kilinkaridis</html>',{headers:{'content-type':'text/html'}});
    return new Response('<html>Roman Kilinkaridis</html>',{headers:{'content-type':'text/html','x-evercraft-campaign-source':source}});
  };
  const res=await probeGuardian({fetchImpl,resolver});
  assert.equal(res.original_domain_verified_on_evercraft,false);
  assert.equal(res.evercraft_mirror_healthy,false);
  assert.equal(res.independent_backup_healthy,false);
  assert.equal(res.recommended_public_fallback,null);
});
