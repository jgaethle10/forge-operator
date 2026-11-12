/* Evercraft observer camera motion. Owned, dependency-free, presentation-only.
 * No agent actions, model calls, telemetry, or world simulation.
 *
 * Can be used by Work Saban or an admitted Mossmere spectator adapter.
 */
(function(root){
  'use strict';
  const FIELDS=['yaw','pitch','zoom','panX','panY'];
  const BOUNDS={yaw:[-170,170],pitch:[32,74],zoom:[.35,1.42],panX:[-480,480],panY:[-360,360]};
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function clean(source,prior){
    const next={};
    for(const key of FIELDS){
      const value=source?.[key];
      if(value!==undefined&&!Number.isFinite(value))throw Error('Invalid observer camera '+key);
      next[key]=clamp(value===undefined?prior[key]:value,...BOUNDS[key]);
    }
    return next;
  }
  function create({initial,onFrame,requestFrame,cancelFrame,reducedMotion=false,response=11}={}){
    if(!initial||typeof onFrame!=='function')throw Error('Observer camera needs an initial pose and frame renderer');
    if(!Number.isFinite(response)||response<1||response>30)throw Error('Invalid damping response');
    const request=requestFrame||root.requestAnimationFrame?.bind(root);
    const cancel=cancelFrame||root.cancelAnimationFrame?.bind(root);
    if(typeof request!=='function')throw Error('Animation frame authority required');
    let current=clean(initial,{yaw:0,pitch:58,zoom:.7,panX:0,panY:0});
    let target={...current},scheduled=false,frameId=null,lastTime=null,disposed=false,suspended=false;
    onFrame({...current});
    function frame(now){
      scheduled=false;frameId=null;
      if(disposed||suspended)return;
      const dt=lastTime===null?1/60:clamp((Number(now)-lastTime)/1000,1/240,1/20);
      lastTime=Number.isFinite(now)?Number(now):0;
      const alpha=1-Math.exp(-response*dt);
      let moving=false;
      for(const key of FIELDS){
        const difference=target[key]-current[key];
        const epsilon=key==='zoom'?.00025:.025;
        if(Math.abs(difference)<=epsilon){current[key]=target[key];continue;}
        current[key]+=difference*alpha;
        moving=true;
      }
      onFrame({...current});
      if(moving)schedule();
      else lastTime=null;
    }
    function schedule(){
      if(disposed||suspended||scheduled||reducedMotion)return;
      scheduled=true;frameId=request(frame);
    }
    function setTarget(next){
      if(disposed)return;
      target=clean(next,target);
      if(reducedMotion){current={...target};onFrame({...current});return;}
      schedule();
    }
    function snap(next=target){
      if(disposed)return;
      target=clean(next,target);current={...target};lastTime=null;
      if(scheduled&&typeof cancel==='function'&&frameId!==null)cancel(frameId);
      scheduled=false;frameId=null;
      onFrame({...current});
    }
    function setSuspended(value){
      suspended=Boolean(value);
      if(suspended){
        if(scheduled&&typeof cancel==='function'&&frameId!==null)cancel(frameId);
        scheduled=false;frameId=null;lastTime=null;
      }else if(FIELDS.some(key=>Math.abs(target[key]-current[key])>1e-6))schedule();
    }
    function destroy(){
      if(scheduled&&typeof cancel==='function'&&frameId!==null)cancel(frameId);
      disposed=true;scheduled=false;frameId=null;
    }
    return {setTarget,snap,setSuspended,destroy,
      getPose:()=>({...current}),getTarget:()=>({...target}),
      isMoving:()=>scheduled};
  }
  root.EvercraftObserverCamera={create,limits:BOUNDS};
})(typeof window!=='undefined'?window:globalThis);
