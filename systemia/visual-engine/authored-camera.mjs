// Authored-model cinematography: deterministic, geometry-aware camera fit.
// Works on canonical World Engine geometry after glTF node transforms are baked.
// It does not alter meshes, rights receipts or render-plan digests.
import assert from 'node:assert/strict';

const EPS=1e-10;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0]
];
const unit=v=>{
  const l=Math.hypot(...v);
  assert.ok(Number.isFinite(l)&&l>EPS,'camera_vector_degenerate');
  return v.map(x=>x/l);
};
const finite=v=>typeof v==='number'&&Number.isFinite(v);

export function getAuthoredBounds(geometries){
  assert.ok(Array.isArray(geometries)&&geometries.length>0,
    'camera_geometry_missing');
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  let count=0;
  for(const geometry of geometries){
    assert.ok(Array.isArray(geometry?.positions)&&
      geometry.positions.length>0&&geometry.positions.length%3===0,
      'camera_positions_invalid');
    for(let i=0;i<geometry.positions.length;i+=3){
      for(let j=0;j<3;j++){
        const v=geometry.positions[i+j];
        assert.ok(finite(v),'camera_position_nonfinite');
        min[j]=Math.min(min[j],v);
        max[j]=Math.max(max[j],v);
      }
      count++;
    }
  }
  const middle=min.map((v,j)=>(v+max[j])/2),span=max.map((v,j)=>v-min[j]);
  const length=Math.hypot(...span);
  assert.ok(length>EPS&&finite(length),'camera_world_bounds_degenerate');
  return {min,max,span,center:{x:middle[0],y:middle[1],z:middle[2]},
    length,vertexCount:count};
}

export function fitAuthoredCamera(geometries,{
  width=1280,height=720,angleRadians=0,
  elevationDeg=19,fovYDeg=46,
  maxHorizontalFraction=.76,maxVerticalFraction=.72
}={}){
  assert.ok(Number.isSafeInteger(width)&&width>=64&&width<=8192&&
    Number.isSafeInteger(height)&&height>=64&&height<=8192,
    'camera_frame_dimensions_invalid');
  assert.ok(finite(angleRadians)&&finite(elevationDeg)&&
    Math.abs(elevationDeg)<80&&finite(fovYDeg)&&fovYDeg>=15&&fovYDeg<=100,
    'camera_optics_invalid');
  assert.ok(finite(maxHorizontalFraction)&&maxHorizontalFraction>=.2&&
    maxHorizontalFraction<=.95&&finite(maxVerticalFraction)&&
    maxVerticalFraction>=.2&&maxVerticalFraction<=.95,
    'camera_framing_constraint_invalid');
  const bounds=getAuthoredBounds(geometries),center=Object.values(bounds.center);
  const aspect=width/height,tanHalf=Math.tan(fovYDeg*Math.PI/360);
  const elev=elevationDeg*Math.PI/180;
  const ray=unit([Math.sin(angleRadians)*Math.cos(elev),
    Math.sin(elev),Math.cos(angleRadians)*Math.cos(elev)]);
  // forward = -ray. Keep the screen axes orthogonal to world up.
  const right=unit(cross([0,1,0],ray));
  const up=unit(cross(ray,right));
  let requiredDepth=0,largestRay=-Infinity;
  const points=[];
  for(const geometry of geometries)
    for(let i=0;i<geometry.positions.length;i+=3){
      const v=[
        geometry.positions[i]-center[0],
        geometry.positions[i+1]-center[1],
        geometry.positions[i+2]-center[2]
      ];
      const along=dot(v,ray),h=dot(v,right),vert=dot(v,up);
      requiredDepth=Math.max(requiredDepth,
        along+Math.abs(h)/(tanHalf*aspect*maxHorizontalFraction),
        along+Math.abs(vert)/(tanHalf*maxVerticalFraction));
      largestRay=Math.max(largestRay,along);
      points.push([along,h,vert]);
    }
  // The fit uses the *actual projected vertices*, not a loose sphere
  // diameter. It keeps wide wings from clipping while filling the shot.
  const distance=Math.max(requiredDepth*1.018,
    largestRay+bounds.length*.035,1);
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  let nearest=Infinity,farthest=0;
  for(const [along,h,vert] of points){
    const depth=distance-along;
    assert.ok(depth>EPS,'camera_near_plane_intersection');
    nearest=Math.min(nearest,depth);farthest=Math.max(farthest,depth);
    const x=h/(depth*tanHalf*aspect),y=vert/(depth*tanHalf);
    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
  const position={
    x:center[0]+ray[0]*distance,
    y:center[1]+ray[1]*distance,
    z:center[2]+ray[2]*distance
  };
  const projectedBounds={
    minX,maxX,minY,maxY,
    widthFraction:(maxX-minX)/2,heightFraction:(maxY-minY)/2,
    centerXFraction:(maxX+minX)/4+.5,
    centerYFraction:.5-(maxY+minY)/4
  };
  const near=Math.max(.001,nearest*.08);
  const far=Math.max(120,farthest*1.5);
  return {
    position,target:bounds.center,distance,near,far,
    projection:{type:'perspective',fovYDeg},
    width,height,angleRadians,elevationDeg,
    bounds,projectedBounds,
    constraints:{maxHorizontalFraction,maxVerticalFraction}
  };
}
