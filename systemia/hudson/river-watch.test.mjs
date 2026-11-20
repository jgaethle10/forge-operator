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
 assert.match(watch,/hudson-watch-release" content="river-current-v2-jointed-explorer"/);
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
 assert.match(code,/function spider\(from,to,t\)/);
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
 assert.match(code,/drawWatershed\(\);drawRivers\(\);drawParticles\(dt\);drawConfluences\(\)/);
});

test('the explorer has eight short jointed legs rather than a straight trailing filament fan',()=>{
 assert.match(code,/function explorerLegGeometry\(size,leg,phase\)/);
 assert.match(code,/for\(var leg=0;leg<8;leg\+\+\)/);
 assert.match(code,/quadraticCurveTo\(.*g\.kneeX,g\.kneeY\)/);
 assert.match(code,/quadraticCurveTo\(.*g\.footX,g\.footY\)/);
 assert.doesNotMatch(code,/for\(var ray=0;ray<26;ray\+\+\)/);
 assert.doesNotMatch(code,/for\(var leg=0;leg<12;leg\+\+\)/);
 const i=code.indexOf('function explorerLegGeometry(');
 const j=code.indexOf('function spider(',i);
 assert.ok(i>=0&&j>i);
 const legFn=new vm.Script(code.slice(i,j)+';explorerLegGeometry').runInNewContext({Math});
 for(let leg=0;leg<8;leg++){
  const g=legFn(20,leg,.43);
  assert.equal(g.side,leg%2===0?-1:1);
  assert.ok(Math.abs(g.footX)<=25,'front/rear foot reach stays compact');
  assert.ok(Math.abs(g.footY)<=26,'the lateral leg spread is bounded');
  assert.ok(Math.hypot(g.footX-g.startX,g.footY-g.startY)<=35,'limbs remain shorter than the original rays');
  assert.notDeepEqual(
    [legFn(20,leg,.43).footX,legFn(20,leg,.43).footY],
    [legFn(20,leg,1.43).footX,legFn(20,leg,1.43).footY],
    'articulated feet should move with gait'
  );
 }
 assert.match(code,/Math\.max\(15,Math\.min\(28,width\*\.044\)\)/);
});

test('explorer silhouette remains readable in bright water without additive overexposure',()=>{
 const start=code.indexOf('function spider(from,to,t){');
 const end=code.indexOf('function routeAt(){',start);
 assert.ok(start>=0&&end>start);
 const body=code.slice(start,end);
 assert.match(body,/ctx\.globalCompositeOperation="source-over"/);
 assert.doesNotMatch(body,/ctx\.globalCompositeOperation="lighter"/);
 assert.match(body,/dark under-stroke separates each articulated leg/i);
 assert.match(body,/ctx\.lineWidth=4\.5;ctx\.strokeStyle="rgba\(2,23,33,\.9\)"/);
 assert.match(body,/ctx\.lineWidth=leg<4\?1\.95:1\.7/);
 assert.match(body,/rgba\(194,255,230,\.13\)/);
 assert.doesNotMatch(body,/ctx\.shadowBlur=14/);
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
