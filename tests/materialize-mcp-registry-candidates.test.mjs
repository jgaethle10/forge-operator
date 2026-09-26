import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script=path.resolve('scripts/materialize-mcp-registry-candidates.mjs');
const targets=[
  ['ibmi-rescue','io.github.jgaethle10/ibmi-rescue'],
  ['foundry-app-escape','io.github.jgaethle10/foundry-app-escape'],
  ['site-survive','io.github.jgaethle10/site-survive'],
];

function candidate(slug,name,{ready=false,base44=false}={}){
  const manifest={
    '$schema':'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
    name,
    title:slug,
    description:'proof',
    version:'1.0.0',
    websiteUrl:'https://example.com',
    remotes:[{
      type:'streamable-http',
      url:base44
        ? 'https://blocked.base44.app/functions/test'
        : 'https://specialists.evercraft.example/mcp/'+slug,
    }],
  };
  return {
    schema:'evercraft.mcp-registry-candidate.v1',
    product:slug,
    slug,
    publication_state:ready
      ? 'ready_for_authorized_publication'
      : 'waiting_public_https_verification',
    desired_registry_name:name,
    registry_publication_proven:false,
    public_execution_verified:ready,
    source_state:ready
      ? 'public_https_verified_registry_pending'
      : 'yard_runtime_proven_public_route_pending',
    source_public_origin_state:ready
      ? 'external_canary_verified'
      : 'https_route_unbound',
    source_canary:null,
    manifest:ready?manifest:null,
    release_rule:'proof',
  };
}

function makeRoot(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-registry-materializer-'));
  fs.mkdirSync(path.join(root,'distribution/mcp-registry-candidates'),{recursive:true});
  for(const [slug,name] of targets){
    fs.writeFileSync(
      path.join(root,'distribution/mcp-registry-candidates',slug+'.json'),
      JSON.stringify(candidate(slug,name),null,2)+'\n'
    );
  }
  return root;
}

test('held candidates never enter the publication directory',()=>{
  const root=makeRoot();
  try{
    const out=path.join(root,'receipt.json');
    execFileSync(process.execPath,[script,'--out',out],{cwd:root,stdio:'pipe'});
    const receipt=JSON.parse(fs.readFileSync(out,'utf8'));
    assert.equal(receipt.registry_publication_proven,false);
    assert.equal(receipt.materialized.length,0);
    assert.equal(receipt.held.length,3);
    for(const [slug] of targets){
      assert.equal(fs.existsSync(path.join(root,'mcp-registry',slug+'.json')),false);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('verified candidates materialize exact manifests but still do not claim publication',()=>{
  const root=makeRoot();
  try{
    for(const [slug,name] of targets){
      fs.writeFileSync(
        path.join(root,'distribution/mcp-registry-candidates',slug+'.json'),
        JSON.stringify(candidate(slug,name,{ready:true}),null,2)+'\n'
      );
    }
    const out=path.join(root,'receipt.json');
    execFileSync(process.execPath,[script,'--out',out],{cwd:root,stdio:'pipe'});
    const receipt=JSON.parse(fs.readFileSync(out,'utf8'));
    assert.equal(receipt.registry_publication_proven,false);
    assert.equal(receipt.materialized.length,3);
    for(const [slug,name] of targets){
      const manifest=JSON.parse(fs.readFileSync(path.join(root,'mcp-registry',slug+'.json'),'utf8'));
      assert.equal(manifest.name,name);
      assert.equal(manifest.remotes[0].url,'https://specialists.evercraft.example/mcp/'+slug);
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Base44 endpoints are rejected from newly materialized Yard registry manifests',()=>{
  const root=makeRoot();
  try{
    for(const [slug,name] of targets){
      fs.writeFileSync(
        path.join(root,'distribution/mcp-registry-candidates',slug+'.json'),
        JSON.stringify(candidate(slug,name,{ready:true,base44:slug==='ibmi-rescue'}),null,2)+'\n'
      );
    }
    assert.throws(
      ()=>execFileSync(process.execPath,[script],{cwd:root,stdio:'pipe'}),
      /Command failed/
    );
    assert.equal(fs.existsSync(path.join(root,'mcp-registry','ibmi-rescue.json')),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
