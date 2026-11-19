import fs from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
 normalizePrivateAlias,normalizePublicCandidate,verifyRegistry,planAlias,
 buildLoopbackLabZone,evaluatePrivateRelease,evaluatePublicDomain,enforceLabBind
} from '../systemia/evercraft-domains/namespace.mjs';
import {answer} from '../infra/evercraft-edge/dns/runtime.mjs';

const registry=JSON.parse(fs.readFileSync(new URL('../systemia/evercraft-domains/registry.json',import.meta.url),'utf8'));
const name='onthegoquicklube.evercraft';
function query(domain,type=1){
 const h=Buffer.alloc(12);h.writeUInt16BE(113,0);h.writeUInt16BE(0x0100,2);h.writeUInt16BE(1,4);
 const labels=Buffer.concat([...domain.replace(/\.$/,'').split('.').map(x=>Buffer.concat([Buffer.from([Buffer.byteLength(x)]),Buffer.from(x)])),Buffer.from([0])]);
 return Buffer.concat([h,labels,Buffer.from([0,type,0,1])]);
}
function flags(reply){
 return {aa:Boolean(reply.readUInt16BE(2)&0x0400),ra:Boolean(reply.readUInt16BE(2)&0x0080),
 rcode:reply.readUInt16BE(2)&15,answers:reply.readUInt16BE(6)};
}
test('registry records intent, not purchased names or a public .evercraft registry',()=>{
 assert.equal(verifyRegistry(registry).count,1);
 assert.equal(registry.public_tld_operated,false);
 assert.equal(registry.public_top_level_domain_registered,false);
 const p=planAlias(registry,name);
 assert.equal(p.state,'HOLD');
 assert.equal(p.site_reachable,false);
 assert.equal(p.private_record_published,false);
 assert.equal(p.public_tld_delegated,false);
 assert.equal(p.customer_promotion_authorized,false);
});
test('a strict one-label private naming contract prevents private/public namespace confusion',()=>{
 assert.equal(normalizePrivateAlias(' ONTHEGOQUICKLUBE.EVERCRAFT. '),name);
 for(const bad of ['onthegoquicklube.com','www.evercraft','thing.sub.evercraft','evil.evercraft.com',
  'onthegoquicklube.evercraft.attacker.com','-bad.evercraft','*.evercraft','localhost.evercraft',
  'a'.repeat(64)+'.evercraft']){
  assert.throws(()=>normalizePrivateAlias(bad),undefined,bad);
 }
 assert.equal(normalizePublicCandidate('onthegoquicklube.com'),'onthegoquicklube.com');
 assert.throws(()=>normalizePublicCandidate(name));
 assert.throws(()=>planAlias(registry,'another.evercraft'),/alias_not_in_registry/);
});
test('duplicates and unsupported live claims fail closed',()=>{
 assert.throws(()=>verifyRegistry({...registry,names:[registry.names[0],registry.names[0]]}),/duplicate/);
 assert.throws(()=>verifyRegistry({...registry,public_tld_operated:true}),/public_tld_claim/);
 assert.throws(()=>verifyRegistry({...registry,policy:{}}),/policy_hold/);
 assert.throws(()=>verifyRegistry({...registry,names:[{...registry.names[0],private_dns_published:true}]}),/registry_publication_claim/);
});
test('real Evercraft-owned DNS wire handler serves only synthetic local alias, not public DNS',()=>{
 const zone=buildLoopbackLabZone(registry,name);
 assert.equal(zone.origin,'evercraft.');
 assert.equal(zone.default_ttl,60);
 assert.equal(zone.records[0].value,'127.0.0.1');
 let r=flags(answer(query(name),zone));
 assert.deepEqual(r,{aa:true,ra:false,rcode:0,answers:1});
 r=flags(answer(query('other.evercraft'),zone));
 assert.equal(r.rcode,3);assert.equal(r.answers,0);
 // Exact zone boundary. noteVerCraft must not be accepted as evercraft.
 r=flags(answer(query('onthegoquicklube.notevercraft'),zone));
 assert.equal(r.rcode,5);assert.equal(r.answers,0);
});
test('private and public release evaluations remain nonexecuting and held by default',()=>{
 const p=evaluatePrivateRelease({alias:name});
 assert.equal(p.eligible,false);assert.equal(p.blockers.length,5);
 const w=evaluatePublicDomain({domain:'onthegoquicklube.com'});
 assert.equal(w.eligible,false);assert.equal(w.blockers.length,5);
 assert.equal(w.public_dns_mutated,false);
 assert.throws(()=>enforceLabBind('0.0.0.0',15353),/loopback/);
 assert.throws(()=>enforceLabBind('127.0.0.1',53),/unprivileged/);
 assert.equal(enforceLabBind('127.0.0.1',15353).network_scope,'loopback_only');
});
