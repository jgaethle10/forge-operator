/* Evercraft Work Saban: visitor-controlled, non-autonomous office tour.
 * Positions are authored camera viewpoints. They are not agent actions,
 * mission trace events, physical pathfinding, or verified worker travel.
 * Pure data and calculation so the same tour can be tested without a browser.
 */
(function(root){
  'use strict';
  const STOPS=Object.freeze([
    {id:'entry',name:'Studio entrance',x:530,y:520,yaw:-14,pitch:43,wideZoom:.62,phoneZoom:.35},
    {id:'mission',name:'Mission control',x:242,y:245,yaw:-18,pitch:39,wideZoom:.85,phoneZoom:.47,agent:'director'},
    {id:'data',name:'Data lab',x:588,y:239,yaw:-4,pitch:36,wideZoom:.88,phoneZoom:.48,agent:'analyst'},
    {id:'comms',name:'Communications',x:934,y:241,yaw:12,pitch:37,wideZoom:.87,phoneZoom:.48,agent:'writer'},
    {id:'table',name:'Community table',x:530,y:342,yaw:-5,pitch:41,wideZoom:.72,phoneZoom:.36},
    {id:'design',name:'Design studio',x:242,y:580,yaw:-13,pitch:39,wideZoom:.88,phoneZoom:.48,agent:'designer'},
    {id:'quality',name:'Quality assurance',x:587,y:580,yaw:-2,pitch:39,wideZoom:.87,phoneZoom:.48,agent:'auditor'},
    {id:'delivery',name:'Delivery',x:934,y:580,yaw:10,pitch:39,wideZoom:.87,phoneZoom:.48,agent:'coordinator'}
  ]);
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function pose(index,{compact=false}={}){
    if(!Number.isInteger(index))throw Error('Studio tour index must be an integer');
    const p=STOPS[((index%STOPS.length)+STOPS.length)%STOPS.length];
    const zoom=compact?p.phoneZoom:p.wideZoom;
    return {
      id:p.id,label:p.name,agent_id:p.agent||null,
      camera:{
        yaw:p.yaw,pitch:p.pitch,zoom,
        panX:clamp(Math.round((530-p.x)*zoom),-480,480),
        panY:clamp(Math.round((340-p.y)*zoom),-360,360)
      }
    };
  }
  function step(index,delta){
    if(!Number.isInteger(index)||!Number.isInteger(delta)||Math.abs(delta)!==1)
      throw Error('Studio tour step must be one adjacent waypoint');
    return (index+delta+STOPS.length)%STOPS.length;
  }
  root.EvercraftStudioTour=Object.freeze({
    pose,step,length:STOPS.length,labels:STOPS.map(x=>x.name)
  });
})(typeof window!=='undefined'?window:globalThis);
