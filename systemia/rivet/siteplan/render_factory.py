import json, math, hashlib, zipfile, importlib.util, sys
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, Color
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape, Polygon, Point, LineString
from shapely import affinity

ROOT = DATA_ROOT
SRC = SOURCE_ROOT
OUT = ROOT / 'fs6_factory'
OUT.mkdir(parents=True, exist_ok=True)
PAGE = (17*inch, 11*inch)
PW, PH = PAGE
DATE = '09/18/2026'
FACTORY_VERSION = 'FS6-FACTORY-v1.0'
SITE_W, SITE_H = 865, 605
SITE_X, SITE_Y = 28, 135
SIDE_X, SIDE_W = 910, 280
G95=Color(.95,.95,.95); G90=Color(.90,.90,.90); G78=Color(.78,.78,.78); G55=Color(.55,.55,.55)

# Import the proven geometry helpers from the canonical earlier renderer.
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('legacy_renderer',HERE/'render_legacy.py')
legacy=importlib.util.module_from_spec(spec); spec.loader.exec_module(legacy)

HOST_OVERRIDES={
  1:'Tru by Hilton Farmville',
  2:'Holiday Inn Express',
  3:'Spark by Hilton',
  4:'Holiday Inn Express & Suites Charlottesville',
  5:'EXISTING HOTEL BUILDING',
}
STALL_OVERRIDES={1:8,2:8,3:8,4:8,5:8,6:8,7:8}

def clean(s):
    return ' '.join(str(s or '').split())

def fit(c,s,x,y,maxw,size=8,bold=False):
    font='Helvetica-Bold' if bold else 'Helvetica'
    fs=size
    while fs>4.5 and stringWidth(clean(s),font,fs)>maxw: fs-=.25
    c.setFont(font,fs); c.setFillColor(black); c.drawString(x,y,clean(s)); return fs

def label(c,s,x,y,size=6,bold=False,anchor='left'):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size); c.setFillColor(black)
    if anchor=='center': c.drawCentredString(x,y,clean(s))
    elif anchor=='right': c.drawRightString(x,y,clean(s))
    else: c.drawString(x,y,clean(s))

def wrap(c,s,x,y,maxw,size=5.2,leading=7,bold=False,max_lines=8):
    words=clean(s).split(); lines=[]; line=''
    font='Helvetica-Bold' if bold else 'Helvetica'
    for word in words:
        test=(line+' '+word).strip()
        if stringWidth(test,font,size)<=maxw: line=test
        else:
            if line: lines.append(line)
            line=word
    if line: lines.append(line)
    for ln in lines[:max_lines]:
        c.setFont(font,size); c.drawString(x,y,ln); y-=leading
    return y

def box(c,x,y,w,h,title=None):
    c.setStrokeColor(black); c.setLineWidth(.65); c.setFillColor(white); c.rect(x,y,w,h,stroke=1,fill=1)
    if title:
        c.setFillColor(Color(.07,.12,.16)); c.rect(x,y+h-19,w,19,stroke=0,fill=1)
        c.setFillColor(white); c.setFont('Helvetica-Bold',7); c.drawString(x+8,y+h-13,title.upper())
        c.setFillColor(black)

def evidence_state(d):
    counts=d.get('feature_counts') or {}
    feature_total=sum(int(v or 0) for v in counts.values())
    roads=len(d.get('road_names') or [])
    buildings=int(counts.get('building',0) or 0)
    parking=int(counts.get('parking',0) or 0)
    tr=d.get('trench_length_ft')
    weak=[]
    if feature_total==0: weak.append('NO MAPPED SITE FEATURES')
    if roads==0: weak.append('NO NAMED ROAD GEOMETRY')
    if buildings==0: weak.append('BUILDING FOOTPRINT UNRESOLVED')
    if parking==0 and not d.get('parking_context_evidence'): weak.append('PARKING GEOMETRY UNRESOLVED')
    if tr is None or float(tr or 0)<=1: weak.append('UTILITY/TRENCH ROUTE UNRESOLVED')
    return weak

def primary_host(d):
    if d.get('host_evidence',{}).get('name'):
        return clean(d['host_evidence']['name'])
    if d['site'] in HOST_OVERRIDES:
        return HOST_OVERRIDES[d['site']]
    parcel=shape(d['parcel'])
    address_point=Point(0,0)
    candidates=[]
    for f in d.get('features',[]):
        if f.get('class')!='building' or not f.get('name'):
            continue
        try:
            g=shape(f['geometry'])
            # A named building may be shown as the host only when it sits on the
            # candidate parcel and is spatially tied to the geocoded address point.
            if not g.intersects(parcel.buffer(2)):
                continue
            dist=g.distance(address_point)
            contains_origin=g.buffer(2).contains(address_point)
            area=getattr(g,'area',0)
            candidates.append((0 if contains_origin else 1,dist,-area,clean(f['name'])))
        except Exception:
            pass
    if candidates:
        candidates.sort()
        best=candidates[0]
        # If no named building is close to the address point, preserve uncertainty.
        if best[0]==0 or best[1] <= 22:
            return best[3]
    return 'EXISTING BUILDING / HOST FIELD VERIFY'

def site_stall_count(d):
    explicit=d.get('charging_stalls')
    if explicit is None:
        explicit=(d.get('compiler_meta') or {}).get('stall_count')
    if explicit is None:
        explicit=(((d.get('geometry_compiler') or {}).get('primitives') or {}).get('stall_module') or {}).get('count')
    if explicit is not None:
        return int(explicit)
    if d['site'] in STALL_OVERRIDES: return STALL_OVERRIDES[d['site']]
    # Modeled fallback only. Project-specific requirements must be explicit in source data.
    return 6

def make_transform(d, pad_right=False):
    parcel=shape(d['parcel'])
    features=[]
    for f in d.get('features',[]):
        try: features.append((f,shape(f.get('geometry'))))
        except Exception: pass
    zone=shape(d['ev_zone']) if d.get('ev_zone') else None
    pminx,pminy,pmaxx,pmaxy=parcel.bounds
    margin=max(18,max(pmaxx-pminx,pmaxy-pminy)*.20)
    minx,maxx=pminx-margin,pmaxx+margin; miny,maxy=pminy-margin,pmaxy+margin
    sx=SITE_W/(maxx-minx); sy=SITE_H/(maxy-miny); s=min(sx,sy)
    ox=SITE_X+(SITE_W-(maxx-minx)*s)/2; oy=SITE_Y+(SITE_H-(maxy-miny)*s)/2
    return parcel,features,zone,(lambda x,y:(ox+(x-minx)*s,oy+(y-miny)*s)),(minx,miny,maxx,maxy)

def draw_base(c,d,detail=False):
    parcel,features,zone,tx,bounds=make_transform(d)
    c.setFillColor(white); c.rect(SITE_X,SITE_Y,SITE_W,SITE_H,stroke=0,fill=1)
    c.setStrokeColor(black); c.setLineWidth(.7); c.rect(SITE_X,SITE_Y,SITE_W,SITE_H,stroke=1,fill=0)
    order=['road','parking','water','vegetation','barrier','building','power','tree','light','camera','other']
    for kind in order:
        for f,g in features:
            if f.get('class')==kind:
                legacy.draw_geom(c,g,tx,kind)
    # parcel
    c.setStrokeColor(black); c.setLineWidth(1.5); c.setDash([7,2,1,2],0)
    legacy.draw_geom(c,parcel,tx,'other'); c.setDash()
    rp=parcel.representative_point(); px,py=tx(rp.x,rp.y)
    label(c,f"PARCEL {d.get('parcel_id') or 'TBD'}",px,py+12,6.3,True,'center')
    # roads
    shown=0
    for f,g in features:
        if f.get('class')=='road' and f.get('name') and g is not None and g.distance(parcel)<65 and shown<5:
            legacy.line_label(c,g,tx,f['name']); shown+=1
    # buildings
    host=primary_host(d)
    host_labeled=False
    for f,g in features:
        if f.get('class')=='building' and g is not None and g.intersects(parcel.buffer(6)):
            p=g.representative_point(); x,y=tx(p.x,p.y)
            nm=clean(f.get('name'))
            if nm and nm.lower()==host.lower():
                label(c,host.upper(),x,y,5.4,True,'center'); host_labeled=True
            elif not nm:
                label(c,'EXISTING BUILDING',x,y,4.8,False,'center')
    if not host_labeled:
        label(c,host.upper(),SITE_X+SITE_W/2,SITE_Y+SITE_H-22,6.2,True,'center')
    # env / vegetation
    waters=[g for f,g in features if f.get('class')=='water' and g is not None and g.intersects(parcel.buffer(20))]
    if waters:
        p=waters[0].representative_point(); x,y=tx(p.x,p.y); legacy.arrow(c,x+70,y+16,x,y); label(c,'MAPPED WATER / DRAINAGE - VERIFY',x+74,y+18,4.9,True)
    veg=[g for f,g in features if f.get('class') in ('vegetation','tree') and g is not None and g.intersects(parcel.buffer(10))]
    if veg:
        p=veg[0].representative_point(); x,y=tx(p.x,p.y); label(c,'VEGETATION / TREES - SOURCE DERIVED',x,y+8,4.6,True,'center')
    # EV zone
    if zone is not None:
        c.setStrokeColor(black); c.setLineWidth(1.2); c.setDash(5,2); legacy.draw_geom(c,zone,tx,'other'); c.setDash()
        z=zone.representative_point(); zx,zy=tx(z.x,z.y)
        label(c,f"{site_stall_count(d)}-STALL PRELIMINARY EV FIT",zx,zy+8,5.3,True,'center')
        label(c,'MODELED / FINAL CIVIL + ADA DESIGN VERIFY',zx,zy-2,4.5,False,'center')
    # access/trench
    ar=shape(d['access_route']) if d.get('access_route') else None
    if ar is not None and not ar.is_empty:
        c.setDash(2,2); legacy.draw_geom(c,ar,tx,'other'); c.setDash()
        p=ar.interpolate(.5,normalized=True); x,y=tx(p.x,p.y); label(c,'ACCESSIBLE ROUTE CONCEPT',x+5,y+5,4.5,True)
    tr=None
    if d.get('trench_route') and float(d.get('trench_length_ft') or 0)>1:
        tr=shape(d['trench_route'])
    if tr is not None and not tr.is_empty:
        c.setDash(6,2); legacy.draw_geom(c,tr,tx,'power'); c.setDash()
        p=tr.interpolate(.5,normalized=True); x,y=tx(p.x,p.y)
        label(c,f"CONCEPT TRENCH ~{float(d['trench_length_ft']):.0f} FT / DEPTH TBD",x+5,y+6,4.5,True)
    # dimensions
    for i,pd in enumerate((d.get('parcel_dimensions') or [])[:12]):
        legacy.dim_line(c,pd['a'],pd['b'],tx,f"{float(pd['ft']):.0f} FT",5+(i%2)*3)
    legacy.north_arrow(c)
    legacy.scale_bar(c,tx,bounds[0],bounds[1])
    return parcel,features,zone,tx

def sheet_header(c,d,sheet,title,subtitle='FS6 CLIENT RELEASE'):
    c.setFillColor(Color(.04,.10,.14)); c.rect(0,PH-34,PW,34,stroke=0,fill=1)
    c.setFillColor(white); c.setFont('Helvetica-Bold',8)
    c.drawString(26,PH-21,f"RIVET | SITE {int(d['site']):02d} | {title.upper()}")
    c.drawRightString(PW-26,PH-21,f"{sheet} | {subtitle}")
    c.setFillColor(black)

def sidebar(c,d,sheet,kind):
    host=primary_host(d); weak=evidence_state(d)
    y=PH-70
    box(c,SIDE_X,y-118,SIDE_W,118,'Project / canonical site state')
    fit(c,'RIVET EV INFRASTRUCTURE INTELLIGENCE',SIDE_X+10,y-24,SIDE_W-20,7,True)
    fit(c,f"SITE {int(d['site']):02d} · {d['address']}",SIDE_X+10,y-40,SIDE_W-20,6.4,True)
    fit(c,f"PARCEL {d.get('parcel_id') or 'TBD'}",SIDE_X+10,y-54,SIDE_W-20,5.8)
    fit(c,f"HOST {host}",SIDE_X+10,y-68,SIDE_W-20,5.8)
    fit(c,f"PROPOSED {site_stall_count(d)}-STALL PRELIMINARY EV FIT",SIDE_X+10,y-82,SIDE_W-20,5.7,True)
    fit(c,'STATUS PRELIMINARY - NOT FOR CONSTRUCTION',SIDE_X+10,y-98,SIDE_W-20,5.5,True)
    y-=132
    box(c,SIDE_X,y-112,SIDE_W,112,'Evidence states')
    states=['VERIFIED / SOURCE-DERIVED','SOURCE-DERIVED APPROX.','MODELED / VERIFY','PROPOSED','FIELD VERIFY / UNKNOWN','UNKNOWN != ABSENT']
    yy=y-28
    for s in states: label(c,s,SIDE_X+12,yy,5.3,s=='UNKNOWN != ABSENT'); yy-=13
    y-=126
    box(c,SIDE_X,y-140,SIDE_W,140,'Attachment E control')
    gates=[
      'ENTIRE TAX PARCEL + SCALE: SHOWN',
      'ROADS / BUILDINGS / HARDSCAPE: SOURCE-SCOPED',
      'ADA ROUTE + CHARGING AREA: CONCEPT / VERIFY',
      'UTILITIES / SERVICE CAPACITY: FIELD VERIFY',
      'FEMA FLOOD MAP: SEPARATE REQUIRED EXHIBIT',
      'GRADES / FLOOD ELEVATIONS: FIELD VERIFY',
      'SOIL DISTURBANCE SF / DEPTH: CIVIL DESIGN TBD',
      'LIGHTING / CAMERAS / FIRE SAFETY: COORDINATE',
      'CORRIDOR / NEVI DISTANCE: APPLICATION VERIFY',
    ]
    yy=y-28
    for g in gates: fit(c,g,SIDE_X+10,yy,SIDE_W-20,4.7); yy-=12
    y-=154
    box(c,SIDE_X,y-100,SIDE_W,100,'Factory QA / exceptions')
    if weak:
        yy=y-26
        for w in weak[:6]: fit(c,'- '+w,SIDE_X+10,yy,SIDE_W-20,4.9,True); yy-=12
    else:
        fit(c,'NO STRUCTURAL SOURCE-RECORD EXCEPTION DETECTED.',SIDE_X+10,y-28,SIDE_W-20,4.8,True)
        fit(c,'SURVEY / CIVIL / UTILITY / ADA VERIFICATION STILL REQUIRED.',SIDE_X+10,y-44,SIDE_W-20,4.6)
    label(c,f"{FACTORY_VERSION} · {DATE}",SIDE_X+10,y-82,4.6)

def footer(c,d,sheet,title):
    y=22; h=91
    c.setFillColor(white); c.setStrokeColor(black); c.setLineWidth(.7); c.rect(26,y,PW-52,h,stroke=1,fill=1)
    x1=245; x2=770; x3=1035
    for x in (x1,x2,x3): c.line(x,y,x,y+h)
    label(c,'RIVET',42,y+56,18,True); label(c,'EV INFRASTRUCTURE INTELLIGENCE',42,y+42,6.5)
    label(c,'PRELIMINARY / NOT FOR CONSTRUCTION',42,y+19,6,True)
    label(c,title,(x1+x2)/2,y+62,11,True,'center')
    fit(c,d['address'],x1+14,y+40,x2-x1-28,8,True)
    fit(c,f"PARCEL: {d.get('parcel_id') or 'TBD'}",x1+14,y+20,x2-x1-28,6)
    label(c,'EVIDENCE DOCTRINE',x2+10,y+69,6.5,True)
    wrap(c,'Source-derived conditions remain source-derived. Modeled geometry stays modeled. Missing data remains UNKNOWN, never silently promoted to absent or surveyed truth.',x2+10,y+56,x3-x2-20,4.7,6)
    c.line(x3,y+56,PW-26,y+56); c.line(x3,y+30,PW-26,y+30)
    label(c,f"SHEET {sheet}",x3+10,y+69,8,True); label(c,f"DATE {DATE}",x3+10,y+42,5.8); label(c,'SCALE GRAPHIC / AS SHOWN',x3+10,y+15,5.8)

def new_page(path,d,sheet,title,body_fn):
    c=canvas.Canvas(str(path),pagesize=PAGE)
    c.setTitle(f"RIVET Site {d['site']:02d} {sheet} - {d['address']}")
    sheet_header(c,d,sheet,title); body_fn(c,d); footer(c,d,sheet,title); c.showPage(); c.save()

def c101(c,d):
    draw_base(c,d); sidebar(c,d,'C101','overall')

def c102(c,d):
    parcel,features,zone,tx=draw_base(c,d,detail=True)
    # callouts register
    x=SITE_X+14; y=SITE_Y+SITE_H-52
    callouts=[
      '01 PARKING / DRIVE AISLES: SOURCE-DERIVED WHERE MAPPED; STRIPING MODELED / VERIFY',
      '02 VEHICULAR ACCESS: EXISTING GEOMETRY WHERE MAPPED; CURB CUT DETAILS VERIFY',
      '03 TREES / WOODY VEGETATION: SOURCE-DERIVED WHERE MAPPED; OTHERWISE FIELD VERIFY',
      '04 CURBS / SIDEWALKS / CROSSWALKS: FIELD VERIFY UNLESS MAPPED',
      '05 LIGHTING / SECURITY CAMERAS: EXISTING LOCATIONS FIELD VERIFY; EV COVERAGE COORDINATE',
    ]
    for t in callouts:
        c.setFillColor(white); c.rect(x-3,y-6,430,12,stroke=0,fill=1); fit(c,t,x,y,420,4.6,True); y-=15
    sidebar(c,d,'C102','evidence')

def e101(c,d):
    parcel,features,zone,tx=draw_base(c,d)
    # conceptual power flow, never a one-line
    bx=SITE_X+30; by=SITE_Y+18; bw=520; bh=62
    c.setFillColor(white); c.setStrokeColor(black); c.rect(bx,by,bw,bh,stroke=1,fill=1)
    label(c,'PRELIMINARY POWER FLOW - CONCEPT ONLY / NOT A ONE-LINE',bx+10,by+47,5.5,True)
    stages=['UTILITY SOURCE','METER / DISC.','SWITCHGEAR / DIST.','EVSE CABINET(S)','CHARGING POSTS']
    sx=bx+12
    for i,s in enumerate(stages):
        w=88; c.rect(sx,by+15,w,20,stroke=1,fill=0); label(c,s,sx+w/2,by+22,4.1,True,'center')
        if i<len(stages)-1:
            legacy.arrow(c,sx+w,by+25,sx+w+13,by+25)
        sx+=101
    sidebar(c,d,'E101','electrical')

def d501(c,d):
    # Standalone detail sheet with dimensions sourced from conceptual EV zone.
    zone=shape(d['ev_zone']) if d.get('ev_zone') else None
    c.setStrokeColor(black); c.setFillColor(white)
    c.rect(SITE_X,SITE_Y,SITE_W,SITE_H,stroke=1,fill=1)
    label(c,'1  TYPICAL EV CHARGING STALL MODULE - PLAN',SITE_X+25,SITE_Y+SITE_H-35,8,True)
    rowx=SITE_X+60; rowy=SITE_Y+SITE_H-220; roww=570; rowh=110
    n=site_stall_count(d); bay=roww/n
    for i in range(n):
        c.rect(rowx+i*bay,rowy,bay-3,rowh,stroke=1,fill=0)
        label(c,'EV',rowx+i*bay+(bay-3)/2,rowy+50,6,True,'center')
    # ADA concept on first bay
    for yy in range(int(rowy),int(rowy+rowh),8): c.line(rowx,yy,rowx+18,min(yy+18,rowy+rowh))
    label(c,'ADA ACCESS AISLE / ROUTE - FINAL WIDTH + SLOPES VERIFY',rowx,rowy-20,5.5,True)
    label(c,'STALL WIDTH / DEPTH - MODELED FIT ONLY; FINAL CIVIL / ADA DESIGN CONTROLS',rowx,rowy+rowh+15,5.3,True)
    # Equipment detail
    label(c,'2  TYPICAL EVSE POST + VEHICLE PROTECTION - ELEVATION',SITE_X+25,SITE_Y+315,8,True)
    ex=SITE_X+90; ey=SITE_Y+190
    c.line(ex,ey,ex+210,ey); c.rect(ex+80,ey,50,92,stroke=1,fill=0); label(c,'EVSE',ex+105,ey+48,7,True,'center')
    c.circle(ex+42,ey+15,8,stroke=1,fill=0); c.circle(ex+168,ey+15,8,stroke=1,fill=0)
    label(c,'BOLLARDS / FOUNDATION / ANCHORAGE / CLEARANCES = OEM + FINAL DESIGN',ex,ey-18,5)
    # trench detail
    label(c,'3  CONCEPTUAL UNDERGROUND FEED / TRENCH SECTION',SITE_X+430,SITE_Y+315,8,True)
    tx=SITE_X+465; ty=SITE_Y+190
    c.line(tx,ty+78,tx+245,ty+78); c.line(tx+20,ty+78,tx+40,ty+5); c.line(tx+225,ty+78,tx+205,ty+5)
    c.line(tx+40,ty+5,tx+205,ty+5)
    label(c,'FINISHED GRADE',tx,ty+87,5,True)
    label(c,'WARNING / IDENTIFICATION TAPE - AS REQUIRED',tx+55,ty+55,4.7)
    label(c,'CONDUIT COUNT / SIZE: TBD',tx+55,ty+38,4.7)
    label(c,'DEPTH / BEDDING / SEPARATION / GROUNDING: TBD',tx+55,ty+22,4.7)
    label(c,'SOIL DISTURBANCE SF + DEPTH: CIVIL DESIGN TBD',tx+55,ty+8,4.7,True)
    sidebar(c,d,'D501','details')

def render_site(d):
    site=int(d['site']); site_dir=OUT/f'site_{site:02d}'; site_dir.mkdir(parents=True,exist_ok=True)
    pages=[
      ('C101','OVERALL PRELIMINARY SITE PLAN - ENRICHED EXISTING CONDITIONS',c101),
      ('C102','EXISTING CONDITIONS + EV WORK ZONE EVIDENCE PLAN',c102),
      ('E101','PRELIMINARY ELECTRICAL / UTILITY CONCEPT',e101),
      ('D501','TYPICAL EV / ADA / TRENCH / EQUIPMENT DETAILS',d501),
    ]
    rendered=[]
    for sh,title,fn in pages:
        p=site_dir/f'RIVET_Site_{site:02d}_{sh}.pdf'; new_page(p,d,sh,title,fn); rendered.append(p)
    pack=OUT/f'RIVET_Site_{site:02d}_FS6_4_Sheet.pdf'
    w=PdfWriter()
    for p in rendered:
        for pg in PdfReader(str(p)).pages: w.add_page(pg)
    with open(pack,'wb') as f: w.write(f)
    return pack,rendered

def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for ch in iter(lambda:f.read(1024*1024),b''): h.update(ch)
    return h.hexdigest()

def main():
    files=sorted(SRC.glob('site_*.json'))
    if len(files)!=26: raise RuntimeError(f'Expected 26 site records, found {len(files)}')
    packs=[]; manifest=[]; errors=[]
    for fp in files:
        try:
            d=json.loads(fp.read_text())
            pack,pages=render_site(d)
            weak=evidence_state(d)
            packs.append(pack)
            manifest.append({
              'site':d['site'],'address':d['address'],'parcel_id':d.get('parcel_id'),
              'host_label':primary_host(d),'modeled_stalls':site_stall_count(d),
              'page_count':len(PdfReader(str(pack)).pages),'pack':str(pack),
              'sha256':sha256(pack),'exceptions':weak,
              'source_record':str(fp),'factory_version':FACTORY_VERSION
            })
            print('FS6',d['site'],d['address'],'EXCEPTIONS',len(weak))
        except Exception as e:
            errors.append({'file':str(fp),'error':repr(e)}); print('ERROR',fp,e)
    if errors: raise RuntimeError(json.dumps(errors,indent=2))
    # combined 104-page bundle
    combined=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_104_Sheet.pdf'
    w=PdfWriter()
    for p in packs:
        for pg in PdfReader(str(p)).pages: w.add_page(pg)
    with open(combined,'wb') as f: w.write(f)
    zpath=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_Factory.zip'
    with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
        for p in packs: z.write(p,p.name)
        z.write(combined,combined.name)
    qa={
      'factory_version':FACTORY_VERSION,'generated_at':DATE,'site_count':len(packs),
      'combined_pages':len(PdfReader(str(combined)).pages),
      'combined_sha256':sha256(combined),'combined_pdf':str(combined),'zip':str(zpath),
      'sites':manifest,'errors':errors,
      'release_gate':'QA ONLY. Founder/client send remains blocked until visual + Attachment E exception review passes.'
    }
    (OUT/'fs6_factory_manifest.json').write_text(json.dumps(qa,indent=2))
    print('COMBINED',len(packs),'sites',qa['combined_pages'],'pages',combined.stat().st_size,'bytes')
    print('ZIP',zpath.stat().st_size,'bytes')
    print('EXCEPTION_SITES',[x['site'] for x in manifest if x['exceptions']])

if __name__=='__main__': main()