import assert from 'node:assert/strict';
import { buildDomainPlan, renderZone } from './domain-plan.mjs';

const held=buildDomainPlan({
  domain:'evercraft.example',
  publicIpv4:'203.0.113.10',
  nameservers:[
    {host:'ns1',ipv4:'203.0.113.10'},
    {host:'ns2',ipv4:'203.0.113.10'},
  ],
});
assert.equal(held.ready_for_delegation,false);
assert.ok(held.holds.includes('nameservers_need_two_distinct_public_addresses'));
assert.ok(held.holds.includes('dkim_public_key_not_supplied'));

const ready=buildDomainPlan({
  domain:'evercraft.example',
  publicIpv4:'203.0.113.10',
  publicIpv6:'2001:db8::10',
  nameservers:[
    {host:'ns1',ipv4:'203.0.113.53'},
    {host:'ns2',ipv4:'198.51.100.53'},
  ],
  dkimSelector:'evercraft1',
  dkimPublicKey:'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8ATESTKEYONLY',
  serial:2026092701,
});
assert.equal(ready.ready_for_delegation,true);
assert.equal(ready.mail.mx_host,'mail.evercraft.example');
assert.equal(ready.gates.dkim_public_key_present,true);
assert.equal(ready.records.some(r=>r.type==='MX'),true);
assert.equal(ready.records.some(r=>r.name==='_dmarc'&&r.type==='TXT'),true);
assert.equal(ready.records.some(r=>r.name==='evercraft1._domainkey'&&r.type==='TXT'),true);

const zone=renderZone(ready);
assert.match(zone,/IN SOA/);
assert.match(zone,/IN NS ns1\.evercraft\.example\./);
assert.match(zone,/IN MX 10 mail\.evercraft\.example\./);
assert.match(zone,/v=spf1 mx -all/);
assert.match(zone,/v=DMARC1/);
assert.match(zone,/v=DKIM1/);

console.log(JSON.stringify({
  ok:true,
  schema:'evercraft.domain-authority.plan-proof.v1',
  fail_closed_without_independent_ns:true,
  fail_closed_without_dkim:true,
  authoritative_zone_rendered:true,
  mail_dns_contract_rendered:true,
},null,2));
