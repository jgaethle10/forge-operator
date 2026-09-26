import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluatePublicEdgeFieldCandidate } from '../compute/public-edge-field-admit.mjs';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'public-edge-field-admit-proof-'));
const key=path.join(root,'edge.key.pem');
const cert=path.join(root,'edge.cert.pem');

try{
  execFileSync('openssl',[
    'req','-x509','-newkey','rsa:2048','-nodes',
    '-keyout',key,
    '-out',cert,
    '-days','10',
    '-subj','/CN=*.edge.evercraft.test',
    '-addext','subjectAltName=DNS:*.edge.evercraft.test',
  ],{stdio:'ignore'});

  const fieldCandidate={
    schema:'evercraft.node001.field-evidence-candidate.v1',
    ready_for_yard_enrollment:true,
    evidence_digest:'sha256:'+'a'.repeat(64),
  };
  const nodeReceipt={
    schema:'evercraft.compute.nodeseed-receipt.v1',
    node_id:'edge-field-proof-node',
    device_fingerprint:'sha256:'+'b'.repeat(64),
  };

  const result=evaluatePublicEdgeFieldCandidate({
    fieldCandidate,
    nodeReceipt,
    baseDomain:'edge.evercraft.test',
    tlsKeyPath:key,
    tlsCertPath:cert,
    publicPort:443,
  });

  assert.equal(result.schema,'evercraft.node001.public-edge-field-candidate.v1');
  assert.equal(result.node_id,'edge-field-proof-node');
  assert.equal(result.device_fingerprint,'sha256:'+'b'.repeat(64));
  assert.equal(result.field_evidence_ready,true);
  assert.equal(result.public_edge_configuration_valid,true);
  assert.equal(result.base_domain,'edge.evercraft.test');
  assert.equal(result.public_port,443);
  assert.equal(result.wildcard_hostname_match,true);
  assert.match(result.certificate_fingerprint256,/^[A-F0-9:]+$/i);
  assert.equal(result.private_key_exposed,false);
  assert.equal(result.certificate_bytes_exposed,false);
  assert.equal(result.founder_login_required,false);
  assert.equal(JSON.stringify(result).includes(key),false);
  assert.equal(JSON.stringify(result).includes(fs.readFileSync(key,'utf8').slice(0,32)),false);

  assert.throws(
    ()=>evaluatePublicEdgeFieldCandidate({
      fieldCandidate:{...fieldCandidate,ready_for_yard_enrollment:false},
      nodeReceipt,
      baseDomain:'edge.evercraft.test',
      tlsKeyPath:key,
      tlsCertPath:cert,
      publicPort:443,
    }),
    /field_evidence_not_ready_for_yard_enrollment/
  );

  assert.throws(
    ()=>evaluatePublicEdgeFieldCandidate({
      fieldCandidate,
      nodeReceipt,
      baseDomain:'wrong.evercraft.test',
      tlsKeyPath:key,
      tlsCertPath:cert,
      publicPort:443,
    }),
    /does_not_cover_wildcard_domain/
  );

  console.log(JSON.stringify({
    ok:true,
    schema:'evercraft.public-edge.field-admit-proof.v1',
    certified_field_evidence_required:true,
    device_fingerprint_required:true,
    wildcard_tls_admission:true,
    low_port_target:443,
    private_key_exposed:false,
    certificate_bytes_exposed:false,
    runtime_advertisement_requires_apply:true,
    external_canary_still_required:true,
    founder_login_required:false,
  },null,2));
}finally{
  fs.rmSync(root,{recursive:true,force:true});
}
