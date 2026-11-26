#!/usr/bin/env python3
"""Private atlas: local verified input, Canvas rendering, year and treatment filters."""
import argparse, hashlib, html, json, math, os, pathlib, runpy
HERE=pathlib.Path(__file__).resolve().parent
A=runpy.run_path(str(HERE/"forest-002-atlas.py"))
def sha(p):
    with p.open("rb") as f: return hashlib.file_digest(f,"sha256").hexdigest()
def pack_rings(rings):
    return [[[round(x,3),round(y,3)] for x,y in (A["project"](p) for p in ring)] for ring in A["checked"](rings)]
def pack(rows,counties):
    features=[]
    for r in rows:
        rings=pack_rings(r["rings"])
        pts=[p for ring in rings for p in ring]
        bbox=[min(p[0] for p in pts),min(p[1] for p in pts),max(p[0] for p in pts),max(p[1] for p in pts)]
        features.append([r["id"],r["year"],r["treatment"] or "Unknown",r["reported_acres"],r["gis_acres"],bbox,rings,r["activity"]])
    cs=[]
    for r in counties:
        rings=pack_rings(r["geometry"]["rings"])
        pts=[p for ring in rings for p in ring]
        cs.append([r["attributes"]["BASENAME"],rings,(min(p[0] for p in pts)+max(p[0] for p in pts))/2,(min(p[1] for p in pts)+max(p[1] for p in pts))/2])
    return {"records":features,"counties":cs}
PAGE=r"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Evercraft | Forest Intelligence</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#0a1415;color:#e8f3ee;font:14px system-ui,sans-serif}header{display:flex;justify-content:space-between;align-items:center;padding:18px 28px;border-bottom:1px solid #2e413e}small,p{color:#a1b4ad;line-height:1.5}.eyebrow{font-size:10px;color:#a4e8ba;letter-spacing:3px;font-weight:700}h1{font-size:32px;margin:5px 0;font-weight:550;letter-spacing:-1px}h2{font-size:16px}main{display:grid;grid-template-columns:minmax(0,1fr) 310px;min-height:76vh}.map{position:relative;min-height:550px;background:#101f22}canvas{position:absolute;width:100%;height:100%;touch-action:none;cursor:grab}aside{padding:20px;background:#11201e;border-left:1px solid #2e413e}.stat{font-size:34px;color:#a4e8ba;font-weight:500}.metric{border-bottom:1px solid #30443c;padding:12px 0}.controls{display:grid;gap:9px;margin:15px 0}select,button{font:inherit;background:#20332d;color:#edf5ef;border:1px solid #436052;border-radius:6px;padding:9px;max-width:100%}button{cursor:pointer}input[type=range]{width:100%;accent-color:#a4e8ba}.tools{position:absolute;right:15px;top:15px;display:grid;gap:7px}.legend{position:absolute;left:15px;bottom:15px;background:#101b1ce8;padding:12px;border:1px solid #41594e;border-radius:8px;font-size:11px;pointer-events:none}.detail{padding:12px;background:#1c3028;border-radius:8px;min-height:100px;line-height:1.6;overflow-wrap:anywhere}.bars{display:flex;align-items:end;height:70px;gap:3px;margin:10px 0}.bars button{padding:0;min-width:0;flex:1;background:#5e9b79;border:0;border-radius:2px 2px 0 0}.bars button.active{background:#e5d49c}footer{padding:12px 28px;border-top:1px solid #2e413e;color:#a1b4ad;font-size:11px}@media(max-width:800px){main{grid-template-columns:1fr}.map{min-height:65vh}}
</style></head><body><header><div><div class="eyebrow">EVERCRAFT / FOREST INTELLIGENCE</div><h1>Restoration observatory</h1><small>Eastern Washington · historical treatment inventory</small></div><small>PRIVATE RESEARCH · RIGHTS HOLD</small></header>
<main><section class="map"><canvas id="map" aria-label="Interactive forest treatment map"></canvas><div class="tools"><button id="in">+</button><button id="out">−</button><button id="reset">Reset</button></div><div class="legend">● Source record locators at overview<br>▰ Simplified polygons when zoomed<br>County boundaries: US Census 2025<br>Drag to pan · scroll to zoom · click record</div></section><aside><div class="eyebrow">FILTERED EVIDENCE</div><div class="metric"><div class="stat" id="count"></div><small>Matching source records (not unique projects)</small></div><div class="metric"><div class="stat" id="acres"></div><small>Sum of non-null reported acres; overlaps possible</small></div><div class="controls"><label>Completion year: <b id="yearText">All</b><input type="range" id="year" min="0" value="0"></label><div class="bars" id="bars" aria-label="Record counts by year"></div><button id="play">Play years</button><label>Treatment category<select id="category"><option value="">All treatments</option></select></label><label><input type="checkbox" id="labels" checked> County labels</label></div><h2>Record inspection</h2><div class="detail" id="detail" aria-live="polite">Select a treatment on the map.</div><p>At low zoom, points locate the first boundary vertex. Geometry is simplified and not suitable for acreage calculation. No harvestability or timber yield inferred.</p></aside></main><footer>WA DNR treatment records · 2017–Oct 2026 source coverage | private simplified geometry | no wildfire-risk or industrial-capacity layers yet | not for publication</footer>
<script type="application/json" id="data">__DATA__</script><script>
const D=JSON.parse(document.getElementById('data').textContent), R=D.records, C=D.counties;
const $=id=>document.getElementById(id), cv=$('map'),ctx=cv.getContext('2d'),fmt=new Intl.NumberFormat('en-US');
let scale=1,ox=0,oy=0,W=0,H=0,filtered=R,selected=null,drag=null,frame=0,timer=null;
const years=[...new Set(R.map(r=>r[1]).filter(v=>v!==null))].sort((a,b)=>a-b);if(R.some(r=>r[1]===null))years.push(null);
const yearCounts=new Map();R.forEach(r=>yearCounts.set(r[1],(yearCounts.get(r[1])||0)+1));$('year').max=years.length;
const cats=[...new Set(R.map(r=>r[2]))].sort();cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;$('category').append(o)});
const max=Math.max(1,...yearCounts.values());years.forEach((y,i)=>{const b=document.createElement('button');b.style.height=(100*yearCounts.get(y)/max)+'%';b.title=(y??'Unknown')+': '+yearCounts.get(y)+' records';b.setAttribute('aria-label',b.title);b.onclick=()=>{$('year').value=i+1;filter()};$('bars').append(b)});
function reset(){scale=Math.min(W/830,H/540);ox=(W-830*scale)/2;oy=(H-540*scale)/2;draw()}
function size(){const r=cv.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);W=r.width;H=r.height;cv.width=Math.round(W*d);cv.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);reset()}
function path(rings){ctx.beginPath();for(const ring of rings){ring.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath()}}
function visible(b){return b[2]*scale+ox>=0&&b[0]*scale+ox<=W&&b[3]*scale+oy>=0&&b[1]*scale+oy<=H}
function draw(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);
for(const c of C){path(c[1]);ctx.fillStyle='#29483d';ctx.fill('evenodd');ctx.strokeStyle='#597365';ctx.lineWidth=.65/scale;ctx.stroke()}
if($('labels').checked){ctx.font=(10/scale)+'px system-ui';ctx.textAlign='center';ctx.fillStyle='#a4bcb1';for(const c of C)ctx.fillText(c[0],c[2],c[3])}
const detailed=scale>=3;ctx.fillStyle=detailed?'#91d9a6':'#a8f5bd';ctx.globalAlpha=detailed?.7:.45;
if(!detailed){const occupied=new Set();ctx.beginPath();for(const r of filtered){if(!visible(r[5]))continue;const p=r[6][0][0],key=Math.floor((p[0]*scale+ox)/3)+','+Math.floor((p[1]*scale+oy)/3);if(occupied.has(key))continue;occupied.add(key);ctx.moveTo(p[0]+1.5/scale,p[1]);ctx.arc(p[0],p[1],1.5/scale,0,Math.PI*2)}ctx.fill()}
else for(const r of filtered){if(!visible(r[5]))continue;path(r[6]);ctx.fill('evenodd');ctx.strokeStyle='#b8f3c4';ctx.lineWidth=.6/scale;ctx.stroke()}
ctx.globalAlpha=1;if(selected&&filtered.includes(selected)){path(selected[6]);ctx.fillStyle='#ffe0a0';ctx.fill('evenodd');ctx.strokeStyle='#fff0c7';ctx.lineWidth=2/scale;ctx.stroke();const p=selected[6][0][0];ctx.beginPath();ctx.arc(p[0],p[1],4/scale,0,Math.PI*2);ctx.fill()}
ctx.restore()})}
function filter(){const i=+$('year').value,y=years[i-1],c=$('category').value;filtered=R.filter(r=>(i===0||r[1]===y)&&(!c||r[2]===c));$('yearText').textContent=i===0?'All':y??'Unknown';[...$('bars').children].forEach((b,j)=>b.classList.toggle('active',j===i-1));$('count').textContent=fmt.format(filtered.length);const known=filtered.filter(r=>r[3]!==null);$('acres').textContent=known.length?fmt.format(Math.round(known.reduce((s,r)=>s+r[3],0))):'Unknown';if(!filtered.includes(selected)){selected=null;$('detail').textContent='Select a treatment on the map.'}draw()}
function zoom(f,x=W/2,y=H/2){const n=Math.min(90,Math.max(.15,scale*f)),r=n/scale;ox=x+(ox-x)*r;oy=y+(oy-y)*r;scale=n;draw()}
cv.onwheel=e=>{e.preventDefault();const b=cv.getBoundingClientRect();zoom(e.deltaY>0?.8:1.25,e.clientX-b.left,e.clientY-b.top)};
cv.onpointerdown=e=>{cv.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,total:0}};
cv.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.total+=Math.abs(dx)+Math.abs(dy);ox+=dx;oy+=dy;drag.x=e.clientX;drag.y=e.clientY;draw()};
cv.onpointercancel=()=>drag=null;
cv.onpointerup=e=>{if(!drag)return;if(drag.total<6){const b=cv.getBoundingClientRect(),x=(e.clientX-b.left-ox)/scale,y=(e.clientY-b.top-oy)/scale;let best=12/scale,hit=null;for(const r of filtered){const p=r[6][0][0],d=Math.hypot(p[0]-x,p[1]-y);if(d<best){best=d;hit=r}}if(hit){selected=hit;$('detail').textContent='DNR record '+hit[0]+' | '+(hit[1]??'Unknown year')+' | '+hit[2]+' | '+(hit[7]??'Unknown activity')+' | Reported acres: '+(hit[3]??'Unknown')}}drag=null;draw()};
$('in').onclick=()=>zoom(1.5);$('out').onclick=()=>zoom(.67);$('reset').onclick=reset;$('year').oninput=filter;$('category').onchange=filter;$('labels').onchange=draw;
$('play').onclick=()=>{if(timer){clearInterval(timer);timer=null;$('play').textContent='Play years';return}let i=1;$('year').value=i;filter();$('play').textContent='Pause';timer=setInterval(()=>{i++;if(i>years.length){clearInterval(timer);timer=null;$('play').textContent='Play years';return}$('year').value=i;filter()},1100)};
new ResizeObserver(size).observe(cv);filter();
</script></body></html>"""
def build(data,receipt_path,county_path,county_receipt,out):
    rec=json.loads(receipt_path.read_text()); cr=json.loads(county_receipt.read_text())
    if rec.get("schema")!="evercraft.forest-002.full-geometry.v1" or rec.get("record_count")!=27238 or rec.get("source_revision_epoch_ms")!=1793919093431 or sha(data)!=rec["inventory_sha256"]: raise ValueError("inventory_receipt_mismatch")
    if sha(county_path)!=cr["census_sha256"]: raise ValueError("county_receipt_mismatch")
    with data.open() as f: rows=[json.loads(x) for x in f]
    counties=json.loads(county_path.read_text())["features"]
    if len(rows)!=27238 or len({r["id"] for r in rows})!=27238 or len(counties)!=39: raise ValueError("input_inventory_mismatch")
    payload=json.dumps(pack(rows,counties),allow_nan=False,separators=(",",":")).replace("<","\\u003c")
    out.mkdir(mode=0o700,exist_ok=False)
    page=out/"atlas.private.html";page.write_text(PAGE.replace("__DATA__",payload),encoding="utf8")
    (out/"receipt.json").write_text(json.dumps({"atlas_sha256":sha(page),"inventory_sha256":sha(data),"county_sha256":sha(county_path),"records":len(rows),"publication_authorized":False},indent=2))
    print("PRIVATE_ATLAS="+str(page))
def self_test():
    ring=[[[-120,47],[-119,47],[-119,48],[-120,47]]]
    d=pack([{"id":1,"year":2025,"treatment":"thin","reported_acres":0,"gis_acres":None,"rings":ring,"activity":None}],[{"attributes":{"BASENAME":"Fixture"},"geometry":{"rings":ring}}])
    assert d["records"][0][3]==0 and d["records"][0][4] is None and len(d["counties"])==1
    assert "requestAnimationFrame" in PAGE and "__DATA__" in PAGE
    print("CANVAS_ATLAS_FIXTURE=PASS")
if __name__=="__main__":
    p=argparse.ArgumentParser();p.add_argument("--self-test",action="store_true")
    for k in ("data","receipt","counties","county-receipt","out"):p.add_argument("--"+k,type=pathlib.Path)
    a=p.parse_args();os.umask(0o077)
    if a.self_test:self_test()
    elif all((a.data,a.receipt,a.counties,a.county_receipt,a.out)):build(a.data,a.receipt,a.counties,a.county_receipt,a.out)
    else:p.error("all five paths required")
