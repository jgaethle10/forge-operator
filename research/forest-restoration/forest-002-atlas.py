#!/usr/bin/env python3
"""Private FOREST-002 interactive atlas. No server, external JS or public publishing."""
import argparse, hashlib, html, json, math, os, pathlib, urllib.request, urllib.parse, tempfile
CENSUS="https://tigerweb.geo.census.gov/arcgis/rest/services/Generalized_ACS2025/State_County/MapServer"
EXPECTED="6b0f1afdaeb10fbf22168a3c8c92c0f796f12935f9eebee6d41c9db20f01f4b7"
def sha(b): return hashlib.sha256(b).hexdigest()
def fetch_counties():
    q=urllib.parse.urlencode({"where":"STATE='53'","outFields":"NAME,GEOID,STATE","returnGeometry":"true","outSR":"4326","f":"json"})
    with urllib.request.urlopen(CENSUS+"/11/query?"+q,timeout=60) as r:
        raw=r.read(24*1024*1024+1)
    if len(raw)>24*1024*1024: raise ValueError("census_response_limit")
    obj=json.loads(raw)
    if obj.get("error") or obj.get("exceededTransferLimit") or obj.get("spatialReference",{}).get("wkid")!=4326: raise ValueError("census_response_invalid")
    rows=obj["features"]
    if len(rows)!=39 or len({r["attributes"]["GEOID"] for r in rows})!=39 or any(r["attributes"]["STATE"]!="53" for r in rows): raise ValueError("census_county_inventory_invalid")
    return rows,raw
def checked(rings):
    if not rings: raise ValueError("missing_geometry")
    for ring in rings:
        if len(ring)<4 or ring[0]!=ring[-1]: raise ValueError("invalid_ring")
        for p in ring:
            if len(p)!=2 or not all(type(x) in (int,float) and math.isfinite(x) for x in p) or not (-126<=p[0]<=-115 and 44<=p[1]<=50): raise ValueError("invalid_coordinate")
    return rings
def project(p):
    return ((p[0]+125)*math.cos(math.radians(47.5))*130,(49.3-p[1])*130)
def svgpath(rings):
    return " ".join("M"+" L".join("%.3f %.3f"%project(p) for p in ring)+" Z" for ring in checked(rings))
def build(data,counties):
    esc=html.escape
    county_paths=[]
    for row in counties:
        a=row["attributes"]; rings=row["geometry"]["rings"]
        name=esc(a["NAME"])
        pts=[project(p) for ring in rings for p in ring]
        x=(min(p[0] for p in pts)+max(p[0] for p in pts))/2
        y=(min(p[1] for p in pts)+max(p[1] for p in pts))/2
        county_paths.append(f'<path class="county" d="{svgpath(rings)}"><title>{name} County</title></path><text class="countylabel" x="{x:.2f}" y="{y:.2f}">{name}</text>')
    treatment_paths=[]
    for f in data["features"]:
        oid=int(f["object_id"]); rings=checked(f["rings"])
        x,y=project(rings[0][0])
        treatment_paths.append(f'<g class="treatment" tabindex="0" role="button" aria-label="Treatment record {oid}" data-id="{oid}" data-lon="{rings[0][0][0]:.6f}" data-lat="{rings[0][0][1]:.6f}" data-rings="{len(rings)}"><path d="{svgpath(rings)}"/><circle cx="{x:.3f}" cy="{y:.3f}" r="2.4"/><title>Record {oid}</title></g>')
    return """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Evercraft | Forest Intelligence Observatory</title>
<style>
:root{color-scheme:dark;--ink:#eaf4ef;--muted:#92aaa6;--mint:#a2efb7;--line:#263a37}*{box-sizing:border-box}body{margin:0;background:#0a1516;color:var(--ink);font:14px system-ui,sans-serif}header{display:flex;align-items:center;justify-content:space-between;padding:22px 30px;border-bottom:1px solid var(--line)}.eyebrow{font-size:11px;letter-spacing:3px;color:var(--mint);font-weight:700}h1{font-size:clamp(24px,3vw,39px);font-weight:550;margin:6px 0;letter-spacing:-1.5px}.pill{border:1px solid #54715d;padding:8px 12px;border-radius:30px;font-size:11px;color:var(--mint)}main{display:grid;grid-template-columns:minmax(0,1fr) 305px;min-height:75vh}.map{position:relative;background:radial-gradient(ellipse at 50% 40%,#182b29,#0b191e);overflow:hidden;min-height:560px}.map svg{width:100%;height:100%;position:absolute;touch-action:none;cursor:grab}.map svg:active{cursor:grabbing}.county{fill:#223f36;stroke:#627f70;stroke-width:.7;vector-effect:non-scaling-stroke;fill-rule:evenodd}.countylabel{fill:#a6bdb1;font-size:8px;text-anchor:middle;pointer-events:none}.treatment{cursor:pointer;outline:none}.treatment path{fill:#84e9ad;fill-opacity:.75;stroke:#b4ffc4;stroke-width:1;vector-effect:non-scaling-stroke;fill-rule:evenodd}.treatment circle{fill:#d7ffbc;stroke:#243b30;stroke-width:.6;vector-effect:non-scaling-stroke}.treatment:hover path,.treatment:focus path,.treatment.active path{fill:#ffdd8e;stroke:#fff1b5;stroke-width:2}.treatment.active circle{fill:#ffdd8e}.tools{position:absolute;right:16px;top:16px;display:grid;gap:6px}.tools button,button{background:#162a28;border:1px solid #3a5550;color:var(--ink);padding:10px;border-radius:7px;cursor:pointer}button:hover{background:#26443b}.legend{position:absolute;bottom:16px;left:18px;background:#101d1de8;padding:12px 15px;border:1px solid var(--line);border-radius:8px;color:var(--muted);line-height:1.8;pointer-events:none}.dot{display:inline-block;background:var(--mint);width:9px;height:9px;border-radius:50%;margin-right:6px}aside{border-left:1px solid var(--line);padding:24px;background:#101d1d}h2{font-size:16px;margin:24px 0 8px}.stat{font-size:34px;letter-spacing:-1px;line-height:1.15;color:var(--mint)}p,small{color:var(--muted);line-height:1.5}.metric{padding:15px 0;border-bottom:1px solid var(--line)}.detail{min-height:115px;padding:12px;background:#152823;border-radius:9px;line-height:1.65;overflow-wrap:anywhere}.switch{display:flex;gap:8px;align-items:center;margin:14px 0}footer{padding:14px 30px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}@media(max-width:800px){main{grid-template-columns:1fr}.map{min-height:64vh}aside{border-left:0}}
</style></head><body><header><div><div class="eyebrow">EVERCRAFT / FOREST INTELLIGENCE</div><h1>Restoration observatory</h1><small>Washington • Geographic evidence laboratory</small></div><span class="pill">PRIVATE RESEARCH</span></header><main><section class="map"><svg id="map" viewBox="0 0 830 470" aria-label="Washington counties and sampled forest treatments"><g id="counties">"""+ "".join(county_paths)+"""</g><g id="treatments">"""+ "".join(treatment_paths)+"""</g></svg><div class="tools"><button id="plus" aria-label="Zoom in">+</button><button id="minus" aria-label="Zoom out">−</button><button id="reset">Reset</button></div><div class="legend"><span class="dot"></span>Sampled treatment locator / polygon<br>County outlines · US Census 2025<br>Scroll to zoom · drag to pan</div></section><aside><div class="eyebrow">EVIDENCE BASELINE</div><div class="metric"><div class="stat">27,238</div><small>Reconciled DNR attribute records</small></div><div class="metric"><div class="stat">"""+str(data["sample_count"])+"""</div><small>Sampled treatment geometries displayed</small></div><div class="metric"><div class="stat">$53.6M</div><small>2025 disclosed Yakima wood & paper payroll (county-wide, not spatially joined)</small></div><label class="switch"><input id="showlabels" type="checkbox" checked> County labels</label><label class="switch"><input id="showpoints" type="checkbox" checked> Treatment locators</label><h2>Inspect a treatment</h2><div class="detail" id="detail" aria-live="polite">Select a glowing treatment record to inspect its source ID and geographic locator.</div><p>Sample selected by object ID, not geographic representativeness. No unique acreage or timber availability inferred.</p></aside></main><footer>WA DNR forest treatment data • 2017–Oct 2026 | Census TIGERweb 2025 county context | Simplified geometry · rights review HOLD · not for publication</footer><script>
const svg=document.getElementById('map'), detail=document.getElementById('detail');let v=[0,0,830,470],drag=null,moved=false;const apply=()=>svg.setAttribute('viewBox',v.join(' '));function point(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())}function zoom(f,x=v[0]+v[2]/2,y=v[1]+v[3]/2){const w=Math.max(8,Math.min(1660,v[2]*f)),r=w/v[2];v=[x+(v[0]-x)*r,y+(v[1]-y)*r,w,v[3]*r];apply()}svg.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);zoom(e.deltaY>0?1.25:.8,p.x,p.y)},{passive:false});svg.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};moved=false});svg.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)moved=true;const scale=svg.getScreenCTM().a;v[0]-=dx/scale;v[1]-=dy/scale;drag={x:e.clientX,y:e.clientY};apply()});window.addEventListener('pointerup',()=>drag=null);document.getElementById('plus').onclick=()=>zoom(.7);document.getElementById('minus').onclick=()=>zoom(1.4);document.getElementById('reset').onclick=()=>{v=[0,0,830,470];apply()};function select(el){document.querySelector('.treatment.active')?.classList.remove('active');el.classList.add('active');detail.textContent='DNR record '+el.dataset.id+' | '+el.dataset.lat+'°, '+el.dataset.lon+'° | '+el.dataset.rings+' polygon ring(s). Locator is a boundary vertex, not a centroid.'}document.querySelectorAll('.treatment').forEach(el=>{el.onclick=()=>{if(!moved)select(el)};el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(el)}}});document.getElementById('showlabels').onchange=e=>document.querySelectorAll('.countylabel').forEach(x=>x.style.display=e.target.checked?'':'none');document.getElementById('showpoints').onchange=e=>document.querySelectorAll('.treatment circle').forEach(x=>x.style.display=e.target.checked?'':'none');
</script></body></html>"""
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--geometry",type=pathlib.Path)
    p.add_argument("--out",type=pathlib.Path)
    p.add_argument("--self-test",action="store_true")
    a=p.parse_args()
    if a.self_test:
        ring=[[[-120,47],[-119,47],[-119,48],[-120,47]]]
        s=build({"sample_count":1,"features":[{"object_id":7,"rings":ring}]},[{"attributes":{"NAME":"Fixture"},"geometry":{"rings":ring}}])
        assert 'data-id="7"' in s and 'Fixture County' in s and 'PRIVATE RESEARCH' in s and 'viewBox' in s
        print("ATLAS_FIXTURE=PASS");return
    if not a.geometry or not a.out: p.error("--geometry and --out required")
    os.umask(0o077)
    raw=a.geometry.read_bytes()
    if sha(raw)!=EXPECTED: raise ValueError("known_geometry_hash_mismatch")
    data=json.loads(raw)
    if data["sample_count"]!=128 or len(data["features"])!=128 or data["source_revision_epoch_ms"]!=1793919093431: raise ValueError("sample_mismatch")
    counties,source=fetch_counties()
    output=build(data,counties).encode()
    a.out.mkdir(mode=0o700,exist_ok=False)
    (a.out/"atlas.private.html").write_bytes(output)
    (a.out/"counties.private.json").write_bytes(source)
    (a.out/"receipt.json").write_text(json.dumps({"geometry_sha256":sha(raw),"census_sha256":sha(source),"atlas_sha256":sha(output),"county_count":len(counties),"sample_count":128,"publication_authorized":False},indent=2))
    print("PRIVATE_ATLAS="+str(a.out/"atlas.private.html"))
if __name__=="__main__": main()
