/**
 * Film-native format camera presets for the same rights-classified 3D world.
 * These change the perspective and real GPU frame plan BEFORE rasterization.
 * They do not crop, reproject or upscale an already rendered widescreen image.
 */
import type {CinematicCameraTake} from './cinematic-rig.js';
import {battleshipTake} from './battleship-scene.js';
export type NativeFilmFormat='landscape'|'square'|'portrait';
export interface NativeFilmFrame {
  format:NativeFilmFormat;
  viewport:{width:number;height:number};
  aspectRatio:'16:9'|'1:1'|'9:16';
  take:CinematicCameraTake;
  framingIntent:string;
  nativeGpuFrameRequired:true;
  releaseAuthority:false;
}
export function nativeBattleshipFilmFrame(format:NativeFilmFormat):NativeFilmFrame{
  const base=battleshipTake();
  if(format==='landscape')return {
    format,viewport:{width:640,height:360},aspectRatio:'16:9',
    take:base,
    framingIntent:'establish the full battleship silhouette in the ocean with three-quarter orbit',
    nativeGpuFrameRequired:true,releaseAuthority:false
  };
  if(format==='square')return {
    format,viewport:{width:480,height:480},aspectRatio:'1:1',
    take:{...base,id:'battleship-native-square-medium',orbit:{
      radius:30,startAngleDeg:-46,endAngleDeg:-12,
      startHeight:8.2,endHeight:7.5},
      lookAtOffset:{x:0,y:3.5,z:-1.6},
      startFovYDeg:48,endFovYDeg:43},
    framingIntent:'closer naval silhouette and recognizable bridge with ocean margin',
    nativeGpuFrameRequired:true,releaseAuthority:false
  };
  if(format==='portrait')return {
    format,viewport:{width:360,height:640},aspectRatio:'9:16',
    take:{...base,id:'battleship-native-portrait-superstructure',
      orbit:{radius:26,startAngleDeg:-29,endAngleDeg:-5,
        startHeight:7.2,endHeight:9.4},
      lookAtOffset:{x:0,y:6.7,z:-4.5},
      startFovYDeg:47,endFovYDeg:44},
    framingIntent:'intentionally featured armored gunhouse bridge and radar stack, not misleading full-ship fit',
    nativeGpuFrameRequired:true,releaseAuthority:false
  };
  throw new Error('native_film_format_unsupported');
}
