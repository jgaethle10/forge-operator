import assert from 'node:assert/strict';
import { startWorkSabanPreview } from './server.mjs';

const server=await startWorkSabanPreview({port:0});
try{
  const address=server.address();
  const base='http://127.0.0.1:'+address.port;
  const response=await fetch(base+'/api/capacity');
  assert.equal(response.status,200);
  assert.match(response.headers.get('cache-control'),'no-store');
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.live_workers,false);
  assert.equal(body.execution_mode,'synthetic_demo_only');
  assert.equal(body.capacity.provisioned,0);
  assert.equal(body.capacity.visibleCharacters,0);
  assert.equal(body.capacity.venue,'office');
  assert.equal(body.capacity.status,'not_provisioned');
  const bad=await fetch(base+'/api/capacity',{headers:{host:'example.org:1234'}});
  assert.equal(bad.status,403);
  console.log('Work Saban capacity HTTP integration PASS (zero-worker truth and local-host enforcement).');
}finally{
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
}
