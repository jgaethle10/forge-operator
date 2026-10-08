import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWorldForgeStarterProject,
  registerWorldForgeRoutes,
} from './world-forge-http.js';
import {
  applyWorldForgeOperations,
  buildWorldForgeRenderPlan,
  validateWorldForgeProject,
} from './world-forge.js';

test('World Forge starter is valid, editable, and render-plannable',()=>{
  const project=createWorldForgeStarterProject();
  const validation=validateWorldForgeProject(project);
  assert.equal(validation.status,'accepted');
  assert.equal(project.nodes.some(node=>node.kind==='camera'),true);
  assert.equal(project.nodes.some(node=>node.kind==='light'),true);
  assert.equal(project.nodes.some(node=>node.kind==='mesh'),true);

  const result=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[{
      type:'set_transform',
      nodeId:'hero-core',
      transform:{position:{x:1,y:.5,z:1.25}},
    }],
  });
  assert.equal(result.status,'completed');
  assert.equal(result.project.version,project.version+1);

  const plan=buildWorldForgeRenderPlan({
    project:result.project,
    renderIntentId:'preview',
  });
  assert.equal(plan.backend.executable,false);
  assert.equal(plan.requirements.true3DScene,true);
});

test('World Forge starter keeps environment locks separate from editable hero content',()=>{
  const project=createWorldForgeStarterProject();
  const locked=applyWorldForgeOperations({
    project,
    expectedVersion:project.version,
    operations:[{
      type:'set_transform',
      nodeId:'world-floor',
      transform:{position:{x:4,y:0,z:-.08}},
    }],
  });
  assert.equal(locked.status,'blocked');
  assert.match(locked.receipt.rejectedOperations[0].reason,/node_locked/);
});


test('World Forge HTTP registers bounded Play Mode lifecycle routes',()=>{
  const routes=new Map<string,Function>();
  const app={
    post(path:string,...handlers:Function[]){
      routes.set(`POST ${path}`,handlers[handlers.length-1]);
    },
    get(path:string,...handlers:Function[]){
      routes.set(`GET ${path}`,handlers[handlers.length-1]);
    },
  };

  registerWorldForgeRoutes(app as any,{
    rateLimit:()=>((_req:any,_res:any,next:Function)=>next()),
  });

  for(const route of [
    'POST /api/fallen/world-forge/play/start',
    'POST /api/fallen/world-forge/play/status',
    'POST /api/fallen/world-forge/play/webgpu-frame',
    'POST /api/fallen/world-forge/play/step',
    'POST /api/fallen/world-forge/play/sync',
    'POST /api/fallen/world-forge/play/stop',
    'GET /api/fallen/world-forge/play/sessions',
  ]){
    assert.equal(routes.has(route),true,`missing route ${route}`);
  }
});

test('World Forge Play Mode HTTP start → step → status → stop lifecycle is wired',()=>{
  const routes=new Map<string,Function>();
  const app={
    post(path:string,...handlers:Function[]){
      routes.set(`POST ${path}`,handlers[handlers.length-1]);
    },
    get(path:string,...handlers:Function[]){
      routes.set(`GET ${path}`,handlers[handlers.length-1]);
    },
  };

  registerWorldForgeRoutes(app as any,{
    rateLimit:()=>((_req:any,_res:any,next:Function)=>next()),
  });

  function invoke(route:string,body:Record<string,unknown>){
    const handler=routes.get(route);
    assert.ok(handler,`missing handler ${route}`);
    let statusCode=200;
    let payload:any=null;
    const response={
      status(code:number){
        statusCode=code;
        return response;
      },
      json(value:any){
        payload=value;
        return response;
      },
    };
    handler!({body},response);
    return {statusCode,payload};
  }

  const project=createWorldForgeStarterProject();
  const sessionId='http-play-proof';

  const started=invoke(
    'POST /api/fallen/world-forge/play/start',
    {project,sessionId},
  );
  assert.equal(started.statusCode,200);
  assert.equal(started.payload.success,true);
  assert.equal(started.payload.snapshot.tick,0);
  assert.equal(started.payload.session.sessionId,sessionId);

  const stepped=invoke(
    'POST /api/fallen/world-forge/play/step',
    {sessionId,ticks:5,inputs:[]},
  );
  assert.equal(stepped.statusCode,200);
  assert.equal(stepped.payload.success,true);
  assert.equal(stepped.payload.result.snapshot.tick,5);

  const status=invoke(
    'POST /api/fallen/world-forge/play/status',
    {sessionId},
  );
  assert.equal(status.statusCode,200);
  assert.equal(status.payload.success,true);
  assert.equal(status.payload.snapshot.tick,5);

  const webgpu=invoke(
    'POST /api/fallen/world-forge/play/webgpu-frame',
    {sessionId,width:640,height:360},
  );
  assert.equal(webgpu.statusCode,200);
  assert.equal(webgpu.payload.success,true);
  assert.equal(webgpu.payload.frame.tick,5);
  assert.equal(webgpu.payload.frame.plan.tick,5);
  assert.equal(webgpu.payload.frame.plan.width,640);
  assert.equal(webgpu.payload.frame.plan.height,360);
  assert.ok(webgpu.payload.frame.geometries.length>0);
  assert.equal(
    Object.keys(webgpu.payload.frame.geometryDigests).length,
    webgpu.payload.frame.geometries.length,
  );

  const stopped=invoke(
    'POST /api/fallen/world-forge/play/stop',
    {sessionId},
  );
  assert.equal(stopped.statusCode,200);
  assert.equal(stopped.payload.success,true);

  const missing=invoke(
    'POST /api/fallen/world-forge/play/status',
    {sessionId},
  );
  assert.equal(missing.statusCode,404);
  assert.equal(missing.payload.success,false);
});
