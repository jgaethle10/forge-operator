/* Aircraft Foundry screen, local-only design library, scene handoff. */
(() => {'use strict';
 const F=window.AAARFoundry;if(!F)return;
 const $=id=>document.getElementById(id),storageKey='evercraft.aaar.foundry.blueprints.v1';
 let design=F.preset('kestrel'),saving=false;
 const fields={
  massKg:['Mass',.5,30000,1,'kg','every'],bodyLengthM:['Body length',.5,40,.1,'m','every'],bodyWidthM:['Body width',.15,8,.05,'m','every'],
  spanM:['Wingspan',.6,60,.2,'m','wing'],chordM:['Wing chord',.15,9,.05,'m','wing'],sweepDeg:['Wing sweep',0,60,1,'°','wing'],
  tailAreaM2:['Horizontal tail area',0,30,.1,'m²','wing'],cgFraction:['CG fraction of chord',.05,.85,.01,'','wing'],
  thrustN:['Maximum forward thrust',0,160000,100,'N','wing'],cd0:['Zero-lift drag coefficient (assumed)',.012,.25,.001,'','wing'],clMax:['Maximum lift coefficient (assumed)',.65,2.5,.05,'','wing'],
  rotors:['Rotor count',2,12,1,'','rotor'],rotorRadiusM:['Rotor radius',.09,3.5,.01,'m','rotor'],totalPowerW:['Total motor shaft power',100,1500000,100,'W','rotor']
 };
 function boundsNice(n,k){const digits=['cgFraction','cd0'].includes(k)?3:['rotorRadiusM','bodyWidthM','chordM'].includes(k)?2:1;return Number(n.toFixed(digits)).toLocaleString('en-US')}
 const shell=document.createElement('section');shell.id='foundryOverlay';shell.className='foundry-overlay';shell.setAttribute('role','dialog');shell.setAttribute('aria-modal','true');shell.setAttribute('aria-label','Anniston Aircraft Foundry');shell.innerHTML=`
 <div class="foundry-frame"><header class="foundry-top"><div class="foundry-identity">EVERCRAFT WORLDS <b>× ANNISTON AAAR</b> / AIRCRAFT FOUNDRY</div><button id="foundryClose" type="button">Close ×</button></header>
 <div class="foundry-heading"><div><span class="foundry-label">DESIGN / SCREEN / FLY / ITERATE</span><h2>Build the <span>impossible.</span><br>Then test it.</h2><p>Create a winged machine, a glider, a flying wing or a rotorcraft. Adjust the physics. Launch it into Cedar Basin and learn what your concept can actually do in this simplified model.</p></div><div class="foundry-flags">OPERATING MODE / LOCAL<br>REAL EQUATIONS / LOW-ORDER MODEL<br>NOT CFD · NOT AIRWORTHINESS</div></div>
 <div class="foundry-main"><section class="foundry-panel"><div class="foundry-formhead"><label>FOUNDATION TEMPLATE<select id="fTemplate"><option value="kestrel">Kestrel / general aviation</option><option value="glider">Silent Arc / sailplane</option><option value="flyingwing">Manta / flying wing</option><option value="quad">Sparrow / quadrotor</option><option value="heavy">Sky Hauler / heavy rotorcraft</option><option value="custom">Custom configuration</option></select></label><label>NAME YOUR MACHINE<input id="fName" type="text" maxlength="64" autocomplete="off" placeholder="Your aircraft name" /></label></div><div class="foundry-subhead">01 / STRUCTURE</div><div id="fEvery"></div><div id="fWingSection"><div class="foundry-subhead">02 / WINGS & STABILITY</div><div id="fWing"></div></div><div id="fRotorSection"><div class="foundry-subhead">02 / ROTORS & POWER</div><div id="fRotor"></div></div><p class="foundry-note">Controls change the screening geometry and equations. No structural, aerodynamic, control or propulsion detail is inferred just from how the sketch looks.</p></section>
 <section class="foundry-panel"><div class="foundry-plot"><div class="badge" id="fBlueprintLabel">TOP-DOWN CONCEPT / NOT TO SCALE</div><svg id="fSketch" viewBox="0 0 760 420" role="img" aria-label="Top-down parametric flying machine preview"></svg><div class="other">BLUEPRINT PROJECTION / SYNTHETIC ASSET</div></div><div class="foundry-stats" id="fStats"></div><div id="fGate" class="foundry-gate"></div><div class="foundry-warnings"><b>ENGINEERING ASSUMPTIONS & LIMITATIONS</b><ul id="fWarnings"></ul></div><div class="foundry-actions"><button class="primary" type="button" id="fLaunch">✈ BUILD & FLY</button><button type="button" id="fSave">Save blueprint</button><button type="button" id="fExport">Export JSON</button><button type="button" id="fImport">Import JSON</button></div><input id="fImportFile" type="file" accept="application/json,.json" hidden><div id="fError" class="foundry-error" role="status"></div><label class="foundry-library">SAVED DESIGNS ON THIS DEVICE<select id="fSaved"><option value="">No saved designs yet</option></select></label><p class="foundry-footer">Simulation-only: modeled lift from dynamic pressure and finite-wing approximation; induced drag from lifting-line theory; rotor hover from ideal momentum scaling with an assumed efficiency. It omits realistic aerodynamic moments, airfoil data, blade dynamics, structures, weather, propeller maps, energy consumption, stability-control engineering, and flight certification. Fictional scenery; no real hardware commands.</p></section></div></div>`;
 document.getElementById('flightShell').appendChild(shell);
 for(const [key,[label,min,max,step,unit,group]] of Object.entries(fields)){
   const row=document.createElement('div');row.className='foundry-field';const l=document.createElement('span');l.className='field-name';l.textContent=label;
   const o=document.createElement('output');o.id='fo_'+key;const range=document.createElement('input');range.id='fi_'+key;range.type='range';range.min=min;range.max=max;range.step=step;range.setAttribute('aria-label',label);
   range.addEventListener('input',()=>{design[key]=Number(range.value);$('fTemplate').value='custom';refresh()});row.append(l,o,range);$('f'+group[0].toUpperCase()+group.slice(1)).appendChild(row);
 }
 function open(){shell.classList.add('open');$('flightShell').dataset.foundry='open';try{window.dispatchEvent(new Event('AAAR_FOUNDRY_OPEN'))}catch{};refresh();$('foundryClose').focus();}
 function close(){shell.classList.remove('open');delete $('flightShell').dataset.foundry;}
 function setDesign(d){design=F.validate(d);const mass=$('fi_massKg'),power=$('fi_totalPowerW'),thrust=$('fi_thrustN');
   if(design.massKg<=25){mass.min='.4';mass.max='80';mass.step='.1';}else if(design.massKg<=1000){mass.min='1';mass.max='1200';mass.step='1';}else{mass.min='50';mass.max='30000';mass.step='25';}
   if(design.totalPowerW<=15000){power.min='100';power.max='15000';power.step='50';}else if(design.totalPowerW<=200000){power.min='1000';power.max='250000';power.step='500';}else{power.min='10000';power.max='1500000';power.step='2000';}
   if(design.thrustN<=15000){thrust.min='0';thrust.max='16000';thrust.step='50';}else{thrust.min='0';thrust.max='160000';thrust.step='500';}
   for(const key of Object.keys(fields)){$('fi_'+key).value=design[key];} $('fName').value=design.name;const matched=Object.keys(F.presets).find(k=>F.presets[k].name===design.name);$('fTemplate').value=matched||'';refresh();}
 function sketch(d){const svg=$('fSketch');const centerX=380,cy=206,span=d.type==='wing'?d.spanM:Math.max(d.rotorRadiusM*3.8,d.bodyWidthM*2);
 const normalizedScale=Math.min(250/Math.max(span/2,.25),145/Math.max(d.bodyLengthM/2,.25));
 const wingHalf=(d.spanM/2)*normalizedScale,bodyHalf=(d.bodyLengthM/2)*normalizedScale;
 const bw=Math.max(6,d.bodyWidthM*.5*normalizedScale),alpha=70;
 const line='#a3ced2',fill='#d6ebe8',accent='#f7a877';
 let shapes=`<g opacity=".65" stroke="#648e9d" stroke-width="1"><path d="M380 13V405M18 206H742" stroke-dasharray="4 7"/><circle cx="380" cy="206" r="160" fill="none" stroke-dasharray="3 9"/><circle cx="380" cy="206" r="70" fill="none" stroke-dasharray="3 9"/></g>`;
 if(d.type==='wing'){
   const yWing=cy+bodyHalf*.13,depth=Math.max(14,d.chordM*normalizedScale),sw=Math.tan(d.sweepDeg*Math.PI/180)*wingHalf*.55;
   const leftPts=[[centerX-bw,yWing-depth/2],[centerX-wingHalf,yWing-depth/2+sw],[centerX-wingHalf,yWing+depth/2+sw],[centerX-bw,yWing+depth/2]];
   const rightPts=leftPts.map(p=>[2*centerX-p[0],p[1]]).reverse();
   const pts=x=>x.map(p=>p.join(',')).join(' ');
   shapes+=`<polygon points="${pts(leftPts)}" fill="#a3d1cf" stroke="${line}" stroke-width="3"/><polygon points="${pts(rightPts)}" fill="#a3d1cf" stroke="${line}" stroke-width="3"/>`;
   const tailHalf=Math.min(wingHalf*.56,Math.sqrt(d.tailAreaM2)*normalizedScale*.7),ty=cy+bodyHalf*.83;
   if(tailHalf>0)shapes+=`<path d="M${centerX-tailHalf} ${ty-12}L${centerX+tailHalf} ${ty-12}L${centerX+tailHalf*.8} ${ty+14}L${centerX-tailHalf*.8} ${ty+14}Z" fill="#87aaa9"/>`;
 }
 if(d.type==='rotor'){
   const R=d.rotorRadiusM*normalizedScale,ring=Math.min(wingHalf*.72,120),count=d.rotors;
   for(let i=0;i<count;i++){const theta=2*Math.PI*i/count+Math.PI/4,x=centerX+Math.cos(theta)*ring,y=cy+Math.sin(theta)*ring;
     shapes+=`<line x1="${centerX}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#8cc9c7" stroke-width="9"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${Math.max(7,Math.min(96,R)).toFixed(1)}" fill="#84c9d21a" stroke="#b8ede0" stroke-width="3"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${accent}"/>`;
   }
 }
 const ytop=cy-bodyHalf,ybot=cy+bodyHalf;
 shapes+=`<path d="M${centerX} ${ytop}L${centerX+bw} ${ytop+bodyHalf*.36}L${centerX+bw} ${ybot-bodyHalf*.22}L${centerX+bw*.75} ${ybot}L${centerX-bw*.75} ${ybot}L${centerX-bw} ${ybot-bodyHalf*.22}L${centerX-bw} ${ytop+bodyHalf*.36}Z" fill="${fill}" stroke="${line}" stroke-width="3"/><path d="M${centerX} ${ytop+8}V${ybot-9}" stroke="#577987" stroke-width="2" stroke-dasharray="7 7"/><circle cx="${centerX}" cy="${cy-6}" r="6" fill="${accent}"/>`;
 shapes+=`<g fill="#a8c6cb" font-family="monospace" font-size="13"><text x="27" y="390">${d.type==='wing'?'WING PLANFORM':'ROTOR POSITION PROXY'} / NON-STRUCTURAL</text><text x="686" y="34">TOP</text></g>`;
 svg.innerHTML=shapes;
 }
 function refresh(){try{design.name=$('fName').value||design.name;const a=F.analyze(design),d=a.design,m=a.metrics;
    $('fWingSection').hidden=d.type!=='wing';$('fRotorSection').hidden=d.type!=='rotor';
    for(const [key,meta] of Object.entries(fields)){$('fo_'+key).textContent=boundsNice(design[key],key)+(meta[4]?' '+meta[4]:'');}
    sketch(d);
    const stats=d.type==='wing'?[['WING AREA',m.wingArea,'m²'],['ASPECT RATIO',m.aspectRatio,''],['STALL SCREEN',m.vStall*1.94384,'knots'],['SCREEN DRAG',m.screenDragN,'N'],['THRUST - DRAG',m.screenThrustMarginN,'N'],['TAIL VOLUME',m.tailVolume,'proxy']]:[['THRUST / WEIGHT',m.thrustWeightRatio,'×'],['DISK AREA',m.diskArea,'m²'],['HOVER POWER',m.hoverPowerScreenW/1000,'kW'],['POWER PROVIDED',d.totalPowerW/1000,'kW'],['DISK LOADING',m.diskLoadingNpm2,'N/m²'],['MASS',d.massKg,'kg']];
    $('fStats').replaceChildren(...stats.map(([label,num,unit])=>{const e=document.createElement('div');e.className='foundry-stat';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=Number(num).toLocaleString('en-US',{maximumFractionDigits:unit==='proxy'||unit==='×'?2:1});const span=document.createElement('span');span.textContent=unit||'dimensionless';e.append(small,strong,span);return e;}));
    const pass=d.type==='wing'?m.screenThrustMarginN>=0:m.thrustWeightRatio>=1;
    $('fGate').className='foundry-gate'+(pass?'':' hold');$('fGate').textContent=d.type==='wing'?(pass?'SCREENING: thrust covers modeled drag at 1.45 × stall speed. This is not a safe-flight result.':'SCREENING HOLD: modeled thrust does not cover level-flight drag. Still flyable as a glider or failure experiment.'):(pass?'SCREENING: modeled available thrust exceeds weight. Control stability remains unknown.':'SCREENING HOLD: thrust below weight. Expect a descent in the simulator.');
    $('fWarnings').replaceChildren(...a.warnings.map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));$('fBlueprintLabel').textContent=d.name.toUpperCase().slice(0,48)+' / '+(d.type==='wing'?'FIXED WING':'ROTORCRAFT');$('fError').textContent='';
  }catch(err){$('fError').textContent=err.message;}}
 function library(){try{const d=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(d)?d.filter(x=>x&&x.schema===F.SCHEMA).slice(-20):[];}catch{return [];}}
 function updateLibrary(){const items=library();const list=$('fSaved');list.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=items.length?'Select a saved blueprint':'No saved designs yet';list.append(empty);items.forEach((d,i)=>{const o=document.createElement('option');o.value=String(i);o.textContent=(d.name||'Design').slice(0,64);list.append(o);});}
 $('fTemplate').addEventListener('change',e=>{if(F.presets[e.target.value])setDesign(F.preset(e.target.value));});
 $('fName').addEventListener('input',e=>{design.name=e.target.value||'Untitled machine';refresh();});
 $('foundryClose').addEventListener('click',close);
 $('fLaunch').addEventListener('click',()=>{try{const d=F.validate({...design,name:$('fName').value});try{localStorage.setItem('evercraft.aaar.foundry.last.v1',JSON.stringify(d));}catch{}window.dispatchEvent(new CustomEvent('AAAR_LAUNCH_CRAFT',{detail:d}));close();}catch(err){$('fError').textContent=err.message;}});
 $('fSave').addEventListener('click',()=>{try{const d=F.validate({...design,name:$('fName').value});const items=library().filter(x=>x.name!==d.name);items.push(d);localStorage.setItem(storageKey,JSON.stringify(items.slice(-20)));updateLibrary();$('fError').textContent='Saved locally. No online synchronization.';}catch(err){$('fError').textContent=err.message;}});
 $('fExport').addEventListener('click',()=>{try{const d=F.validate({...design,name:$('fName').value});const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='anniston-aircraft-blueprint.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(err){$('fError').textContent=err.message;}});
 $('fImport').addEventListener('click',()=>$('fImportFile').click());
 $('fImportFile').addEventListener('change',async e=>{try{const file=e.target.files?.[0];if(!file)return;if(file.size>12000)throw Error('Blueprint JSON exceeds 12 KB.');setDesign(F.validate(JSON.parse(await file.text())));}catch(err){$('fError').textContent='Import refused: '+err.message}finally{e.target.value='';}});
 $('fSaved').addEventListener('change',e=>{if(e.target.value==='')return;const d=library()[Number(e.target.value)];try{setDesign(F.validate(d));}catch(err){$('fError').textContent=err.message;}});
 window.AAARFoundryUI={open,close,getDesign:()=>F.validate(design)};
 setDesign(design);updateLibrary();
 document.getElementById('openFoundry')?.addEventListener('click',open);
 document.getElementById('designFromStart')?.addEventListener('click',open);
})();
