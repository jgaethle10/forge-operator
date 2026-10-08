import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const openapi=JSON.parse(fs.readFileSync('public/openapi.json','utf8'));
const server=fs.readFileSync('server.ts','utf8');
const manifest=JSON.parse(fs.readFileSync('public/benchmarks/systemia-university/manifest.json','utf8'));

test('OpenAPI exposes bounded University benchmark discovery and evaluator',()=>{
  assert.ok(openapi.paths['/api/systemia-university/benchmarks']?.get);
  assert.ok(openapi.paths['/api/systemia-university/benchmarks/{missionKey}']?.get);
  const evaluator=openapi.paths['/api/systemia-university/evaluate']?.post;
  assert.ok(evaluator);
  assert.match(evaluator.description,/does not persist attempts/);
  assert.match(evaluator.description,/verify provider identity/);
  assert.ok(evaluator.responses['429']);
});

test('server registers University routes behind existing rate limiting and discovery CORS',()=>{
  assert.match(server,/registerUniversityBenchmarkRoutes\(app/);
  assert.match(server,/publicEvaluateLimiter:\s*rateLimit\(30,\s*60 \* 60 \* 1000\)/);
  assert.match(server,/pathname\.startsWith\('\/api\/systemia-university\/'\)/);
  assert.match(server,/Systemia University Benchmarks/);
});

test('public contracts do not claim deployment before an external canary',()=>{
  assert.equal(manifest.remote_evaluation.state,'implementation_ready_deployment_unverified');
  assert.equal(
    openapi['x-evercraft-discovery'].systemia_university_evaluator_state,
    'implementation_ready_deployment_unverified'
  );
});
