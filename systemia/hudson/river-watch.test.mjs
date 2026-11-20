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
 assert.match(watch,/hudson-watch-release" content="river-current-v5-responsive-watershed"/);
 assert.match(watch,/canvas id="current"/);
 assert.match(watch,/id="explore"/);
 assert.match(watch,/id="pause"/);
 assert.match(watch,/id="next"/);
 assert.match(watch,/role="dialog"/);
 assert.match(watch,/CURRENT|RIVER|SCENIC CURRENT/);
 assert.ok(code);
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/function drawWatershed\(/);
 assert.match(code,/function drawRivers\(/);
 assert.match(code,/function drawParticles\(/);
 assert.match(code,/function drawConfluences\(/);
 assert.match(code,/function drawAnomaly\(from,to,t\)/);
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
test('river topology has seven named confluences and multi-channel currents',()=>{
 const keys=['hudson','systemia','kaidance','discovery','evidence','raven','saban'];
 for(const key of keys)assert.match(code,new RegExp(key+':\\{name:'));
 assert.match(code,/var EDGES=/);
 assert.match(code,/createEdge\(e\[0\],e\[1\],e\[2\]\)/);
 assert.match(code,/drawWatershed\(field\);drawRivers\(\);drawParticles\(dt\);drawConfluences\(\)/);
});

test('the watcher becomes an ambiguous changing presence, not a recognizable bug',()=>{
 assert.match(code,/function anomalyFilament\(time,index\)/);
 assert.match(code,/function anomalyForm\(time\)/);
 assert.match(code,/function drawAnomaly\(from,to,t\)/);
 assert.match(code,/for\(var thread=0;thread<9;thread\+\+\)/);
 assert.match(code,/ctx\.globalCompositeOperation="source-over"/);
 assert.match(code,/dark center is deliberate negative space/i);
 assert.match(code,/faint delayed echo/);
 assert.doesNotMatch(code,/function explorerLegGeometry/);
 assert.doesNotMatch(code,/function spider\(/);
 assert.doesNotMatch(code,/for\(var leg=0;/);
 assert.doesNotMatch(code,/for\(var ray=0;/);
 assert.doesNotMatch(code,/ctx\.shadowBlur=14/);
 assert.match(watch,/river-current-v5-responsive-watershed/);
});
test('probing filaments fold, disappear and return without fixed mirrored anatomy',()=>{
 const a=code.indexOf('function presencePulse(time){');
 const b=code.indexOf('function drawAnomaly(',a);
 assert.ok(a>=0&&b>a);
 const forms=new vm.Script(code.slice(a,b)+';({anomalyFilament,anomalyForm})').runInNewContext({Math});
 const snapshot=(at)=>Array.from({length:9},(_,i)=>forms.anomalyFilament(at,i));
 const beginning=snapshot(0),later=snapshot(12.3);
 assert.ok(beginning.some((p,i)=>Math.abs(p.opacity-later[i].opacity)>.13),'filament brightness changes');
 assert.ok(beginning.some((p,i)=>Math.abs(p.reach-later[i].reach)>.23),'filament lengths change');
 for(const p of [...beginning,...later]){
  assert.ok(p.reach>=.47&&p.reach<=1.70,'reach capped');
  assert.ok(p.opacity>=.055&&p.opacity<=.516,'appearance bounded');
  assert.ok(Number.isFinite(p.angle)&&Number.isFinite(p.curl));
 }
 const first=forms.anomalyForm(0),second=forms.anomalyForm(20);
 assert.notEqual(first.rotation,second.rotation);
 assert.notEqual(first.fold,second.fold);
 assert.ok(first.aperture>=.14&&first.aperture<=.70);
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
 const begin=code.indexOf('function presencePulse(time){'),end=code.indexOf('function anomalyFilament(',begin);
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
test('pulse ripples into the water and responds through staggered filaments',()=>{
 assert.match(code,/function drawPresenceRipple\(from,to,t\)/);
 assert.match(code,/presencePulse\(time-\(index%5\)\*\.12\)/);
 assert.match(code,/reach:\.47\+unfold\*\(1\.04\+delayed\.energy\*\.18\)/);
 assert.match(code,/ctx\.scale\(1\+form\.pulse\*\.07,1\+form\.pulse\*\.095\)/);
 assert.match(code,/var nearness=Math\.pow\(clamp\(\(t-\.76\)\/\.24,0,1\),2\)/);
 assert.match(code,/drawPresenceRipple\(trip\.from,trip\.to,\.04\+trip\.t\*\.92\);drawAnomaly\(trip\.from,trip\.to,\.04\+trip\.t\*\.92\)/);
 assert.match(code,/deterministic visual choreography, never a live source\/mission heartbeat/);
 const a=code.indexOf('function presencePulse(time){'),b=code.indexOf('function drawPresenceRipple(',a);
 const f=new vm.Script(code.slice(a,b)+';({presencePulse,anomalyFilament,anomalyForm})').runInNewContext({Math});
 for(let i=0;i<9;i++){
  for(const t of [0,.4,4.2,13.4,28.5]){
   const filament=f.anomalyFilament(t,i);
   assert.ok(filament.reach>=.47&&filament.reach<=1.70);
   assert.ok(filament.opacity>=.055&&filament.opacity<=.50);
   assert.ok(Number.isFinite(filament.angle));
  }
 }
 for(const t of [0,3,14,34]){
  const form=f.anomalyForm(t);
  assert.ok(form.aperture>=.14&&form.aperture<=.70);
  assert.ok(form.pulse>=0&&form.pulse<=1);
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
