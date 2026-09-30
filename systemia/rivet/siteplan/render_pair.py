import json, math, hashlib, zipfile, importlib.util, urllib.parse, urllib.request, argparse, os
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT, COMPILER_ROOT
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, white, Color
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageEnhance
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape, Point

HERE=Path(__file__).resolve().parent
ROOT=DATA_ROOT
SRC=Path(os.getenv('KSS_SITE_SRC', str(SOURCE_ROOT)))
OUT=Path(os.getenv('KSS_RENDER_OUT', str(COMPILER_ROOT/'render')))
OUT.mkdir(parents=True,exist_ok=True)
AERIAL_CACHE=Path(os.getenv('KSS_AERIAL_CACHE', str(COMPILER_ROOT/'aerial_cache')))
AERIAL_CACHE.mkdir(parents=True,exist_ok=True)
RENDER_OFFLINE=os.getenv('KSS_RENDER_OFFLINE','0')=='1'
PAGE=(17*inch,11*inch); PW,PH=PAGE
DATE='09/19/2026'
from kss_siteplan_profiles import resolve_configuration, ENGINE_VERSION
ACTIVE_CONFIG=resolve_configuration()
ACTIVE_MODE=ACTIVE_CONFIG['compliance_mode']
ACTIVE_CLIENT=ACTIVE_CONFIG['client_profile']
ACTIVE_EQUIPMENT=ACTIVE_CONFIG['equipment_pack']
ACTIVE_RECIPE=ACTIVE_CONFIG['deliverable_recipe']
ACTIVE_LAYOUT=ACTIVE_CONFIG['layout_profile']
ACTIVE_PROFILE=ACTIVE_MODE
def loadmod(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m

gold=loadmod('gold',HERE/'render_golden.py')
basefactory=loadmod('basefactory',HERE/'render_factory.py')
attach=loadmod('attach',HERE/'attachment_exhibits.py')
legacy=gold.legacy

DARK=Color(.06,.06,.06)
LIGHT=Color(.94,.94,.94)
MID=Color(.72,.72,.72)
PALE=Color(.975,.975,.975)

def clean(v): return ' '.join(str(v or '').split())

def text(c,s,x,y,size=6,bold=False,anchor='left',color=black,maxw=None):
    t=clean(s); font='Helvetica-Bold' if bold else 'Helvetica'; fs=size
    if maxw:
        while fs>4 and stringWidth(t,font,fs)>maxw: fs-=.2
    c.setFont(font,fs); c.setFillColor(color)
    if anchor=='center': c.drawCentredString(x,y,t)
    elif anchor=='right': c.drawRightString(x,y,t)
    else: c.drawString(x,y,t)

def wrap(c,s,x,y,maxw,size=5.4,leading=7,bold=False,max_lines=8,color=black):
    font='Helvetica-Bold' if bold else 'Helvetica'
    words=clean(s).split(); lines=[]; cur=''
    for w in words:
        t=(cur+' '+w).strip()
        if stringWidth(t,font,size)<=maxw: cur=t
        else:
            if cur: lines.append(cur)
            cur=w
    if cur: lines.append(cur)
    for ln in lines[:max_lines]:
        text(c,ln,x,y,size,bold,color=color); y-=leading
    return y

def sha(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def recipe_sheet(role,fallback):
    for item in ACTIVE_RECIPE.get('sheets') or []:
        if item.get('role')==role and item.get('sheet'):
            return item['sheet']
    return fallback

def _naip_cache_fingerprint(d,bounds,key,size):
    payload={
      'site':int(d['site']),
      'identity_sha256':d.get('_identity_sha256') or (d.get('compiler_meta') or {}).get('identity_sha256') or d.get('identity_sha256') or '',
      'address':clean(d.get('address')),
      'lat':round(float(d.get('lat') or 0),8),
      'lon':round(float(d.get('lon') or 0),8),
      'bounds':[round(float(v),8) for v in bounds],
      'key':str(key),
      'size':[int(size[0]),int(size[1])],
      'source':'USGSNAIPImagery/ImageServer',
      'engine_version':ENGINE_VERSION
    }
    return hashlib.sha256(json.dumps(payload,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:20]

def _naip_fetch(d,bounds,key,size=(1800,1400)):
    minlon,minlat,maxlon,maxlat=bounds
    fp=_naip_cache_fingerprint(d,bounds,key,size)
    cache=AERIAL_CACHE/f"_naip_site_{int(d['site']):02d}_{key}_{fp}.jpg"
    if cache.exists() and cache.stat().st_size>10000:
        return cache
    if RENDER_OFFLINE:
        raise RuntimeError(f"OFFLINE RENDER CACHE MISS site={d['site']} key={key} fingerprint={fp} expected={cache}")
    params={
      'bbox':f'{minlon},{minlat},{maxlon},{maxlat}',
      'bboxSR':'4326','imageSR':'4326',
      'size':f'{int(size[0])},{int(size[1])}',
      'format':'jpg','f':'image'
    }
    url='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage?'+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={'User-Agent':'Evercraft-KSS-RIVET/1.0'})
    with urllib.request.urlopen(req,timeout=45) as resp:
        data=resp.read()
    if len(data)<10000 or not data.startswith(b'\xff\xd8'):
        raise RuntimeError(f'NAIP fetch failed for site {d["site"]}: {len(data)} bytes')
    cache.write_bytes(data)
    return cache

def _aerial_reader(path,contrast=1.22,brightness=.98,color=.78,sharpness=1.08,force_size=None):
    # The aerial is evidence, not wallpaper. Preserve pavement/building texture
    # while keeping engineering overlays visually dominant. National Map image
    # dimensions follow degree-space aspect, while the engineering overlay is in
    # local metric space. Resample to the exact engineering-frame aspect before
    # placement so the aerial and geometry remain registered on the sheet.
    im=Image.open(path).convert('RGB')
    im=ImageEnhance.Contrast(im).enhance(contrast)
    im=ImageEnhance.Brightness(im).enhance(brightness)
    im=ImageEnhance.Color(im).enhance(color)
    im=ImageEnhance.Sharpness(im).enhance(sharpness)
    if force_size:
        im=im.resize((max(1,int(force_size[0])),max(1,int(force_size[1]))),Image.Resampling.LANCZOS)
    return ImageReader(im)

def draw_naip_local(c,d,local_bounds,box,key='site'):
    minx,miny,maxx,maxy=local_bounds
    a=attach.local_to_lonlat(d,minx,miny); b=attach.local_to_lonlat(d,maxx,maxy)
    geo=(min(a[0],b[0]),min(a[1],b[1]),max(a[0],b[0]),max(a[1],b[1]))
    x,y,w,h=box
    scale=min(w/max(1e-9,maxx-minx),h/max(1e-9,maxy-miny))
    dw=(maxx-minx)*scale; dh=(maxy-miny)*scale
    ox=x+(w-dw)/2; oy=y+(h-dh)/2
    img=_naip_fetch(d,geo,key,(1800,1400))
    target_w=1800; target_h=max(1,round(target_w*dh/max(1e-9,dw)))
    c.drawImage(_aerial_reader(img,1.30,.98,.88,1.12,(target_w,target_h)),ox,oy,width=dw,height=dh,preserveAspectRatio=False,mask='auto')
    # Do not veil the aerial with a translucent white rectangle. PDF renderer
    # alpha handling can flatten the veil into an opaque wash, destroying the
    # evidence canvas and visual-maturity metrics. Engineering overlays provide
    # their own local white halos where legibility needs them.
    # Source attribution is rendered in the dedicated evidence-control block, not on top of the plan image.
    # Keeping the aerial itself label-free prevents collisions with scale bars and civil annotations.

def draw_naip_lonlat(c,d,bounds,box,key='area'):
    minlon,minlat,maxlon,maxlat=bounds; bx,by,bw,bh=box
    sx=bw/max(1e-9,maxlon-minlon); sy=bh/max(1e-9,maxlat-minlat); s=min(sx,sy)
    dw=(maxlon-minlon)*s; dh=(maxlat-minlat)*s
    ox=bx+(bw-dw)/2; oy=by+(bh-dh)/2
    img=_naip_fetch(d,bounds,key,(1800,1400))
    c.drawImage(_aerial_reader(img,1.24,.98,.90,1.10),ox,oy,width=dw,height=dh,preserveAspectRatio=False,mask='auto')
    # Keep the corridor aerial authoritative. Local label halos protect text;
    # a page-wide white alpha veil is intentionally avoided for renderer parity.
    return (ox,oy,dw,dh)

def title_block_field(c,x,w,top_rule_y,label,value,layout,max_lines=3,value_size=None,value_leading=None):
    tb=(layout or {}).get('title_block') or {}
    rule_to_label=float(tb.get('rule_to_label_gap_pt',12.0))
    label_to_value=float(tb.get('label_to_value_gap_pt',9.0))
    bottom_pad=float(tb.get('row_bottom_padding_pt',9.0))
    left_pad=float(tb.get('cell_left_padding_pt',8.0))
    right_pad=float(tb.get('cell_right_padding_pt',8.0))
    label_size=float(tb.get('label_font_pt',5.8))
    value_size=float(value_size if value_size is not None else tb.get('value_font_pt',6.8))
    value_leading=float(value_leading if value_leading is not None else tb.get('value_leading_pt',8.0))
    c.setStrokeColor(black); c.line(x+6,top_rule_y,x+w-6,top_rule_y)
    label_y=top_rule_y-rule_to_label
    text(c,label,x+left_pad,label_y,label_size,True,color=Color(.30,.30,.30))
    value_y=label_y-label_to_value
    after=wrap(c,value,x+left_pad,value_y,w-left_pad-right_pad,value_size,value_leading,False,max_lines)
    return after-bottom_pad

def title_block(c,d,sheet,drawing):
    x=1040; y=28; w=168; h=736
    c.setStrokeColor(black); c.setLineWidth(.8); c.setFillColor(white); c.rect(x,y,w,h,stroke=1,fill=1)
    studio=clean(ACTIVE_CLIENT.get('studio_credit') or ACTIVE_CLIENT.get('label') or 'SITE PLANNING')
    brand=clean(ACTIVE_CLIENT.get('title_block_brand') or ACTIVE_CLIENT.get('organization') or ACTIVE_CLIENT.get('label') or 'SITE PLAN')
    text(c,studio,x+w/2,y+h-42,7.8,True,'center',maxw=w-16)
    c.line(x,y+h-88,x+w,y+h-88)
    text(c,brand,x+w/2,y+h-111,12.2,True,'center',maxw=w-16)
    text(c,clean(ACTIVE_EQUIPMENT.get('label') or 'EV INFRASTRUCTURE'),x+w/2,y+h-126,6.8,True,'center',maxw=w-16)
    top_rule=y+h-137

    fields=[
      ('PROJECT',ACTIVE_MODE.get('project_label') or ACTIVE_MODE.get('label') or 'PRELIMINARY SITE PLAN'),
      ('SITE',f"SITE {int(d['site']):02d}"),
      ('ADDRESS',d['address']),
      ('PARCEL',d.get('parcel_id') or 'TBD'),
      ('STATUS','PRELIMINARY'),
      ('DATE',DATE),
      ('DRAWN',ACTIVE_CLIENT.get('organization') or ACTIVE_CLIENT.get('label') or 'SITE PLANNING'),
      ('CHECK','SYSTEMIA QA'),
      ('REFERENCE',ACTIVE_MODE.get('reference_label') or ACTIVE_MODE.get('label') or 'GENERIC'),
    ]
    for k,v in fields:
        top_rule=title_block_field(c,x,w,top_rule,k,v,ACTIVE_LAYOUT,max_lines=3)
    tb=(ACTIVE_LAYOUT or {}).get('title_block') or {}
    c.setStrokeColor(black); c.line(x+6,top_rule,x+w-6,top_rule)
    drawing_label_y=top_rule-float(tb.get('rule_to_label_gap_pt',12.0))
    text(c,'DRAWING',x+float(tb.get('cell_left_padding_pt',8.0)),drawing_label_y,float(tb.get('drawing_label_font_pt',5.8)),True,color=Color(.30,.30,.30))
    drawing_value_y=drawing_label_y-float(tb.get('label_to_value_gap_pt',9.0))
    wrap(c,drawing,x+float(tb.get('cell_left_padding_pt',8.0)),drawing_value_y,w-float(tb.get('cell_left_padding_pt',8.0))-float(tb.get('cell_right_padding_pt',8.0)),float(tb.get('drawing_value_font_pt',9.2)),float(tb.get('drawing_value_leading_pt',10.4)),True,4)
    text(c,'SHEET',x+8,y+51,5.4,True,color=Color(.30,.30,.30))
    text(c,sheet,x+w/2,y+20,21,True,'center')
    text(c,'NOT FOR CONSTRUCTION',x+w/2,y+7,5.5,True,'center',Color(.30,.30,.30))

def north(c,x,y):
    c.setStrokeColor(black); c.setLineWidth(1.2); c.line(x,y-28,x,y+10)
    p=c.beginPath(); p.moveTo(x,y+18); p.lineTo(x-7,y+5); p.lineTo(x+7,y+5); p.close(); c.drawPath(p,stroke=1,fill=1)
    text(c,'N',x,y+25,7,True,'center')

def draw_ada_path(c,d,tx,reserved=None):
    ar=d.get('access_route')
    if not ar: return
    try: g=shape(ar)
    except Exception: return
    c.saveState(); c.setDash([5,3],0); c.setLineWidth(1.5); c.setStrokeColor(black)
    legacy.draw_geom(c,g,tx,'other'); c.setDash()
    try:
        q=g.interpolate(.5,normalized=True); X,Y=tx(q.x,q.y)
        label_text='ADA PATH OF TRAVEL - CONCEPT / FIELD VERIFY'
        candidates=[(X+8,Y+8),(X+8,Y-16),(X+8,Y+28),(X-205,Y+8),(X-205,Y-16)]
        trench_rect=None
        if d.get('trench_route') and float(d.get('trench_length_ft') or 0)>1:
            tr=shape(d['trench_route'])
            tq=tr.interpolate(.5,normalized=True); TX,TY=tx(tq.x,tq.y)
            trench_text=f"CONCEPT TRENCH ~{float(d['trench_length_ft']):.0f} FT - DEPTH TBD"
            tw=min(300,stringWidth(trench_text,'Helvetica-Bold',7))
            trench_rect=(TX+12,TY+5,TX+12+tw,TY+14)
        chosen=candidates[0]
        obstacles=list(reserved or [])
        if trench_rect is not None: obstacles.append(trench_rect)
        for ax,ay in candidates:
            aw=min(300,stringWidth(label_text,'Helvetica-Bold',9.0))
            rect=(ax,ay-4,ax+aw,ay+10)
            if any(rects_overlap(rect,ob,2) for ob in obstacles if ob):
                continue
            chosen=(ax,ay); break
        text(c,label_text,chosen[0],chosen[1],9.0,True,maxw=300)
    except Exception: pass
    c.restoreState()

def rects_overlap(a,b,pad=0):
    if a is None or b is None: return False
    return not (a[2]+pad <= b[0] or a[0]-pad >= b[2] or a[3]+pad <= b[1] or a[1]-pad >= b[3])

def dimension_label_box(a,b,tx,label,offset,font_size):
    x1,y1=tx(*a); x2,y2=tx(*b)
    dx,dy=x2-x1,y2-y1; L=max(1,math.hypot(dx,dy)); nx,ny=-dy/L,dx/L
    x1o,y1o=x1+nx*offset,y1+ny*offset; x2o,y2o=x2+nx*offset,y2+ny*offset
    mx,my=(x1o+x2o)/2,(y1o+y2o)/2
    w=stringWidth(label,'Helvetica',font_size)
    baseline=my+2
    return (mx-w/2,baseline-font_size*.22,mx+w/2,baseline+font_size*.78)

def left_text_box(label,x,baseline,font_size,bold=False,maxw=None):
    font='Helvetica-Bold' if bold else 'Helvetica'
    fs=font_size
    if maxw:
        while fs>4 and stringWidth(label,font,fs)>maxw: fs-=.2
    w=stringWidth(label,font,fs)
    return (x,baseline-fs*.22,x+w,baseline+fs*.78)

def source_parcel_dimension_boxes(d,tx):
    boxes=[]
    for i,pd in enumerate((d.get('parcel_dimensions') or [])[:8]):
        try:
            label=f'{float(pd["ft"]):.0f} FT'
            boxes.append(dimension_label_box(pd['a'],pd['b'],tx,label,8+(i%2)*5,5.5))
        except Exception:
            pass
    return boxes

def ev_pad_label_box(d,zone,tx):
    if zone is None or zone.is_empty: return None
    try:
        n=basefactory.site_stall_count(d)
        total=n*2.743
        ang=math.radians(float(d.get('ev_zone_angle_deg') or 0))
        cent=zone.centroid
        r=total/2+3.0
        px=cent.x+r*math.cos(ang); py=cent.y+r*math.sin(ang)
        X,Y=tx(px,py)
        w=stringWidth('PAD','Helvetica-Bold',6.4)
        baseline=Y-3
        return (X-w/2,baseline-6.4*.22,X+w/2,baseline+6.4*.78)
    except Exception:
        return None

def stall_number_boxes(d,zone,tx):
    if zone is None or zone.is_empty: return []
    try:
        n=basefactory.site_stall_count(d)
        sw=2.743
        total=n*sw
        angle=math.radians(float(d.get('ev_zone_angle_deg') or 0))
        cent=zone.centroid
        boxes=[]
        for i in range(n):
            dx=-total/2+(i+.5)*sw
            cx=cent.x+dx*math.cos(angle)
            cy=cent.y+dx*math.sin(angle)
            X,Y=tx(cx,cy)
            label=str(i+1); fs=7.3
            w=stringWidth(label,'Helvetica-Bold',fs)
            baseline=Y-3
            boxes.append((X-w/2,baseline-fs*.22,X+w/2,baseline+fs*.78))
        return boxes
    except Exception:
        return []

def choose_dimension_offset(a,b,tx,label,font_size,candidates,reserved):
    for off in candidates:
        box=dimension_label_box(a,b,tx,label,off,font_size)
        if not any(rects_overlap(box,r,1) for r in reserved if r):
            return off,box
    off=candidates[-1]
    return off,dimension_label_box(a,b,tx,label,off,font_size)

def draw_ev_zone_dimensions(c,d,zone,tx):
    if zone is None or zone.is_empty: return []
    try:
        pts=list(zone.minimum_rotated_rectangle.exterior.coords)[:4]
        edges=[]
        for i in range(4):
            a=pts[i]; b=pts[(i+1)%4]
            L=math.hypot(b[0]-a[0],b[1]-a[1])
            edges.append((L,a,b))
        edges.sort(key=lambda q:q[0],reverse=True)
        long_edge=edges[0]
        short_edge=min(edges,key=lambda q:q[0])
        reserved=stall_number_boxes(d,zone,tx)
        if reserved:
            # PDF text extraction may merge adjacent stall numbers into one span.
            reserved.append((min(q[0] for q in reserved),min(q[1] for q in reserved),max(q[2] for q in reserved),max(q[3] for q in reserved)))
        try:
            zx0,zy0,zx1,zy1=zone.bounds; A=tx(zx0,zy0); B=tx(zx1,zy1)
            reserved.append((min(A[0],B[0])-8,min(A[1],B[1])-8,max(A[0],B[0])+8,max(A[1],B[1])+8))
        except Exception:
            pass
        reserved.extend(source_parcel_dimension_boxes(d,tx))
        pad_box=ev_pad_label_box(d,zone,tx)
        if pad_box: reserved.append(pad_box)
        long_label=f'{long_edge[0]*3.28084:.0f} FT PROPOSED EV ROW'
        long_off,long_box=choose_dimension_offset(long_edge[1],long_edge[2],tx,long_label,8.4,[32,-32,48,-48,64,-64,80,-80,96,-96],reserved)
        reserved.append(long_box)
        short_label=f'{short_edge[0]*3.28084:.0f} FT MODULE'
        short_off,short_box=choose_dimension_offset(short_edge[1],short_edge[2],tx,short_label,8.0,[70,-70,84,-84,98,-98,112,-112],reserved)
        c.saveState(); c.setStrokeColor(black); c.setFillColor(black)
        legacy.dim_line(c,long_edge[1],long_edge[2],tx,long_label,long_off,font_size=8.4)
        legacy.dim_line(c,short_edge[1],short_edge[2],tx,short_label,short_off,font_size=8.0)
        c.restoreState()
        return [long_box,short_box]
    except Exception:
        return []

def vdot_site_plan(path,d):
    c=canvas.Canvas(str(path),pagesize=PAGE)
    c.setTitle(f"Kennedy Space Station | {ACTIVE_CLIENT.get('label','Site Planning')} | Site {int(d['site']):02d} | {ACTIVE_MODE.get('label','Site Plan')}")
    # main plan box
    px,py,pw,ph=24,58,762,706
    c.setStrokeColor(black); c.rect(px,py,pw,ph,stroke=1,fill=0)
    # VDOT-style aerial base with source-derived engineering overlays.
    parcel0,features0,zone0,tx0,bounds0=gold.plan_transform(d,px+6,py+6,pw-12,ph-12,.12)
    draw_naip_local(c,d,bounds0,(px+6,py+6,pw-12,ph-12),key='plan')
    aerial_ok=True
    parcel,features,zone,tx,bounds=gold.draw_plan(c,d,x=px+6,y=py+6,w=pw-12,h=ph-12,detail=True)
    ev_dimension_boxes=draw_ev_zone_dimensions(c,d,zone,tx)
    ada_reserved=list(ev_dimension_boxes or [])+source_parcel_dimension_boxes(d,tx)+stall_number_boxes(d,zone,tx)
    if ada_reserved:
        nums=stall_number_boxes(d,zone,tx)
        if nums: ada_reserved.append((min(q[0] for q in nums),min(q[1] for q in nums),max(q[2] for q in nums),max(q[3] for q in nums)))
    pbox=ev_pad_label_box(d,zone,tx)
    if pbox: ada_reserved.append(pbox)
    draw_ada_path(c,d,tx,ada_reserved)
    # plan header strip
    c.setFillColor(white); c.rect(px+5,py+ph-31,445,25,stroke=0,fill=1)
    text(c,ACTIVE_MODE.get('site_plan_header') or 'PRELIMINARY EV SITE PLAN / PROPOSED CHARGING LAYOUT',px+12,py+ph-23,11.4,True,maxw=425)
    # VDOT-style callouts
    if zone is not None:
        q=zone.representative_point(); X,Y=tx(q.x,q.y)
        # One bounded callout block replaces three independently placed labels.
        # The block chooses the side with more map room and stays clear of the header/border.
        cbw,cbh=300,84
        right_x=max(px+12,min(X+24,px+pw-cbw-12))
        left_x=max(px+12,min(X-cbw-24,px+pw-cbw-12))
        right_space=(px+pw-12)-X
        x_candidates=[right_x,left_x] if right_space >= cbw+30 else [left_x,right_x]
        reserved=[]
        label_obstacles=list(ev_dimension_boxes or [])+source_parcel_dimension_boxes(d,tx)
        pad_box=ev_pad_label_box(d,zone,tx)
        if pad_box: label_obstacles.append(pad_box)
        # Reserve the host/building label footprint already drawn by gold.draw_plan().
        # This keeps proposed-work callouts from covering source-context labels.
        try:
            host=basefactory.primary_host(d)
            host_reserved=False
            for f,g in features:
                if f.get('class')=='building' and g is not None and not g.is_empty and g.intersects(parcel.buffer(4)):
                    nm=clean(f.get('name'))
                    if nm and nm.lower()==host.lower():
                        hq=g.representative_point(); HX,HY=tx(hq.x,hq.y)
                        hw=min(340,stringWidth(host.upper(),'Helvetica-Bold',11.5))
                        reserved.append((HX-hw/2-8,HY-7,HX+hw/2+8,HY+14))
                        host_reserved=True
                        break
            if not host_reserved:
                HX=px+6+(pw-12)*.50; HY=py+6+(ph-12)*.53
                hw=min(420,stringWidth(host.upper(),'Helvetica-Bold',10.5))
                reserved.append((HX-hw/2-8,HY-7,HX+hw/2+8,HY+13))
        except Exception:
            pass
        # Reserve the exact halo boxes used by gold.draw_plan() for the first
        # seven named road labels. Proposed-work callouts may not cover them.
        try:
            shown=0
            for f,g in features:
                nm=clean(f.get('name'))
                if f.get('class')=='road' and nm and shown<7 and g is not None and not g.is_empty:
                    rp=g.interpolate(.5,normalized=True) if g.geom_type in ('LineString','MultiLineString') else g.representative_point()
                    RX,RY=tx(rp.x,rp.y)
                    rw=stringWidth(nm.upper(),'Helvetica-Bold',6)+8
                    reserved.append((RX-rw/2,RY-4,RX+rw/2,RY+7))
                    shown+=1
        except Exception:
            pass
        if d.get('access_route'):
            try:
                ag=shape(d['access_route']); aq=ag.interpolate(.5,normalized=True); AX,AY=tx(aq.x,aq.y)
                reserved.append((AX-220,AY-34,AX+230,AY+38))
            except Exception: pass
        if d.get('trench_route') and float(d.get('trench_length_ft') or 0)>1:
            try:
                tg=shape(d['trench_route']); tq=tg.interpolate(.5,normalized=True); TX,TY=tx(tq.x,tq.y)
                reserved.append((TX-12,TY-18,TX+320,TY+30))
            except Exception: pass
        chosen=None
        for cx in x_candidates:
            for cy0 in (Y+72,Y-68,Y+132,Y-128,Y+12):
                cy=max(py+24,min(cy0,py+ph-cbh-34))
                rect=(cx,cy,cx+cbw,cy+cbh)
                blocked=any(not (rect[2] <= q[0] or rect[0] >= q[2] or rect[3] <= q[1] or rect[1] >= q[3]) for q in reserved)
                if not blocked:
                    callout_text_boxes=[
                        left_text_box(f"(N) {basefactory.site_stall_count(d)} EV CHARGING STALLS",cx+11,cy+63,11.2,True,cbw-22),
                        left_text_box('(N) EVSE / SWITCHGEAR - CONCEPT',cx+11,cy+39,9.2,True,cbw-22),
                        left_text_box('(N) ADA CHARGING / ACCESS AISLE - VERIFY',cx+11,cy+16,8.4,True,cbw-22)
                    ]
                    blocked=any(rects_overlap(tb,ob) for tb in callout_text_boxes for ob in label_obstacles if ob)
                if not blocked:
                    chosen=(cx,cy); break
            if chosen: break
        cbx,cby=chosen if chosen else (x_candidates[0],max(py+24,min(Y+12,py+ph-cbh-34)))
        c.saveState()
        try: c.setFillAlpha(.90)
        except Exception: pass
        c.setFillColor(white); c.setStrokeColor(Color(.25,.25,.25)); c.rect(cbx,cby,cbw,cbh,stroke=1,fill=1)
        c.restoreState()
        text(c,f"(N) {basefactory.site_stall_count(d)} EV CHARGING STALLS",cbx+11,cby+63,11.2,True,maxw=cbw-22)
        text(c,'(N) EVSE / SWITCHGEAR - CONCEPT',cbx+11,cby+39,9.2,True,maxw=cbw-22)
        text(c,'(N) ADA CHARGING / ACCESS AISLE - VERIFY',cbx+11,cby+16,8.4,True,maxw=cbw-22)
        c.setStrokeColor(Color(.25,.25,.25)); c.line(X,Y,cbx if cbx>X else cbx+cbw,cby+cbh/2)
    # right notes/detail
    rx=792; rw=241
    c.setStrokeColor(black); c.setFillColor(white); c.rect(rx,500,rw,264,stroke=1,fill=1)
    text(c,'GENERAL SHEET NOTES',rx+10,744,9.6,True)
    notes=[
      '(E)=EXISTING; (N)=PROPOSED; (FV)=FIELD VERIFY. PRELIMINARY - NOT FOR CONSTRUCTION. UNKNOWN / MISSING DATA REMAINS TBD / FV.',
      'ADA / PARKING: FINAL DIMENSIONS, SLOPES, AISLES, SIGNAGE AND BOLLARDS REQUIRE DESIGN VERIFICATION.',
      'EVSE / ELECTRICAL: FINAL EQUIPMENT, CLEARANCES, SERVICE, TRANSFORMER, METERING AND PROTECTION REQUIRE ENGINEER / UTILITY / OEM COORDINATION.',
      'TRENCH / RESTORATION: CONCEPTUAL WHERE SHOWN. DEPTH AND SOIL DISTURBANCE REMAIN TBD UNLESS SOURCE-SUPPORTED.'
    ]
    yy=724
    for n in notes:
        yy=wrap(c,'• '+n,rx+10,yy,rw-20,7.2,8.9,False,5)-4
    # detail inset
    c.setFillColor(white); c.rect(rx,250,rw,238,stroke=1,fill=1)
    text(c,'EV CHARGER / ADA MODULE - CONCEPT',rx+10,472,9.6,True)
    sx=rx+35; sy=285; sw=105; sh=155
    c.rect(sx,sy,sw,sh,stroke=1,fill=0)
    aisle_x=sx+sw-35
    c.setDash([4,3],0); c.rect(aisle_x,sy,35,sh,stroke=1,fill=0); c.setDash()
    c.saveState()
    clip=c.beginPath(); clip.rect(aisle_x,sy,35,sh)
    c.clipPath(clip,stroke=0,fill=0)
    c.setStrokeColor(Color(.22,.22,.22)); c.setLineWidth(.8)
    for hy in range(int(sy-35),int(sy+sh+35),11):
        c.line(aisle_x-12,hy,aisle_x+47,hy+59)
    c.restoreState()
    c.setFillColor(LIGHT); c.rect(sx+29,sy+sh-26,18,18,stroke=1,fill=1)
    text(c,'EVSE',sx+38,sy+sh-20,8.0,True,'center')
    text(c,'ADA ACCESS AISLE',sx+sw-17,sy+sh/2,7.6,True,'center')
    text(c,'9 FT TYP.',sx+sw/2,sy-13,7.6,True,'center')
    text(c,'18 FT TYP.',sx-16,sy+sh/2,7.6,True,'center')
    wrap(c,'FINAL ADA SPACE / AISLE, SLOPES, BOLLARDS, EQUIPMENT CLEARANCES AND SIGNAGE: PROJECT-SPECIFIC / VERIFY.',rx+150,428,82,6.8,8.2,False,9)
    # evidence control
    c.setFillColor(white); c.rect(rx,64,rw,174,stroke=1,fill=1)
    text(c,'SOURCE / EVIDENCE CONTROL',rx+10,220,8.4,True)
    host=basefactory.primary_host(d)
    text(c,'HOST',rx+10,203,5.8,True,color=Color(.30,.30,.30)); wrap(c,host,rx+60,203,rw-70,6.1,7.2,False,3)
    text(c,'PARCEL',rx+10,178,5.8,True,color=Color(.30,.30,.30)); text(c,d.get('parcel_id') or 'TBD',rx+60,178,6.1,False,maxw=160)
    ev=' / '.join(basefactory.evidence_state(d)[:3]) or 'NO OPEN EXCEPTION'
    text(c,'VERIFY',rx+10,160,5.8,True,color=Color(.30,.30,.30)); wrap(c,ev,rx+60,160,rw-70,5.8,6.9,False,4)
    ref_sha=clean(ACTIVE_MODE.get('reference_sha256'))
    text(c,'REFERENCE',rx+10,126,5.8,True,color=Color(.30,.30,.30)); text(c,(ref_sha[:12]+'...') if ref_sha else (ACTIVE_MODE.get('reference_label') or 'PROFILE CONTROL'),rx+60,126,5.8,False,maxw=160)
    text(c,'AERIAL',rx+10,111,5.8,True,color=Color(.30,.30,.30)); text(c,'USGS NAIP / NATIONAL MAP' if aerial_ok else 'UNAVAILABLE - VERIFY',rx+60,111,5.6,False,maxw=160)
    wrap(c,'Kennedy Space Station | Evercraft Site Planning + Spatial Engineering | Preliminary planning exhibit | No NASA affiliation.',rx+10,94,rw-20,5.2,6.3,False,5)
    title_block(c,d,recipe_sheet('site_plan','S-0'),ACTIVE_MODE.get('site_drawing_name') or 'EV SITE PLAN')
    c.showPage(); c.save()

def ll_bounds(area,d):
    # Curate A-0 around decision-relevant corridor context. Wide GIS harvests may
    # contain roads many miles away; those may remain in evidence but may not
    # shrink the candidate site into a locator dot.
    lat0,lon0=float(d['lat']),float(d['lon'])
    coords=[(lon0,lat0)]
    roads=area.get('roads') or []
    lat_cap=.045
    lon_cap=.055/max(.55,math.cos(math.radians(lat0)))
    for r in roads:
        rc=r.get('coords') or []
        segs=rc if attach.is_multiseg(rc) else [rc]
        for seg in segs:
            for p in seg:
                try:
                    lon,lat=float(p[0]),float(p[1])
                except Exception:
                    continue
                if abs(lat-lat0)<=lat_cap and abs(lon-lon0)<=lon_cap:
                    coords.append((lon,lat))
    lons=[p[0] for p in coords]; lats=[p[1] for p in coords]
    minlon,maxlon=min(lons),max(lons); minlat,maxlat=min(lats),max(lats)
    min_w=.022/max(.55,math.cos(math.radians(lat0))); min_h=.018
    dx=max(maxlon-minlon,min_w); dy=max(maxlat-minlat,min_h)
    # Bound final window to roughly a few miles around the host. This preserves
    # recognizable highway/corridor context without sacrificing site prominence.
    dx=min(dx,.075/max(.55,math.cos(math.radians(lat0))))
    dy=min(dy,.060)
    cx=(minlon+maxlon)/2 if len(coords)>1 else lon0
    cy=(minlat+maxlat)/2 if len(coords)>1 else lat0
    # Keep the candidate inside the central 60% even when contextual roads skew.
    cx=max(lon0-dx*.18,min(cx,lon0+dx*.18))
    cy=max(lat0-dy*.18,min(cy,lat0+dy*.18))
    pad=max(dx,dy)*.08
    return (cx-dx/2-pad,cy-dy/2-pad,cx+dx/2+pad,cy+dy/2+pad)

def vdot_area_map(path,d):
    area=attach.get_area_data(d)
    c=canvas.Canvas(str(path),pagesize=PAGE)
    c.setTitle(f"Kennedy Space Station | {ACTIVE_CLIENT.get('label','Site Planning')} | Site {int(d['site']):02d} | {ACTIVE_MODE.get('area_drawing_name','Area Context')}")
    bx,by,bw,bh=24,64,1008,700
    c.setStrokeColor(black); c.rect(bx,by,bw,bh,stroke=1,fill=0)
    bounds=ll_bounds(area,d); lat0,lon0=float(d['lat']),float(d['lon'])
    roads=area.get('roads') or []
    # VDOT-style aerial road context. Keep vector roads and parcel as legible overlays.
    c.setFillColor(PALE); c.rect(bx+1,by+1,bw-2,bh-2,stroke=0,fill=1)
    draw_naip_lonlat(c,d,bounds,(bx+1,by+1,bw-2,bh-2),key='area')
    aerial_ok=True
    style={'motorway':4.0,'trunk':3.4,'primary':2.6,'secondary':1.8}
    labels=[]; seen=set()
    for r in roads:
        rc=r.get('coords') or []
        if not rc: continue
        c.setStrokeColor(Color(.20,.20,.20))
        if attach.is_multiseg(rc):
            for seg in rc: attach.draw_polyline(c,seg,bounds,(bx,by,bw,bh),style.get(r.get('highway'),1.0))
            flat=[p for seg in rc for p in seg]
        else:
            attach.draw_polyline(c,rc,bounds,(bx,by,bw,bh),style.get(r.get('highway'),1.0)); flat=rc
        nm=clean(r.get('name')); ref=clean(r.get('ref')); lab=' / '.join([v for v in (nm,ref) if v])
        if lab and lab not in seen and flat:
            seen.add(lab); p=flat[len(flat)//2]; X,Y=attach.transform_lonlat(bounds,*p,(bx,by,bw,bh)); labels.append((lab,X,Y))
    # parcel in ll
    try:
        parcel=shape(d['parcel']); ll=[attach.local_to_lonlat(d,x,y) for x,y in parcel.exterior.coords]
        c.setDash([6,3],0); c.setStrokeColor(black); attach.draw_polyline(c,ll,bounds,(bx,by,bw,bh),1.8); c.setDash()
    except Exception: pass
    sx,sy=attach.transform_lonlat(bounds,lon0,lat0,(bx,by,bw,bh))
    c.setFillColor(black); c.circle(sx,sy,7,stroke=1,fill=1)
    text(c,'CANDIDATE SITE',sx+12,sy+10,8.6,True)
    # Compliance-mode reference radius. Generic modes do not inherit VDOT's
    # 528-foot / 0.1-mile program rule.
    radius_ft=(ACTIVE_MODE.get('program_rules') or {}).get('amenity_reference_radius_ft')
    if radius_ft:
        radius_m=float(radius_ft)*0.3048
        rr=[]
        for i in range(73):
            ang=2*math.pi*i/72
            north_m=radius_m*math.sin(ang); east=radius_m*math.cos(ang)
            lat=lat0+north_m/111320.0
            lon=lon0+east/(111320.0*max(.2,math.cos(math.radians(lat0))))
            rr.append((lon,lat))
        c.setStrokeColor(Color(.28,.28,.28)); c.setDash([3,3],0); attach.draw_polyline(c,rr,bounds,(bx,by,bw,bh),1.0); c.setDash()
        radius_label=('0.1 MI / 528 FT REFERENCE RADIUS' if abs(float(radius_ft)-528)<.5 else f'{float(radius_ft):.0f} FT REFERENCE RADIUS')
        text(c,radius_label,sx+16,sy-18,6.2,True,maxw=205)
    # Collision-aware road-label placement. Labels are nudged within the map
    # frame rather than being stacked blindly at road midpoints.
    site_label_w=stringWidth('CANDIDATE SITE','Helvetica-Bold',8.6)+8
    placed_label_rects=[(sx-20,sy-34,sx+max(245,site_label_w+35),sy+34)]
    if radius_ft:
        placed_label_rects.append((sx+12,sy-24,sx+225,sy-8))
    inset_reserved=(bx+bw-292,by+bh-196,bx+bw-24,by+bh-24)
    for lab,X,Y in labels[:14]:
        lw=min(180,stringWidth(lab,'Helvetica-Bold',6.0)+7); lh=12
        candidates=[(X,Y),(X,Y+12),(X,Y-12),(X+28,Y),(X-28,Y),(X,Y+24),(X,Y-24)]
        chosen=None
        for cx,cy in candidates:
            cx=max(bx+4,min(cx,bx+bw-lw-4)); cy=max(by+4,min(cy,by+bh-lh-4))
            rect=(cx-2,cy-3,cx-2+lw,cy-3+lh)
            collides=any(not (rect[2] <= q[0] or rect[0] >= q[2] or rect[3] <= q[1] or rect[1] >= q[3]) for q in placed_label_rects)
            if not collides:
                q=inset_reserved
                collides=not (rect[2] <= q[0] or rect[0] >= q[2] or rect[3] <= q[1] or rect[1] >= q[3])
            if not collides:
                chosen=(cx,cy,rect); break
        if chosen is None:
            continue
        cx,cy,rect=chosen
        c.setFillColor(white); c.rect(rect[0],rect[1],lw,lh,stroke=0,fill=1)
        text(c,lab,cx,cy,6.0,True,maxw=172)
        placed_label_rects.append(rect)
    north(c,bx+34,by+bh-45)

    # Close-site inset: reuse the canonical plan aerial cache so A-0 preserves
    # corridor context while still giving the reviewer a readable host/parcel/EV relationship.
    ix,iy,iw,ih=bx+bw-292,by+bh-196,268,172
    c.setFillColor(white); c.setStrokeColor(black); c.rect(ix,iy,iw,ih,stroke=1,fill=1)
    text(c,'CLOSE SITE CONTEXT',ix+8,iy+ih-14,6.6,True)
    try:
        iparcel,ifeatures,izone,itx,ibounds=gold.plan_transform(d,ix+7,iy+7,iw-14,ih-26,.12)
        draw_naip_local(c,d,ibounds,(ix+7,iy+7,iw-14,ih-26),key='plan')
        c.saveState()
        c.setStrokeColor(black); c.setLineWidth(1.5); c.setDash([5,2],0)
        legacy.draw_geom(c,iparcel,itx,'other'); c.setDash()
        if izone is not None:
            c.setLineWidth(1.7); legacy.draw_geom(c,izone,itx,'other')
            q=izone.representative_point(); X,Y=itx(q.x,q.y)
            c.setFillColor(black); c.circle(X,Y,2.8,stroke=1,fill=1)
            text(c,'PROPOSED EV',X+6,Y+5,7.0,True,maxw=92)
        c.restoreState()
    except Exception:
        text(c,'SITE INSET UNAVAILABLE - VERIFY',ix+iw/2,iy+ih/2,5.8,True,'center')

    # control box
    c.setFillColor(white); c.rect(bx+12,by+12,325,104,stroke=1,fill=1)
    text(c,ACTIVE_MODE.get('area_map_header') or 'AREA CONTEXT / ROAD NETWORK',bx+22,by+98,7.4,True)
    text(c,d['address'],bx+22,by+82,6.4,True,maxw=300)
    radius_ft=(ACTIVE_MODE.get('program_rules') or {}).get('amenity_reference_radius_ft')
    if radius_ft:
        context_note=f'This map identifies the candidate site, parcel context, named major-road context and the profile-required {float(radius_ft):.0f}-foot reference radius. Required program-specific driving-distance or station fields remain separately verified and are not silently replaced by this map.'
    else:
        context_note='This map identifies the candidate site, parcel context and named major-road context. Program-specific distance, station or amenity-radius requirements are not inferred unless the selected compliance mode explicitly requires them.'
    wrap(c,context_note,bx+22,by+65,300,5.6,6.6,False,6)
    text(c,'SOURCE',bx+22,by+20,5.4,True,color=Color(.35,.35,.35))
    src=clean(area.get('source') or 'Canonical site intelligence record')
    if aerial_ok: src='USGS NAIP aerial + '+src
    text(c,src,bx+62,by+20,5.4,False,maxw=250)
    title_block(c,d,recipe_sheet('area_context','A-0'),ACTIVE_MODE.get('area_drawing_name') or 'AREA CONTEXT')
    c.showPage(); c.save()

def hydrate_identity_digest(d):
    if d.get('_identity_sha256') or (d.get('compiler_meta') or {}).get('identity_sha256') or d.get('identity_sha256'):
        return d
    try:
        ident=ROOT/'compiler_v2'/'identity'/f"site_{int(d['site']):02d}_identity.json"
        if ident.exists():
            rec=json.load(open(ident))
            digest=clean(rec.get('identity_sha256'))
            if digest:
                d['_identity_sha256']=digest
                d['_identity_receipt']=str(ident)
    except Exception:
        pass
    return d

def main():
    global ACTIVE_CONFIG, ACTIVE_MODE, ACTIVE_CLIENT, ACTIVE_EQUIPMENT, ACTIVE_RECIPE, ACTIVE_LAYOUT, ACTIVE_PROFILE
    ap=argparse.ArgumentParser(description='Build KSS site-plan deliverables from the canonical site-intelligence core.')
    ap.add_argument('--site',type=int,default=None,help='Render one site only for calibration/revision without mutating the batch manifest/bundle.')
    ap.add_argument('--mode',default='vdot_nevi_va',help='Compliance/program mode.')
    ap.add_argument('--client-profile',default='rivet_kss',help='Client/render profile.')
    ap.add_argument('--equipment-pack',default='generic_ev',help='Equipment family/profile pack.')
    ap.add_argument('--recipe',default='two_sheet_site_area',help='Deliverable recipe.')
    ap.add_argument('--layout-profile',default='semantic_sheet_v2',help='Semantic drawing/layout contract.')
    args=ap.parse_args()
    ACTIVE_CONFIG=resolve_configuration(args.mode,args.client_profile,args.equipment_pack,args.recipe,args.layout_profile)
    ACTIVE_MODE=ACTIVE_CONFIG['compliance_mode']
    ACTIVE_CLIENT=ACTIVE_CONFIG['client_profile']
    ACTIVE_EQUIPMENT=ACTIVE_CONFIG['equipment_pack']
    ACTIVE_RECIPE=ACTIVE_CONFIG['deliverable_recipe']
    ACTIVE_LAYOUT=ACTIVE_CONFIG['layout_profile']
    ACTIVE_PROFILE=ACTIVE_MODE
    records=[]
    for fp in sorted(SRC.glob('site_*.json')):
        d=hydrate_identity_digest(json.load(open(fp))); records.append(d)
    if args.site is None and len(records)!=26: raise RuntimeError(f'Expected 26 site records, got {len(records)}')
    if args.site is not None:
        records=[d for d in records if int(d['site'])==int(args.site)]
        if not records: raise RuntimeError(f'Site {args.site} not found')
    manifest=[]; review_parts=[]
    for d in records:
        s=int(d['site']); nn=f'{s:02d}'
        legacy_default=(ACTIVE_MODE['id']=='vdot_nevi_va' and ACTIVE_CLIENT['id']=='rivet_kss')
        if legacy_default:
            stem=f'RIVET_Site_{nn}_VDOT'
        else:
            client_tag=(ACTIVE_CLIENT.get('organization') or ACTIVE_CLIENT['id']).upper().replace(' ','_').replace('/','_')
            mode_tag=ACTIVE_MODE['id'].upper()
            stem=f'{client_tag}_Site_{nn}_{mode_tag}'
        sp=OUT/f'{stem}_S0_Site_Plan.pdf'
        am=OUT/f'{stem}_A0_Area_Map.pdf'
        # Validate exact modeled stall polygons before image fetch or PDF output.
        # A missing parking surface or a displaced row stops the submission pair.
        gold.validate_stall_placement(d)
        vdot_site_plan(sp,d); vdot_area_map(am,d)
        pair=OUT/f'{stem}_Founder_Review_2pg.pdf'
        w=PdfWriter()
        for p in (sp,am):
            for pg in PdfReader(str(p)).pages: w.add_page(pg)
        with open(pair,'wb') as f:w.write(f)
        review_parts.append(pair)
        source_model=SRC/f'site_{nn}.json'
        manifest.append({
          'site':s,'address':d['address'],'parcel_id':d.get('parcel_id'),
          'source_model':str(source_model),'source_model_sha256':sha(source_model),
          'site_plan':str(sp),'site_plan_sha256':sha(sp),
          'area_map':str(am),'area_map_sha256':sha(am),
          'review_pair':str(pair),'review_pair_sha256':sha(pair),
          'open_evidence':basefactory.evidence_state(d),
          'render_offline':RENDER_OFFLINE,
          'engine_version':ENGINE_VERSION,
          'compliance_mode':ACTIVE_MODE['id'],
          'compliance_mode_version':ACTIVE_MODE['version'],
          'client_profile':ACTIVE_CLIENT['id'],
          'client_profile_version':ACTIVE_CLIENT['version'],
          'equipment_pack':ACTIVE_EQUIPMENT['id'],
          'equipment_pack_version':ACTIVE_EQUIPMENT['version'],
          'deliverable_recipe':ACTIVE_RECIPE['id'],
          'deliverable_recipe_version':ACTIVE_RECIPE['version'],
          'layout_profile':ACTIVE_LAYOUT['id'],
          'layout_profile_version':ACTIVE_LAYOUT['version']
        })
        print('PAIR',nn,'siteplan',sp.stat().st_size,'areamap',am.stat().st_size,'open',len(manifest[-1]['open_evidence']))
    if args.site is not None:
        m=manifest[0]
        print('CALIBRATION_ONLY',m['site'],m['review_pair'],m['review_pair_sha256'])
        return
    legacy_default=(ACTIVE_MODE['id']=='vdot_nevi_va' and ACTIVE_CLIENT['id']=='rivet_kss')
    package_tag='RIVET_VDOT_NEVI' if legacy_default else ((ACTIVE_CLIENT.get('organization') or ACTIVE_CLIENT['id']).upper().replace(' ','_').replace('/','_')+'_'+ACTIVE_MODE['id'].upper())
    combined=OUT/f'{package_tag}_26_Sites_Founder_Review_52pg.pdf'
    w=PdfWriter()
    for p in review_parts:
        for pg in PdfReader(str(p)).pages:w.add_page(pg)
    with open(combined,'wb') as f:w.write(f)
    z=OUT/f'{package_tag}_26_Sites_Submission_Pairs.zip'
    with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED) as zz:
        for m in manifest:
            for key in ('site_plan','area_map'): 
                p=Path(m[key]); zz.write(p,p.name)
        zz.write(combined,combined.name)
    obj={
      'engine_version':ENGINE_VERSION,
      'compliance_mode':ACTIVE_MODE['id'],'compliance_mode_version':ACTIVE_MODE['version'],
      'client_profile':ACTIVE_CLIENT['id'],'client_profile_version':ACTIVE_CLIENT['version'],
      'equipment_pack':ACTIVE_EQUIPMENT['id'],'equipment_pack_version':ACTIVE_EQUIPMENT['version'],
      'deliverable_recipe':ACTIVE_RECIPE['id'],'deliverable_recipe_version':ACTIVE_RECIPE['version'],
      'layout_profile':ACTIVE_LAYOUT['id'],'layout_profile_version':ACTIVE_LAYOUT['version'],
      'authority':ACTIVE_MODE.get('authority',''),
      'reference_sha256':ACTIVE_MODE.get('reference_sha256',''),
      'reference_drive_id':ACTIVE_MODE.get('reference_drive_id',''),
      'studio':ACTIVE_CLIENT.get('studio_credit','Kennedy Space Station | Evercraft Site Planning + Spatial Engineering'),
      'site_count':26,'submission_files':52,'founder_review_pages':len(PdfReader(str(combined)).pages),
      'combined_founder_review':str(combined),'combined_sha256':sha(combined),
      'submission_zip':str(z),'sites':manifest,
      'external_delivery_authorized':False
    }
    (OUT/'manifest.json').write_text(json.dumps(obj,indent=2))
    print('COMBINED',obj['founder_review_pages'],combined.stat().st_size,obj['combined_sha256'])
    print('ZIP',z.stat().st_size)

if __name__=='__main__': main()