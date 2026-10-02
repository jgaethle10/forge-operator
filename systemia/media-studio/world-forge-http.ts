import { compileWorldForgeCommand } from './world-forge-command.js';
import type { Express, NextFunction, Request, Response } from 'express';
import {
  applyWorldForgeOperations,
  buildWorldForgeRenderPlan,
  createEmptyWorldForgeProject,
  identityWorldForgeTransform,
  validateWorldForgeProject,
  type WorldForgeOperation,
  type WorldForgeProject,
} from './world-forge.js';

type WorldForgeHttpDeps = {
  rateLimit: (maxRequests:number,windowMs:number)=>
    (req:Request,res:Response,next:NextFunction)=>void;
};

export function createWorldForgeStarterProject():WorldForgeProject{
  const project=createEmptyWorldForgeProject({
    id:'fallen-world-forge-starter',
    title:'Fallen World Forge',
  });

  project.materials.push(
    {
      id:'material-graphite',
      name:'Graphite',
      model:'pbr',
      baseColor:[0.055,0.065,0.075,1],
      metallic:.48,
      roughness:.3,
    },
    {
      id:'material-ice',
      name:'Electric Ice',
      model:'pbr',
      baseColor:[.075,.42,.82,1],
      metallic:.22,
      roughness:.24,
      emissive:[.01,.08,.18],
    },
    {
      id:'material-floor',
      name:'Studio Floor',
      model:'pbr',
      baseColor:[.025,.028,.032,1],
      metallic:.12,
      roughness:.58,
    },
  );

  project.nodes.push(
    {
      id:'world-floor',
      name:'World Floor',
      kind:'mesh',
      transform:{
        position:{x:0,y:0,z:-.08},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:12,y:12,z:.08},
      },
      geometry:{kind:'primitive',primitive:'cube'},
      materialIds:['material-floor'],
      locked:true,
      tags:['environment','starter'],
    },
    {
      id:'hero-core',
      name:'Hero Core',
      kind:'mesh',
      transform:{
        position:{x:0,y:0,z:1},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:1,y:1,z:1},
      },
      geometry:{kind:'primitive',primitive:'cube'},
      materialIds:['material-ice'],
      modifiers:[
        {id:'hero-bevel',type:'bevel',width:.08,segments:4},
      ],
      tags:['hero','editable','starter'],
    },
    {
      id:'plinth-left',
      name:'Left Plinth',
      kind:'mesh',
      transform:{
        position:{x:-2.35,y:.55,z:.55},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:.72,y:.72,z:.55},
      },
      geometry:{kind:'primitive',primitive:'cube'},
      materialIds:['material-graphite'],
      tags:['starter'],
    },
    {
      id:'plinth-right',
      name:'Right Plinth',
      kind:'mesh',
      transform:{
        position:{x:2.35,y:.55,z:.75},
        rotationDeg:{x:0,y:0,z:0},
        scale:{x:.62,y:.62,z:.75},
      },
      geometry:{kind:'primitive',primitive:'cube'},
      materialIds:['material-graphite'],
      tags:['starter'],
    },
    {
      id:'key-light',
      name:'Key Light',
      kind:'light',
      transform:{
        position:{x:-4,y:-4,z:6},
        rotationDeg:{x:40,y:0,z:-38},
        scale:{x:1,y:1,z:1},
      },
      light:{
        type:'area',
        intensity:1200,
        color:[1,.92,.78],
        size:4,
        castShadows:true,
      },
      tags:['lighting','starter'],
    },
    {
      id:'rim-light',
      name:'Rim Light',
      kind:'light',
      transform:{
        position:{x:4,y:1,z:4.5},
        rotationDeg:{x:56,y:0,z:132},
        scale:{x:1,y:1,z:1},
      },
      light:{
        type:'area',
        intensity:850,
        color:[.28,.68,1],
        size:3,
        castShadows:true,
      },
      tags:['lighting','starter'],
    },
  );

  const camera=project.nodes.find(node=>node.id==='camera-main');
  if(camera){
    camera.transform={
      position:{x:7,y:-9,z:6.2},
      rotationDeg:{x:64,y:0,z:38},
      scale:{x:1,y:1,z:1},
    };
  }

  project.renderIntents[0]={
    id:'preview',
    cameraNodeId:'camera-main',
    width:1920,
    height:1080,
    fps:30,
    startFrame:1,
    endFrame:1,
    quality:'preview',
    colorPipeline:'aces',
  };

  const validation=validateWorldForgeProject(project);
  if(validation.status!=='accepted'){
    throw new Error(`world_forge_starter_invalid:${validation.errors.join('|')}`);
  }
  return project;
}

function badRequest(res:Response,error:string){
  res.status(400).json({success:false,error});
}

export function registerWorldForgeRoutes(app:Express,deps:WorldForgeHttpDeps){
  const {rateLimit}=deps;

  app.get(
    '/api/fallen/world-forge/starter',
    rateLimit(120,60*60*1000),
    (_req:Request,res:Response)=>{
      const project=createWorldForgeStarterProject();
      res.json({
        success:true,
        project,
        validation:validateWorldForgeProject(project),
      });
    },
  );

  app.post(
    '/api/fallen/world-forge/validate',
    rateLimit(240,60*60*1000),
    (req:Request,res:Response)=>{
      const project=req.body?.project as WorldForgeProject|undefined;
      if(!project){
        badRequest(res,'World Forge project is required.');
        return;
      }
      const validation=validateWorldForgeProject(project);
      res.status(validation.status==='accepted'?200:422).json({
        success:validation.status==='accepted',
        validation,
      });
    },
  );

  app.post(
    '/api/fallen/world-forge/command-plan',
    rateLimit(360,60*60*1000),
    (req:Request,res:Response)=>{
      const project=req.body?.project as WorldForgeProject|undefined;
      const instruction=String(req.body?.instruction||'').slice(0,1000);
      const selectedNodeId=req.body?.selectedNodeId
        ? String(req.body.selectedNodeId).slice(0,200)
        : undefined;
      if(!project){
        badRequest(res,'World Forge project is required.');
        return;
      }
      const plan=compileWorldForgeCommand({
        project,
        instruction,
        selectedNodeId,
      });
      res.status(plan.status==='accepted'?200:422).json({
        success:plan.status==='accepted',
        plan,
      });
    },
  );

  app.post(
    '/api/fallen/world-forge/mutate',
    rateLimit(360,60*60*1000),
    (req:Request,res:Response)=>{
      const project=req.body?.project as WorldForgeProject|undefined;
      const operations=req.body?.operations as WorldForgeOperation[]|undefined;
      const expectedVersion=Number(req.body?.expectedVersion);

      if(!project||!Array.isArray(operations)||!operations.length){
        badRequest(res,'Project and at least one World Forge operation are required.');
        return;
      }
      if(operations.length>50){
        badRequest(res,'A single World Forge mutation may contain at most 50 operations.');
        return;
      }

      const result=applyWorldForgeOperations({
        project,
        operations,
        expectedVersion:Number.isInteger(expectedVersion)?expectedVersion:project.version,
      });

      res.status(result.status==='completed'?200:409).json({
        success:result.status==='completed',
        result,
      });
    },
  );

  app.post(
    '/api/fallen/world-forge/render-plan',
    rateLimit(120,60*60*1000),
    (req:Request,res:Response)=>{
      const project=req.body?.project as WorldForgeProject|undefined;
      const renderIntentId=String(req.body?.renderIntentId||'preview');
      if(!project){
        badRequest(res,'World Forge project is required.');
        return;
      }
      try{
        const plan=buildWorldForgeRenderPlan({project,renderIntentId});
        res.json({success:true,plan});
      }catch(error){
        res.status(422).json({
          success:false,
          error:error instanceof Error?error.message:String(error),
        });
      }
    },
  );
}
