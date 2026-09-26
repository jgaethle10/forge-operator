import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

execFileSync(process.execPath,['scripts/generate-mcp-registry-candidates.mjs','--check'],{stdio:'inherit'});

const specs=JSON.parse(fs.readFileSync('distribution/direct-plugin-specs.json','utf8'));
const targets=[
  ['ibmi-rescue','io.github.jgaethle10/ibmi-rescue'],
  ['foundry-app-escape','io.github.jgaethle10/foundry-app-escape'],
  ['site-survive','io.github.jgaethle10/site-survive'],
];

for(const [slug,desiredName] of targets){
  const product=specs.products.find(p=>p.slug===slug);
  assert.ok(product,'missing direct product '+slug);

  const candidate=JSON.parse(
    fs.readFileSync('distribution/mcp-registry-candidates/'+slug+'.json','utf8')
  );
  assert.equal(candidate.schema,'evercraft.mcp-registry-candidate.v1');
  assert.equal(candidate.slug,slug);
  assert.equal(candidate.desired_registry_name,desiredName);

  if(product.state==='yard_runtime_proven_public_route_pending'){
    assert.equal(candidate.publication_state,'waiting_public_https_verification');
    assert.equal(candidate.public_execution_verified,false);
    assert.equal(candidate.registry_publication_proven,false);
    assert.equal(candidate.manifest,null);
    assert.equal(fs.existsSync('mcp-registry/'+slug+'.json'),false,slug+': held candidate must not exist in publish directory');
    const raw=fs.readFileSync('distribution/mcp-registry-candidates/'+slug+'.json','utf8');
    assert.equal(/base44\.app/i.test(raw),false,slug+': held candidate must not preserve stale Base44 MCP URLs');
  }

  if(product.state==='public_https_verified_registry_pending'){
    assert.equal(candidate.publication_state,'ready_for_authorized_publication');
    assert.equal(candidate.public_execution_verified,true);
    assert.equal(candidate.registry_publication_proven,false);
    assert.ok(candidate.manifest);
    assert.equal(candidate.manifest.name,desiredName);
    assert.equal(candidate.manifest.remotes[0].url,product.mcp_url);
    assert.equal(fs.existsSync('mcp-registry/'+slug+'.json'),false,slug+': registry-pending candidate must not masquerade as published');
  }

  if(product.state==='registry_published_direct_mcp_existing'){
    assert.equal(candidate.publication_state,'publication_proven');
    assert.equal(candidate.registry_publication_proven,true);
    assert.ok(candidate.manifest);
    assert.equal(candidate.manifest.name,product.registry_name);
    assert.equal(candidate.manifest.remotes[0].url,product.mcp_url);
    assert.equal(fs.existsSync('mcp-registry/'+slug+'.json'),true,slug+': published state requires actual registry manifest');
  }
}

console.log('MCP_REGISTRY_CANDIDATES_PASS',JSON.stringify({
  candidates:targets.length,
  states:Object.fromEntries(targets.map(([slug])=>[
    slug,
    specs.products.find(p=>p.slug===slug)?.state||null
  ])),
}));
