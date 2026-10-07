export function snapWorldDelta(value:number,step:number){
  if(!Number.isFinite(value)) throw new Error('world_forge_snap_value_invalid');
  if(!Number.isFinite(step)||step<=0) throw new Error('world_forge_snap_step_invalid');
  const snapped=Math.round(value/step)*step;
  if(Math.abs(snapped)<1e-12) return 0;
  return Number(snapped.toFixed(9));
}

export function perspectiveVerticalFovRad(input:{
  focalLengthMm:number;
  sensorWidthMm:number;
  aspect:number;
}){
  if(!Number.isFinite(input.focalLengthMm)||input.focalLengthMm<=0){
    throw new Error('world_forge_camera_focal_length_invalid');
  }
  if(!Number.isFinite(input.sensorWidthMm)||input.sensorWidthMm<=0){
    throw new Error('world_forge_camera_sensor_width_invalid');
  }
  if(!Number.isFinite(input.aspect)||input.aspect<=0){
    throw new Error('world_forge_camera_aspect_invalid');
  }
  const sensorHeight=input.sensorWidthMm/input.aspect;
  return 2*Math.atan(sensorHeight/(2*input.focalLengthMm));
}

export function frameDistanceForScale(input:{
  scale:{x:number;y:number;z:number};
  verticalFovRad:number;
  padding?:number;
}){
  const maxScale=Math.max(
    Math.abs(input.scale.x),
    Math.abs(input.scale.y),
    Math.abs(input.scale.z),
    .01,
  );
  const radius=maxScale*Math.sqrt(3)/2;
  const padding=Math.max(1,input.padding??1.45);
  const halfFov=Math.max(.01,Math.min(Math.PI/2-.01,input.verticalFovRad/2));
  return Math.max(1,radius/Math.tan(halfFov)*padding);
}

export function axisDragWorldDelta(input:{
  pointerDx:number;
  pointerDy:number;
  axisScreenDx:number;
  axisScreenDy:number;
  axisWorldLength:number;
  snapStep:number;
}){
  const screenLength=Math.hypot(input.axisScreenDx,input.axisScreenDy);
  if(screenLength<4) throw new Error('world_forge_gizmo_axis_screen_degenerate');
  if(!Number.isFinite(input.axisWorldLength)||input.axisWorldLength<=0){
    throw new Error('world_forge_gizmo_axis_world_length_invalid');
  }
  const ux=input.axisScreenDx/screenLength;
  const uy=input.axisScreenDy/screenLength;
  const directionalPixels=input.pointerDx*ux+input.pointerDy*uy;
  const pixelsPerWorldUnit=screenLength/input.axisWorldLength;
  return snapWorldDelta(directionalPixels/pixelsPerWorldUnit,input.snapStep);
}
