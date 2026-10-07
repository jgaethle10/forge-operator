export type RuntimeVec3={x:number;y:number;z:number};
export type RuntimeTransform={
  position:RuntimeVec3;
  rotationDeg?:RuntimeVec3;
  scale?:RuntimeVec3;
};

type Mat3=[
  number,number,number,
  number,number,number,
  number,number,number,
];

const DEG=Math.PI/180;
const RAD=180/Math.PI;

function mat3Multiply(a:Mat3,b:Mat3):Mat3{
  const out=new Array<number>(9).fill(0);
  for(let r=0;r<3;r+=1){
    for(let c=0;c<3;c+=1){
      out[r*3+c]=
        a[r*3+0]*b[0*3+c]+
        a[r*3+1]*b[1*3+c]+
        a[r*3+2]*b[2*3+c];
    }
  }
  return out as Mat3;
}

function transpose(m:Mat3):Mat3{
  return [
    m[0],m[3],m[6],
    m[1],m[4],m[7],
    m[2],m[5],m[8],
  ];
}

function engineEulerMatrix(rotation:RuntimeVec3):Mat3{
  const x=rotation.x*DEG;
  const y=rotation.y*DEG;
  const z=rotation.z*DEG;
  const cx=Math.cos(x),sx=Math.sin(x);
  const cy=Math.cos(y),sy=Math.sin(y);
  const cz=Math.cos(z),sz=Math.sin(z);
  const rx:Mat3=[
    1,0,0,
    0,cx,-sx,
    0,sx,cx,
  ];
  const ry:Mat3=[
    cy,0,sy,
    0,1,0,
    -sy,0,cy,
  ];
  const rz:Mat3=[
    cz,-sz,0,
    sz,cz,0,
    0,0,1,
  ];
  return mat3Multiply(mat3Multiply(rz,ry),rx);
}

const FORGE_TO_ENGINE:Mat3=[
  1,0,0,
  0,0,1,
  0,-1,0,
];

function normalizeDeg(value:number){
  let result=value%360;
  if(result>180) result-=360;
  if(result<=-180) result+=360;
  if(Math.abs(result)<1e-10) return 0;
  return Number(result.toFixed(9));
}

function eulerFromRzRyRx(matrix:Mat3):RuntimeVec3{
  const sy=-matrix[6];
  const y=Math.asin(Math.max(-1,Math.min(1,sy)));
  const cy=Math.cos(y);
  let x:number;
  let z:number;

  if(Math.abs(cy)>1e-7){
    x=Math.atan2(matrix[7],matrix[8]);
    z=Math.atan2(matrix[3],matrix[0]);
  }else{
    x=0;
    z=Math.atan2(-matrix[1],matrix[4]);
  }

  return {
    x:normalizeDeg(x*RAD),
    y:normalizeDeg(y*RAD),
    z:normalizeDeg(z*RAD),
  };
}

export function worldEnginePositionToWorldForge(value:RuntimeVec3):RuntimeVec3{
  return {x:value.x,y:-value.z,z:value.y};
}

export function worldEngineScaleToWorldForge(value:RuntimeVec3):RuntimeVec3{
  return {x:value.x,y:value.z,z:value.y};
}

export function worldEngineEulerToWorldForge(rotation:RuntimeVec3):RuntimeVec3{
  const engine=engineEulerMatrix(rotation);
  const forge=mat3Multiply(
    mat3Multiply(transpose(FORGE_TO_ENGINE),engine),
    FORGE_TO_ENGINE,
  );
  return eulerFromRzRyRx(forge);
}

export function worldEngineTransformToWorldForge(
  transform:RuntimeTransform,
):{
  position:RuntimeVec3;
  rotationDeg:RuntimeVec3;
  scale:RuntimeVec3;
}{
  return {
    position:worldEnginePositionToWorldForge(transform.position),
    rotationDeg:worldEngineEulerToWorldForge(
      transform.rotationDeg??{x:0,y:0,z:0},
    ),
    scale:worldEngineScaleToWorldForge(
      transform.scale??{x:1,y:1,z:1},
    ),
  };
}

export function runtimeTransformsByForgeNodeId(snapshot:any){
  const result:Record<string,ReturnType<typeof worldEngineTransformToWorldForge>>={};
  const entities=Array.isArray(snapshot?.entities)?snapshot.entities:[];
  for(const entity of entities){
    const nodeId=entity?.properties?.worldForgeNodeId;
    if(typeof nodeId!=='string'||!nodeId||!entity?.transform) continue;
    result[nodeId]=worldEngineTransformToWorldForge(entity.transform);
  }
  return result;
}


export interface RuntimeBodyView {
  entityId:string;
  velocity:RuntimeVec3|null;
  kinematic:boolean;
}

export function worldForgeDirectionToWorldEngine(value:RuntimeVec3):RuntimeVec3{
  return {x:value.x,y:value.z,z:-value.y};
}

export function worldForgeAxisImpulseToWorldEngine(
  axis:keyof RuntimeVec3,
  amount:number,
):RuntimeVec3{
  const forgeImpulse:RuntimeVec3={x:0,y:0,z:0};
  forgeImpulse[axis]=amount;
  const mapped=worldForgeDirectionToWorldEngine(forgeImpulse);
  return {
    x:mapped.x===0?0:mapped.x,
    y:mapped.y===0?0:mapped.y,
    z:mapped.z===0?0:mapped.z,
  };
}

export function runtimeBodiesByForgeNodeId(snapshot:any){
  const result:Record<string,RuntimeBodyView>={};
  const entities=Array.isArray(snapshot?.entities)?snapshot.entities:[];
  for(const entity of entities){
    const nodeId=entity?.properties?.worldForgeNodeId;
    if(typeof nodeId!=='string'||!nodeId) continue;
    result[nodeId]={
      entityId:String(entity.id),
      velocity:entity?.rigidBody?.velocity
        ? {
            x:Number(entity.rigidBody.velocity.x),
            y:Number(entity.rigidBody.velocity.y),
            z:Number(entity.rigidBody.velocity.z),
          }
        : null,
      kinematic:Boolean(entity?.rigidBody?.kinematic),
    };
  }
  return result;
}
