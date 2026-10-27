// Synthetic-only kinetic field for the Evercraft Mission Observatory.
// No network calls, agent actions, side effects or production data.
const SPINS=3000;
function random(seed){const x=Math.sin(seed*127.1+78.233)*43758.5453;return x-Math.floor(x);}
const particles=Array.from({length:SPINS},(_,i)=>({
  stage:i%6,
  angle:random(i*7+1)*Math.PI*2,
  radius:7+Math.pow(random(i*3+17),.7)*128,
  speed:(.012+random(i*11+6)*.085)*(i%2?-1:1),
  size:.5+random(i*5+8)*1.5,
  alpha:.25+random(i*9+7)*.69
}));

export function constellationCenter(si,centers,w,h){
  const c=centers[si],pad=w<600?.025:.09;
  return [pad*w+c[0]*w*(1-2*pad),(w<600?h*.23+h*c[1]*.62:h*.11+h*c[1]*.77)];
}

export function renderConstellations(ctx,{stages,centers,firstAt,w,h,time,current,reducedMotion,glow}){
  const spread=Math.min(w/850,1.2);
  for(let si=0;si<stages.length;si++){
    const age=current-firstAt[si];if(age<=0)continue;
    const [cx,cy]=constellationCenter(si,centers,w,h),stage=stages[si],fade=Math.min(1,age/3.1),turn=time*.05+si*1.3;
    glow(cx,cy,Math.max(72,155*spread),stage.tint,.13*fade);
    ctx.save();ctx.globalAlpha=fade;ctx.translate(cx,cy);
    for(let ring=0;ring<10;ring++){
      const radius=(22+ring*11)*spread;
      ctx.beginPath();ctx.ellipse(0,0,radius*1.42,radius*.77,turn*.3+ring*.23,ring*.49+turn,ring*.49+turn+Math.PI*1.12);
      ctx.strokeStyle=stage.tint+(ring%3===0?"34":"21");ctx.lineWidth=.6;ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    for(let j=si;j<particles.length;j+=6){
      const m=particles[j],radius=m.radius*spread,angle=m.angle+(reducedMotion?0:time*m.speed);
      const x=cx+Math.cos(angle)*radius*1.37,y=cy+Math.sin(angle)*radius*.91;
      if(j%5===si%5){
        const nx=cx+Math.cos(angle+.36)*(radius*.91)*1.37,ny=cy+Math.sin(angle+.36)*(radius*.91)*.91;
        ctx.moveTo(x,y);ctx.quadraticCurveTo(cx+(x-cx)*.85,cy+(y-cy)*.85,nx,ny);
      }
    }
    ctx.strokeStyle=stage.tint+"36";ctx.lineWidth=.6;ctx.globalAlpha=fade;ctx.stroke();ctx.globalAlpha=1;
    for(let j=si;j<particles.length;j+=6){
      const m=particles[j],radius=m.radius*spread,angle=m.angle+(reducedMotion?0:time*m.speed);
      const x=cx+Math.cos(angle)*radius*1.37,y=cy+Math.sin(angle)*radius*.91;
      const alpha=m.alpha*fade*(reducedMotion?1:.78+.22*Math.sin(time*.7+j*.4));
      ctx.fillStyle=stage.tint;ctx.globalAlpha=alpha;ctx.fillRect(x,y,m.size,m.size);
    }
    ctx.globalAlpha=1;
    if(si>0){
      const [ax,ay]=constellationCenter(si-1,centers,w,h);
      ctx.beginPath();ctx.moveTo(ax,ay);
      ctx.bezierCurveTo(ax+(cx-ax)*.6,ay-42*spread,cx-(cx-ax)*.6,cy+44*spread,cx,cy);
      ctx.strokeStyle=stage.tint+"70";ctx.lineWidth=.8;ctx.globalAlpha=.62*fade;ctx.stroke();ctx.globalAlpha=1;
    }
  }
}
