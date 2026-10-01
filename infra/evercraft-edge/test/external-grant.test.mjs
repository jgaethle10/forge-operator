import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const issuer=path.join(root,'infra/evercraft-edge/dns/issue-public-ingress-grant.mjs');

test('grant issuer requires independent UDP and TCP proof',()=>{
  const base=['--request-id','a'.repeat(32),'--node-id','evercraft-penguin','--canary-name','edge-canary.evercraftpropertyservices.com.','--evidence-ref','external-canary:test'];
  const fail=spawnSync(process.execPath,[issuer,...base,'--udp','pass','--tcp','fail'],{encoding:'utf8'});
  assert.notEqual(fail.status,0);

  const pass=spawnSync(process.execPath,[issuer,...base,'--udp','pass','--tcp','pass'],{encoding:'utf8'});
  assert.equal(pass.status,0,pass.stderr);
  const grant=JSON.parse(pass.stdout);
  assert.equal(grant.verified,true);
  assert.equal(grant.udp_53_verified,true);
  assert.equal(grant.tcp_53_verified,true);
  assert.equal(grant.public_ip_recorded,false);
});

test('Chromebook promotion no longer requires local GitHub CLI',()=>{
  const fs=require('node:fs');
  const one=fs.readFileSync(path.join(root,'scripts/make-chromebook-edge-node.sh'),'utf8');
  assert.doesNotMatch(one,/\bgh\s+(workflow|run|auth)\b/);
  assert.match(one,/external-canary-request\.json/);
  assert.match(one,/public-ingress-grants/);
  assert.match(one,/Node remains public-edge-candidate/);
});
