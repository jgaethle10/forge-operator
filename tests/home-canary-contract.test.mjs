import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const workflow=fs.readFileSync(
  '.github/workflows/evercraft-home-canary.yml',
  'utf8'
);

test('Home canary fails closed without a verified origin',()=>{
  for(const required of [
    'held_no_home_origin_configured',
    '"public_https_verified": false',
    '"anonymous_access_denied": false',
  ]){
    assert.ok(workflow.includes(required),'missing held-state contract: '+required);
  }
});

test('Home canary requires sovereign HTTPS and auth boundaries',()=>{
  for(const required of [
    'HOME_ORIGIN must use HTTPS',
    'Evercraft Home public edge must not resolve to Base44',
    '.service == "evercraft-home"',
    '.runtime == "Evercraft Compute"',
    '.workload_class == "systemia.evercraft-home.v1"',
    '.authority == "evercraft"',
    '.auth_mode == "passport"',
    '.deployment_receipt_bound == true',
    '.identity_login_configured == true',
    '.session_revocation_supported == true',
    '.base44_required == false',
    '.external_ai_required == false',
    '.legacy_provider_required == false',
    'test "$session_code" = "401"',
    '.state == "session_required"',
    'certificate_validation:"system_default_trust_store"',
  ]){
    assert.ok(workflow.includes(required),'missing Home canary contract: '+required);
  }
});

test('Home canary never submits credentials or creates sessions',()=>{
  assert.equal(workflow.includes('/api/login'),false);
  assert.equal(workflow.includes('evercraft_session='),false);
  assert.equal(workflow.includes('EVERCRAFT_IDENTITY_SECRET'),false);
  assert.equal(workflow.includes('EVERCRAFT_OWNER_PASSWORD'),false);
  assert.equal(/["']password["']\s*:|password=|--data[^\n]*password|authorization:\s*basic/i.test(workflow),false);
});


const ownedEdgeWorkflow=fs.readFileSync(
  '.github/workflows/evercraft-home-owned-edge-canary.yml',
  'utf8'
);

test('owned-edge Home canary persists only verified external proof',()=>{
  for(const required of [
    'if: success()',
    'conformance/runtime-observations/evercraft-home-owned-edge-latest.json',
    'git rev-parse origin/main',
    'Record verified Personal Evercraft Home edge',
    '.source_release_ref | type == "string"',
    'source_release_ref:$source_release',
  ]){
    assert.ok(ownedEdgeWorkflow.includes(required),'missing durable Home receipt contract: '+required);
  }
  assert.ok(ownedEdgeWorkflow.includes('permissions:\n  contents: write'));
  assert.equal(ownedEdgeWorkflow.includes('/api/login'),false);
  assert.equal(/EVERCRAFT_IDENTITY_SECRET|EVERCRAFT_OWNER_PASSWORD|claim_code/i.test(ownedEdgeWorkflow),false);
});

test('Clip credential screen correctly resolves Home-prefixed routes and local root routes',()=>{
  const html=fs.readFileSync('systemia/evercraft-home/public/credentials.html','utf8');
  const baseUrls=[
    ['https://fabric.systemiacommandcenters.com/home/credentials.html','/home/api/'],
    ['http://127.0.0.1:4310/credentials.html','/api/'],
  ];
  const endpoints=[...html.matchAll(/endpoint:"(api\/[^"]+)"/g)].map(match=>match[1]);
  assert.ok(endpoints.includes('api/credentials/providers/facebook-pages'));
  assert.ok(html.includes('fetch("api/clip/facebook/diagnose"'));
  assert.ok(html.includes('fetch("api/session"'));
  assert.ok(html.includes('href="./"'));
  assert.ok(html.includes('window.location.replace("./")'));
  assert.doesNotMatch(html,/endpoint:"\/api\/|fetch\("\/api\/|href="\/"/);
  for(const [origin,prefix] of baseUrls){
    for(const endpoint of [...endpoints,'api/clip/facebook/diagnose','api/session']){
      const target=new URL(endpoint,origin);
      assert.equal(target.origin,new URL(origin).origin);
      assert.ok(target.pathname.startsWith(prefix),target.pathname+' does not have '+prefix);
    }
  }
});
test('owned Home installer allocates persistent claim storage for Clip Journal publishing',()=>{
  const script=fs.readFileSync('scripts/install-evercraft-home-edge.sh','utf8');
  assert.ok(script.includes('"$HOME_STATE/clip/journal-attempts"'));
  assert.ok(script.includes('EVERCRAFT_CLIP_JOURNAL_STATE_DIR=$HOME_STATE/clip/journal-attempts'));
  assert.ok(script.includes('install -d -o "$RUN_USER" -g "$RUN_USER" -m 0700'));
  assert.ok(script.includes('handle_path /home/*'));
  assert.ok(script.includes('EVERCRAFT_HOME_COOKIE_PATH=/home'));
  assert.ok(!script.includes('BASE44'));
});
