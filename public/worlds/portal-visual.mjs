// Physical sizing and near-field glow for Mossmere's authored doorway.
export const PORTAL={x:3,y:2.08,z:-10.2,frameWidth:2.28,frameHeight:3.6,
 outerX:2.36,outerY:3.28,innerX:2.14,innerY:3.02};
export function portalEffect(distance,time){
 if(!Number.isFinite(distance)||!Number.isFinite(time))return {opacity:0,pulse:1};
 const t=Math.max(0,Math.min(1,(distance-.72)/1.65));
 const smooth=t*t*(3-2*t);
 return {opacity:smooth*.94,pulse:1+.018*Math.sin(time*2.4)};
}
