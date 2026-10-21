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
  assert.match(src,/planUpnpMapping\(existing,\{\.\.\.m,host\},\{missing\}\)/);
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
  assert.match(src,/\^\(web\|dns\|all\)\$/);
});
