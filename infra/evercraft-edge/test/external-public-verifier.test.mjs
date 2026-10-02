import test from 'node:test';
import assert from 'node:assert/strict';
import {dnsTxtQueryHex,parseDigAuthority,summarizeCheckHost,authoritativeReceiptMatches} from '../dns/external-public-verifier.mjs';

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
  const hex=dnsTxtQueryHex('_evercraft.edge-canary.evercraftpropertyservices.com.',0x7a11);
  const b=Buffer.from(hex.slice(2),'hex');
  assert.equal(b.readUInt16BE(0),0x7a11);
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


test('runtime identity requires the same nonce from at least two external UDP sources',()=>{
  const receipts={receipts:[
    {transaction_id:0x7a11,qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',protocol:'udp',remote_address:'198.51.100.10',aa:true,ra:false,rcode:0,answer_count:1},
    {transaction_id:0x7a11,qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',protocol:'udp',remote_address:'203.0.113.20',aa:true,ra:false,rcode:0,answer_count:1},
    {transaction_id:0x7a12,qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',protocol:'udp',remote_address:'203.0.113.30',aa:true,ra:false,rcode:0,answer_count:1}
  ]};
  const match=authoritativeReceiptMatches(receipts,{transactionId:0x7a11,identityName:'_evercraft.edge-canary.evercraftpropertyservices.com.'});
  assert.equal(match.verified,true);
  assert.equal(match.match_count,2);
  assert.equal(match.distinct_remote_addresses,2);
});

test('runtime identity rejects recursive or single-source receipts',()=>{
  const receipts={receipts:[
    {transaction_id:9,qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',protocol:'udp',remote_address:'198.51.100.10',aa:true,ra:true,rcode:0,answer_count:1},
    {transaction_id:9,qname:'_evercraft.edge-canary.evercraftpropertyservices.com.',protocol:'udp',remote_address:'198.51.100.10',aa:true,ra:false,rcode:0,answer_count:1}
  ]};
  assert.equal(authoritativeReceiptMatches(receipts,{transactionId:9,identityName:'_evercraft.edge-canary.evercraftpropertyservices.com.'}).verified,false);
});
