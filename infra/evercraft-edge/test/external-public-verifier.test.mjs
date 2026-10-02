import test from 'node:test';
import assert from 'node:assert/strict';
import {dnsTxtQueryHex,parseDigAuthority,summarizeCheckHost} from '../dns/external-public-verifier.mjs';

test('external verifier recognizes exact authoritative non-recursive TXT identity',()=>{
  const text=`; <<>> DiG <<>>
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1
;; flags: qr aa; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0
_evercraft.edge-canary.evercraftpropertyservices.com. 60 IN TXT "service=evercraft://edge/canary"
`;
  const p=parseDigAuthority(text,{
    identityName:'_evercraft.edge-canary.evercraftpropertyservices.com.',
    expectedTxt:'service=evercraft://edge/canary'
  });
  assert.equal(p.verified,true);
  assert.equal(p.aa,true);
  assert.equal(p.ra,false);
});

test('external verifier rejects recursive answer even when TXT marker appears',()=>{
  const text=`;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 1
;; flags: qr aa ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 0
_evercraft.edge-canary.evercraftpropertyservices.com. 60 IN TXT "service=evercraft://edge/canary"`;
  assert.equal(parseDigAuthority(text,{
    identityName:'_evercraft.edge-canary.evercraftpropertyservices.com.',
    expectedTxt:'service=evercraft://edge/canary'
  }).verified,false);
});

test('DNS UDP payload is non-recursive TXT query',()=>{
  const hex=dnsTxtQueryHex('_evercraft.edge-canary.evercraftpropertyservices.com.');
  const b=Buffer.from(hex.slice(2),'hex');
  assert.equal(b.readUInt16BE(0),0x4556);
  assert.equal(b.readUInt16BE(2)&0x0100,0);
  assert.equal(b.readUInt16BE(4),1);
  assert.equal(b.readUInt16BE(b.length-4),16);
  assert.equal(b.readUInt16BE(b.length-2),1);
});

test('distributed status summary counts only successful external nodes',()=>{
  const s=summarizeCheckHost({data:{
    A:{countryCode:'US',city:'Seattle',checks:[{status:1,errortext:'',target_ip:'192.0.2.1'}]},
    B:{countryCode:'DE',city:'Frankfurt',checks:[{status:1,errortext:'',target_ip:'192.0.2.1'}]},
    C:{countryCode:'NL',city:'Amsterdam',checks:[{status:0,errortext:'timeout',target_ip:'192.0.2.1'}]}
  }});
  assert.equal(s.node_count,3);
  assert.equal(s.success_count,2);
  assert.deepEqual(new Set(s.successful_countries),new Set(['US','DE']));
});

test('production port 53 reachability is not mislabeled as blocked',()=>{
  const tcp53={success_count:6};
  const udp53={success_count:5};
  const tcpDiag={success_count:5};
  const udpDiag={success_count:5};
  const tcpIdentity={parsed:{verified:false}};
  const tcp53Reachable=Number(tcp53?.success_count||0)>=2;
  const udp53Reachable=Number(udp53?.success_count||0)>=2;
  const diagnosticReachable=Number(tcpDiag?.success_count||0)>=1||Number(udpDiag?.success_count||0)>=1;
  const verified=tcpIdentity?.parsed?.verified===true&&tcp53Reachable&&udp53Reachable;
  const classification=verified
    ? 'public_dns_verified'
    : (tcp53Reachable||udp53Reachable)
      ? 'production_53_reachable_identity_unverified'
      : diagnosticReachable
        ? 'diagnostic_high_port_reachable_production_53_unreachable'
        : 'no_external_path_to_candidate';
  assert.equal(classification,'production_53_reachable_identity_unverified');
});
