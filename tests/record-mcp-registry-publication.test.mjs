import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script=path.resolve('scripts/record-mcp-registry-publication.mjs');
const targets=[
  ['ibmi-rescue','io.github.jgaethle10/ibmi-rescue'],
  ['foundry-app-escape','io.github.jgaethle10/foundry-app-escape'],
  ['site-survive','io.github.jgaethle10/site-survive'],
];

function makeRoot({canary=true,remoteMismatch=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'registry-publication-record-'));
  fs.mkdirSync(path.join(root,'distribution'),{recursive:true});
  fs.mkdirSync(path.join(root,'mcp-registry'),{recursive:true});
  const products=[];
  const manifestPaths=[];

  for(const [slug,name] of targets){
    const mcp='https://specialists.evercraft.example/mcp/'+slug;
    products.push({
      slug,
      name:slug,
      state:'public_https_verified_registry_pending',
      registry_name:null,
      mcp_url:mcp,
      public_origin_state:'external_canary_verified',
      public_edge_canary:canary ? {
        verified:true,
        registry_publication_proven:false,
        deployment_receipt_ref:'sha256:'+'a'.repeat(64),
      } : null,
    });
    const manifestPath='mcp-registry/'+slug+'.json';
    fs.writeFileSync(path.join(root,manifestPath),JSON.stringify({
      '$schema':'https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json',
      name,
      title:slug,
      description:'proof',
      version:'1.0.0',
      websiteUrl:'https://example.com',
      remotes:[{
        type:'streamable-http',
        url:remoteMismatch && slug==='ibmi-rescue'
          ? 'https://wrong.evercraft.example/mcp/ibmi-rescue'
          : mcp,
      }],
    },null,2)+'\n');
    manifestPaths.push(manifestPath);
  }

  fs.writeFileSync(
    path.join(root,'distribution/direct-plugin-specs.json'),
    JSON.stringify({
      schema:'evercraft.direct-plugin-specs.v1',
      version:'1.0.0',
      routing_policy:{},
      products,
    },null,2)+'\n'
  );
  fs.writeFileSync(path.join(root,'published.txt'),manifestPaths.join('\n')+'\n');
  return root;
}

test('official publisher success records registry publication without altering remote execution truth',()=>{
  const root=makeRoot();
  try{
    execFileSync(process.execPath,[
      script,
      '--manifests-file','published.txt',
      '--workflow-run-id','123456',
      '--release-sha','b'.repeat(40),
      '--approval-mode','auto_policy',
      '--approval-ref','routine_public',
    ],{cwd:root,stdio:'pipe'});

    const specs=JSON.parse(
      fs.readFileSync(path.join(root,'distribution/direct-plugin-specs.json'),'utf8')
    );
    for(const [slug,name] of targets){
      const product=specs.products.find(p=>p.slug===slug);
      assert.equal(product.state,'registry_published_direct_mcp_existing');
      assert.equal(product.registry_name,name);
      assert.equal(product.public_edge_canary.verified,true);
      assert.equal(product.public_edge_canary.registry_publication_proven,true);
      assert.equal(product.registry_publication_receipt.registry_name,name);
      assert.equal(product.registry_publication_receipt.workflow_run_id,'123456');
      assert.equal(product.registry_publication_receipt.release_sha,'b'.repeat(40));
      assert.equal(
        fs.existsSync(
          path.join(root,'distribution/mcp-registry-publication-receipts',slug+'-1.0.0.json')
        ),
        true
      );
    }
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('publication recorder refuses products without the external execution canary',()=>{
  const root=makeRoot({canary:false});
  try{
    assert.throws(
      ()=>execFileSync(process.execPath,[
        script,
        '--manifests-file','published.txt',
        '--workflow-run-id','123456',
        '--release-sha','b'.repeat(40),
      ],{cwd:root,stdio:'pipe'}),
      /Command failed/
    );
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('publication recorder refuses a registry manifest pointing somewhere other than the verified MCP',()=>{
  const root=makeRoot({remoteMismatch:true});
  try{
    assert.throws(
      ()=>execFileSync(process.execPath,[
        script,
        '--manifests-file','published.txt',
        '--workflow-run-id','123456',
        '--release-sha','b'.repeat(40),
      ],{cwd:root,stdio:'pipe'}),
      /Command failed/
    );
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
