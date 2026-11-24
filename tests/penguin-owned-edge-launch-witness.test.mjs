import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateOwnedEdgeLaunch as evaluate}
  from '../systemia/yard/penguin-owned-edge-launch-witness.mjs';

const PID=8080;
function sample(){
  return {
    unit:{pid:PID,active:'active',enabled:'enabled',user:'caddy'},
    cmdline:[
      '/usr/bin/caddy','run','--environ','--config',
      '/etc/evercraft/Caddyfile','--adapter','caddyfile',
    ],
    exe:'/usr/bin/caddy',
    sockets:'LISTEN 0 4096 *:8443 *:* users:(("caddy",pid=8080,fd=9))',
    sourceText:[
      '{',
      '  http_port 18080',
      '  https_port 8443',
      '  admin off',
      '}',
      'fabric.example.test {',
      '  reverse_proxy 127.0.0.1:8787',
      '}',
    ].join('\n'),
    sourceRegular:true,
    pidStable:true,
    sourceMtimeMs:1700000000000,
    startMs:1700000100000,
    brokerPort:8797,
  };
}
test('recognizes Evercraft-owned Caddy unit with admin off without claiming route-free runtime',()=>{
  const r=evaluate(sample());
  assert.equal(r.source_observed,true,JSON.stringify(r));
  assert.deepEqual(r.hold_reasons,[]);
  assert.equal(r.admin_off_in_source,true);
  assert.equal(r.caddy_listener_pid_owned,true);
  assert.equal(r.historical_broker_port_referenced_in_source,false);
  assert.equal(r.active_caddy_config_attested,false);
  assert.equal(r.route_absence_proven,false);
  assert.equal(r.public_route_created,null);
  assert.equal(r.physical_broker_activation_authorized,false);
});
test('Caddyfile historical broker route or numeric port requires HOLD',()=>{
  const v=sample();
  v.sourceText+='\nservice.example.test { reverse_proxy 127.0.0.1:8797 }\n';
  const r=evaluate(v);
  assert.equal(r.source_observed,false);
  assert.ok(r.hold_reasons.includes('candidate_broker_port_in_source_or_unverified'));
  assert.equal(r.historical_broker_port_referenced_in_source,true);
});
test('wrong unit, PID, process or launch file cannot claim source verification',()=>{
  const changes=[
    v=>{v.pidStable=false},
    v=>{v.unit.active='inactive'},
    v=>{v.unit.enabled='disabled'},
    v=>{v.unit.user='root'},
    v=>{v.unit.pid=0},
    v=>{v.cmdline[1]='adapt'},
    v=>{v.cmdline[4]='/tmp/fake'},
    v=>{v.exe='/usr/bin/other'},
    v=>{v.sockets='LISTEN 0 4096 *:8443 *:* users:(("caddy",pid=77,fd=9))'},
    v=>{v.sockets=''},
  ];
  for(const change of changes){
    const v=sample();change(v);
    assert.equal(evaluate(v).source_observed,false,JSON.stringify(v.unit));
  }
});
test('missing, unsafe or post-start Caddyfile is HOLD',()=>{
  const changes=[
    v=>{v.sourceText=null},
    v=>{v.sourceRegular=false},
    v=>{v.sourceMtimeMs=v.startMs+100},
    v=>{v.startMs=null},
    v=>{v.startMs=0},
  ];
  for(const change of changes){
    const v=sample();change(v);
    const r=evaluate(v);
    assert.equal(r.source_observed,false);
    assert.equal(r.physical_broker_activation_authorized,false);
  }
});
test('Caddyfile imports are disclosed as unresolved source scope, not attested runtime',()=>{
  const v=sample();
  v.sourceText+='\nimport /etc/evercraft/sites/*.caddy\n';
  const r=evaluate(v);
  assert.equal(r.import_directive_in_source,true);
  assert.equal(r.active_caddy_config_attested,false);
  assert.equal(r.route_absence_proven,false);
  assert.equal(r.public_route_created,null);
});
test('possible credentials in Caddyfile and process argv are never printed',()=>{
  const v=sample();
  const secret='SUPER_SECRET_VALUE_SHOULD_NOT_PRINT';
  v.sourceText+='\nheader Authorization '+secret+'\n';
  v.cmdline.push('--unrelated-secret='+secret);
  const r=evaluate(v);
  assert.equal(JSON.stringify(r).includes(secret),false);
  assert.equal(r.config_contents_printed,false);
  assert.equal(r.process_cmdline_printed,false);
});
