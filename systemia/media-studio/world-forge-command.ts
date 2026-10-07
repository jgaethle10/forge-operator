import {
  extrudeNodeFaceOperation,
  insetNodeFaceOperation,
  makeNodeEditableOperation,
  moveNodeVerticesOperation,
} from './world-forge-mesh.js';
import type {
  WorldForgeOperation,
  WorldForgeProject,
  WorldForgeTransform,
} from './world-forge.js';

export interface WorldForgeCommandPlan {
  schema:'evercraft.fallen.world-forge-command-plan.v1';
  status:'accepted'|'blocked';
  projectId:string;
  projectVersion:number;
  instruction:string;
  targetNodeId?:string;
  operations:WorldForgeOperation[];
  reasons:string[];
  explanation:string;
  boundaries:{
    destructiveAuthorityGranted:false;
    publicationAuthorityGranted:false;
    paidGenerationAuthorityGranted:false;
  };
}

function numberFrom(value:string|undefined,fallback:number){
  if(value===undefined) return fallback;
  const parsed=Number(value);
  return Number.isFinite(parsed)?parsed:fallback;
}

function resolveTarget(project:WorldForgeProject,selectedNodeId:string|undefined,instruction:string){
  if(selectedNodeId){
    const selected=project.nodes.find(node=>node.id===selectedNodeId);
    if(selected) return selected;
  }

  const quoted=instruction.match(/["']([^"']+)["']/)?.[1]?.toLowerCase();
  if(quoted){
    const exact=project.nodes.find(node=>node.name.toLowerCase()===quoted||node.id.toLowerCase()===quoted);
    if(exact) return exact;
  }

  return null;
}

function partialTransform(
  group:keyof Pick<WorldForgeTransform,'position'|'rotationDeg'|'scale'>,
  current:WorldForgeTransform,
  axis:'x'|'y'|'z',
  value:number,
){
  return {
    [group]:{
      ...current[group],
      [axis]:value,
    },
  } as Partial<WorldForgeTransform>;
}

export function compileWorldForgeCommand(input:{
  project:WorldForgeProject;
  instruction:string;
  selectedNodeId?:string;
}):WorldForgeCommandPlan{
  const instruction=input.instruction.trim();
  const normalized=instruction.toLowerCase().replace(/,/g,' ');
  const target=resolveTarget(input.project,input.selectedNodeId,instruction);
  const base={
    schema:'evercraft.fallen.world-forge-command-plan.v1' as const,
    projectId:input.project.id,
    projectVersion:input.project.version,
    instruction,
    boundaries:{
      destructiveAuthorityGranted:false as const,
      publicationAuthorityGranted:false as const,
      paidGenerationAuthorityGranted:false as const,
    },
  };

  if(!instruction){
    return {
      ...base,status:'blocked',operations:[],reasons:['instruction_missing'],
      explanation:'Enter a scene instruction.',
    };
  }

  if(!target){
    return {
      ...base,status:'blocked',operations:[],reasons:['target_node_unresolved'],
      explanation:'Select a scene object or name one in quotes.',
    };
  }

  if(target.locked){
    return {
      ...base,status:'blocked',targetNodeId:target.id,operations:[],reasons:[`node_locked:${target.id}`],
      explanation:`${target.name} is locked by the canonical scene.`,
    };
  }

  if(/\b(make|convert)\s+(?:this\s+)?editable\b/.test(normalized)||normalized==='make editable'){
    try{
      const operation=makeNodeEditableOperation({
        project:input.project,
        nodeId:target.id,
      });
      return {
        ...base,status:'accepted',targetNodeId:target.id,reasons:[],
        operations:[operation],
        explanation:`Convert ${target.name} into editable mesh topology.`,
      };
    }catch(error){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[error instanceof Error?error.message:String(error)],
        explanation:'That object cannot be converted to editable mesh topology yet.',
      };
    }
  }

  const extrude=normalized.match(/\bextrude\s+face\s+(\d+)\s*(?:by\s*)?(-?\d+(?:\.\d+)?)\s*(?:m|meter|meters)?\b/);
  if(extrude){
    const faceIndex=Number(extrude[1]);
    const distance=Number(extrude[2]);
    try{
      const operation=extrudeNodeFaceOperation({
        project:input.project,
        nodeId:target.id,
        faceIndex,
        distance,
      });
      return {
        ...base,status:'accepted',targetNodeId:target.id,reasons:[],
        operations:[operation],
        explanation:`Extrude face ${faceIndex} on ${target.name} by ${distance} m.`,
      };
    }catch(error){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[error instanceof Error?error.message:String(error)],
        explanation:'World Forge could not compile that mesh extrusion.',
      };
    }
  }

  const inset=normalized.match(/\binset\s+face\s+(\d+)\s*(?:by\s*)?(\d+(?:\.\d+)?)\b/);
  if(inset){
    const faceIndex=Number(inset[1]);
    const amount=Number(inset[2]);
    try{
      const operation=insetNodeFaceOperation({
        project:input.project,
        nodeId:target.id,
        faceIndex,
        amount,
      });
      return {
        ...base,status:'accepted',targetNodeId:target.id,reasons:[],
        operations:[operation],
        explanation:`Inset face ${faceIndex} on ${target.name} by ${amount}.`,
      };
    }catch(error){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[error instanceof Error?error.message:String(error)],
        explanation:'World Forge could not compile that face inset.',
      };
    }
  }

  const vertexMove=normalized.match(
    /\bmove\s+vertices\s+((?:\d+\s*)+)\s+by\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\b/
  );
  if(vertexMove){
    const vertexIndices=vertexMove[1].trim().split(/\s+/).map(Number);
    const delta={
      x:Number(vertexMove[2]),
      y:Number(vertexMove[3]),
      z:Number(vertexMove[4]),
    };
    try{
      const operation=moveNodeVerticesOperation({
        project:input.project,
        nodeId:target.id,
        vertexIndices,
        delta,
      });
      return {
        ...base,status:'accepted',targetNodeId:target.id,reasons:[],
        operations:[operation],
        explanation:`Move vertices ${vertexIndices.join(', ')} on ${target.name} by Δ(${delta.x}, ${delta.y}, ${delta.z}).`,
      };
    }catch(error){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[error instanceof Error?error.message:String(error)],
        explanation:'World Forge could not compile that vertex move.',
      };
    }
  }

  if(/\b(?:disable|remove|turn\s+off)\s+physics\b/.test(normalized)){
    if(target.kind!=='mesh'){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[`physics_target_not_mesh:${target.id}`],
        explanation:'Physics commands require a selected mesh.',
      };
    }
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{type:'set_physics',nodeId:target.id,physics:null}],
      explanation:`Disable physics on ${target.name}.`,
    };
  }

  const physicsMode=normalized.match(
    /\b(?:make|set)\s+(?:this\s+)?(?:physics\s+(?:to\s+)?)?(dynamic|static|kinematic)\b/
  );
  if(physicsMode){
    if(target.kind!=='mesh'){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[`physics_target_not_mesh:${target.id}`],
        explanation:'Physics commands require a selected mesh.',
      };
    }

    const mode=physicsMode[1] as 'dynamic'|'static'|'kinematic';
    const massMatch=normalized.match(/\b(?:mass\s*)?(\d+(?:\.\d+)?)\s*kg\b/);
    const gravityMatch=normalized.match(/\bgravity\s*(\d+(?:\.\d+)?)\b/);
    const dampingMatch=normalized.match(/\bdamping\s*(\d+(?:\.\d+)?)\b/);
    const bounceMatch=normalized.match(/\b(?:bounce|restitution)\s*(\d+(?:\.\d+)?)\b/);
    const colliderMatch=normalized.match(/\bcollider\s+(box|sphere)\b/);

    const previous=target.physics;
    const collider=
      colliderMatch?.[1]==='sphere'?{type:'auto_sphere' as const}:
      colliderMatch?.[1]==='box'?{type:'auto_box' as const}:
      previous?.collider??{type:'auto_box' as const};

    const physics={
      mode,
      massKg:mode==='static'
        ? undefined
        : Math.max(.001,numberFrom(massMatch?.[1],previous?.massKg??1)),
      gravityScale:mode==='static'
        ? undefined
        : mode==='kinematic'
          ? 0
          : Math.max(0,numberFrom(gravityMatch?.[1],previous?.gravityScale??1)),
      linearDamping:mode==='static'
        ? undefined
        : Math.max(0,numberFrom(dampingMatch?.[1],previous?.linearDamping??.05)),
      restitution:Math.max(0,Math.min(1,numberFrom(bounceMatch?.[1],previous?.restitution??0))),
      collider,
    };

    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{type:'set_physics',nodeId:target.id,physics}],
      explanation:
        mode==='static'
          ? `Make ${target.name} a static ${collider.type.replace('auto_','')} collider.`
          : `Make ${target.name} ${mode} at ${physics.massKg} kg, gravity ${physics.gravityScale}, damping ${physics.linearDamping}, bounce ${physics.restitution}.`,
    };
  }

  if(/\b(delete|remove|destroy)\b/.test(normalized)){
    return {
      ...base,status:'blocked',targetNodeId:target.id,operations:[],
      reasons:['destructive_command_requires_explicit_ui_authority'],
      explanation:'Destructive commands are not granted authority through the command bar.',
    };
  }

  const lens=normalized.match(/\b(?:set\s+)?lens\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(?:mm|millimeter|millimeters)?\b/);
  if(lens){
    if(target.kind!=='camera'||!target.camera){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[`camera_target_invalid:${target.id}`],
        explanation:'Lens commands require a selected camera.',
      };
    }
    const focalLengthMm=Number(lens[1]);
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_camera',
        nodeId:target.id,
        camera:{focalLengthMm},
      }],
      explanation:`Set ${target.name} lens to ${focalLengthMm} mm.`,
    };
  }

  const lookAt=normalized.match(/\blook\s+at\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\b/);
  if(lookAt){
    if(target.kind!=='camera'||!target.camera){
      return {
        ...base,status:'blocked',targetNodeId:target.id,operations:[],
        reasons:[`camera_target_invalid:${target.id}`],
        explanation:'Look-at commands require a selected camera.',
      };
    }
    const point={x:Number(lookAt[1]),y:Number(lookAt[2]),z:Number(lookAt[3])};
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_camera',
        nodeId:target.id,
        camera:{lookAt:point},
      }],
      explanation:`Aim ${target.name} at ${point.x}, ${point.y}, ${point.z}.`,
    };
  }

  const moveAbsolute=normalized.match(/\b(?:set|move)\s+(?:position\s+)?([xyz])\s*(?:to|=)?\s*(-?\d+(?:\.\d+)?)/);
  if(moveAbsolute){
    const axis=moveAbsolute[1] as 'x'|'y'|'z';
    const value=numberFrom(moveAbsolute[2],target.transform.position[axis]);
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_transform',
        nodeId:target.id,
        transform:partialTransform('position',target.transform,axis,value),
      }],
      explanation:`Set ${target.name} position ${axis.toUpperCase()} to ${value} m.`,
    };
  }

  const direction=normalized.match(/\bmove\s+(left|right|up|down|forward|back(?:ward)?)\s*(?:by\s*)?(-?\d+(?:\.\d+)?)?\s*(?:m|meter|meters)?\b/);
  if(direction){
    const amount=Math.abs(numberFrom(direction[2],1));
    const directionName=direction[1];
    const axis:'x'|'y'|'z'=
      directionName==='up'||directionName==='down'?'z':
      directionName==='forward'||directionName.startsWith('back')?'y':'x';
    const sign=
      directionName==='left'||directionName==='down'||directionName.startsWith('back')?-1:1;
    const value=target.transform.position[axis]+amount*sign;
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_transform',
        nodeId:target.id,
        transform:partialTransform('position',target.transform,axis,value),
      }],
      explanation:`Move ${target.name} ${directionName} by ${amount} m.`,
    };
  }

  const rotate=normalized.match(/\brotate\s+(?:around\s+)?([xyz])(?:\s+axis)?\s*(?:by|to)?\s*(-?\d+(?:\.\d+)?)\s*(?:deg|degree|degrees)?\b/);
  if(rotate){
    const axis=rotate[1] as 'x'|'y'|'z';
    const delta=numberFrom(rotate[2],0);
    const value=target.transform.rotationDeg[axis]+delta;
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_transform',
        nodeId:target.id,
        transform:partialTransform('rotationDeg',target.transform,axis,value),
      }],
      explanation:`Rotate ${target.name} ${delta}° around ${axis.toUpperCase()}.`,
    };
  }

  const scaleAxis=normalized.match(/\bscale\s+([xyz])\s*(?:to|=)?\s*(\d+(?:\.\d+)?)/);
  if(scaleAxis){
    const axis=scaleAxis[1] as 'x'|'y'|'z';
    const value=Math.max(.01,numberFrom(scaleAxis[2],target.transform.scale[axis]));
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_transform',
        nodeId:target.id,
        transform:partialTransform('scale',target.transform,axis,value),
      }],
      explanation:`Scale ${target.name} ${axis.toUpperCase()} to ${value}.`,
    };
  }

  const uniformScale=normalized.match(/\bscale\s+(?:uniform(?:ly)?\s+)?(?:to\s+)?(\d+(?:\.\d+)?)/);
  if(uniformScale){
    const value=Math.max(.01,numberFrom(uniformScale[1],1));
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{
        type:'set_transform',
        nodeId:target.id,
        transform:{scale:{x:value,y:value,z:value}},
      }],
      explanation:`Scale ${target.name} uniformly to ${value}.`,
    };
  }

  if(/\bhide\b/.test(normalized)){
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{type:'set_visibility',nodeId:target.id,visible:false}],
      explanation:`Hide ${target.name}.`,
    };
  }

  if(/\bshow\b|\bunhide\b/.test(normalized)){
    return {
      ...base,status:'accepted',targetNodeId:target.id,reasons:[],
      operations:[{type:'set_visibility',nodeId:target.id,visible:true}],
      explanation:`Show ${target.name}.`,
    };
  }

  return {
    ...base,status:'blocked',targetNodeId:target.id,operations:[],
    reasons:['command_not_understood'],
    explanation:'That command is outside the deterministic World Forge command grammar.',
  };
}
