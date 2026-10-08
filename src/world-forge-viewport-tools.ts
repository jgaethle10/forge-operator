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


export function snapWorldAngle(valueDeg:number,stepDeg:number){
  if(!Number.isFinite(valueDeg)) throw new Error('world_forge_snap_angle_invalid');
  if(!Number.isFinite(stepDeg)||stepDeg<=0) throw new Error('world_forge_snap_angle_step_invalid');
  let snapped=Math.round(valueDeg/stepDeg)*stepDeg;
  snapped%=360;
  if(snapped>180) snapped-=360;
  if(snapped<=-180) snapped+=360;
  if(Math.abs(snapped)<1e-12) return 0;
  return Number(snapped.toFixed(9));
}

export function screenRotationDeltaDeg(input:{
  startX:number;
  startY:number;
  currentX:number;
  currentY:number;
  centerX:number;
  centerY:number;
  snapDeg:number;
}){
  const startRadius=Math.hypot(
    input.startX-input.centerX,
    input.startY-input.centerY,
  );
  const currentRadius=Math.hypot(
    input.currentX-input.centerX,
    input.currentY-input.centerY,
  );
  if(startRadius<4||currentRadius<4){
    throw new Error('world_forge_rotation_gizmo_radius_degenerate');
  }

  const start=Math.atan2(
    input.startY-input.centerY,
    input.startX-input.centerX,
  );
  const current=Math.atan2(
    input.currentY-input.centerY,
    input.currentX-input.centerX,
  );
  let delta=(current-start)*180/Math.PI;
  while(delta>180) delta-=360;
  while(delta<=-180) delta+=360;
  return snapWorldAngle(delta,input.snapDeg);
}

export function axisDragScaleValue(input:{
  pointerDx:number;
  pointerDy:number;
  axisScreenDx:number;
  axisScreenDy:number;
  startScale:number;
  snapStep:number;
}){
  const screenLength=Math.hypot(input.axisScreenDx,input.axisScreenDy);
  if(screenLength<4) throw new Error('world_forge_scale_axis_screen_degenerate');
  if(!Number.isFinite(input.startScale)||input.startScale<=0){
    throw new Error('world_forge_scale_start_invalid');
  }
  if(!Number.isFinite(input.snapStep)||input.snapStep<=0){
    throw new Error('world_forge_scale_snap_invalid');
  }

  const ux=input.axisScreenDx/screenLength;
  const uy=input.axisScreenDy/screenLength;
  const directionalPixels=input.pointerDx*ux+input.pointerDy*uy;
  const sensitivity=Math.max(1,Math.abs(input.startScale));
  const raw=input.startScale+(directionalPixels/screenLength)*sensitivity;
  const snapped=Math.round(raw/input.snapStep)*input.snapStep;
  return Number(Math.max(.01,snapped).toFixed(9));
}

export type WorldForgeViewportViewMode='orbit'|'camera';

export function resolveWorldForgeViewportViewMode(input:{
  requestedMode:WorldForgeViewportViewMode;
  runtimeUnderlayActive:boolean;
  hasActiveCamera:boolean;
}){
  if(input.runtimeUnderlayActive&&input.hasActiveCamera){
    return {
      mode:'camera' as const,
      runtimeCameraLocked:true,
    };
  }
  return {
    mode:input.requestedMode,
    runtimeCameraLocked:false,
  };
}
