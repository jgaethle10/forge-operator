/** FIRST-CONTACT-001 | Rectified camera pixel -> local ENU bearing.
 *
 * Camera axes: +x right, +y down, +z optical forward.
 * ENU axes: +x East, +y North, +z Up.
 * Rotation has ROWS indexed by ENU axis and COLUMNS by camera axis.
 *
 * This is mathematical conversion of operator-supplied intrinsics/extrinsics.
 * No camera capture, distortion removal, calibration validation, synchronization,
 * or physical target authentication occurs here.
 */
const finite=(name,v)=>{
  if(typeof v!=="number"||!Number.isFinite(v))throw new TypeError(name+" must be finite");
  return v;
};
const positive=(name,v)=>{
  finite(name,v);
  if(v<=0)throw new RangeError(name+" must be positive");
  return v;
};
const coordinate=(name,p)=>{
  if(!p||typeof p!=="object")throw new TypeError(name+" must be 3D ENU coordinate");
  return {x:finite(name+".x",p.x),y:finite(name+".y",p.y),z:finite(name+".z",p.z)};
};
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const cross=(a,b)=>[
  a[1]*b[2]-a[2]*b[1],
  a[2]*b[0]-a[0]*b[2],
  a[0]*b[1]-a[1]*b[0]
];
const radToDeg=r=>r*180/Math.PI;
function cameraInfo(camera){
  if(!camera||typeof camera!=="object")throw new TypeError("camera calibration required");
  const width=camera.imageWidthPixels,height=camera.imageHeightPixels;
  if(!Number.isInteger(width)||!Number.isInteger(height)||
     width<2||height<2||width>16384||height>16384)
    throw new RangeError("image dimensions must be 2..16384 integer pixels");
  const fx=positive("fxPixels",camera.fxPixels),fy=positive("fyPixels",camera.fyPixels);
  const cx=finite("cxPixels",camera.cxPixels),cy=finite("cyPixels",camera.cyPixels);
  const skew=camera.skewPixels===undefined?0:finite("skewPixels",camera.skewPixels);
  if(cx<0||cx>width-1||cy<0||cy>height-1)
    throw new RangeError("principal point must lie on the rectified image");
  if(camera.rectifiedImage!==true)
    throw new RangeError("rectifiedImage must be explicitly true: uncorrected lens distortion unsupported");
  const m=camera.rotationCameraToEnu;
  if(!Array.isArray(m)||m.length!==3||
     m.some(row=>!Array.isArray(row)||row.length!==3))
    throw new TypeError("rotationCameraToEnu must be a 3x3 matrix");
  const R=m.map((row,i)=>row.map((v,j)=>finite("rotation["+i+"]["+j+"]",v)));
  const col=(j)=>[R[0][j],R[1][j],R[2][j]];
  const tolerance=1e-5;
  for(let i=0;i<3;i++){
    for(let j=0;j<3;j++){
      if(Math.abs(dot(col(i),col(j))-(i===j?1:0))>tolerance)
        throw new RangeError("camera-to-ENU rotation must be orthonormal");
    }
  }
  if(Math.abs(dot(cross(col(0),col(1)),col(2))-1)>tolerance)
    throw new RangeError("camera-to-ENU rotation must be right-handed, determinant +1");
  if(typeof camera.sensorId!=="string"||!camera.sensorId.trim()||camera.sensorId.length>100)
    throw new RangeError("bounded camera sensorId required");
  return {R,fx,fy,cx,cy,skew,width,height,
    sensorId:camera.sensorId,
    observerMeters:coordinate("observerMeters",camera.observerMeters)};
}
function worldFromCam(R,v){
  return [
    R[0][0]*v[0]+R[0][1]*v[1]+R[0][2]*v[2],
    R[1][0]*v[0]+R[1][1]*v[1]+R[1][2]*v[2],
    R[2][0]*v[0]+R[2][1]*v[1]+R[2][2]*v[2]
  ];
}
function camFromWorld(R,v){
  return [
    R[0][0]*v[0]+R[1][0]*v[1]+R[2][0]*v[2],
    R[0][1]*v[0]+R[1][1]*v[1]+R[2][1]*v[2],
    R[0][2]*v[0]+R[1][2]*v[1]+R[2][2]*v[2]
  ];
}
/** Pixel center (u,v) -> a self-attested bearing suitable for two-view geometry. */
export function rectifiedPixelToEnuBearing({camera,detection}={}){
  const c=cameraInfo(camera);
  if(!detection||typeof detection!=="object")throw new TypeError("detection required");
  const u=finite("uPixels",detection.uPixels);
  const v=finite("vPixels",detection.vPixels);
  if(u<0||u>c.width-1||v<0||v>c.height-1)
    throw new RangeError("detection outside rectified image bounds");
  const timestamp=detection.captureEpochMilliseconds;
  if(!Number.isSafeInteger(timestamp)||timestamp<0)
    throw new RangeError("calibrated nonnegative integer capture epoch milliseconds required");
  const yy=(v-c.cy)/c.fy;
  const xx=((u-c.cx)-c.skew*yy)/c.fx;
  const d=worldFromCam(c.R,[xx,yy,1]);
  const length=Math.hypot(...d);
  const east=d[0]/length,north=d[1]/length,up=d[2]/length;
  return {
    sensorId:c.sensorId,
    captureEpochMilliseconds:timestamp,
    observerMeters:c.observerMeters,
    azimuthDegrees:(radToDeg(Math.atan2(east,north))+360)%360,
    elevationDegrees:radToDeg(Math.asin(Math.max(-1,Math.min(1,up)))),
    conversion:"rectified_pixel_pinhole_calibration_operator_asserted",
    calibrationIndependentlyVerified:false,
    sourceMediaAuthenticated:false
  };
}
/** Project a known ENU point into the supplied rectified model for test design. */
export function projectEnuPointToRectifiedPixel({camera,targetMeters}={}){
  const c=cameraInfo(camera);
  const t=coordinate("targetMeters",targetMeters);
  const delta=[
    t.x-c.observerMeters.x,
    t.y-c.observerMeters.y,
    t.z-c.observerMeters.z
  ];
  const [x,y,z]=camFromWorld(c.R,delta);
  if(z<=0)throw new RangeError("target not in front of camera optical plane");
  const xx=x/z,yy=y/z;
  const u=c.fx*xx+c.skew*yy+c.cx, v=c.fy*yy+c.cy;
  if(u<0||u>c.width-1||v<0||v>c.height-1)
    throw new RangeError("target projects outside rectified image");
  return {uPixels:u,vPixels:v,
    conversion:"synthetic_pinhole_projection_not_real_image_detection"};
}
