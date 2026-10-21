import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {planUpnpMapping,parseUpnpErrorCode} from '../scripts/edge-upnp-mapping-policy.mjs';

const desired={external:443,internal:8443,proto:'TCP',desc:'Evercraft Fabric HTTPS',host:'192.168.88.5'};
const existing=(patch={})=>({
  host:'192.168.88.5',internal:8443,
  description:'Evercraft Fabric HTTPS',enabled:'1',...patch
});

test('identical occupied Evercraft port is preserved without AddPortMapping',()=>{
  assert.deepEqual(planUpnpMapping(existing(),desired).action,'keep');
  assert.equal(planUpnpMapping(existing(),desired).ownership_verified,true);
});

test('only verified owned finite-lease ports renew when the resident clock says due',()=>{
  const owned={...existing(),lease_seconds:'86400'};
  const result=planUpnpMapping(owned,desired,{renewHealthy:true});
  assert.equal(result.action,'renew');
  assert.equal(result.ownership_verified,true);
  assert.equal(planUpnpMapping(owned,desired).action,'keep');
  assert.equal(planUpnpMapping({...owned,lease_seconds:'3200'},desired).action,'renew');
  assert.equal(planUpnpMapping({...owned,lease_seconds:'0'},desired,{renewHealthy:true}).action,'keep');
  assert.equal(planUpnpMapping({...owned,lease_seconds:''},desired,{renewHealthy:true}).action,'renew');
});

test('lease renewal never overrides a stale or foreign client',()=>{
  for(const patch of [{host:'192.168.88.3'},{description:'Other Router Service'},{enabled:'0'}]){
    assert.equal(planUpnpMapping(existing(patch),desired,{renewHealthy:true}).action,'hold');
  }
});

test('missing port code 714 can be created after router verification',()=>{
  assert.equal(planUpnpMapping(null,desired,{missing:true}).action,'create');
  assert.equal(planUpnpMapping(null,desired).action,'hold');
});

test('foreign labels cannot be appropriated, including same target',()=>{
  const result=planUpnpMapping(existing({description:'Other Private Web Server'}),desired);
  assert.equal(result.action,'hold');
  assert.equal(result.state,'foreign_mapping');
  assert.equal(result.ownership_verified,false);
});

test('stale host, wrong port, disabled entry all hold for operator repair',()=>{
  for(const patch of [
    {host:'192.168.88.3'},{internal:8787},{enabled:'0'},
  ]){
    const result=planUpnpMapping(existing(patch),desired);
    assert.equal(result.action,'hold');
    assert.equal(result.state,'owned_mapping_drift');
  }
});

test('unknown readback never causes writes and malformed expectations reject',()=>{
  assert.equal(planUpnpMapping(undefined,desired).action,'hold');
  assert.throws(()=>planUpnpMapping(existing(),{...desired,external:-1}),TypeError);
  assert.throws(()=>planUpnpMapping(existing(),{...desired,desc:''}),TypeError);
});

test('SOAP faults retain actionable router error codes',()=>{
  assert.equal(parseUpnpErrorCode('<s:Fault><errorCode>718</errorCode></s:Fault>'),'718');
  assert.equal(parseUpnpErrorCode('<ns:errorCode>714</ns:errorCode>'),'714');
  assert.equal(parseUpnpErrorCode('<s:Fault>UPnPError</s:Fault>'),null);
});

test('production mapper preflights all entries before writes and never protocol-falls-back over owner conflict',()=>{
  const path=new URL('../scripts/evercraft-public-edge-map.mjs',import.meta.url);
  execFileSync(process.execPath,['--check',path.pathname]);
  const src=fs.readFileSync(path,'utf8');
  assert.match(src,/planUpnpMapping\(existing,\{\.\.\.m,host\},\{missing,renewHealthy:renewOwned==='1'\}\)/);
  assert.match(src,/if\(planned\.some\(row=>row\.decision\.action==='hold'\)\)/);
  assert.match(src,/if\(row\.decision\.action==='keep'\)/);
  assert.match(src,/if\(error\.upnpCode==='714'\) missing=true/);
  assert.match(src,/if\(upnp\.ownership_conflict===true\)/);
  assert.match(src,/args\.get\('scope'\) \|\| 'web'/);
  assert.ok(src.indexOf('if(upnp.ownership_conflict===true)') < src.indexOf('const natpmp = await natPmpMap'));
  assert.ok(src.indexOf('if(planned.some(row=>row.decision.action') < src.indexOf("await soap(control,service.serviceType,'AddPortMapping',b)"));
  assert.match(src,/parseUpnpErrorCode\(text\)/);
});

test('installed refresh script defaults to WEB only and preserves separate DNS opt-in',()=>{
  const src=fs.readFileSync(new URL('../scripts/install-fabric-router-map-resident.sh',import.meta.url),'utf8');
  execFileSync('bash',['-n',new URL('../scripts/install-fabric-router-map-resident.sh',import.meta.url).pathname]);
  assert.match(src,/SCOPE="web"/);
  assert.match(src,/EVERCRAFT_ROUTER_SCOPE=\$SCOPE/);
  assert.match(src,/--scope "\$\{EVERCRAFT_ROUTER_SCOPE:-web\}"/);
  assert.match(src,/--renew-owned "\$renew_due"/);
  assert.match(src,/now-last >= 21600/);
  // No prior successful tick means read back first, not a forced duplicate UPnP Add.
  assert.match(src,/last="\$\(stat -c %Y "\$renew_marker" 2>\/dev\/null \|\| true\)"/);
  assert.match(src,/if \[\[ -n "\$last" \]\]; then/);
  assert.match(src,/\[\[ ! -e "\$renew_marker" \]\]/);
  assert.match(src,/last-owned-lease-renewal/);
  assert.match(src,/if \[\[ "\$code" -eq 0 \]\] &&/);
  assert.match(src,/grep -Eq/);
  assert.match(src,/\[\[:space:\]\]\*/);
  assert.match(src,/last-owned-lease-renewal/);
  assert.match(src,/\^\(web\|dns\|all\)\$/);
});
