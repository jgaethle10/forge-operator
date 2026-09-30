import json, math, time, hashlib, zipfile, urllib.parse, urllib.request
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT
from concurrent.futures import ThreadPoolExecutor, as_completed
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, Color
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape

ROOT=DATA_ROOT
SRC=SOURCE_ROOT
FS6=ROOT/'fs6_factory'
OUT=ROOT/'release_candidate'
CACHE=ROOT/'exhibit_cache'
OUT.mkdir(parents=True,exist_ok=True)
CACHE.mkdir(parents=True,exist_ok=True)
PAGE=(17*inch,11*inch); PW,PH=PAGE
DATE='09/18/2026'
VERSION='FS6-RC-v1.0'
FEMA_BASE='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer'
OVERPASS_ENDPOINTS=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
]

def clean(v): return ' '.join(str(v or '').split())
def label(c,s,x,y,size=6,bold=False,anchor='left'):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size); c.setFillColor(black)
    if anchor=='center': c.drawCentredString(x,y,clean(s))
    elif anchor=='right': c.drawRightString(x,y,clean(s))
    else: c.drawString(x,y,clean(s))
def fit(c,s,x,y,maxw,size=8,bold=False):
    font='Helvetica-Bold' if bold else 'Helvetica'; fs=size; txt=clean(s)
    while fs>4.2 and stringWidth(txt,font,fs)>maxw: fs-=.25
    c.setFont(font,fs); c.setFillColor(black); c.drawString(x,y,txt)
def wrap(c,s,x,y,maxw,size=5.5,leading=7,bold=False,max_lines=12):
    font='Helvetica-Bold' if bold else 'Helvetica'; words=clean(s).split(); line=''; lines=[]
    for w in words:
        t=(line+' '+w).strip()
        if stringWidth(t,font,size)<=maxw: line=t
        else:
            if line: lines.append(line)
            line=w
    if line: lines.append(line)
    for ln in lines[:max_lines]:
        c.setFont(font,size); c.drawString(x,y,ln); y-=leading
    return y
def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def local_to_lonlat(d,x,y):
    lat0=float(d['lat']); lon0=float(d['lon'])
    lat=lat0 + float(y)/111320.0
    lon=lon0 + float(x)/(111320.0*max(.2,math.cos(math.radians(lat0))))
    return lon,lat

def point_dist_m(lat0,lon0,lat,lon):
    x=math.radians(lon-lon0)*6371000*math.cos(math.radians((lat+lat0)/2))
    y=math.radians(lat-lat0)*6371000
    return math.hypot(x,y)

def is_multiseg(coords):
    return bool(coords) and isinstance(coords[0], (list,tuple)) and len(coords[0]) > 0 and isinstance(coords[0][0], (list,tuple))

def is_multiseg(coords):
    return bool(coords) and isinstance(coords[0], (list,tuple)) and len(coords[0]) > 0 and isinstance(coords[0][0], (list,tuple))

def local_major_roads(d):
    out=[]
    for f in d.get('features',[]):
        if f.get('class')!='road' or f.get('highway') not in ('motorway','trunk','primary','secondary'): continue
        try:
            g=shape(f['geometry'])
        except Exception:
            continue
        coords=[]
        if g.geom_type=='LineString':
            for x,y in g.coords: coords.append(local_to_lonlat(d,x,y))
        elif g.geom_type=='MultiLineString':
            for line in g.geoms:
                coords.append([local_to_lonlat(d,x,y) for x,y in line.coords])
        out.append({'highway':f.get('highway'),'name':clean(f.get('name')),'ref':clean((f.get('tags') or {}).get('ref')),'coords':coords})
    return out

def fetch_overpass(site,d):
    cp=CACHE/f'area_major_roads_site_{site:02d}.json'
    if cp.exists():
        return json.loads(cp.read_text())
    lat,lon=d['lat'],d['lon']
    q=f'[out:json][timeout:25];way(around:5000,{lat},{lon})["highway"~"^(motorway|trunk|primary|secondary)$"];out geom;'
    last=''
    for endpoint in OVERPASS_ENDPOINTS:
        for attempt in range(2):
            try:
                req=urllib.request.Request(endpoint,data=urllib.parse.urlencode({'data':q}).encode(),headers={'User-Agent':'Evercraft-RIVET/1.0'})
                with urllib.request.urlopen(req,timeout=45) as r: raw=json.load(r)
                roads=[]
                for e in raw.get('elements',[]):
                    geom=e.get('geometry') or []
                    if len(geom)<2: continue
                    tags=e.get('tags') or {}
                    roads.append({
                        'highway':tags.get('highway'),'name':clean(tags.get('name')),'ref':clean(tags.get('ref')),
                        'coords':[(float(p['lon']),float(p['lat'])) for p in geom]
                    })
                obj={'source':'OpenStreetMap via Overpass','endpoint':endpoint,'retrieved_at':DATE,'roads':roads}
                cp.write_text(json.dumps(obj))
                return obj
            except Exception as e:
                last=repr(e); time.sleep(1.0+attempt)
    obj={'source':'OpenStreetMap via Overpass','retrieved_at':DATE,'roads':[],'error':last}
    cp.write_text(json.dumps(obj))
    return obj

def get_area_data(d):
    site=int(d['site']); local=local_major_roads(d)
    if local:
        return {'source':'Canonical site record / OpenStreetMap features','retrieved_at':DATE,'roads':local,'external_fetch':False}
    return {**fetch_overpass(site,d),'external_fetch':True}

def fetch_json(url,timeout=35):
    req=urllib.request.Request(url,headers={'User-Agent':'Evercraft-RIVET/1.0'})
    with urllib.request.urlopen(req,timeout=timeout) as r: return json.load(r)

def fema_for_site(site,d):
    cp=CACHE/f'fema_site_{site:02d}.json'
    if cp.exists(): return json.loads(cp.read_text())
    lat,lon=float(d['lat']),float(d['lon'])
    common={'f':'json','geometry':f'{lon},{lat}','geometryType':'esriGeometryPoint','inSR':'4326','spatialRel':'esriSpatialRelIntersects','returnGeometry':'false','outFields':'*'}
    zone=fetch_json(FEMA_BASE+'/28/query?'+urllib.parse.urlencode(common))
    panel=fetch_json(FEMA_BASE+'/3/query?'+urllib.parse.urlencode(common))
    dz=.012
    env=f'{lon-dz},{lat-dz},{lon+dz},{lat+dz}'
    p={'f':'geojson','geometry':env,'geometryType':'esriGeometryEnvelope','inSR':'4326','spatialRel':'esriSpatialRelIntersects','returnGeometry':'true','outFields':'FLD_ZONE,ZONE_SUBTY,SFHA_TF'}
    nearby=fetch_json(FEMA_BASE+'/28/query?'+urllib.parse.urlencode(p))
    zattrs=(zone.get('features') or [{}])[0].get('attributes') or {}
    pattrs=(panel.get('features') or [{}])[0].get('attributes') or {}
    obj={'source':'FEMA National Flood Hazard Layer','service':FEMA_BASE,'retrieved_at':DATE,'point_zone':zattrs,'panel':pattrs,'nearby_geojson':nearby}
    cp.write_text(json.dumps(obj))
    return obj

def prepare_sources():
    records=[]
    for fp in sorted(SRC.glob('site_*.json')):
        d=json.loads(fp.read_text()); records.append(d)
    if len(records)!=26: raise RuntimeError(f'Expected 26 sites, found {len(records)}')
    # Fetch only wider-road sites concurrently; FEMA sequential is fast and official.
    need=[d for d in records if not local_major_roads(d)]
    with ThreadPoolExecutor(max_workers=2) as ex:
        futs={ex.submit(fetch_overpass,int(d['site']),d):d['site'] for d in need}
        for fut in as_completed(futs):
            site=futs[fut]
            try:
                obj=fut.result(); print('AREA_FETCH',site,len(obj.get('roads',[])),'error' if obj.get('error') else 'ok')
            except Exception as e: print('AREA_FETCH_ERROR',site,repr(e))
    for d in records:
        try:
            obj=fema_for_site(int(d['site']),d); print('FEMA_FETCH',d['site'],(obj.get('point_zone') or {}).get('FLD_ZONE'),(obj.get('point_zone') or {}).get('SFHA_TF'))
        except Exception as e:
            print('FEMA_FETCH_ERROR',d['site'],repr(e))
            (CACHE/f'fema_site_{int(d["site"]):02d}.json').write_text(json.dumps({'source':'FEMA NFHL','retrieved_at':DATE,'error':repr(e),'point_zone':{},'panel':{},'nearby_geojson':{'features':[]}}))
    return records

def draw_header(c,d,sheet,title):
    c.setFillColor(Color(.04,.10,.14)); c.rect(0,PH-34,PW,34,stroke=0,fill=1)
    c.setFillColor(white); c.setFont('Helvetica-Bold',8)
    c.drawString(26,PH-21,f"RIVET | SITE {int(d['site']):02d} | {title.upper()}")
    c.drawRightString(PW-26,PH-21,f"{sheet} | RELEASE CANDIDATE")
    c.setFillColor(black)

def draw_footer(c,d,sheet,title,source_note):
    y=22; h=82; x1=250; x2=790; x3=1040
    c.setStrokeColor(black); c.setFillColor(white); c.rect(26,y,PW-52,h,stroke=1,fill=1)
    for x in (x1,x2,x3): c.line(x,y,x,y+h)
    label(c,'RIVET',42,y+50,17,True); label(c,'EV INFRASTRUCTURE INTELLIGENCE',42,y+36,6.2)
    label(c,'PRELIMINARY / NOT FOR CONSTRUCTION',42,y+15,5.8,True)
    label(c,title,(x1+x2)/2,y+54,9.5,True,'center'); fit(c,d['address'],x1+12,y+34,x2-x1-24,7.2,True)
    fit(c,f"PARCEL {d.get('parcel_id') or 'TBD'}",x1+12,y+17,x2-x1-24,5.5)
    label(c,'SOURCE / EVIDENCE',x2+10,y+57,6,True); wrap(c,source_note,x2+10,y+45,x3-x2-20,4.6,6,max_lines=5)
    label(c,f"SHEET {sheet}",x3+10,y+55,7.5,True); label(c,f"DATE {DATE}",x3+10,y+34,5.5); label(c,'SCALE AS SHOWN',x3+10,y+15,5.5)

def transform_lonlat(bounds,x,y,box):
    minlon,minlat,maxlon,maxlat=bounds; bx,by,bw,bh=box
    sx=bw/max(1e-9,maxlon-minlon); sy=bh/max(1e-9,maxlat-minlat); s=min(sx,sy)
    ox=bx+(bw-(maxlon-minlon)*s)/2; oy=by+(bh-(maxlat-minlat)*s)/2
    return ox+(x-minlon)*s, oy+(y-minlat)*s

def draw_polyline(c,coords,bounds,box,width=1.0):
    if not coords or len(coords)<2:return
    p=c.beginPath()
    x,y=transform_lonlat(bounds,*coords[0],box); p.moveTo(x,y)
    for lon,lat in coords[1:]:
        x,y=transform_lonlat(bounds,lon,lat,box); p.lineTo(x,y)
    c.setLineWidth(width); c.drawPath(p,stroke=1,fill=0)

def area_sheet(path,d,area):
    c=canvas.Canvas(str(path),pagesize=PAGE); draw_header(c,d,'A001','AREA MAP / ROAD CONTEXT')
    box=(38,132,885,600); bx,by,bw,bh=box
    c.setStrokeColor(black); c.rect(bx,by,bw,bh,stroke=1,fill=0)
    lat0,lon0=float(d['lat']),float(d['lon'])
    roads=area.get('roads') or []
    coords=[(lon0,lat0)]
    for r in roads:
        rc=r.get('coords') or []
        if is_multiseg(rc):
            for seg in rc: coords.extend(seg)
        else: coords.extend(rc)
    if roads and len(coords)>1:
        lons=[p[0] for p in coords]; lats=[p[1] for p in coords]
        minlon,maxlon=min(lons),max(lons); minlat,maxlat=min(lats),max(lats)
        dx=maxlon-minlon; dy=maxlat-minlat
        pad=max(dx,dy,.02)*.08
        bounds=(minlon-pad,minlat-pad,maxlon+pad,maxlat+pad)
    else:
        bounds=(lon0-.025,lat0-.02,lon0+.025,lat0+.02)
    # roads
    style={'motorway':2.8,'trunk':2.4,'primary':2.0,'secondary':1.3}
    named=[]
    for r in roads:
        rc=r.get('coords') or []
        if not rc: continue
        c.setStrokeColor(black)
        if is_multiseg(rc):
            for seg in rc: draw_polyline(c,seg,bounds,box,style.get(r.get('highway'),1))
            flat=[p for seg in rc for p in seg]
        else:
            draw_polyline(c,rc,bounds,box,style.get(r.get('highway'),1)); flat=rc
        nm=clean(r.get('name')); ref=clean(r.get('ref'))
        if (nm or ref) and flat:
            mid=flat[len(flat)//2]; x,y=transform_lonlat(bounds,*mid,box)
            txt=' / '.join([v for v in (nm,ref) if v])
            if txt not in [x[0] for x in named]:
                named.append((txt,x,y))
    # parcel
    try:
        parcel=shape(d['parcel']); ring=list(parcel.exterior.coords)
        ll=[local_to_lonlat(d,x,y) for x,y in ring]
        c.setDash([5,2],0); draw_polyline(c,ll,bounds,box,1.1); c.setDash()
    except Exception: pass
    # site marker
    sx,sy=transform_lonlat(bounds,lon0,lat0,box)
    c.setFillColor(black); c.circle(sx,sy,4,stroke=1,fill=1); label(c,'CANDIDATE SITE',sx+8,sy+6,6,True)
    # labels limited
    for txt,x,y in named[:10]:
        c.setFillColor(white); c.rect(x-2,y-3,min(155,stringWidth(txt,'Helvetica-Bold',5.2)+6),10,stroke=0,fill=1)
        fit(c,txt,x,y,150,5.2,True)
    # north arrow
    c.setLineWidth(1); c.line(bx+35,by+bh-80,bx+35,by+bh-25); c.line(bx+35,by+bh-25,bx+27,by+bh-42); c.line(bx+35,by+bh-25,bx+43,by+bh-42); label(c,'N',bx+35,by+bh-17,7,True,'center')
    # nearest mapped major screening distance
    best=None
    for r in roads:
        rc=r.get('coords') or []
        flat=[p for seg in rc for p in seg] if is_multiseg(rc) else rc
        for lon,lat in flat or []:
            dist=point_dist_m(lat0,lon0,lat,lon)
            if best is None or dist<best[0]: best=(dist,r)
    side_x=945
    c.setStrokeColor(black); c.rect(side_x,480,245,252,stroke=1,fill=0)
    label(c,'ATTACHMENT E - AREA MAP CONTROL',side_x+12,710,7,True)
    fit(c,d['address'],side_x+12,692,220,6,True)
    y=670
    if best:
        r=best[1]; road=' / '.join([v for v in (clean(r.get('name')),clean(r.get('ref'))) if v]) or clean(r.get('highway'))
        fit(c,'NEAREST MAPPED MAJOR ROAD:',side_x+12,y,220,5,True); y-=14; fit(c,road,side_x+12,y,220,6.2,True); y-=16
        label(c,f"STRAIGHT-LINE SCREENING: {best[0]/1609.344:.2f} MI",side_x+12,y,5.3,True); y-=20
    else:
        fit(c,'MAJOR-ROAD CONTEXT NOT RETRIEVED',side_x+12,y,220,5.5,True); y-=20
    wrap(c,'Attachment E 6.1 requires a driving distance to the corridor at 0.01-mile resolution for Corridor Zones, or a straight-line distance to the nearest NEVI-funded station for Urban/Rural Zones. This map does not silently substitute the screening distance for that application field.',side_x+12,y,220,5.1,7,max_lines=12)
    c.rect(side_x,350,245,115,stroke=1,fill=0)
    label(c,'ACCESS / MAP NOTES',side_x+12,445,6.5,True)
    wrap(c,'Candidate-site marker uses the canonical geocode. Exact charging-station curb-cut coordinates remain an application verification item. Road context is source-derived where available; proposed access modifications are not inferred.',side_x+12,428,220,5.1,7,max_lines=9)
    src=f"{area.get('source','Road context source unavailable')}; accessed {area.get('retrieved_at',DATE)}. Candidate parcel/geocode from canonical RIVET site record."
    draw_footer(c,d,'A001','AREA MAP / ROAD CONTEXT',src)
    c.showPage(); c.save()

def fema_sheet(path,d,fema):
    c=canvas.Canvas(str(path),pagesize=PAGE); draw_header(c,d,'F001','FEMA FLOODPLAIN EXHIBIT')
    box=(38,132,885,600); bx,by,bw,bh=box
    c.setStrokeColor(black); c.rect(bx,by,bw,bh,stroke=1,fill=0)
    lat0,lon0=float(d['lat']),float(d['lon']); dz=.012; bounds=(lon0-dz,lat0-dz,lon0+dz,lat0+dz)
    gj=fema.get('nearby_geojson') or {}; features=gj.get('features') or []
    def rings_from_geom(g):
        typ=(g or {}).get('type'); co=(g or {}).get('coordinates') or []
        if typ=='Polygon': return co
        if typ=='MultiPolygon': return [ring for poly in co for ring in poly]
        return []
    for ft in features:
        props=ft.get('properties') or {}; sfha=clean(props.get('SFHA_TF')); zone=clean(props.get('FLD_ZONE'))
        fill=Color(.76,.76,.76) if sfha=='T' else Color(.92,.92,.92)
        for ring in rings_from_geom(ft.get('geometry')):
            if len(ring)<3: continue
            p=c.beginPath(); x,y=transform_lonlat(bounds,*ring[0],box); p.moveTo(x,y)
            for lon,lat in ring[1:]:
                x,y=transform_lonlat(bounds,lon,lat,box); p.lineTo(x,y)
            p.close(); c.setFillColor(fill); c.setStrokeColor(Color(.45,.45,.45)); c.setLineWidth(.45); c.drawPath(p,stroke=1,fill=1)
    # parcel
    try:
        parcel=shape(d['parcel']); ll=[local_to_lonlat(d,x,y) for x,y in parcel.exterior.coords]
        c.setStrokeColor(black); c.setDash([5,2],0); draw_polyline(c,ll,bounds,box,1.2); c.setDash()
    except Exception: pass
    sx,sy=transform_lonlat(bounds,lon0,lat0,box); c.setFillColor(black); c.circle(sx,sy,4,stroke=1,fill=1); label(c,'SITE',sx+8,sy+6,6,True)
    # legend
    c.setFillColor(Color(.76,.76,.76)); c.rect(bx+15,by+15,18,10,stroke=1,fill=1); label(c,'SPECIAL FLOOD HAZARD AREA (SFHA)',bx+40,by+17,5.2)
    c.setFillColor(Color(.92,.92,.92)); c.rect(bx+235,by+15,18,10,stroke=1,fill=1); label(c,'OTHER FEMA FLOOD HAZARD ZONE',bx+260,by+17,5.2)
    # side panel
    z=fema.get('point_zone') or {}; p=fema.get('panel') or {}
    zone=clean(z.get('FLD_ZONE')) or 'UNKNOWN'; sub=clean(z.get('ZONE_SUBTY')) or 'UNKNOWN'; sfha=clean(z.get('SFHA_TF'))
    yesno='YES' if sfha=='T' else 'NO' if sfha=='F' else 'UNKNOWN'
    side_x=945
    c.setStrokeColor(black); c.setFillColor(white); c.rect(side_x,445,245,287,stroke=1,fill=1)
    label(c,'ATTACHMENT E 6.13',side_x+12,710,7,True)
    fit(c,f"100-YEAR / SFHA AT SITE: {yesno}",side_x+12,688,220,7,True)
    fit(c,f"FEMA ZONE: {zone}",side_x+12,668,220,6.4,True)
    y=650
    y=wrap(c,f"ZONE SUBTYPE: {sub}",side_x+12,y,220,5.3,7,max_lines=4)-4
    panel=clean(p.get('FIRM_PAN')) or clean(p.get('PANEL')) or 'UNKNOWN'
    eff=clean(p.get('EFF_DATE')) or 'UNKNOWN'
    fit(c,f"FIRM PANEL: {panel}",side_x+12,y,220,5.3,True); y-=15
    fit(c,f"EFFECTIVE DATE VALUE: {eff}",side_x+12,y,220,5.0); y-=20
    wrap(c,'This exhibit uses FEMA National Flood Hazard Layer data at the candidate site. It does not replace a survey, elevation certificate, engineering flood analysis, or required mitigation design where floodplain constraints apply.',side_x+12,y,220,5.1,7,max_lines=10)
    c.rect(side_x,315,245,115,stroke=1,fill=0)
    label(c,'EVIDENCE BOUNDARY',side_x+12,408,6.5,True)
    wrap(c,'The point-zone result is an official GIS screening observation. Parcel-edge flood exposure may differ from the geocoded point. Final application review should confirm the entire proposed installation area and current effective map.',side_x+12,391,220,5.0,7,max_lines=9)
    src=f"FEMA National Flood Hazard Layer, official ArcGIS service, retrieved {fema.get('retrieved_at',DATE)}. Candidate site/parcel from canonical RIVET record."
    draw_footer(c,d,'F001','FEMA FLOODPLAIN EXHIBIT',src)
    c.showPage(); c.save()

def build():
    records=prepare_sources(); manifest=[]; errors=[]
    for d in records:
        site=int(d['site']); nn=f'{site:02d}'
        try:
            area=get_area_data(d); fema=json.loads((CACHE/f'fema_site_{nn}.json').read_text())
            a=OUT/f'RIVET_Site_{nn}_A001_Area_Map.pdf'; f=OUT/f'RIVET_Site_{nn}_F001_FEMA.pdf'
            area_sheet(a,d,area); fema_sheet(f,d,fema)
            old=FS6/f'RIVET_Site_{nn}_FS6_4_Sheet.pdf'
            rc=OUT/f'RIVET_Site_{nn}_FS6_RC_6_Sheet.pdf'
            w=PdfWriter()
            for src in (a,old,f):
                for pg in PdfReader(str(src)).pages: w.add_page(pg)
            with open(rc,'wb') as fh:w.write(fh)
            zone=(fema.get('point_zone') or {})
            manifest.append({
                'site':site,'address':d['address'],'parcel_id':d.get('parcel_id'),'release_candidate':str(rc),
                'pages':len(PdfReader(str(rc)).pages),'sha256':sha256(rc),
                'area_map_source':area.get('source'),'area_map_fetch_error':area.get('error'),
                'fema_zone':zone.get('FLD_ZONE'),'fema_zone_subtype':zone.get('ZONE_SUBTY'),'fema_sfha':zone.get('SFHA_TF'),
                'fema_panel':(fema.get('panel') or {}).get('FIRM_PAN'),
                'factory_exceptions':next((x['exceptions'] for x in json.loads((FS6/'fs6_factory_manifest.json').read_text())['sites'] if x['site']==site),[])
            })
            print('RC',nn,'pages',manifest[-1]['pages'],'fema',manifest[-1]['fema_zone'],manifest[-1]['fema_sfha'],'area_roads',len(area.get('roads') or []))
        except Exception as e:
            errors.append({'site':site,'error':repr(e)}); print('ERROR',nn,repr(e))
    if errors: raise RuntimeError(json.dumps(errors,indent=2))
    combined=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_RC_156_Sheet.pdf'
    w=PdfWriter()
    for s in sorted(manifest,key=lambda x:x['site']):
        for pg in PdfReader(s['release_candidate']).pages:w.add_page(pg)
    with open(combined,'wb') as fh:w.write(fh)
    zpath=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_RC.zip'
    with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
        for s in manifest:
            p=Path(s['release_candidate']);z.write(p,p.name)
        z.write(combined,combined.name)
    out={'version':VERSION,'generated_at':DATE,'site_count':26,'pages':len(PdfReader(str(combined)).pages),'combined_pdf':str(combined),'combined_sha256':sha256(combined),'zip':str(zpath),'sites':manifest,'errors':errors}
    (OUT/'release_candidate_manifest.json').write_text(json.dumps(out,indent=2))
    print('COMBINED',out['pages'],combined.stat().st_size,'SHA',out['combined_sha256'])
    print('ZIP',zpath.stat().st_size)

if __name__=='__main__': build()