/* Evercraft Work Saban / observer-only scene framing.
 * Uses the actual SCENE width, not device window width. No agent simulation,
 * mission events, network requests or private state changes.
 */
(function(root){
  'use strict';
  const MIN=.20,MAX=.78;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function fit({width,height}={}){
    if(!finite(width)||!finite(height)||width<=0||height<=0)
      throw Error('Work Saban framing needs measured positive scene dimensions');
    // Studio shell is 1060 × 680 plus projecting character heads and props.
    // Factor in perspective/hats and leave a gutter around the six stations.
    const horizontal=(Math.max(80,width-26))/(1060*1.20);
    const vertical=(Math.max(120,height-58))/(680*1.25);
    const zoom=clamp(Math.min(horizontal,vertical),MIN,MAX);
    return Object.freeze({yaw:-9,pitch:61,zoom,panX:0,panY:clamp(Math.round(height*.12),24,68)});
  }
  root.EvercraftOfficeFraming=Object.freeze({fit,MIN,MAX});
})(typeof window!=='undefined'?window:globalThis);
