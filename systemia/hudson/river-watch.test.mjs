import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const watch=fs.readFileSync(path.join(root,'public/hudson/watch/index.html'),'utf8');
const home=fs.readFileSync(path.join(root,'public/hudson/index.html'),'utf8');
const code=watch.match(/<script>([\s\S]*?)<\/script>/)?.[1];

test('river Watch is an interactive site and not an image stand-in',()=>{
 assert.match(home,/href="\.\/watch\/"/);
 assert.match(home,/Enter the Current/);
 assert.match(watch,/hudson-watch-release" content="river-current-v11-spectral-navigator"/);
 assert.match(watch,/canvas id="current"/);
 assert.match(watch,/id="explore"/);
 assert.match(watch,/id="pause"/);
 assert.match(watch,/id="next"/);
 assert.match(watch,/role="dialog"/);
 assert.match(watch,/CURRENT|RIVER|SCENIC CURRENT/);
 assert.ok(code);
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/function drawDepthVeils\(\)/);
 assert.match(code,/function drawWatershed\(/);
 assert.match(code,/function drawRivers\(/);
 assert.match(code,/function drawParticles\(/);
 assert.match(code,/function drawConfluences\(/);
 assert.match(code,/function drawTraveler\(from,to,t\)/);
 assert.match(code,/function routeAt\(/);
 assert.match(code,/canvas\.addEventListener\("click"/);
});
test('source admission is read-only, exact origin-bound and cannot forge live missions',()=>{
 assert.match(code,/\.\.\/activity\.json\?watch=/);
 assert.match(code,/credentials:"omit"/);
 assert.match(code,/cache:"no-store"/);
 assert.match(code,/source_verified!==true/);
 assert.match(code,/kind!=="public_git_source_change"/);
 assert.match(code,/e\.title!==VALID_TITLES\[e\.system\]/);
 assert.match(code,/e\.source_url===url/);
 assert.match(code,/age>=-10000&&age<120000/);
 assert.match(code,/PUBLIC GIT HISTORY · REPLAY/);
 assert.match(code,/SCENIC CURRENT · NOT A LIVE MISSION/);
 assert.match(watch,/Not live mission or AI inference telemetry/);
 assert.doesNotMatch(watch,/<img\b|<iframe\b|<audio\b|<video\b/i);
 assert.doesNotMatch(code,/fetch\(["']https?:\/\//);
});
test('continuous watch mode has an explicit long-run CPU/visibility budget',()=>{
 assert.match(code,/elapsed<33/);
 assert.match(code,/Math\.min\(\.08,elapsed\/1000\)/);
 assert.match(code,/document\.hidden/);
 assert.match(code,/prefers-reduced-motion: reduce/);
 assert.match(code,/cancelAnimationFrame\(frame\)/);
 assert.match(code,/setPause\(!paused\)/);
 assert.match(code,/if\(!paused\)frame=requestAnimationFrame\(loop\)/);
 assert.doesNotMatch(code,/Math\.random\(\)/);
});
test('v7 scenic junctions branch only toward their current destination',()=>{
 assert.match(code,/function drawDepthVeils\(\)/);
 assert.match(code,/function drawFoldingWake\(trip\)/);
 assert.match(code,/function drawBranchingSurge\(trip\)/);
 assert.match(code,/drawBranchingSurge\(trip\);drawFoldingWake\(trip\)/);
 assert.match(code,/edge\.warpedPoints\|\|edge\.points/);
 assert.match(code,/var wakeBands=Array\.from\(\{length:3\}/);
 assert.match(code,/left=wakeBands\[band\]\.left,right=wakeBands\[band\]\.right/);
 assert.doesNotMatch(code,/left\.push\(/);
 const start=code.indexOf('function junctionExcitation(trip,key){');
 const end=code.indexOf('function drawFoldingWake(trip){',start);
 const bloom=new vm.Script(code.slice(start,end)+';junctionExcitation')
  .runInNewContext({Math,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
 assert.equal(bloom({to:'hudson',t:.81},'saban'),0);
 assert.equal(bloom({to:'hudson',t:.20},'hudson'),0);
 assert.ok(bloom({to:'hudson',t:.80},'hudson')>.5);
 assert.equal(bloom({to:'hudson',t:1},'hudson'),0);
 for(let t=-1;t<=2;t+=.01){
  const x=bloom({to:'hudson',t},'hudson');
  assert.ok(Number.isFinite(x)&&x>=0&&x<=1);
 }
});
test('film-mode is reversible and remains evidence honest',()=>{
 assert.match(watch,/body\.film-mode #story,body\.film-mode #story-sub/);
 assert.match(watch,/body\.film-mode \.facts,body\.film-mode #receipt,body\.film-mode #next/);
 assert.match(watch,/body\.film-mode #film:hover,body\.film-mode #film:focus-visible/);
 assert.match(watch,/Immersive Watch: scenery occupies the canvas/);

 assert.match(watch,/id="film" type="button" aria-pressed="false"/);
 assert.match(watch,/body\.film-mode/);
 assert.match(code,/function setFilmMode\(on\)/);
 assert.match(code,/searchParams\.set\("film","1"\)/);
 assert.match(code,/searchParams\.delete\("film"\)/);
 assert.match(code,/get\("film"\)==="1"/);
 assert.match(watch,/Not live mission or AI inference telemetry/);
});
test('river topology has seven named confluences and multi-channel currents',()=>{
 const keys=['hudson','systemia','kaidance','discovery','evidence','raven','saban'];
 for(const key of keys)assert.match(code,new RegExp(key+':\\{name:'));
 assert.match(code,/var EDGES=/);
 assert.match(code,/createEdge\(e\[0\],e\[1\],e\[2\]\)/);
 assert.match(code,/drawWatershed\(field\);drawRivers\(\);drawParticles\(dt\);drawConfluences\(\)/);
});

test('spectral ship stays attached to the canonical current and points down its tangent',()=>{
 assert.match(code,/function shipPathPose\(from,to,t\)/);
 assert.match(code,/var pos=locate\(from,to,t\)/);
 assert.match(code,/var angle=Math\.atan2\(dy,dx\)/);
 assert.match(code,/ctx\.translate\(pose\.x,pose\.y\)/);
 assert.match(code,/ctx\.rotate\(pose\.angle\)/);
 assert.doesNotMatch(code,/var drawX=clamp\(/);
 const a=code.indexOf('function shipPathPose(from,to,t){');
 const b=code.indexOf('function drawMistySail(',a);
 const pose=new vm.Script(code.slice(a,b)+';shipPathPose').runInNewContext({
  Math,width:390,height:844,clamp:(v,l,h)=>Math.max(l,Math.min(h,v)),
  locate:(_a,_b,v)=>({x:47+v*290,y:205+v*426})
 });
 for(const v of [.02,.15,.5,.83,.97]){
  const s=pose('discovery','hudson',v);
  assert.ok(Math.abs(s.x-(47+v*290))<1e-9);
  assert.ok(Math.abs(s.y-(205+v*426))<1e-9);
  assert.ok(Math.abs(s.angle-Math.atan2(426,290))<.001);
  assert.ok(s.size>=9&&s.size<=32);
  const c=Math.min(s.x,390-s.x,s.y,844-s.y);
  assert.ok(s.size*2.90<=c+.01);
 }
});
test('Spectral Navigator adds dimensional cloud sails, reflective carved keel and prismatic stars',()=>{
 assert.match(code,/Spectral Navigator v11/);
 assert.match(code,/function drawMistySail\(x,span,wind,tint\)/);
 assert.match(code,/function drawShipStardustWake\(trip\)/);
 assert.match(code,/for\(var cloud=0;cloud<19;cloud\+\+\)/);
 assert.match(code,/for\(var star=0;star<42;star\+\+\)/);
 assert.match(code,/drawMistySail\(-\.07,1\.64/);
 assert.match(code,/Rigging lines connect the upper cloud spires/);
 assert.match(code,/A carved aftcastle and starlit deck/);
 assert.match(code,/for\(var prong=0;prong<9;prong\+\+\)/);
 assert.match(code,/Three wind-filled aurora sails, mounted on ONE side/);
 assert.match(code,/Crescent keel/);
 assert.match(code,/drawFoldingWake\(trip\);drawShipStardustWake\(trip\)/);
 assert.match(code,/drawTraveler\(trip\.from,trip\.to,\.04\+trip\.t\*\.92\)/);
 assert.doesNotMatch(code,/function drawRoyalSail\(/);
});
test('sparkle wake traces the existing water, not fake activity',()=>{
 const a=code.indexOf('function drawShipStardustWake(trip){');
 const b=code.indexOf('function drawTraveler(from,to,t){',a);
 assert.ok(a>=0&&b>a);
 const w=code.slice(a,b);
 assert.match(w,/shipPathPose\(trip\.from,trip\.to,front\)/);
 assert.match(w,/locate\(trip\.from,trip\.to,/);
 assert.match(w,/for\(var thread=0;thread<3;thread\+\+\)/);
 assert.match(w,/for\(var star=0;star<23;star\+\+\)/);
 assert.doesNotMatch(w,/Math\.random\(\)/);
});
test('v8 currents and confluences have different silhouettes and optical depth',()=>{
 assert.match(code,/Braided bands instead of hairline pipes/);
 assert.match(code,/function drawConfluences\(\)/);
 assert.match(code,/Each confluence is a suspended deep-water lens/);
 assert.match(code,/Large atmospheric wells give every basin its own volume/);
 assert.match(code,/ctx\.setLineDash\(\[2,14,1,38\]\)/);
 assert.match(code,/glass\.addColorStop\(0,"rgba\(1,6,20,\.99\)"\)/);
 assert.match(code,/var facets=central\?11:7/); // design contract: if changed, update acceptance
 assert.match(code,/var wells=\[\[/);
 assert.doesNotMatch(code,/for\(var ring=0;ring<7;ring\+\+\)/);
});
test('traveler ribbons evolve in length, twist, transparency and confluence behavior',()=>{
 const begin=code.indexOf('function presencePulse(time){');
 const end=code.indexOf('function drawPresenceRipple(',begin);
 assert.ok(begin>=0&&end>begin);
 const forms=new vm.Script(code.slice(begin,end)+';({presencePulse,travelerState,ribbonForm})')
  .runInNewContext({Math,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
 const quiet=forms.travelerState(2,.25),arrival=forms.travelerState(2,.97);
 assert.ok(arrival.opening>quiet.opening+.32,'arrival unfolds rather than circling mindlessly');
 assert.ok(arrival.scan>.25,'arrival briefly examines a confluence');
 assert.ok(quiet.scan===0,'no scanning at the start of every current');
 assert.ok(forms.travelerState(12,.09).integrity<forms.travelerState(12,.52).integrity,
  'traveler assembles from the water after departure');
 assert.ok(forms.travelerState(12,.98).integrity<forms.travelerState(12,.52).integrity,
  'traveler unravels near a confluence rather than freezing as a logo');
 const early=Array.from({length:5},(_,i)=>forms.ribbonForm(2,i,quiet));
 const late=Array.from({length:5},(_,i)=>forms.ribbonForm(14,i,arrival));
 assert.ok(early.some((f,i)=>Math.abs(f.length-late[i].length)>.18),'ribbons actually morph');
 assert.ok(early.some((f,i)=>Math.abs(f.angle-late[i].angle)>.20),'ribbons rotate unevenly');
 for(const f of [...early,...late]){
  assert.ok(f.length>.4&&f.length<2);
  assert.ok(f.width>.18&&f.width<.62);
  assert.ok(f.opacity>=.20&&f.opacity<=.78);
  assert.ok(Number.isFinite(f.bend)&&Number.isFinite(f.angle));
 }
 const atPhone=390*.072;
 assert.ok(atPhone>=24&&atPhone<=32,'phone-size spectral ship must fit the path');
});
test('slow river camera moves the whole field and tap positions use its inverse',()=>{
 const start=code.indexOf('function riverCamera(){');
 const end=code.indexOf('function paint(dt){',start);
 assert.ok(start>=0&&end>start);
 const fn=new vm.Script(code.slice(start,end)+';riverCamera').runInNewContext({Math,width:390,height:844,clock:47});
 const c=fn();
 assert.ok(Math.abs(c.dx)<6,'phone river drift remains subtle');
 assert.ok(Math.abs(c.dy)<8,'phone vertical drift remains subtle');
 assert.ok(c.zoom>1&&c.zoom<1.04,'avoid clipping peripheral labels');
 const point={x:83,y:329};
 const screen={x:(point.x-390/2+c.dx)*c.zoom+390/2,y:(point.y-844/2+c.dy)*c.zoom+844/2};
 const recovered={x:(screen.x-390/2)/c.zoom+390/2-c.dx,y:(screen.y-844/2)/c.zoom+844/2-c.dy};
 assert.ok(Math.abs(recovered.x-point.x)<1e-9);
 assert.ok(Math.abs(recovered.y-point.y)<1e-9);
 assert.match(code,/ctx\.translate\(-width\/2\+camera\.dx,-height\/2\+camera\.dy\)/);
 assert.match(code,/x=\(ev\.clientX-rect\.left-width\/2\)\/camera\.zoom\+width\/2-camera\.dx/);
 assert.match(code,/ctx\.restore\(\);[\s\n]*\}/);
 assert.match(code,/This is ambient scenery, not evidence of a new mission/);
});

test('Presence has an irregular multi-stage pulse rather than a blinking light',()=>{
 const begin=code.indexOf('function presencePulse(time){'),end=code.indexOf('function travelerState(',begin);
 assert.ok(begin>=0&&end>begin);
 const pulse=new vm.Script(code.slice(begin,end)+';presencePulse').runInNewContext({Math});
 const timeline=Array.from({length:3501},(_,i)=>({t:i*.02,...pulse(i*.02)}));
 const peaks=timeline.filter((p,i)=>i>0&&i<timeline.length-1&&p.primary>timeline[i-1].primary&&p.primary>=timeline[i+1].primary&&p.primary>.82);
 assert.ok(peaks.length>=10,'visible repeating pulse peaks for long-running Watch');
 const intervals=peaks.slice(1).map((p,i)=>p.t-peaks[i].t);
 assert.ok(Math.max(...intervals)-Math.min(...intervals)>.45,'beats must be irregular, not a metronome');
 assert.ok(Math.min(...intervals)>3,'long rests give the Presence mystery');
 assert.ok(timeline.some(p=>p.secondary>.40),'occasional second beat is perceptible');
 assert.ok(timeline.some(p=>p.energy<.005),'silence between pulses remains possible');
 for(const p of timeline){
  assert.ok(Number.isFinite(p.energy)&&p.energy>=0&&p.energy<=1);
  assert.ok(p.phase>=0&&p.phase<Math.PI*2);
 }
});
test('pulse spreads through prismatic ribbons and the river, without a fake live-heartbeat claim',()=>{
 assert.match(code,/function drawPresenceRipple\(from,to,t\)/);
 assert.match(code,/presencePulse\(time-\(layer%4\)\*\.19\)/);
 assert.match(code,/width:\.19\+state\.opening\*\.27\+delay\.energy\*\.11/);
 assert.match(code,/var nearness=Math\.pow\(clamp\(\(t-\.76\)\/\.24,0,1\),2\)/);
 assert.match(code,/drawPresenceRipple\(trip\.from,trip\.to,\.04\+trip\.t\*\.92\);drawTraveler\(trip\.from,trip\.to,\.04\+trip\.t\*\.92\)/);
 assert.match(code,/This is visual choreography, not AI life/);
 const a=code.indexOf('function presencePulse(time){'),b=code.indexOf('function drawPresenceRipple(',a);
 const forms=new vm.Script(code.slice(a,b)+';({presencePulse,travelerState,ribbonForm})')
  .runInNewContext({Math,clamp:(x,a,b)=>Math.max(a,Math.min(b,x))});
 for(const t of [0,3,14,34]){
  const state=forms.travelerState(t,.78);
  assert.ok(state.opening>=.15&&state.opening<=1);
  assert.ok(state.pulse>=0&&state.pulse<=1);
  const ribbon=forms.ribbonForm(t,2,state);
  assert.ok(Number.isFinite(ribbon.length));
 }
});
test('Presence pulse actually reshapes local river geometry and leaves far waters alone',()=>{
 const begin=code.indexOf('function presenceCurrentField(trip){');
 const end=code.indexOf('function strokeSamples(points,offset){',begin);
 assert.ok(begin>=0&&end>begin,'pure water geometry functions present');
 const renderers=new vm.Script(code.slice(begin,end)+';({presenceCurrentField,deflectCurrent,shapeRiverChannels})')
   .runInNewContext({
    Math,clock:11,width:390,
    locate:()=>({x:200,y:350}),clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
    presencePulse:()=>({energy:.86}),
    scene:{edges:[]}
   });
 const field=renderers.presenceCurrentField({from:'discovery',to:'hudson',t:.82});
 assert.ok(field.radius>=67&&field.radius<=90);
 assert.ok(field.strength>8&&field.strength<25);
 const near=renderers.deflectCurrent(235,350,field);
 assert.ok(Math.hypot(near.x-235,near.y-350)>4,'local water bends visibly on an iPhone');
 assert.ok(Math.hypot(near.x-235,near.y-350)<24,'no violent jump');
 const far=renderers.deflectCurrent(750,600,field);
 assert.equal(far.x,750);assert.equal(far.y,600);
 for(let dx=-200;dx<=200;dx+=17){
  for(let dy=-200;dy<=200;dy+=19){
   const p=renderers.deflectCurrent(200+dx,350+dy,field);
   assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y),'field is finite');
   assert.ok(Math.hypot(p.x-(200+dx),p.y-(350+dy))<=27,'deformation bounded');
  }
 }
 const quiet=renderers.deflectCurrent(235,350,{...field,strength:2.4});
 assert.ok(Math.hypot(near.x-235,near.y-350)>2*Math.hypot(quiet.x-235,quiet.y-350),
  'visual response becomes substantially stronger on the pulse');
});
test('atmospheric streamlines, channel lanes and light particles share one deformed river',()=>{
 assert.match(code,/function drawWatershed\(field\)/);
 assert.match(code,/var curved=deflectCurrent\(x,y,field\)/);
 assert.match(code,/var e=scene\.edges\[i\],rgb=e\.color,major=i<6,water=e\.warpedPoints\|\|e\.points/);
 assert.match(code,/strokeSamples\(water,shift\)/);
 assert.match(code,/var water=e\.warpedPoints\|\|e\.points/);
 assert.match(code,/var trip=routeAt\(\),field=presenceCurrentField\(trip\)/);
 assert.match(code,/shapeRiverChannels\(field\)/);
 assert.match(code,/drawWatershed\(field\);drawRivers\(\);drawParticles\(dt\);drawConfluences\(\)/);
 const idx=code.indexOf('function deflectCurrent(x,y,field){');
 const stop=code.indexOf('function strokeSamples(',idx);
 const context={
  Math,scene:{edges:[{points:[{x:200,y:350},{x:225,y:360},{x:250,y:370}]}]}
 };
 const f=new vm.Script(code.slice(idx,stop)+';({shapeRiverChannels})').runInNewContext(context);
 const original=context.scene.edges[0].points.map(x=>({x:x.x,y:x.y}));
 const field={x:220,y:360,radius:80,strength:12,swirl:.21};
 f.shapeRiverChannels(field);
 const edge=context.scene.edges[0];
 assert.equal(edge.warpedPoints.length,3);
 assert.ok(edge.warpedPoints.some((p,i)=>Math.hypot(p.x-edge.points[i].x,p.y-edge.points[i].y)>1));
 const ref=edge.warpedPoints;
 f.shapeRiverChannels({...field,strength:3});
 assert.equal(edge.warpedPoints,ref,'reuse displacement array rather than allocate per frame');
 assert.deepEqual(edge.points.map(x=>({x:x.x,y:x.y})),original,'canonical topology remains unchanged for touch and explorer travel');
 assert.doesNotMatch(code,/fetch\(["']https?:\/\//);
});
