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

  if(/\b(delete|remove|destroy)\b/.test(normalized)){
    return {
      ...base,status:'blocked',targetNodeId:target.id,operations:[],
      reasons:['destructive_command_requires_explicit_ui_authority'],
      explanation:'Destructive commands are not granted authority through the command bar.',
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
