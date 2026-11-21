import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyFabricWebRouterReceipt} from '../scripts/verify-fabric-router-receipt.mjs';

const host='192.168.88.5';
const entry=(external,internal,desc)=>({
  requested:{external,internal,proto:'TCP',scope:'web',desc},
  success:true,readback_verified:true,
  observed_host:host,observed_port:internal,
});
const good=()=>({
  ok:true,scope:'web',host,
  web_mapping_control_ok:true,public_ingress_verified:false,
  attempts:[{
    method:'UPnP-IGD',success:true,mappings:[
      entry(80,18080,'Evercraft Fabric HTTP'),
      entry(443,8443,'Evercraft Fabric HTTPS'),
    ]
  }]
});

test('two owned UPnP web mappings pass without claiming external reachability',()=>{
  const r=verifyFabricWebRouterReceipt(good(),host);
  assert.equal(r.ok,true);
  assert.equal(r.public_ingress_verified,false);
  assert.deepEqual(r.verified_ports,[80,443]);
});

test('foreign owner, incorrect IP and internal port, duplicate or missing mapping all fail',()=>{
  for(const modify of [
    a=>a.attempts[0].mappings[0].requested.desc='Another service',
    a=>a.attempts[0].mappings[0].observed_host='192.168.88.3',
    a=>a.attempts[0].mappings[1].observed_port=8787,
    a=>a.attempts[0].mappings.pop(),
    a=>a.attempts[0].mappings.push({...a.attempts[0].mappings[0]}),
    a=>a.attempts[0].mappings[0].readback_verified=false,
    a=>a.attempts[0].mappings[1].requested.proto='UDP',
    a=>a.attempts[0].success=false,
    a=>a.public_ingress_verified=true,
    a=>a.scope='all',
    a=>a.web_mapping_control_ok=false,
  ]){
    const receipt=good();
    modify(receipt);
    assert.equal(verifyFabricWebRouterReceipt(receipt,host).ok,false);
  }
});

test('upgrade script is shell-parseable and defaults to read-only with explicit operator confirmation',()=>{
  const upgrade=new URL('../scripts/upgrade-fabric-router-map-resident.sh',import.meta.url);
  execFileSync('bash',['-n',upgrade.pathname]);
  const source=fs.readFileSync(upgrade,'utf8');
  assert.match(source,/MODE=preflight/);
  assert.match(source,/if \[\[ "\$MODE" == preflight \]\]; then exit 0; fi/);
  assert.match(source,/\[\[ -t 0 \]\]/);
  assert.match(source,/Type UPGRADE/);
  assert.match(source,/--confirm-ip/);
  assert.match(source,/scripts\/verify-fabric-router-receipt\.mjs/);
  assert.match(source,/--scope web/);
  assert.doesNotMatch(source,/--scope dns/);
  assert.match(source,/sudo cp -a/);
  assert.match(source,/trap rollback EXIT/);
  assert.match(source,/sudo systemctl daemon-reload/);
  assert.match(source,/committed=1/);
  assert.match(source,/NEXT: verify production HTTPS and MCP externally/);
});

test('rollback cannot be mistaken for public validation',()=>{
  const source=fs.readFileSync(new URL('../scripts/upgrade-fabric-router-map-resident.sh',import.meta.url),'utf8');
  assert.ok(source.indexOf('trap rollback EXIT')<source.indexOf('bash "$INSTALLER"'));
  assert.ok(source.indexOf('scripts/verify-fabric-router-receipt.mjs"')<source.indexOf('committed=1'));
  assert.ok(source.indexOf('No router changes performed by this preflight')<source.indexOf('if [[ "$MODE" == preflight ]]'));
});
