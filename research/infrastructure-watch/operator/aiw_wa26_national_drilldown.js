// Evercraft American Infrastructure Watch: private 2026 WA deep evidence,
// overlaid on the ORIGINAL national map. Never replaces the national experience.
(() => {
  'use strict';
  const mapShell = document.getElementById('mapShell');
  const mapHead = mapShell?.querySelector('.map-head');
  if (!mapShell || !mapHead || document.getElementById('aiw-wa26-open')) return;

  const style = document.createElement('style');
  style.textContent = `
    #aiw-wa26-open{background:#e4f3ff;color:#084f8b;border:1px solid #a8d0f2;border-radius:11px;padding:9px 13px;font-size:12px;font-weight:800;white-space:normal}
    #aiw-wa26-depth{max-width:1160px;margin:12px auto 24px;padding:18px 22px;background:#fff;border:1px solid #d5e6f4;border-radius:18px;box-shadow:0 8px 26px #143d6312;color:#15395e}
    #aiw-wa26-depth h2{font-size:21px;letter-spacing:-.02em;margin:0 0 5px}
    #aiw-wa26-depth p{font-size:13px;color:#536f8c;margin:4px 0 14px;line-height:1.55}
    #aiw-wa26-depth .wa26-head{display:flex;justify-content:space-between;gap:15px;flex-wrap:wrap;align-items:start}
    #aiw-wa26-depth .wa26-pill{background:#e6f3ff;border:1px solid #bad9f4;border-radius:30px;padding:6px 10px;font-weight:800;color:#0d5b9d;font-size:11px}
    #aiw-wa26-depth .wa26-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
    #aiw-wa26-depth .wa26-kpis div{background:#eff7ff;border:1px solid #d4e9fa;border-radius:11px;padding:11px}
    #aiw-wa26-depth .wa26-kpis b{font-size:21px;display:block;color:#0b477e}
    #aiw-wa26-depth .wa26-kpis span{font-size:11px;color:#496f90}
    #aiw-wa26-depth .wa26-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:16px 0}
    #aiw-wa26-depth label{display:flex;flex-direction:column;gap:3px;color:#476c8b;font-size:12px;font-weight:750}
    #aiw-wa26-depth select,#aiw-wa26-depth input{background:#fff;border:1px solid #c0d9ec;border-radius:9px;color:#163c5e;padding:9px;min-height:42px;max-width:170px}
    #aiw-wa26-depth button.wa26-action{border:0;background:#1264a2;color:white;border-radius:9px;padding:10px 13px;min-height:42px;font-weight:750}
    #aiw-wa26-depth button:disabled{opacity:.5;cursor:not-allowed}
    #aiw-wa26-depth .wa26-row{border-top:1px solid #e1ebf6;padding:12px 5px;background:white;display:block;text-align:left;width:100%;color:#1f4f78;font-size:13px}
    #aiw-wa26-depth .wa26-row strong{display:block;font-size:14px}
    #aiw-wa26-depth .wa26-row span{color:#587995;font-size:12px}
    #aiw-wa26-depth .wa26-bottom{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;border-top:1px solid #dae9f6;padding-top:12px;font-size:12px}
    #aiw-wa26-depth .wa26-detail{padding:12px;background:#f0f7fd;border-radius:10px;font-size:12px;line-height:1.6;margin-top:10px;overflow-wrap:anywhere}
    #aiw-wa26-depth .wa26-warn{background:#fff6e6;border-left:3px solid #cb9b39;padding:10px 13px;border-radius:8px}
    #aiw-wa26-depth .wa26-disabled{color:#697f91}
    @media(max-width:650px){#aiw-wa26-depth{margin:10px;padding:14px}#aiw-wa26-depth .wa26-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#aiw-wa26-depth .wa26-tools label{flex:1 1 105px}#aiw-wa26-depth select,#aiw-wa26-depth input{width:100%;max-width:none}}
  `;
  document.head.append(style);
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'aiw-wa26-open';
  button.textContent = 'Explore verified WA bridges · 2026';
  button.setAttribute('aria-expanded','false');
  mapHead.insertBefore(button,mapHead.lastElementChild);

  const panel = document.createElement('section');
  panel.id = 'aiw-wa26-depth';
  panel.setAttribute('aria-label','Washington 2026 owned federal bridge evidence');
  panel.hidden = true;
  panel.innerHTML = `
    <div class="wa26-head"><div><span class="eyebrow">DEEP EVIDENCE / VERIFIED STATE IMPORT</span>
    <h2>Washington · 2026 federal bridges</h2><p>Explore the FHWA records behind the national infrastructure map. This is an independently indexed Washington-only source, not a nationwide 2026 import.</p></div>
    <span class="wa26-pill">Owned-source evidence · 2026</span></div>
    <div class="wa26-kpis"><div><b>8,619</b><span>Washington records</span></div>
    <div><b>4,298</b><span>Good</span></div><div><b>3,918</b><span>Fair</span></div><div><b>403</b><span>Poor, not emergency</span></div></div>
    <p class="wa26-warn"><strong>Historical conditions only.</strong> Poor-rated bridges are not automatically unsafe or closed. One out-of-state coordinate is withheld from mapped results pending review; missing county/name fields are never guessed.</p>
    <div class="wa26-tools"><label>Condition<select id="aiw-wa26-condition">
      <option value="P">Poor</option><option value="">All classifications</option><option value="F">Fair</option><option value="G">Good</option>
    </select></label><label>County code (optional)<input id="aiw-wa26-county" inputmode="numeric" pattern="[0-9]*" maxlength="3" placeholder="e.g. 77"></label>
    <button class="wa26-action" type="button" id="aiw-wa26-search">Search evidence</button>
    <button class="wa26-action" type="button" id="aiw-wa26-focus">Zoom map to Washington</button>
    <button class="wa26-action" type="button" id="aiw-wa26-close">Close deep dive</button></div>
    <p id="aiw-wa26-message" role="status" aria-live="polite">Select a filter to inspect source records.</p>
    <div id="aiw-wa26-list" aria-label="Official Washington federal bridge records"></div>
    <div class="wa26-bottom"><span id="aiw-wa26-page">No query yet</span>
    <div><button class="wa26-action" type="button" id="aiw-wa26-prev" disabled>Previous</button>
    <button class="wa26-action" type="button" id="aiw-wa26-next" disabled>Next</button></div></div>
    <div class="wa26-detail" id="aiw-wa26-detail">Select a record for its bridge ID, source location, and original inventory context.</div>
    <p><a href="https://www.fhwa.dot.gov/bridge/nbi/nbi_data_2026.cfm" target="_blank" rel="noopener noreferrer">Official FHWA 2026 source</a> · Source SHA-256 c97fb57339f8f7bd9ae82cb807814443fb7cd8bb9fb99c45adc74f2ae3912c79 · Private staging only</p>
  `;
  mapShell.insertAdjacentElement('afterend', panel);

  const $ = id => document.getElementById(id);
  const api = '/api/wa26/';
  let shown = false, offset = 0, currentCount = 0, entries = [], token = 0, pointsLayer = null, mapListener = null;
  const esc = x => String(x == null ? '' : x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stateMap = () => {
    try { return (typeof map !== 'undefined' && map && typeof L !== 'undefined') ? map : null; }
    catch { return null; }
  };
  function clearPoints(){
    if (pointsLayer){ pointsLayer.clearLayers(); }
  }
  function stop(){
    shown=false; panel.hidden=true;button.setAttribute('aria-expanded','false');clearPoints();
  }
  async function load(reset=false){
    if (reset) offset=0;
    const active = ++token;
    const cond=$('aiw-wa26-condition').value;
    const county=$('aiw-wa26-county').value.trim();
    if (county && !/^\d{1,3}$/.test(county)){
      $('aiw-wa26-message').textContent='County code must contain 1–3 digits.';return;
    }
    const params=new URLSearchParams({limit:'20',offset:String(offset)});
    if (cond)params.set('condition',cond);
    if (county)params.set('county',county);
    $('aiw-wa26-message').textContent='Loading verified FHWA records…';
    try{
      const response=await fetch(api+'bridges?'+params,{cache:'no-store'});
      if(!response.ok)throw new Error('Federal index unavailable');
      const data=await response.json();
      if(active!==token||!shown)return;
      entries=data.bridges;currentCount=data.total_matches;
      const rows=$('aiw-wa26-list');rows.replaceChildren();
      for(const r of entries){
        const el=document.createElement('button');el.type='button';el.className='wa26-row';
        el.innerHTML='<strong>'+esc(r.name||'Unnamed bridge')+'</strong><span>'+esc(r.bridge_id)+' · '+({P:'Poor',F:'Fair',G:'Good'}[r.condition]||'Unknown')+' condition · County '+esc(r.county_code??'not supplied')+'</span>';
        el.addEventListener('click',()=>show(r));rows.appendChild(el);
      }
      $('aiw-wa26-message').textContent=entries.length?'Official bridge records loaded. Select one to inspect it.':'No records in this filter. This is not evidence of safety.';
      $('aiw-wa26-page').textContent=(currentCount.toLocaleString())+' matching · '+(entries.length?((offset+1)+'–'+(offset+entries.length)):'0')+' shown';
      $('aiw-wa26-prev').disabled=offset===0;
      $('aiw-wa26-next').disabled=offset+entries.length>=currentCount;
    }catch(e){if(active!==token)return;$('aiw-wa26-message').textContent='Unable to load the owned Washington index. No results inferred.';}
  }
  function show(r){
    $('aiw-wa26-detail').innerHTML='<strong>'+esc(r.name||'Unnamed bridge')+'</strong><div>Bridge ID: '+esc(r.bridge_id)+'</div><div>Condition: '+esc(r.condition)+' · County code: '+esc(r.county_code??'not available')+'</div><div>Coordinates: '+esc(r.latitude)+', '+esc(r.longitude)+'</div><div>Inspection entries in supplied file: '+esc(r.inspection_entry_count)+'</div><div>2026 FHWA historical inventory. Not current road or safety advice.</div>';
    const m=stateMap();
    if(m && r.coordinate_quality!=='review_outside_wa_bbox'){m.setView([r.latitude,r.longitude],11); mapShell.scrollIntoView({behavior:'smooth',block:'start'});}
  }
  let lastMapToken=0;
  async function mapMoved(){
    const m=stateMap();
    if(!shown||!m)return;
    if(!pointsLayer)pointsLayer=L.layerGroup().addTo(m);
    clearPoints();
    if(m.getZoom()<8){
      $('aiw-wa26-message').textContent='Zoom into Washington to level 8+ to plot individual 2026 bridge records; the national map remains available.';
      return;
    }
    const b=m.getBounds();
    const p=new URLSearchParams({south:b.getSouth(),north:b.getNorth(),west:b.getWest(),east:b.getEast(),condition:$('aiw-wa26-condition').value});
    const n=++lastMapToken;
    try{
      const res=await fetch(api+'viewport?'+p,{cache:'no-store'});
      if(!res.ok)throw Error('viewport unavailable');
      const data=await res.json();
      if(!shown||n!==lastMapToken)return;
      if(!data.complete){
        $('aiw-wa26-message').textContent=data.total_matches.toLocaleString()+' bridges in view. Zoom further to display all points accurately; partial map suppressed.';
        return;
      }
      for(const r of data.bridges){
        const color=r.condition==='P'?'#b58b3d':r.condition==='F'?'#7896b3':'#358c82';
        const mark=L.circleMarker([r.latitude,r.longitude],{radius:5,color:'#fff',weight:1,fillColor:color,fillOpacity:.86});
        const safeName=esc(r.name||'Unnamed bridge');
        mark.bindPopup('<strong>'+safeName+'</strong><br>Condition: '+esc(r.condition)+' (not an emergency)<br>Bridge ID: '+esc(r.bridge_id)+'<br>FHWA 2026 snapshot');
        mark.addTo(pointsLayer);
      }
      $('aiw-wa26-message').textContent=data.total_matches.toLocaleString()+' 2026 federal bridge records plotted in current Washington view. Not current safety alerts.';
    }catch{
      if(n===lastMapToken&&shown)$('aiw-wa26-message').textContent='Map evidence unavailable. Record search remains available.';
    }
  }
  function start(){
    shown=true;panel.hidden=false;button.setAttribute('aria-expanded','true');panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    const m=stateMap();
    if(m){
      if(!mapListener){mapListener=()=>{if(shown)mapMoved()};m.on('moveend',mapListener);}
      m.setView([47.45,-120.6],7);
    }else{
      $('aiw-wa26-message').textContent='The national map fallback remains available. Individual bridge locations require the interactive map library; use the searchable records below.';
    }
    load(true);
  }
  button.addEventListener('click',()=>shown?stop():start());
  $('aiw-wa26-close').addEventListener('click',stop);
  $('aiw-wa26-search').addEventListener('click',()=>{load(true);mapMoved()});
  $('aiw-wa26-condition').addEventListener('change',()=>{load(true);mapMoved()});
  $('aiw-wa26-county').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load(true)}});
  $('aiw-wa26-focus').addEventListener('click',()=>{
    const m=stateMap();
    if(m){m.setView([46.6,-120.5],10);mapShell.scrollIntoView({behavior:'smooth'});}
    else $('aiw-wa26-message').textContent='National map fallback active. Use source-record search below.';
  });
  $('aiw-wa26-prev').addEventListener('click',()=>{offset=Math.max(0,offset-20);load()});
  $('aiw-wa26-next').addEventListener('click',()=>{offset+=20;load()});
  // Switching original national map categories preserves the national map,
  // but closes the deep-dive overlay instead of mixing vintages.
  for(const tab of document.querySelectorAll('.tab[data-view]'))
    tab.addEventListener('click',()=>{if(shown)stop()});
})();