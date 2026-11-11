import {RADIO_BROWSER_MIRRORS,RADIO_PRESETS,radioQuery,radioRegionalQuery,normalizeRadioStations,pointFromMap,pointToMap} from './world-radio-core.mjs';

// Independent, opt-in live-radio layer. It does not touch world saves, player pose, or the 3D renderer.
const isYakimaScene=location.pathname.endsWith('/worlds/hidden-world/yakima-standalone.html');
const topbar=document.querySelector('.topright')||(isYakimaScene?document.body:null);
if(topbar){
  const toggle=document.createElement('button');
  toggle.type='button';
  toggle.id='worldRadioToggle';
  toggle.className='world-radio-toggle'+(isYakimaScene?' world-radio-floating':'');
  toggle.setAttribute('aria-controls','worldRadioPanel');
  toggle.setAttribute('aria-expanded','false');
  toggle.textContent=isYakimaScene?'📻 Live Yakima radio':'📻 Radio';
  topbar.prepend(toggle);
  const panel=document.createElement('aside');
  panel.id='worldRadioPanel';
  panel.className='world-radio-panel';
  panel.hidden=true;
  panel.setAttribute('aria-label','Live radio explorer');
  panel.innerHTML=`
    <div class="wr-head"><div><div class="wr-eyebrow">EVERCRAFT WORLDS · AUDIO LAYER</div><h2>World Radio <span class="wr-live">LIVE</span></h2></div><button type="button" id="wrClose" class="wr-close" aria-label="Close world radio">×</button></div>
    <p class="wr-subtitle">Visit somewhere on the map, discover nearby broadcasters, and choose what to hear.</p>
    <div class="wr-controls"><label for="wrPreset">EXPLORE A PLACE</label><select id="wrPreset" aria-label="Choose a place"></select></div>
    <canvas id="wrMap" class="wr-map" width="480" height="240" role="button" tabindex="0" aria-label="World map. Tap to search nearby stations. Use the city list for keyboard navigation."></canvas>
    <div class="wr-map-caption"><span id="wrLocation">Yakima, Washington</span><span id="wrCoords">46.60° N · 120.51° W</span></div>
    <button id="wrExplore" class="wr-explore" type="button">Find nearby stations ↗</button>
    <p class="wr-status" id="wrStatus" role="status" aria-live="polite">Choose a city or tap the map. Playback starts only when you choose a station.</p>
    <div class="wr-stations" id="wrStations" aria-label="Available stations"></div>
    <div class="wr-player"><div class="wr-playing" id="wrPlaying">Nothing playing</div><audio id="wrAudio" controls preload="none" playsinline aria-label="Live station audio"></audio></div>
    <p class="wr-fine">Live stations are independent third-party streams. Discovery contacts Radio Browser; pressing Play connects to the station and exposes your IP address to that operator. Some streams may be blocked, unavailable or restricted. No audio is recorded, relayed or auto-played by Worlds.</p>
    <p class="wr-history">🕰️ These are PRESENT-DAY live stations, even inside a historical reconstruction. Period broadcasts are a separate future feature requiring licensed recordings or labeled reconstructions.</p>
  `;
  document.body.append(panel);
  // Persistent controls stay reachable after the radio drawer closes.
  // They only appear once a visitor deliberately selects a station.
  const mini=document.createElement('div');
  mini.id='wrMini';
  mini.className='wr-mini';
  mini.hidden=true;
  mini.setAttribute('role','group');
  mini.setAttribute('aria-label','World Radio playback controls');
  mini.innerHTML=`
    <div class="wr-mini-copy"><strong id="wrMiniStation">No station</strong><span id="wrMiniState">Connecting</span></div>
    <button type="button" id="wrMiniPause" aria-label="Pause station">Pause</button>
    <button type="button" id="wrMiniOpen" aria-label="Open radio explorer">Stations</button>
    <button type="button" id="wrMiniStop" aria-label="Stop radio and disconnect">Stop</button>
  `;
  document.body.append(mini);
  const miniName=mini.querySelector('#wrMiniStation');
  const miniState=mini.querySelector('#wrMiniState');
  const miniPause=mini.querySelector('#wrMiniPause');
  const $=id=>panel.querySelector('#'+id), map=$('wrMap'), ctx=map.getContext('2d');
  const preset=$('wrPreset'), status=$('wrStatus'), list=$('wrStations'), audio=$('wrAudio'), playing=$('wrPlaying');
  for(let i=0;i<RADIO_PRESETS.length;i++){
    const o=document.createElement('option');o.value=String(i);o.textContent=RADIO_PRESETS[i].name;preset.append(o);
  }
  let selected={...RADIO_PRESETS[0]},stations=[],activeId=null,activeName=null,requestId=0,controller=null;
  const labelCoords=(lat,lon)=>Math.abs(lat).toFixed(2)+'° '+(lat>=0?'N':'S')+' · '+Math.abs(lon).toFixed(2)+'° '+(lon>=0?'E':'W');
  function visit(next){
    if(controller)controller.abort();
    controller=null;
    requestId++;
    selected={...next};
    $('wrLocation').textContent=selected.name;
    $('wrCoords').textContent=labelCoords(selected.lat,selected.lon);
    stations=[];list.replaceChildren();
    status.textContent='Ready to find live stations around '+selected.name+'.';
    renderMap();
  }
  const land=[
    [[-168,72],[-147,70],[-127,59],[-124,48],[-117,32],[-100,18],[-92,15],[-86,20],[-81,26],[-82,32],[-96,31],[-109,32],[-123,48],[-141,59],[-168,64]],
    [[-82,12],[-71,12],[-61,5],[-49,-2],[-35,-10],[-39,-20],[-54,-35],[-70,-55],[-76,-40],[-78,-21],[-81,-4]],
    [[-17,36],[5,37],[20,32],[33,29],[42,11],[49,-12],[34,-35],[18,-35],[11,-23],[8,-5],[-2,5],[-17,16]],
    [[-11,36],[-10,53],[2,60],[19,72],[38,69],[50,60],[72,55],[98,60],[124,50],[151,62],[180,60],[173,42],[139,33],[121,22],[105,4],[99,1],[92,16],[73,8],[65,24],[44,37],[30,42],[11,36]],
    [[112,-11],[131,-12],[145,-17],[154,-29],[145,-39],[128,-35],[115,-27]],
    [[-53,59],[-41,62],[-39,82],[-50,83],[-60,75]]
  ];
  function renderMap(){
    if(!ctx)return;
    const rect=map.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width||480)),h=Math.max(1,Math.round(rect.height||240));
    const dpr=Math.min(window.devicePixelRatio||1,2);
    if(map.width!==Math.round(w*dpr)||map.height!==Math.round(h*dpr)){map.width=Math.round(w*dpr);map.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const bg=ctx.createLinearGradient(0,0,w,h);bg.addColorStop(0,'#0e3145');bg.addColorStop(1,'#071523');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='rgba(139,206,217,.12)';ctx.lineWidth=1;
    for(let x=0;x<=w;x+=w/12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<=h;y+=h/6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    ctx.fillStyle='#24485a';ctx.strokeStyle='rgba(168,225,220,.25)';
    for(const polygon of land){ctx.beginPath();polygon.forEach(([lon,lat],i)=>{const p=pointToMap(lat,lon,w,h);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.closePath();ctx.fill();ctx.stroke();}
    for(const place of RADIO_PRESETS){const p=pointToMap(place.lat,place.lon,w,h);ctx.beginPath();ctx.arc(p.x,p.y,2.7,0,Math.PI*2);ctx.fillStyle='#7eafc1';ctx.fill();}
    for(const st of stations){const p=pointToMap(st.lat,st.lon,w,h);ctx.beginPath();ctx.arc(p.x,p.y,3.1,0,Math.PI*2);ctx.fillStyle='#f5cb7a';ctx.fill();}
    const target=pointToMap(selected.lat,selected.lon,w,h);
    ctx.beginPath();ctx.arc(target.x,target.y,9,0,Math.PI*2);ctx.strokeStyle='#7ef0e5';ctx.lineWidth=1.5;ctx.stroke();
    ctx.beginPath();ctx.arc(target.x,target.y,3.5,0,Math.PI*2);ctx.fillStyle='#e7ffff';ctx.fill();
  }
  function makeStationButton(st){
    const button=document.createElement('button');button.type='button';button.className='wr-station';
    const name=document.createElement('strong');name.textContent=st.name;
    const info=document.createElement('small');info.textContent=st.distanceKm+' km away · '+([st.region,st.country,st.codec].filter(Boolean).join(' · ')||'Internet radio');
    const symbol=document.createElement('span');symbol.textContent='▶';symbol.setAttribute('aria-hidden','true');
    button.append(name,info,symbol);button.setAttribute('aria-label','Play '+st.name);
    button.addEventListener('click',()=>playStation(st));
    if(st.id===activeId)button.classList.add('wr-active');
    return button;
  }
  function updateStationList(){
    list.replaceChildren(...stations.map(makeStationButton));
    renderMap();
  }
  async function discover(){
    if(controller)controller.abort();
    controller=null;
    const ownId=++requestId;
    const current={...selected};
    // Prefer the geo-radius API. Radio Browser clients support these query
    // parameters, but older public documentation omits them. A documented
    // country/state candidate search provides a fallback for known presets.
    const regional=radioRegionalQuery(current);
    const queries=[radioQuery(current.lat,current.lon,350),...(regional?[regional]:[])];
    stations=[];list.replaceChildren();renderMap();
    status.textContent='Discovering geotagged HTTPS radio streams near '+current.name+'…';
    let lastError=null,hadValidResponse=false;
    for(const path of queries){
      for(const origin of RADIO_BROWSER_MIRRORS){
        const localController=new AbortController();
        controller=localController;
        const timeout=setTimeout(()=>localController.abort(),9000);
        try{
          const response=await fetch(origin+path,{signal:localController.signal,headers:{Accept:'application/json'}});
          if(!response.ok)throw Error('Station directory HTTP '+response.status);
          const records=await response.json();
          if(ownId!==requestId)return;
          hadValidResponse=true;
          const found=normalizeRadioStations(records,current.lat,current.lon,350);
          if(found.length){
            stations=found;updateStationList();
            status.textContent=stations.length+' nearby station'+(stations.length===1?'':'s')+' listed within 350 km. Tap a station to try its live stream.';
            return;
          }
          // A working mirror returned no local stations. Try the regional
          // fallback instead of accepting unrelated high-vote global results.
          break;
        }catch(error){
          if(ownId!==requestId)return;
          lastError=error;
          // Try the next mirror even if this one timed out.
        }finally{clearTimeout(timeout);}
      }
    }
    if(ownId!==requestId)return;
    status.textContent=hadValidResponse
      ?'No geotagged HTTPS station found within 350 km. Try another location or check again later.'
      :'Radio directory unavailable ('+(lastError?.message||'network error')+'). Try again later.';
  }
  function playStation(st){
    activeId=st.id;
    activeName=st.name;
    miniName.textContent=st.name;
    miniState.textContent='Connecting';
    miniPause.disabled=false;
    playing.textContent='Loading · '+st.name;
    audio.src=st.stream;
    updateStationList();
    // The play call stays in a direct user gesture; automatic travel never starts audio.
    const attempt=audio.play();
    if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{playing.textContent='Playback blocked or stream unavailable · '+st.name;});
    // The directory asks clients to count station plays; failure never blocks listening.
    fetch(RADIO_BROWSER_MIRRORS[0]+'/json/url/'+encodeURIComponent(st.id),{mode:'cors'}).catch(()=>{});
  }
  audio.addEventListener('playing',()=>{
    playing.textContent='Now playing · '+(activeName||'Live radio');
    miniState.textContent='Live';miniPause.textContent='Pause';
    miniPause.setAttribute('aria-label','Pause station');
  });
  audio.addEventListener('waiting',()=>{if(activeName)miniState.textContent='Buffering';});
  audio.addEventListener('error',()=>{
    playing.textContent='Stream unavailable. Choose another station.';
    miniState.textContent='Stream unavailable';
    miniPause.disabled=true;
  });
  audio.addEventListener('pause',()=>{
    if(!activeName)return;
    playing.textContent='Paused · '+activeName;
    miniState.textContent='Paused';miniPause.textContent='Resume';
    miniPause.setAttribute('aria-label','Resume station');
  });
  function openPanel(){
    panel.hidden=false;mini.hidden=true;toggle.setAttribute('aria-expanded','true');
    requestAnimationFrame(renderMap);$('wrClose').focus();
  }
  function closePanel(){
    panel.hidden=true;mini.hidden=!activeName;toggle.setAttribute('aria-expanded','false');toggle.focus();
  }
  miniPause.addEventListener('click',()=>{
    if(!activeName)return;
    if(!audio.paused){audio.pause();return;}
    const attempt=audio.play();
    if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{
      miniState.textContent='Playback blocked';playing.textContent='Playback blocked · '+activeName;
    });
  });
  mini.querySelector('#wrMiniOpen').addEventListener('click',openPanel);
  mini.querySelector('#wrMiniStop').addEventListener('click',()=>{
    // Releasing the src drops the station connection instead of merely hiding UI.
    audio.pause();audio.removeAttribute('src');audio.load();
    activeId=null;activeName=null;mini.hidden=true;
    playing.textContent='Nothing playing';
    if(stations.length)updateStationList();
  });
  toggle.addEventListener('click',()=>panel.hidden?openPanel():closePanel());
  $('wrClose').addEventListener('click',closePanel);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)closePanel();});
  preset.addEventListener('change',()=>visit(RADIO_PRESETS[Number(preset.value)]||RADIO_PRESETS[0]));
  $('wrExplore').addEventListener('click',discover);
  map.addEventListener('click',event=>{
    const bounds=map.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const x=event.clientX-bounds.left,y=event.clientY-bounds.top;
    const marker=stations.find(st=>{const p=pointToMap(st.lat,st.lon,bounds.width,bounds.height);return Math.hypot(p.x-x,p.y-y)<=8;});
    if(marker){playStation(marker);return;}
    const pos=pointFromMap(x,y,bounds.width,bounds.height);
    preset.selectedIndex=-1;
    visit({...pos,name:'Map selection'});
    discover();
  });
  map.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){event.preventDefault();discover();}
  });
  window.addEventListener('resize',()=>{if(!panel.hidden)renderMap();});
  renderMap();
}
