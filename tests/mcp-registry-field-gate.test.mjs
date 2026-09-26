import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script=path.resolve('scripts/generate-mcp-registry-candidates.mjs');
const targets=[
  ['ibmi-rescue','Evercraft IBM i Rescue','/mcp/ibmi-rescue'],
  ['foundry-app-escape','Evercraft Foundry App Escape Audit','/mcp/foundry-app-escape'],
  ['site-survive','Site-Survive Rapid Audit','/mcp/site-survive'],
  ['systemia-remote-ops','Systemia Remote Ops','/mcp/systemia-remote-ops'],
];

function rootWithCanary({fieldVerified}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-field-gate-'));
  fs.mkdirSync(path.join(root,'distribution/mcp-registry-candidates'),{recursive:true});
  const products=targets.map(([slug,name,runtimePath])=>({
    slug,
    name,
    short_description:'proof',
    long_description:'proof',
    category:'Business',
    website_url:'https://example.com/'+slug,
    registry_name:null,
    mcp_url:'https://specialists.evercraft.example'+runtimePath,
    state:'public_https_verified_registry_pending',
    default_prompt:'proof',
    keywords:[slug],
    intent:'proof',
    truth_boundary:'proof',
    capability_public_ids:[],
    public_origin_state:'external_canary_verified',
    runtime_workload_class:'systemia.specialist-handoff-mcp.v1',
    runtime_path:runtimePath,
    public_edge_canary:{
      verified:true,
      field_enrollment_verified:fieldVerified,
      device_fingerprint:'sha256:'+'a'.repeat(64),
      field_enrollment_receipt_ref:fieldVerified?'sha256:'+'b'.repeat(64):null,
      public_edge_admission_receipt_ref:fieldVerified?'sha256:'+'c'.repeat(64):null,
    },
  }));
  fs.writeFileSync(
    path.join(root,'distribution/direct-plugin-specs.json'),
    JSON.stringify({
      schema:'evercraft.direct-plugin-specs.v1',
      version:'1.0.0',
      routing_policy:{default:'specialist_direct_when_clear',fallback:'universal'},
      products,
    },null,2)+'\n'
  );
  return root;
}

test('public HTTPS alone cannot produce registry-ready candidates without field proof',()=>{
  const root=rootWithCanary({fieldVerified:false});
  try{
    execFileSync(process.execPath,[script],{cwd:root,stdio:'pipe'});
    for(const [slug] of targets){
      const candidate=JSON.parse(fs.readFileSync(
        path.join(root,'distribution/mcp-registry-candidates',slug+'.json'),
        'utf8'
      ));
      assert.equal(candidate.public_execution_verified,false);
      assert.equal(candidate.publication_state,'waiting_public_https_verification');
      assert.equal(candidate.manifest,null);
    }
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});

test('field-backed public canary makes all four specialist candidates publication-ready',()=>{
  const root=rootWithCanary({fieldVerified:true});
  try{
    execFileSync(process.execPath,[script],{cwd:root,stdio:'pipe'});
    for(const [slug] of targets){
      const candidate=JSON.parse(fs.readFileSync(
        path.join(root,'distribution/mcp-registry-candidates',slug+'.json'),
        'utf8'
      ));
      assert.equal(candidate.public_execution_verified,true);
      assert.equal(candidate.publication_state,'ready_for_authorized_publication');
      assert.ok(candidate.manifest);
      assert.equal(
        candidate.manifest.remotes[0].url,
        'https://specialists.evercraft.example'+
          targets.find(([s])=>s===slug)[2]
      );
    }
  }finally{
    fs.rmSync(root,{recursive:true,force:true});
  }
});
