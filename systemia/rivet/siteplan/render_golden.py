import json, math, hashlib, zipfile, importlib.util
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, Color
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape, Polygon, Point
from shapely import affinity

ROOT=DATA_ROOT
SRC=SOURCE_ROOT
OUT=ROOT/'fs6_golden_candidate'
OUT.mkdir(parents=True,exist_ok=True)
PAGE=(36*inch,24*inch)
PW,PH=PAGE
DATE='09/19/2026'
VERSION='FS6-GOLDEN-CANDIDATE-v2'

LEFT_X=28
LEFT_W=1960
SIDE_X=2015
SIDE_W=548
BODY_TOP=1678
PLAN_BOTTOM=152
DARK=Color(.035,.085,.105)
G96=Color(.96,.96,.96)
G90=Color(.90,.90,.90)
G80=Color(.80,.80,.80)
CYAN=Color(.05,.45,.58)
ORANGE=Color(.78,.45,.08)
GREEN=Color(.10,.48,.28)
RED=Color(.70,.18,.16)

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('legacy',HERE/'render_legacy.py')
legacy=importlib.util.module_from_spec(spec); spec.loader.exec_module(legacy)
spec2=importlib.util.spec_from_file_location('basefactory',HERE/'render_factory.py')
basefactory=importlib.util.module_from_spec(spec2); spec2.loader.exec_module(basefactory)

def clean(v):
    return ' '.join(str(v or '').split())

def fontfit(text,maxw,size=14,font='Helvetica'):
    fs=size
    while fs>6 and stringWidth(clean(text),font,fs)>maxw:
        fs-=.25
    return fs

def txt(c,text,x,y,size=9,bold=False,color=black,anchor='left',maxw=None):
    font='Helvetica-Bold' if bold else 'Helvetica'
    if maxw is not None: size=fontfit(text,maxw,size,font)
    c.setFont(font,size); c.setFillColor(color)
    t=clean(text)
    if anchor=='center': c.drawCentredString(x,y,t)
    elif anchor=='right': c.drawRightString(x,y,t)
    else: c.drawString(x,y,t)

def wrap(c,text,x,y,maxw,size=8.2,leading=11,bold=False,color=black,max_lines=12):
    font='Helvetica-Bold' if bold else 'Helvetica'
    words=clean(text).split()
    lines=[]; cur=''
    for w in words:
        test=(cur+' '+w).strip()
        if stringWidth(test,font,size)<=maxw: cur=test
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    for line in lines[:max_lines]:
        c.setFont(font,size); c.setFillColor(color); c.drawString(x,y,line); y-=leading
    return y

def section_bar(c,x,y,w,title):
    c.setFillColor(DARK); c.rect(x,y,w,24,stroke=0,fill=1)
    txt(c,title,x+10,y+7,8.2,True,white)

def line(c,x1,y1,x2,y2,width=.6,color=black):
    c.setStrokeColor(color); c.setLineWidth(width); c.line(x1,y1,x2,y2)

def source_status_rows(d):
    fc=d.get('feature_counts') or {}
    roads=[r for r in (d.get('road_names') or []) if clean(r)]
    parking=int(fc.get('parking',0) or 0)
    veg=int(fc.get('vegetation',0) or 0)+int(fc.get('tree',0) or 0)
    water=int(fc.get('water',0) or 0)
    buildings=int(fc.get('building',0) or 0)
    camera=int(fc.get('camera',0) or 0)
    power=int(fc.get('power',0) or 0)
    host=basefactory.primary_host(d)
    rows=[]
    rows.append(('01','PARKING / DRIVE AISLES',
                 f'{parking} mapped parking feature(s); proposed charging geometry remains modeled / verify' if parking else 'Parking geometry not mapped in canonical source; field / aerial verification required',
                 'SOURCE-DERIVED + MODELED' if parking else 'FIELD VERIFY / UNKNOWN',
                 CYAN if parking else RED))
    rows.append(('02','NAMED SITE DRIVE / ACCESS',
                 f'Road context: {", ".join(roads[:3])}' if roads else 'No named road geometry resolved in canonical site record',
                 'SOURCE / VERIFY' if roads else 'FIELD VERIFY / UNKNOWN',
                 CYAN if roads else RED))
    rows.append(('03','BUILDING / HOST FOOTPRINT',
                 f'Host: {host}; {buildings} mapped building feature(s)' if buildings else f'Host identity: {host}; mapped footprint unresolved',
                 'SOURCE / VERIFY' if buildings else 'HOST REPORTED / GEOMETRY UNKNOWN',
                 GREEN if buildings else RED))
    rows.append(('04','LANDSCAPE / VEGETATION',
                 f'{veg} tree / vegetation feature(s) represented from source geometry' if veg else 'Vegetation not resolved in source record; missing is not absent',
                 'SOURCE-DERIVED APPROX.' if veg else 'FIELD VERIFY / UNKNOWN',
                 ORANGE if veg else RED))
    rows.append(('05','WATER / STORMWATER / DRAINAGE',
                 f'{water} mapped water / drainage feature(s); verify project-specific applicability' if water else 'No mapped water feature in source record; do not infer absence of drainage constraints',
                 'SOURCE / VERIFY' if water else 'UNKNOWN != ABSENT',
                 CYAN if water else RED))
    rows.append(('06','LIGHTING / CAMERAS / FIRE',
                 f'{camera} camera and {power} power feature(s) mapped; final coverage and fire/traffic safety by design coordination',
                 'SOURCE + FIELD VERIFY / COORD.' if (camera or power) else 'FIELD VERIFY / COORD.',
                 CYAN if (camera or power) else RED))
    return rows

def site_notes(d):
    notes=[]
    for w in basefactory.evidence_state(d):
        notes.append(w+' - KEEP EXPLICIT UNTIL EVIDENCE CLOSES IT.')
    roads=[clean(r) for r in (d.get('road_names') or []) if clean(r)]
    if roads:
        notes.append('Named road context: '+', '.join(roads[:3])+'. Exact curb-cut / ROW geometry remains project verification.')
    else:
        notes.append('Named road / access geometry is unresolved in the canonical site record; no generic corridor identity is substituted.')
    notes.append(f'Parcel {clean(d.get("parcel_id") or "TBD")} / {float(d.get("parcel_area_sf") or 0)/43560:.2f} AC is a GIS planning basis, not a survey-certified boundary.')
    if d.get('trench_length_ft') and float(d.get('trench_length_ft') or 0)>1:
        notes.append(f'Concept trench length is modeled at ~{float(d["trench_length_ft"]):.0f} FT; depth / conductor / restoration remain TBD.')
    else:
        notes.append('Utility / trench routing is unresolved. No route or depth is asserted.')
    if d.get('host_evidence'):
        h=d['host_evidence']
        notes.append(f'Host identity evidence: {clean(h.get("name"))}; host identity does not establish survey-grade building / parking geometry.')
    else:
        notes.append('Final ADA slopes, striping, equipment clearances and utility capacity remain project-specific design / field verification items.')
    return notes[:5]

def page_header(c,d,sheet,title):
    c.setFillColor(DARK); c.rect(0,PH-48,PW,48,stroke=0,fill=1)
    txt(c,f'RIVET | SITE {int(d["site"]):02d} | {title}',30,PH-30,13,True,white,maxw=1420)
    txt(c,d['address'],1930,PH-30,7.6,False,white,anchor='right',maxw=460)
    txt(c,f'{sheet} | FS6 CLIENT RELEASE',PW-30,PH-30,8.2,True,white,anchor='right',maxw=300)

def page_footer(c):
    txt(c,'RIVET EV INFRASTRUCTURE INTELLIGENCE | PRELIMINARY - NOT FOR CONSTRUCTION | EVIDENCE STATE IS PART OF THE DRAWING',30,18,6.6,False,Color(.42,.42,.42))

def sidebar(c,d):
    x=SIDE_X; w=SIDE_W
    # Canonical state
    y=1536; section_bar(c,x,y,w,'CANONICAL SITE STATE')
    host=basefactory.primary_host(d)
    state=[
        ('HOST',host),
        ('PARCEL',f'{d.get("parcel_id") or "TBD"} | {float(d.get("parcel_area_sf") or 0)/43560:.2f} AC APPROX.'),
        ('EXISTING',f'{(d.get("feature_counts") or {}).get("building",0)} BUILDING / {(d.get("feature_counts") or {}).get("parking",0)} PARKING / {len(d.get("road_names") or [])} NAMED ROAD RECORD(S)'),
        ('PROPOSED',f'{basefactory.site_stall_count(d)} STALL PRELIMINARY EV FIT'),
        ('EVIDENCE','MIXED SOURCE + MODELED / UNKNOWN ITEMS REMAIN VISIBLE'),
        ('CURRENT RELEASE BASIS','FS6 GOLDEN CORE / SITE-SPECIFIC SOURCE EVIDENCE / VERIFY UNRESOLVED CONDITIONS'),
    ]
    yy=y-20
    for k,v in state:
        yy-=23
        txt(c,k,x+10,yy,7.1,True,Color(.30,.30,.30))
        txt(c,v,x+116,yy,7.5,k=='CURRENT RELEASE BASIS',black,maxw=w-128)
    # Feature register
    y2=1022; section_bar(c,x,y2+490,w,'EXISTING CONDITIONS - FEATURE REGISTER')
    yy=y2+458
    for num,name,desc,status,color in source_status_rows(d):
        txt(c,num,x+10,yy,7.4,True,color)
        txt(c,name,x+42,yy,7.9,True,black,maxw=270)
        txt(c,status,x+w-10,yy,7.1,True,color,anchor='right',maxw=230)
        yy-=15
        yy=wrap(c,desc,x+42,yy,w-58,6.8,9,False,Color(.32,.32,.32),3)-12
    # Doctrine
    y3=700; section_bar(c,x,y3+288,w,'EVIDENCE DOCTRINE | SOURCE CONTROL')
    yy=y3+254
    src='; '.join([clean(s) for s in (d.get('source_notes') or [])[:3]])
    if not src: src='Canonical parcel / OpenStreetMap-derived geometry / RIVET modeled planning layer.'
    yy=wrap(c,src,x+10,yy,w-20,6.8,9,False,Color(.25,.25,.25),5)-14
    statuses=[('VERIFIED','SOURCE-OBSERVED',GREEN),('SOURCE-DERIVED','APPROXIMATE',CYAN),('MODELED','VERIFY',ORANGE),('PROPOSED','DESIGN INTENT',CYAN),('FIELD VERIFY','UNKNOWN',RED),('UNKNOWN','!= ABSENT',RED)]
    colw=(w-30)/2
    for i,(a,b,color) in enumerate(statuses):
        col=i%2; row=i//2
        xx=x+10+col*(colw+10); yrow=yy-row*34
        txt(c,a,xx,yrow,7,True,color)
        txt(c,b,xx+88,yrow,6.7,True,color)
    # Notes
    y4=392; section_bar(c,x,y4+286,w,'SITE-SPECIFIC NOTES')
    yy=y4+250
    for i,n in enumerate(site_notes(d),1):
        txt(c,f'{i}.',x+10,yy,6.8,True,Color(.30,.30,.30))
        yy=wrap(c,n,x+32,yy,w-42,6.9,9,False,black,4)-11

def plan_transform(d,x,y,w,h,margin=.14):
    parcel=shape(d['parcel'])
    feats=[]
    for f in d.get('features',[]):
        try: feats.append((f,shape(f['geometry'])))
        except Exception: pass
    zone=shape(d['ev_zone']) if d.get('ev_zone') else None
    minx,miny,maxx,maxy=parcel.bounds
    pad=max(15,max(maxx-minx,maxy-miny)*margin)
    minx-=pad;miny-=pad;maxx+=pad;maxy+=pad
    # Expand the evidence window to the drawing-box aspect ratio instead of
    # letterboxing narrow/tall parcels. Geometry keeps the same scale; the
    # previously blank bands become additional real aerial context.
    spanx=max(1e-9,maxx-minx); spany=max(1e-9,maxy-miny)
    target=max(1e-9,w/max(1e-9,h)); current=spanx/spany
    if current < target:
        desired=spany*target; extra=(desired-spanx)/2
        minx-=extra; maxx+=extra
    elif current > target:
        desired=spanx/target; extra=(desired-spany)/2
        miny-=extra; maxy+=extra
    scale=min(w/max(1e-9,maxx-minx),h/max(1e-9,maxy-miny))
    ox=x+(w-(maxx-minx)*scale)/2
    oy=y+(h-(maxy-miny)*scale)/2
    def tx(px,py): return ox+(px-minx)*scale, oy+(py-miny)*scale
    return parcel,feats,zone,tx,(minx,miny,maxx,maxy)

def proposed_stall_polygons(d):
    """Exact polygons used by the plan renderer, in the source's local metric CRS."""
    if not d.get('ev_zone'):
        raise ValueError('EV_ZONE_MISSING')
    z=shape(d['ev_zone'])
    if z.is_empty or not z.is_valid:
        raise ValueError('EV_ZONE_INVALID')
    cent=z.centroid
    n=basefactory.site_stall_count(d)
    if not 1 <= n <= 100:
        raise ValueError('STALL_COUNT_INVALID')
    sw,sd=2.743,5.486  # preliminary 9 x 18 ft modules
    total=n*sw
    angle=float(d.get('ev_zone_angle_deg') or 0)
    stalls=[]
    for i in range(n):
        x0=cent.x-total/2+i*sw
        rect=Polygon([(x0,cent.y-sd/2),(x0+sw,cent.y-sd/2),(x0+sw,cent.y+sd/2),(x0,cent.y+sd/2)])
        stalls.append(affinity.rotate(rect,angle,origin=(cent.x,cent.y),use_radians=False))
    return stalls

def validate_stall_placement(d, min_coverage=.98):
    """Fail closed when modeled spaces cannot be tied to on-parcel mapped parking.

    Mapped parking is only a surface-level gate. Passing does not establish
    individual stripe alignment, ownership, ADA compliance, or permit readiness.
    """
    site=d.get('site','?')
    parcel=shape(d['parcel'])
    zone=shape(d['ev_zone']) if d.get('ev_zone') else None
    stalls=proposed_stall_polygons(d)
    parking=[]; buildings=[]
    for feature in d.get('features') or []:
        try:
            geometry=shape(feature.get('geometry'))
            if geometry.is_empty or not geometry.is_valid: continue
            if feature.get('class')=='parking': parking.append(geometry.intersection(parcel))
            if feature.get('class')=='building': buildings.append(geometry)
        except Exception:
            continue
    errors=[]
    mode=d.get('installation_mode')
    if mode not in ('existing_stall_retrofit','proposed_new_build'):
        errors.append('INSTALLATION_MODE_UNSPECIFIED')
    if mode=='existing_stall_retrofit' and not parking:
        errors.append('HOST_PARKING_SURFACE_UNRESOLVED')
    civil=d.get('civil_scope') or {}
    paving=None
    if mode=='proposed_new_build':
        # New paved stalls need a deliberately proposed civil footprint and
        # explicit access and design gates. Existing stripes are irrelevant.
        try:
            paving=shape(civil['proposed_paving_footprint'])
            if paving.is_empty or not paving.is_valid: raise ValueError('invalid paving')
        except Exception:
            errors.append('PROPOSED_PAVING_FOOTPRINT_UNRESOLVED')
            paving=None
        for key in ('vehicle_access_route','pedestrian_ada_route','vegetation_clearing','grading','stormwater','soil_disturbance','utility_connection'):
            item=civil.get(key)
            if not isinstance(item,dict) or item.get('status') not in ('proposed','source_verified') or not item.get('design_basis'):
                errors.append('CIVIL_SCOPE_'+key.upper()+'_UNRESOLVED')
    for i,stall in enumerate(stalls,1):
        area=max(stall.area,1e-9)
        parcel_ratio=stall.intersection(parcel).area/area
        zone_ratio=stall.intersection(zone).area/area if zone is not None else 0
        parking_ratio=max((stall.intersection(surface).area/area for surface in parking),default=0)
        building_overlap=sum(stall.intersection(b).area for b in buildings)
        if parcel_ratio < min_coverage: errors.append(f'STALL_{i}_OUTSIDE_PARCEL:{parcel_ratio:.3f}')
        if zone_ratio < min_coverage: errors.append(f'STALL_{i}_OUTSIDE_EV_ZONE:{zone_ratio:.3f}')
        if mode=='existing_stall_retrofit' and parking_ratio < min_coverage:
            errors.append(f'STALL_{i}_OUTSIDE_MAPPED_PARKING:{parking_ratio:.3f}')
        if mode=='proposed_new_build' and paving is not None:
            paving_ratio=stall.intersection(paving).area/area
            if paving_ratio < min_coverage:
                errors.append(f'STALL_{i}_OUTSIDE_PROPOSED_PAVING:{paving_ratio:.3f}')
        if building_overlap > .1: errors.append(f'STALL_{i}_BUILDING_COLLISION:{building_overlap:.2f}sqm')
        if not stall.covers(stall.representative_point()):
            errors.append(f'STALL_{i}_LABEL_OUTSIDE_STALL')
    if errors:
        raise ValueError(f'Site {site} stall geometry failed: '+', '.join(errors))
    return stalls

def draw_rotated_stalls(c,d,tx):
    stalls=validate_stall_placement(d)
    cent=shape(d['ev_zone']).centroid
    total=len(stalls)*2.743
    angle=float(d.get('ev_zone_angle_deg') or 0)
    for i,rect in enumerate(stalls):
        pts=list(rect.exterior.coords)
        p=c.beginPath(); X,Y=tx(*pts[0]);p.moveTo(X,Y)
        for q in pts[1:]: X,Y=tx(*q);p.lineTo(X,Y)
        c.setStrokeColor(black);c.setLineWidth(1.15);c.drawPath(p,stroke=1,fill=0)
        q=rect.representative_point(); X,Y=tx(q.x,q.y)
        txt(c,str(i+1),X,Y-3,7.3,True,black,'center')
    # pad
    pad=Polygon([(cent.x+total/2+1,cent.y-2),(cent.x+total/2+5,cent.y-2),(cent.x+total/2+5,cent.y+2),(cent.x+total/2+1,cent.y+2)])
    pad=affinity.rotate(pad,angle,origin=(cent.x,cent.y),use_radians=False)
    pts=list(pad.exterior.coords); p=c.beginPath();X,Y=tx(*pts[0]);p.moveTo(X,Y)
    for q in pts[1:]:X,Y=tx(*q);p.lineTo(X,Y)
    c.setFillColor(G80);c.setStrokeColor(black);c.drawPath(p,stroke=1,fill=1)
    q=pad.representative_point();X,Y=tx(q.x,q.y);txt(c,'PAD',X,Y-3,6.4,True,black,'center')

def draw_plan(c,d,x=LEFT_X,y=PLAN_BOTTOM,w=LEFT_W,h=1510,detail=False):
    parcel,features,zone,tx,bounds=plan_transform(d,x,y,w,h,.12 if detail else .18)
    c.saveState()
    clip=c.beginPath(); clip.rect(x,y,w,h)
    c.clipPath(clip,stroke=0,fill=0)
    # Evidence-density control: draw the most relevant nearby context, not every
    # feature returned by a wide GIS harvest. The source record stays intact.
    pb=parcel.bounds
    maxdim=max(pb[2]-pb[0],pb[3]-pb[1])
    limits={'road':14,'parking':12,'water':8,'vegetation':12,'barrier':10,'building':10,'power':8,'tree':24,'camera':6}
    radius=max(18,maxdim*.35)
    # Small urban parcels need a tighter context budget or nearby GIS can overwhelm
    # the candidate site. This changes presentation density, not the underlying evidence.
    if float(d.get('parcel_area_sf') or 0) < 25000:
        limits.update({'road':8,'parking':6,'vegetation':6,'barrier':6,'building':6,'power':5,'tree':12,'camera':4})
        radius=max(12,maxdim*.22)
    total_features=sum(int(v or 0) for v in (d.get('feature_counts') or {}).values())
    if total_features > 90:
        limits.update({'road':5,'parking':3,'water':4,'vegetation':3,'barrier':4,'building':3,'power':4,'tree':6,'camera':3})
        radius=max(8,maxdim*.12)
    # Small urban parcels need a tighter context budget or nearby GIS can overwhelm
    # the candidate site. This changes presentation density, not the underlying evidence.
    if float(d.get('parcel_area_sf') or 0) < 25000:
        limits.update({'road':8,'parking':6,'vegetation':6,'barrier':6,'building':6,'power':5,'tree':12,'camera':4})
        radius=max(12,maxdim*.22)
    for kind in ['road','parking','water','vegetation','barrier','building','power','tree','camera']:
        candidates=[]
        for f,g in features:
            if f.get('class')!=kind or g is None or g.is_empty:
                continue
            dist=g.distance(parcel)
            if g.intersects(parcel.buffer(5)) or dist<=radius:
                candidates.append((dist,f,g))
        candidates.sort(key=lambda q:q[0])
        for _,f,g in candidates[:limits[kind]]:
            legacy.draw_geom(c,g,tx,kind)
    c.setStrokeColor(black);c.setLineWidth(2.1);c.setDash([12,4,2,4],0);legacy.draw_geom(c,parcel,tx,'other');c.setDash()
    # labels
    host=basefactory.primary_host(d)
    host_labeled=False
    for f,g in features:
        if f.get('class')=='building' and g.intersects(parcel.buffer(4)):
            q=g.representative_point();X,Y=tx(q.x,q.y)
            nm=clean(f.get('name'))
            if nm and nm.lower()==host.lower():
                txt(c,host.upper(),X,Y,11.5,True,black,'center',340);host_labeled=True
    if not host_labeled:
        hw=min(420,stringWidth(host.upper(),'Helvetica-Bold',10.5))
        host_candidates=[
            (x+w*.50,y+h*.53),(x+w*.50,y+h*.68),(x+w*.50,y+h*.35),
            (x+w*.30,y+h*.64),(x+w*.70,y+h*.64),(x+w*.30,y+h*.34),(x+w*.70,y+h*.34)
        ]
        obstacles=[]
        if detail: obstacles.append((x,y+h-62,x+w,y+h))
        if zone is not None and not zone.is_empty:
            try:
                zx0,zy0,zx1,zy1=zone.bounds; A=tx(zx0,zy0); B=tx(zx1,zy1)
                obstacles.append((min(A[0],B[0])-34,min(A[1],B[1])-28,max(A[0],B[0])+52,max(A[1],B[1])+28))
            except Exception: pass
        hx,hy=host_candidates[0]
        for cx,cy in host_candidates:
            rect=(cx-hw/2-8,cy-8,cx+hw/2+8,cy+14)
            if rect[0]<x+8 or rect[2]>x+w-8 or rect[1]<y+8 or rect[3]>y+h-8: continue
            if any(not (rect[2]<=q[0] or rect[0]>=q[2] or rect[3]<=q[1] or rect[1]>=q[3]) for q in obstacles): continue
            hx,hy=cx,cy; break
        txt(c,host.upper(),hx,hy,10.5,True,Color(.25,.25,.25),'center',420)
    road_reserved=[]
    if detail: road_reserved.append((x,y+h-62,x+w,y+h))
    # Reserve the lower-right graphic-scale zone so road labels never collide
    # with the scale bar or its 0 / distance labels.
    road_reserved.append((x+w-260,y,x+w,y+58))
    if zone is not None and not zone.is_empty:
        try:
            zx0,zy0,zx1,zy1=zone.bounds; A=tx(zx0,zy0); B=tx(zx1,zy1)
            road_reserved.append((min(A[0],B[0])-22,min(A[1],B[1])-22,max(A[0],B[0])+42,max(A[1],B[1])+22))
        except Exception: pass
    for i,pd in enumerate((d.get('parcel_dimensions') or [])[:8]):
        try:
            a,b=pd['a'],pd['b']; label=f'{float(pd["ft"]):.0f} FT'
            x1,y1=tx(*a); x2,y2=tx(*b); dx,dy=x2-x1,y2-y1; L=max(1,math.hypot(dx,dy)); nx,ny=-dy/L,dx/L
            off=8+(i%2)*5; mx,my=(x1+x2)/2+nx*off,(y1+y2)/2+ny*off
            lw=stringWidth(label,'Helvetica',5.5)+8
            road_reserved.append((mx-lw/2-18,my-13,mx+lw/2+18,my+17))
        except Exception: pass
    shown=0
    for f,g in features:
        nm=clean(f.get('name'))
        if f.get('class')!='road' or not nm or shown>=7 or g is None or g.is_empty: continue
        try:
            rp=g.interpolate(.5,normalized=True) if g.geom_type in ('LineString','MultiLineString') else g.representative_point()
            RX,RY=tx(rp.x,rp.y); rw=stringWidth(nm.upper(),'Helvetica-Bold',6)+8
            candidates=[(RX,RY),(RX,RY+18),(RX,RY-18),(RX+42,RY),(RX-42,RY),(RX,RY+36),(RX,RY-36),(RX+72,RY),(RX-72,RY)]
            chosen=None
            for cx,cy in candidates:
                rect=(cx-rw/2,cy-4,cx+rw/2,cy+7)
                if rect[0]<x+4 or rect[2]>x+w-4 or rect[1]<y+4 or rect[3]>y+h-4: continue
                if any(not (rect[2]<=q[0] or rect[0]>=q[2] or rect[3]<=q[1] or rect[1]>=q[3]) for q in road_reserved): continue
                chosen=(cx,cy,rect); break
            if chosen:
                cx,cy,rect=chosen; c.setFillColor(white); c.rect(rect[0],rect[1],rw,11,stroke=0,fill=1)
                txt(c,nm.upper(),cx,cy,6,True,black,'center'); road_reserved.append(rect); shown+=1
        except Exception: pass
    if zone is not None:
        c.setStrokeColor(black);c.setLineWidth(1.4);c.setDash([5,2],0);legacy.draw_geom(c,zone,tx,'other');c.setDash()
        draw_rotated_stalls(c,d,tx)
        q=zone.representative_point();X,Y=tx(q.x,q.y)
        if not detail:
            txt(c,f'{basefactory.site_stall_count(d)} PROPOSED EV STALLS @ 9 FT TYP.',X,Y+38,8.4,True,black,'center')
    if d.get('trench_route') and float(d.get('trench_length_ft') or 0)>1:
        tr=shape(d['trench_route']);c.setDash([8,3],0);legacy.draw_geom(c,tr,tx,'power');c.setDash()
        q=tr.interpolate(.5,normalized=True);X,Y=tx(q.x,q.y)
        txt(c,f'CONCEPT TRENCH ~{float(d["trench_length_ft"]):.0f} FT - DEPTH TBD',X+12,Y+8,7,True,black,maxw=300)
    for i,pd in enumerate((d.get('parcel_dimensions') or [])[:8]):
        try: legacy.dim_line(c,pd['a'],pd['b'],tx,f'{float(pd["ft"]):.0f} FT',8+(i%2)*5)
        except Exception: pass
    # Golden-sheet north arrow + graphic scale are positioned inside this plan field,
    # not inherited from the legacy 17x11 renderer coordinates.
    nx=x+58; ny=y+h-74
    c.setStrokeColor(black); c.setLineWidth(1.4); c.line(nx,ny-30,nx,ny+10)
    ap=c.beginPath(); ap.moveTo(nx,ny+20); ap.lineTo(nx-8,ny+7); ap.lineTo(nx+8,ny+7); ap.close()
    c.drawPath(ap,stroke=1,fill=1); txt(c,'N',nx,ny+29,8.5,True,black,'center')
    minx,miny,maxx,maxy=bounds
    m100=30.48
    p0=tx(minx,miny); p1=tx(minx+m100,miny); barw=abs(p1[0]-p0[0])
    label='100 FT'
    if barw<70:
        m100=60.96; p1=tx(minx+m100,miny); barw=abs(p1[0]-p0[0]); label='200 FT'
    bx=x+w-barw-30; by=y+24
    c.setFillColor(black); c.rect(bx,by,barw/2,8,stroke=1,fill=1)
    c.setFillColor(white); c.rect(bx+barw/2,by,barw/2,8,stroke=1,fill=1)
    txt(c,'0',bx,by-14,5.8); txt(c,label,bx+barw,by-14,5.8,False,black,'right')
    c.restoreState()
    return parcel,features,zone,tx,bounds

def feature_callouts(c,d):
    rows=source_status_rows(d)[:5]
    x=1652;y=1540;w=320
    for num,name,desc,status,color in rows:
        c.setStrokeColor(color);c.setLineWidth(.8);c.setFillColor(white);c.rect(x,y,w,45,stroke=1,fill=1)
        txt(c,f'{num} {name}',x+8,y+27,6.4,True,black,maxw=w-16)
        txt(c,status,x+8,y+12,5.8,True,color,maxw=w-16)
        y-=52

def key_strip(c,d,title='KEY DIMENSIONS / QUANTITIES'):
    y=62;h=64
    section_bar(c,LEFT_X,y+h-24,LEFT_W,title)
    vals=[
      ('PROPOSED STALLS',str(basefactory.site_stall_count(d))),
      ('TYP. WIDTH','9 FT MODELED'),
      ('TYP. DEPTH','18 FT MODELED'),
      ('PARCEL',f'{float(d.get("parcel_area_sf") or 0)/43560:.2f} AC APPROX.'),
      ('TRENCH',f'~{float(d.get("trench_length_ft")):.0f} FT MODELED' if d.get('trench_length_ft') else 'TBD / VERIFY'),
    ]
    cw=LEFT_W/len(vals)
    for i,(k,v) in enumerate(vals):
        xx=LEFT_X+i*cw
        if i: line(c,xx,y,xx,y+h-24,.4,G80)
        txt(c,k,xx+12,y+22,5.9,True,Color(.32,.32,.32))
        txt(c,v,xx+12,y+8,6.8,True,black,maxw=cw-24)

def c101(c,d):
    draw_plan(c,d,y=152,h=1500)
    feature_callouts(c,d)
    # key notes just above strip
    line(c,250,150,1870,150,.7,black)
    txt(c,'KEY NOTES',250,132,7.5,True)
    notes=[
      '1. EXISTING PARCEL / BUILDING / ROAD / PARKING GEOMETRY IS SOURCE-DERIVED WHERE MAPPED; UNRESOLVED CONDITIONS REMAIN FIELD VERIFY.',
      '2. PROPOSED EV / ADA / EQUIPMENT / TRENCH GEOMETRY IS PRELIMINARY PLANNING WORK, NOT SURVEY OR IFC DESIGN.'
    ]
    yy=116
    for n in notes: txt(c,n,250,yy,6.4,False,black,maxw=1500);yy-=14
    key_strip(c,d,'KEY DIMENSIONS / QUANTITIES')

def c102(c,d):
    draw_plan(c,d,y=168,h=1480,detail=True)
    feature_callouts(c,d)
    key_strip(c,d,'RELEASE-LOCKED DIMENSIONS + COORDINATION REGISTER')

def e101(c,d):
    draw_plan(c,d,y=390,h=1260,detail=True)
    feature_callouts(c,d)
    # power flow
    section_bar(c,280,100,1100,'PRELIMINARY POWER FLOW - CONCEPT ONLY / NOT A ONE-LINE')
    stages=['UTILITY SOURCE','METER / DISCONNECT','SWITCHGEAR / DISTRIBUTION','EVSE CABINETS','CHARGING POSTS']
    xx=320;yy=145;bw=175;bh=58
    for i,s in enumerate(stages):
        c.setStrokeColor(black);c.setFillColor(white);c.rect(xx,yy,bw,bh,stroke=1,fill=1)
        txt(c,s,xx+bw/2,yy+25,7,True,black,'center',bw-12)
        if i<len(stages)-1:
            legacy.arrow(c,xx+bw,yy+bh/2,xx+bw+36,yy+bh/2)
        xx+=215
    # notes
    section_bar(c,1420,100,550,'ELECTRICAL COORDINATION NOTES')
    yy=177
    en=[
      'A. E101 inherits C101 / C102 site geometry; no independent site redraw.',
      'B. Existing utility point, transformer capacity and service voltage remain utility / field verification unless specifically sourced.',
      'C. Trench shown only where a modeled route exists; conductor, depth, restoration and grounding are TBD.',
      'D. Final load, protection, metering and network equipment are final electrical / utility design items.'
    ]
    for n in en: yy=wrap(c,n,1435,yy,520,6.7,9,False,black,2)-6

def d501(c,d):
    x0=190;y0=125;w=1780;h=1515;gap=38
    qw=(w-gap)/2;qh=(h-gap)/2
    rects=[(x0,y0+qh+gap,qw,qh),(x0+qw+gap,y0+qh+gap,qw,qh),(x0,y0,qw,qh),(x0+qw+gap,y0,qw,qh)]
    titles=['1  TYPICAL EV CHARGING STALL MODULE - PLAN','2  TYPICAL EVSE POST + VEHICLE PROTECTION - ELEVATIONS','3  CONCEPTUAL UNDERGROUND FEED / TRENCH SECTION','4  CONCEPTUAL EQUIPMENT PAD / CABINET ARRANGEMENT']
    for (x,y,rw,rh),t in zip(rects,titles):
        c.setStrokeColor(black);c.setFillColor(white);c.rect(x,y,rw,rh,stroke=1,fill=1)
        txt(c,t,x+18,y+rh-35,10.5,True,black,maxw=rw-36)
    # stall detail
    x,y,rw,rh=rects[0];sx=x+150;sy=y+145;sw=330;sd=360
    c.rect(sx,sy,sw,sd,stroke=1,fill=0)
    aisle=105
    for yy in range(int(sy),int(sy+sd),18): line(c,sx+sw-aisle,yy,sx+sw,min(yy+aisle,sy+sd),.55,G80)
    txt(c,'EVSE POST / DISPENSER LOCATION',sx+sw+130,sy+sd-95,7,False,black,maxw=250)
    line(c,sx+sw*.35,sy+sd-25,sx+sw+120,sy+sd-90,.65,black)
    txt(c,'BOLLARD / VEHICLE PROTECTION - FINAL DESIGN',sx+sw+130,sy+sd-155,7,False,black,maxw=290)
    line(c,sx+sw*.15,sy+sd-25,sx+sw+120,sy+sd-150,.65,black)
    txt(c,'18 FT',sx-35,sy+sd/2,8,True,black,'center')
    txt(c,'9 FT TYP. - MODELED',sx+sw*.25,sy-35,7,True)
    txt(c,'ACCESS AISLE - PROJECT ADA DESIGN',sx+sw*.62,sy-35,7,True)
    wrap(c,'ACCESSIBLE MODULE, ROUTE AND SLOPES SHALL FOLLOW PROJECT-SPECIFIC ADA DESIGN AND SELECTED OEM / NETWORK REQUIREMENTS.',sx+sw+140,sy+sd-210,260,7,10,False,black,5)
    # elevation
    x,y,rw,rh=rects[1];base=y+145;cx=x+rw*.58
    line(c,x+90,base,x+rw-80,base,1,black)
    c.setFillColor(G90);c.rect(cx,base,120,285,stroke=1,fill=1)
    c.rect(cx-140,base,45,190,stroke=1,fill=0)
    txt(c,'EVSE',cx+60,base+150,11,True,black,'center')
    txt(c,'BOLLARD',cx-118,base+95,6,True,black,'center')
    txt(c,'OEM / NETWORK VARIES',cx+60,base+118,6.4,False,black,'center')
    txt(c,'BOLLARD OFFSET / SPACING = FINAL CIVIL',cx-170,base+225,6.4,True,black,maxw=330)
    wrap(c,'PAD / FOUNDATION / ANCHORAGE: STRUCTURAL + OEM REQUIREMENTS. CLEARANCES, WORK SPACE AND PROTECTION ARE PROJECT-SPECIFIC.',x+70,y+rh-125,rw-140,7.2,10,True,black,4)
    wrap(c,'FINAL EQUIPMENT HEIGHT, WORKING SPACE, IMPACT PROTECTION AND MAINTENANCE ACCESS SHALL FOLLOW SELECTED OEM / NETWORK AND PROJECT ENGINEERING.',x+70,y+rh-175,rw-140,6.8,9,False,black,4)
    txt(c,'FINISHED GRADE',x+80,base+12,6.4,True)
    # trench
    x,y,rw,rh=rects[2];gy=y+420
    line(c,x+90,gy,x+rw-90,gy,1,black);txt(c,'FINISHED GRADE',x+95,gy+12,6.5,True)
    tx=x+370;tw=270
    line(c,tx,gy,tx+35,y+120,.8);line(c,tx+tw,gy,tx+tw-35,y+120,.8);line(c,tx+35,y+120,tx+tw-35,y+120,.8)
    line(c,tx+65,y+265,tx+tw-65,y+265,1,black)
    txt(c,'WARNING / IDENTIFICATION TAPE - AS REQUIRED',tx+tw+35,y+265,7,True,maxw=300)
    for i in range(3): c.circle(tx+100+i*75,y+190,21,stroke=1,fill=0)
    txt(c,'CONDUIT COUNT / SIZE - TBD',tx+tw+35,y+210,7,maxw=260)
    txt(c,'DEPTH / BEDDING - TBD',tx+tw+35,y+175,7,maxw=260)
    txt(c,'SEPARATION / GROUNDING - TBD',tx+tw+35,y+140,7,maxw=260)
    txt(c,'UTILITY CONFLICTS - FIELD VERIFY',tx+tw+35,y+105,7,True,maxw=260)
    wrap(c,'COORDINATION ENVELOPE ONLY. NO TRENCH DEPTH, BEDDING, CONDUCTOR, SEPARATION, BORING OR RESTORATION REQUIREMENT IS ASSERTED HERE.',x+90,y+72,rw-180,6.7,9,False,black,4)
    # equipment
    x,y,rw,rh=rects[3];px=x+210;py=y+160;pw=500;ph=280
    c.setDash([8,5],0);c.rect(px-50,py-45,pw+100,ph+90,stroke=1,fill=0);c.setDash()
    c.setFillColor(G90);c.rect(px,py,pw,ph,stroke=1,fill=1)
    cabw=110
    for i in range(3):
        xx=px+65+i*150;c.setFillColor(G96);c.rect(xx,py+55,cabw,145,stroke=1,fill=1);txt(c,f'CAB {i+1}',xx+cabw/2,py+120,7,True,black,'center')
    txt(c,'CONCEPTUAL EQUIPMENT ZONE - FINAL OEM / UTILITY / CIVIL CLEARANCES CONTROL',px,py-38,7,True,maxw=600)
    txt(c,'PAD SIZE SHOWN FOR COORDINATION ONLY',px,py-66,6.7,True,maxw=420)
    wrap(c,'FINAL CABINET COUNT, VENTILATION, UTILITY METERING, CLEAR WORKING SPACE, ACCESS AND VEHICLE PROTECTION SHALL FOLLOW SELECTED EQUIPMENT AND PROJECT DESIGN.',px,py-90,pw,6.7,9,False,black,4)

def make_page(path,d,sheet,title,fn):
    c=canvas.Canvas(str(path),pagesize=PAGE)
    c.setTitle(f'RIVET Site {int(d["site"]):02d} {sheet} - {d["address"]}')
    page_header(c,d,sheet,title)
    sidebar(c,d)
    fn(c,d)
    page_footer(c)
    c.showPage();c.save()

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()

def main():
    pagespec=[('C101','OVERALL PRELIMINARY SITE PLAN - ENRICHED EXISTING CONDITIONS',c101),('C102','EXISTING CONDITIONS + EV WORK ZONE EVIDENCE PLAN',c102),('E101','PRELIMINARY ELECTRICAL / UTILITY CONCEPT',e101),('D501','TYPICAL EV / ADA / TRENCH / EQUIPMENT DETAILS',d501)]
    packs=[];manifest=[]
    for fp in sorted(SRC.glob('site_*.json')):
        d=json.load(open(fp));site=int(d['site']);parts=[]
        sdir=OUT/f'site_{site:02d}';sdir.mkdir(parents=True,exist_ok=True)
        for sheet,title,fn in pagespec:
            p=sdir/f'RIVET_Site_{site:02d}_{sheet}.pdf';make_page(p,d,sheet,title,fn);parts.append(p)
        pack=OUT/f'RIVET_Site_{site:02d}_FS6_4_Sheet.pdf'
        w=PdfWriter()
        for p in parts:
            for pg in PdfReader(str(p)).pages:w.add_page(pg)
        with open(pack,'wb') as f:w.write(f)
        packs.append(pack)
        manifest.append({'site':site,'address':d['address'],'pack':str(pack),'page_count':4,'sha256':sha(pack),'exceptions':basefactory.evidence_state(d),'version':VERSION})
        print('GOLDEN_CANDIDATE',site,'exceptions',len(manifest[-1]['exceptions']))
    combined=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_GOLDEN_CANDIDATE_104_Sheet.pdf'
    w=PdfWriter()
    for p in packs:
        for pg in PdfReader(str(p)).pages:w.add_page(pg)
    with open(combined,'wb') as f:w.write(f)
    z=OUT/'RIVET_VDOT_NEVI_26_Sites_FS6_GOLDEN_CANDIDATE.zip'
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as zz:
        for p in packs:zz.write(p,p.name)
        zz.write(combined,combined.name)
    obj={'version':VERSION,'site_count':26,'pages':len(PdfReader(str(combined)).pages),'combined_pdf':str(combined),'combined_sha256':sha(combined),'zip':str(z),'sites':manifest}
    (OUT/'candidate_manifest.json').write_text(json.dumps(obj,indent=2))
    print('COMBINED',obj['pages'],obj['combined_sha256'])

if __name__=='__main__':main()