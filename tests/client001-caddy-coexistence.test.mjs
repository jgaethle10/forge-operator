import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {composeCandidate,readScopedEdgeEnv,hostnameRoutes,
 assertCoexistence,syntheticHost,sha256,evaluatePhysicalEdge} from '../scripts/client001-caddy-coexistence.mjs';

const fragment=readFileSync('infra/evercraft-edge/client001-on-the-go/Caddyfile.example','utf8');
const base=[
 '{','  http_port 18080','  https_port 8443','  admin off','}',
 '{$EVERCRAFT_PUBLIC_HOST} {','  reverse_proxy 127.0.0.1:8787','}',''
].join('\n');
test('only append the unmodified candidate, never mutate existing Caddy routes',()=>{
 const joined=composeCandidate(base,fragment);
 assert.ok(joined.startsWith(base),'Existing Caddyfile must be exact byte prefix');
 assert.ok(joined.includes('{$CLIENT001_DOMAIN}, www.{$CLIENT001_DOMAIN} {'));
 assert.ok(joined.includes('root * /srv/evercraft/client001/current'));
 assert.ok(joined.includes('X-Robots-Tag "noindex, nofollow, noarchive"'));
 assert.ok(joined.includes('respond 404'));
 assert.ok(joined.includes('REHEARSAL'));
 assert.ok(!joined.includes('tls internal'));
 assert.ok(!joined.includes('systemctl'));
 assert.equal(sha256(base).length,64);
});
test('an existing Client001 binding is a hard stop, not a duplicate site',()=>{
 assert.throws(()=>composeCandidate(base+'\n{$CLIENT001_DOMAIN} { respond "already" }\n',fragment),
  /existing_client001_routing_requires_manual_reconciliation/);
 assert.throws(()=>composeCandidate(base+'\nonthegoquicklube.invalid { respond "already" }\n',fragment),
  /existing_client001_routing_requires_manual_reconciliation/);
});
test('invalid candidate config or shared Caddy source is rejected',()=>{
 assert.throws(()=>composeCandidate('',fragment),/missing_caddyfile_source/);
 assert.throws(()=>composeCandidate(base,'other.host { respond "x" }'),/candidate_missing_exact_host_guard/);
 assert.throws(()=>composeCandidate(base,fragment+'\ntls internal\n'),/candidate_must_remain_static_public_ca/);
 assert.throws(()=>composeCandidate(base,fragment+'\nreverse_proxy localhost:3000\n'),/candidate_must_remain_static_public_ca/);
});
test('read env text as data; never source shell expressions',()=>{
 assert.deepEqual(readScopedEdgeEnv('EVERCRAFT_PUBLIC_HOST=fabric.systemiacommandcenters.com\nEVERCRAFT_ACME_EMAIL=ops@example.com\n'),{
  EVERCRAFT_PUBLIC_HOST:'fabric.systemiacommandcenters.com',
  EVERCRAFT_ACME_EMAIL:'ops@example.com'
 });
 assert.throws(()=>readScopedEdgeEnv('EVERCRAFT_PUBLIC_HOST=$(id)\nEVERCRAFT_ACME_EMAIL=a@b.com'),/edge_host_env_missing_or_invalid/);
 assert.throws(()=>readScopedEdgeEnv('EVERCRAFT_PUBLIC_HOST=fabric.example.com'),/edge_acme_env_missing_or_invalid/);
});
test('Caddy JSON route preservation: preserves Fabric, adds exactly scoped synthetic host',()=>{
 const fabric='fabric.systemiacommandcenters.invalid';
 const baseRoute={match:[{host:[fabric]}],handle:[{handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:8787'}]}],terminal:true};
 const clientRoute={match:[{host:[syntheticHost,'www.'+syntheticHost]}],handle:[{handler:'file_server'}],terminal:true};
 const source={apps:{http:{servers:{srv0:{routes:[baseRoute]}}}}};
 const next={apps:{http:{servers:{srv0:{routes:[clientRoute,baseRoute]}}}}};
 assert.deepEqual(hostnameRoutes(source),[fabric]);
 const pass=assertCoexistence(source,next,{fabricHost:fabric});
 assert.equal(pass.original_host_routes_preserved,true);
 assert.deepEqual(pass.added_hosts,[syntheticHost,'www.'+syntheticHost]);
});
test('Caddy JSON tampering, host collision or dropped Fabric route fail closed',()=>{
 const host='fabric.systemiacommandcenters.invalid';
 const route={match:[{host:[host]}],handle:[{handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:8787'}]}],terminal:true};
 const initial={apps:{http:{servers:{srv0:{routes:[route]}}}}};
 const altered={apps:{http:{servers:{srv0:{routes:[{...route,handle:[{handler:'static_response',body:'wrong'}]},
  {match:[{host:[syntheticHost,'www.'+syntheticHost]}],handle:[]}]}}}}};
 assert.throws(()=>assertCoexistence(initial,altered,{fabricHost:host}),/existing_host_route_changed/);
 assert.throws(()=>assertCoexistence(initial,altered,{fabricHost:'missing.invalid'}),/original_fabric_host_not_found/);
 const duplicate={apps:{http:{servers:{srv0:{routes:[route,{match:[{host:[syntheticHost]}],handle:[]}]}}}}};
 assert.throws(()=>assertCoexistence(duplicate,duplicate,{fabricHost:host}),/client_host_conflicts_with_existing_edge/);
});

test('protected Caddyfile may be supplied through stdin without trying to reopen it',()=>{
 const visits=[];
 const io={readFileSync(file){
  visits.push(String(file));
  if(file==='/etc/evercraft/Caddyfile'){
   const e=Error('EACCES: permission denied /etc/evercraft/Caddyfile');
   e.code='EACCES';throw e;
  }
  if(file.endsWith('Caddyfile.example'))return fragment;
  if(file==='/etc/evercraft/public-edge.env')
   return 'EVERCRAFT_PUBLIC_HOST=fabric.systemiacommandcenters.invalid\nEVERCRAFT_ACME_EMAIL=ops@example.invalid\n';
  throw Error('unexpected_read');
 }};
 const adapter=(text,env)=>{
  const routes=[{match:[{host:[env.EVERCRAFT_PUBLIC_HOST]}],
   handle:[{handler:'reverse_proxy',upstreams:[{dial:'127.0.0.1:8787'}]}],terminal:true}];
  if(text.includes('READ-ONLY REHEARSAL'))
   routes.push({match:[{host:[syntheticHost,'www.'+syntheticHost]}],
    handle:[{handler:'file_server'}],terminal:true});
  return {apps:{http:{servers:{srv0:{routes}}}}};
 };
 const stageInspector=()=>({canonical_sha256:'a'.repeat(64),release_staged:true,
  staged_sha256_matches:true});
 const blocked=evaluatePhysicalEdge({io,adapter,stageInspector});
 assert.equal(blocked.result,'HOLD_REHEARSAL_INCOMPLETE');
 assert.match(blocked.reason,/EACCES/);
 const seen=visits.length;
 const streamed=evaluatePhysicalEdge({io,adapter,stageInspector,baseContent:base});
 assert.equal(streamed.result,'PASS_SOURCE_COMPOSITION_ONLY');
 assert.equal(streamed.state,'HOLD_PUBLIC_PROMOTION');
 assert.equal(streamed.existing_routes_preserved,true);
 assert.equal(streamed.original_bytes_preserved,true);
 assert.equal(streamed.synthetic_hosts_present,true);
 assert.equal(streamed.staged_digest_verified,true);
 assert.equal(streamed.production_config_modified,false);
 assert.equal(streamed.service_reloaded,false);
 assert.equal(streamed.client001_publicly_deployed,false);
 assert.equal(streamed.original_config_sha256,sha256(base));
 assert.ok(!visits.slice(seen).includes('/etc/evercraft/Caddyfile'));
});
test('empty, oversized and NUL-bearing piped Caddyfile content fails closed',()=>{
 for(const bad of ['', '\0', 'x'.repeat(2*1024*1024+1)]){
  const result=evaluatePhysicalEdge({baseContent:bad});
  assert.equal(result.result,'HOLD_REHEARSAL_INCOMPLETE');
  assert.equal(result.reason,'invalid_protected_caddyfile_input');
  assert.equal(result.production_config_modified,false);
  assert.equal(result.state,'HOLD_PUBLIC_PROMOTION');
 }
});
