import json, math, zipfile
from pathlib import Path
from paths import DATA_ROOT, SOURCE_ROOT
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape
from reportlab.lib.colors import black, white, Color
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.units import inch
from pypdf import PdfReader, PdfWriter
from shapely.geometry import shape, Point, Polygon, LineString, MultiPolygon, MultiLineString, MultiPoint
from shapely import affinity

ROOT = DATA_ROOT
SRC = SOURCE_ROOT
OUT = ROOT / 'rendered'
OUT.mkdir(parents=True, exist_ok=True)
PAGE = (17*inch, 11*inch)  # 17x11 landscape engineering sheet
PW, PH = PAGE
MAP_X, MAP_Y = 28, 120
MAP_W, MAP_H = PW - 56, PH - 155
DATE = '09/17/2026'

G50 = Color(.50,.50,.50)
G70 = Color(.70,.70,.70)
G85 = Color(.85,.85,.85)
G93 = Color(.93,.93,.93)

# ---------- helpers ----------
def geom(obj):
    return shape(obj) if obj else None

def all_xy(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == 'Point':
        return [(g.x,g.y)]
    if g.geom_type in ('LineString','LinearRing'):
        return list(g.coords)
    if g.geom_type == 'Polygon':
        pts=list(g.exterior.coords)
        for ring in g.interiors: pts += list(ring.coords)
        return pts
    pts=[]
    for part in g.geoms: pts += all_xy(part)
    return pts

def text_fit(c, s, x, y, maxw, size=8, font='Helvetica'):
    fs=size
    while fs>5 and stringWidth(s,font,fs)>maxw:
        fs -= .25
    c.setFont(font,fs); c.drawString(x,y,s)
    return fs

def poly_path(c, pts, tx, close=True):
    if not pts: return
    p=c.beginPath()
    x0,y0=tx(*pts[0]); p.moveTo(x0,y0)
    for x,y in pts[1:]:
        xx,yy=tx(x,y); p.lineTo(xx,yy)
    if close: p.close()
    c.drawPath(p,stroke=1,fill=0)

def draw_geom(c, g, tx, kind):
    if g is None or g.is_empty: return
    if g.geom_type == 'Point':
        x,y=tx(g.x,g.y)
        if kind=='tree':
            c.setLineWidth(.7); c.setDash(); c.circle(x,y,3.6,stroke=1,fill=0)
            for a in range(0,360,45):
                r=5.2; c.line(x,y,x+math.cos(math.radians(a))*r,y+math.sin(math.radians(a))*r)
        elif kind=='power':
            c.setLineWidth(.8); c.circle(x,y,2.2,stroke=1,fill=0); c.line(x-3,y,x+3,y); c.line(x,y-3,x,y+3)
        elif kind=='light':
            c.circle(x,y,1.8,stroke=1,fill=1)
        elif kind=='camera':
            c.rect(x-2,y-1.2,4,2.4,stroke=1,fill=0); c.line(x+2,y,x+5,y+2)
        else:
            c.circle(x,y,1.8,stroke=1,fill=0)
        return
    if g.geom_type == 'MultiPoint':
        for p in g.geoms: draw_geom(c,p,tx,kind)
        return
    if kind=='road':
        c.setStrokeColor(G70); c.setLineWidth(4.0); c.setDash()
    elif kind=='building':
        c.setStrokeColor(black); c.setFillColor(G93); c.setLineWidth(1.1); c.setDash()
    elif kind=='parking':
        c.setStrokeColor(G50); c.setLineWidth(.85); c.setDash(2,2)
    elif kind=='vegetation':
        c.setStrokeColor(G50); c.setLineWidth(.7); c.setDash(1.5,2)
    elif kind=='water':
        c.setStrokeColor(G50); c.setLineWidth(1); c.setDash(5,2)
    elif kind=='power':
        c.setStrokeColor(black); c.setLineWidth(1.0); c.setDash(5,2)
    elif kind=='barrier':
        c.setStrokeColor(black); c.setLineWidth(1.0); c.setDash(2,2)
    else:
        c.setStrokeColor(G50); c.setLineWidth(.75); c.setDash()

    if g.geom_type=='LineString':
        poly_path(c,list(g.coords),tx,False)
    elif g.geom_type=='MultiLineString':
        for p in g.geoms: poly_path(c,list(p.coords),tx,False)
    elif g.geom_type=='Polygon':
        pts=list(g.exterior.coords)
        p=c.beginPath(); x0,y0=tx(*pts[0]); p.moveTo(x0,y0)
        for x,y in pts[1:]:
            xx,yy=tx(x,y); p.lineTo(xx,yy)
        p.close()
        if kind=='building': c.drawPath(p,stroke=1,fill=1)
        else: c.drawPath(p,stroke=1,fill=0)
    elif g.geom_type=='MultiPolygon':
        for p in g.geoms: draw_geom(c,p,tx,kind)
    c.setDash(); c.setStrokeColor(black); c.setFillColor(black)

def label(c,s,x,y,size=6.5,bold=False,anchor='left'):
    c.setFont('Helvetica-Bold' if bold else 'Helvetica',size)
    if anchor=='center': c.drawCentredString(x,y,s)
    elif anchor=='right': c.drawRightString(x,y,s)
    else: c.drawString(x,y,s)

def arrow(c,x1,y1,x2,y2):
    c.setLineWidth(.8); c.line(x1,y1,x2,y2)
    ang=math.atan2(y2-y1,x2-x1); ah=5
    for d in (+.5,-.5):
        c.line(x2,y2,x2-math.cos(ang+d)*ah,y2-math.sin(ang+d)*ah)

def dim_line(c,a,b,tx,text,offset=6,font_size=5.5):
    x1,y1=tx(*a); x2,y2=tx(*b)
    dx,dy=x2-x1,y2-y1; L=max(1,math.hypot(dx,dy)); nx,ny=-dy/L,dx/L
    x1o,y1o=x1+nx*offset,y1+ny*offset; x2o,y2o=x2+nx*offset,y2+ny*offset
    c.setLineWidth(.5); c.line(x1o,y1o,x2o,y2o)
    c.line(x1,y1,x1o+nx*2,y1o+ny*2); c.line(x2,y2,x2o+nx*2,y2o+ny*2)
    # ticks
    c.line(x1o-ny*2.5,y1o+nx*2.5,x1o+ny*2.5,y1o-nx*2.5)
    c.line(x2o-ny*2.5,y2o+nx*2.5,x2o+ny*2.5,y2o-nx*2.5)
    mx,my=(x1o+x2o)/2,(y1o+y2o)/2
    label(c,text,mx,my+2,font_size,False,'center')

def nearest_named_road(d):
    # Prefer address street if present in road_names, else nearest listed name.
    street=d['address'].split(',')[0].split(' ',1)[1].strip()
    names=d.get('road_names',[])
    def norm(s): return ''.join(ch for ch in s.lower() if ch.isalnum())
    for n in names:
        if norm(street) in norm(n) or norm(n) in norm(street): return n
    return names[0] if names else street

def line_label(c,g,tx,name):
    if not name or g is None or g.is_empty: return
    p = g.interpolate(.5,normalized=True) if g.geom_type in ('LineString','MultiLineString') else g.representative_point()
    x,y=tx(p.x,p.y)
    # white halo box for legibility
    w=stringWidth(name.upper(),'Helvetica-Bold',6)+8
    c.setFillColor(white); c.rect(x-w/2,y-4,w,11,stroke=0,fill=1)
    c.setFillColor(black); label(c,name.upper(),x,y,6,True,'center')

def north_arrow(c):
    x=MAP_X+MAP_W-28; y=MAP_Y+MAP_H-20
    c.setLineWidth(1.2); c.line(x,y-22,x,y+8)
    p=c.beginPath(); p.moveTo(x,y+14); p.lineTo(x-5,y+5); p.lineTo(x+5,y+5); p.close(); c.drawPath(p,stroke=1,fill=1)
    label(c,'N',x,y+18,9,True,'center')

def scale_bar(c, tx, minx, miny):
    # 100 ft graphic scale
    m100=30.48
    x0,y0=tx(minx,miny)
    x0=MAP_X+22; y0=MAP_Y+36
    x1,_=tx(minx+m100,miny)
    w=abs(x1-tx(minx,miny)[0])
    if w<45:
        m100=60.96; txt='200 FT'
    else: txt='100 FT'
    x1,_=tx(minx+m100,miny); w=abs(x1-tx(minx,miny)[0])
    c.setFillColor(black); c.rect(x0,y0,w/2,5,stroke=1,fill=1)
    c.setFillColor(white); c.rect(x0+w/2,y0,w/2,5,stroke=1,fill=1)
    c.setFillColor(black); label(c,'0',x0,y0+8,5.5); label(c,txt,x0+w,y0+8,5.5,False,'right')

def draw_ev_zone(c,zone,tx):
    if zone is None or zone.is_empty: return
    # Zone outline
    c.setDash(6,3); c.setLineWidth(1.3); c.setStrokeColor(black)
    draw_geom(c,zone,tx,'other'); c.setDash()
    # Draw 4 conceptual stalls + 2 future reserve inside oriented rectangle
    rect=zone.minimum_rotated_rectangle
    pts=list(rect.exterior.coords)[:-1]
    # choose long edge
    edges=[]
    for i in range(4):
        a=pts[i]; b=pts[(i+1)%4]; edges.append((math.hypot(b[0]-a[0],b[1]-a[1]),a,b))
    _,a,b=max(edges,key=lambda x:x[0])
    ang=math.degrees(math.atan2(b[1]-a[1],b[0]-a[0]))
    center=zone.centroid
    # local rectangle size in rotated coords
    zr=affinity.rotate(zone,-ang,origin=(center.x,center.y))
    minx,miny,maxx,maxy=zr.bounds
    n=6; gap=(maxx-minx)/n
    for i in range(n):
        x1=minx+i*gap+gap*.08; x2=minx+(i+1)*gap-gap*.08
        y1=miny+(maxy-miny)*.17; y2=maxy-(maxy-miny)*.17
        stall=Polygon([(x1,y1),(x2,y1),(x2,y2),(x1,y2)])
        stall=affinity.rotate(stall,ang,origin=(center.x,center.y))
        c.setLineWidth(.65)
        if i>=4: c.setDash(4,2)
        else: c.setDash()
        draw_geom(c,stall,tx,'other')
    c.setDash()
    rp=zone.representative_point(); x,y=tx(rp.x,rp.y)
    label(c,'PROPOSED EV CHARGING AREA',x,y+8,6.2,True,'center')
    label(c,'CONCEPT STALL LAYOUT + FUTURE RESERVE - FINAL COUNT VERIFY',x,y-2,5.0,False,'center')
    label(c,'1 ADA SPACE MIN. - FINAL LAYOUT FIELD/ENGINEERING VERIFY',x,y-11,4.9,False,'center')
    # overall conceptual dimensions
    # use side lengths
    e=sorted(edges,reverse=True,key=lambda t:t[0])
    long_ft=e[0][0]*3.28084; short_ft=min(x[0] for x in edges)*3.28084
    dim_line(c,e[0][1],e[0][2],tx,f'~{long_ft:.0f} FT',8)


def draw_charging_detail(c,d,zone,tx):
    """Monochrome engineer-style close-up required by Attachment E.

    This is intentionally a conceptual fit-check. It uses only measured zone
    dimensions already carried in the RIVET site record and labels every
    unresolved civil/utility item as TBD/field verify rather than inventing it.
    """
    if zone is None or zone.is_empty:
        return

    # Put the inset in the map corner opposite the proposed EV zone so the
    # underlying parcel context is obscured as little as possible.
    zp=zone.representative_point(); zx,zy=tx(zp.x,zp.y)
    w,h=300,158
    left = MAP_X+12 if zx > MAP_X+MAP_W/2 else MAP_X+MAP_W-w-12
    bottom = MAP_Y+12 if zy > MAP_Y+MAP_H/2 else MAP_Y+MAP_H-h-12
    x0,y0=left,bottom

    c.saveState()
    c.setFillColor(white); c.setStrokeColor(black); c.setLineWidth(.9)
    c.rect(x0,y0,w,h,stroke=1,fill=1)
    label(c,'DETAIL A - PROPOSED EV CHARGING AREA',x0+10,y0+h-16,7.5,True)
    label(c,'CONCEPTUAL FIT-CHECK / FIELD + CIVIL + UTILITY VERIFY',x0+10,y0+h-27,4.8)

    # Derive the overall zone dimensions from the actual conceptual geometry.
    rect=zone.minimum_rotated_rectangle
    pts=list(rect.exterior.coords)[:-1]
    lengths=[]
    for i in range(4):
        a=pts[i]; b=pts[(i+1)%4]
        lengths.append(math.hypot(b[0]-a[0],b[1]-a[1]))
    long_ft=max(lengths)*3.28084
    short_ft=min(lengths)*3.28084
    area_sf=float(d.get('ev_zone_area_sf') or zone.area*10.7639)

    # Stall row. The bay geometry is a conceptual fit-check only. Existing
    # application commitments and final engineering control the exact charger
    # count, power, stall widths, and future-reserve configuration.
    row_x=x0+20; row_y=y0+53; row_w=196; row_h=52
    bay=row_w/6
    for i in range(6):
        bx=row_x+i*bay
        if i>=4: c.setDash(4,2)
        else: c.setDash()
        c.setLineWidth(.7); c.rect(bx,row_y,bay-2,row_h,stroke=1,fill=0)
        label(c,'FUT.' if i>=4 else 'EV',bx+(bay-2)/2,row_y+23,4.7,i<4,'center')
    c.setDash()

    # ADA access aisle is shown as a concept, not as a final engineered
    # dimension. Final dimensions/elevations are explicit gates.
    ada_x=row_x
    c.setLineWidth(.6)
    for yy in range(int(row_y),int(row_y+row_h),6):
        c.line(ada_x,yy,ada_x+10,min(yy+10,row_y+row_h))
    label(c,'ADA',ada_x+5,row_y-10,5.2,True,'center')
    label(c,'ACCESS AISLE / ROUTE - FINAL WIDTH + ELEVATIONS TBD',row_x,row_y-20,4.6)

    # Concept equipment pad and trench connection.
    pad_x=x0+w-58; pad_y=row_y+8; pad_w=36; pad_h=38
    c.setDash(3,2); c.rect(pad_x,pad_y,pad_w,pad_h,stroke=1,fill=0); c.setDash()
    label(c,'ELEC.',pad_x+pad_w/2,pad_y+22,4.8,True,'center')
    label(c,'PAD',pad_x+pad_w/2,pad_y+13,4.8,True,'center')
    label(c,'TBD',pad_x+pad_w/2,pad_y+4,4.2,False,'center')
    c.setDash(5,2); c.line(row_x+row_w,row_y+6,pad_x,pad_y+6); c.setDash()
    label(c,'CONCEPT TRENCH',row_x+row_w+4,row_y-2,4.4)

    # Dimension lines within the inset.
    c.setLineWidth(.5)
    ydim=row_y+row_h+16
    c.line(row_x,ydim,row_x+row_w,ydim)
    c.line(row_x,row_y+row_h,row_x,ydim+3); c.line(row_x+row_w,row_y+row_h,row_x+row_w,ydim+3)
    label(c,f'~{long_ft:.0f} FT OVERALL CONCEPT ZONE',row_x+row_w/2,ydim+4,4.8,False,'center')
    c.line(row_x-10,row_y,row_x-10,row_y+row_h)
    c.line(row_x-13,row_y,row_x,row_y); c.line(row_x-13,row_y+row_h,row_x,row_y+row_h)
    label(c,f'~{short_ft:.0f} FT',row_x-14,row_y+row_h/2,4.5,False,'right')

    # Compact Attachment E verification gates. Unknown stays unknown.
    label(c,f'CONCEPT EV ZONE: ~{area_sf:,.0f} SF',x0+10,y0+31,4.8,True)
    label(c,'SOIL DISTURBANCE SF / DEPTH: TBD BY CIVIL DESIGN',x0+10,y0+21,4.6)
    label(c,'LIGHTING / CAMERA / BOLLARDS / FIRE SAFETY: FIELD + FINAL DESIGN VERIFY',x0+10,y0+11,4.4)
    c.restoreState()


def make_sheet(d, outpdf):
    c=canvas.Canvas(str(outpdf),pagesize=PAGE)
    c.setTitle(f"RIVET Preliminary Site Plan - {d['address']}")
    # border + map frame
    c.setLineWidth(1); c.rect(16,16,PW-32,PH-32,stroke=1,fill=0)
    c.setLineWidth(.7); c.rect(MAP_X,MAP_Y,MAP_W,MAP_H,stroke=1,fill=0)

    parcel=geom(d['parcel']); features=[]
    for f in d.get('features',[]):
        try: features.append((f,geom(f.get('geometry'))))
        except: pass
    zone=geom(d.get('ev_zone'))
    extra=[g for _,g in features if g is not None]
    allg=[parcel,zone]+extra
    pts=[]
    for g in allg: pts+=all_xy(g)
    if not pts: pts=[(-50,-50),(50,50)]
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    minx,maxx=min(xs),max(xs); miny,maxy=min(ys),max(ys)
    # keep map centered on parcel, not entire 120m context, but retain named road if close
    pminx,pminy,pmaxx,pmaxy=parcel.bounds
    margin=max(18,(max(pmaxx-pminx,pmaxy-pminy))*.18)
    minx,maxx=pminx-margin,pmaxx+margin; miny,maxy=pminy-margin,pmaxy+margin
    sx=MAP_W/(maxx-minx); sy=MAP_H/(maxy-miny); s=min(sx,sy)
    ox=MAP_X+(MAP_W-(maxx-minx)*s)/2; oy=MAP_Y+(MAP_H-(maxy-miny)*s)/2
    def tx(x,y): return ox+(x-minx)*s, oy+(y-miny)*s

    # map background and actual features
    c.saveState(); c.rect(MAP_X,MAP_Y,MAP_W,MAP_H,stroke=0,fill=0); c.clipPath(c.beginPath(),stroke=0,fill=0) if False else None
    order=['road','parking','water','vegetation','barrier','building','power','tree','light','camera','other']
    for kind in order:
        for f,g in features:
            if f.get('class')==kind: draw_geom(c,g,tx,kind)
    c.restoreState()

    # parcel boundary
    c.setStrokeColor(black); c.setLineWidth(1.5); c.setDash([7,2,1,2],0)
    draw_geom(c,parcel,tx,'other'); c.setDash()
    rp=parcel.representative_point(); px,py=tx(rp.x,rp.y)
    label(c,f"PROPERTY LINE / PARCEL {d.get('parcel_id','TBD')}",px,py+MAP_H*.36 if py<MAP_Y+MAP_H/2 else py-MAP_H*.36,6,True,'center')

    # road labels: only named roads actually mapped
    road_labels=0
    for f,g in features:
        if f.get('class')=='road' and f.get('name') and g is not None and road_labels<3:
            if g.distance(parcel) < 55:
                line_label(c,g,tx,f['name']); road_labels+=1
    # Always surface the actual address road. If public map geometry does not carry
    # that exact name, label it as an address-record reference rather than silently
    # substituting a nearby road.
    address_street=d['address'].split(',')[0].split(' ',1)[1].strip()
    def _norm_road(s): return ''.join(ch for ch in s.lower() if ch.isalnum())
    mapped_names=[f.get('name','') for f,g in features if f.get('class')=='road' and f.get('name')]
    exact_address_road=any(_norm_road(address_street) in _norm_road(n) or _norm_road(n) in _norm_road(address_street) for n in mapped_names)
    if road_labels==0:
        label(c,address_street.upper(),MAP_X+MAP_W/2,MAP_Y+MAP_H-18,8,True,'center')
    elif not exact_address_road:
        label(c,f"SITE ADDRESS ROAD: {address_street.upper()}  (ROAD GEOMETRY FIELD VERIFY)",MAP_X+MAP_W/2,MAP_Y+MAP_H-18,6.2,True,'center')

    # building labels
    for f,g in features:
        if f.get('class')=='building' and g is not None and g.intersects(parcel.buffer(8)):
            p=g.representative_point(); x,y=tx(p.x,p.y); nm=f.get('name') or 'EXISTING BUILDING'
            label(c,nm.upper(),x,y,5.2,True,'center')

    # vegetation/tree callouts
    veg=[g for f,g in features if f.get('class') in ('vegetation','tree') and g is not None and g.intersects(parcel.buffer(5))]
    if veg:
        gv=veg[0].representative_point(); x,y=tx(gv.x,gv.y); arrow(c,x+60,y+20,x,y); label(c,'EXISTING TREES / WOODY VEGETATION',x+64,y+22,5.3,True)
    else:
        label(c,'TREES / WOODY VEGETATION: NOT MAPPED IN AVAILABLE PUBLIC GIS - FIELD VERIFY',MAP_X+14,MAP_Y+MAP_H-34,5.1)

    # water/environment callout
    waters=[g for f,g in features if f.get('class')=='water' and g is not None and g.intersects(parcel.buffer(15))]
    if waters:
        p=waters[0].representative_point(); x,y=tx(p.x,p.y); arrow(c,x+55,y+18,x,y); label(c,'MAPPED WATER / DRAINAGE FEATURE - AVOID / VERIFY',x+58,y+20,5.2,True)

    draw_ev_zone(c,zone,tx)

    # utility/trench route
    tr=geom(d.get('trench_route'))
    if tr is not None:
        c.setLineWidth(1.2); c.setDash(6,2); draw_geom(c,tr,tx,'power'); c.setDash()
        p=tr.interpolate(.52,normalized=True); x,y=tx(p.x,p.y)
        label(c,'CONCEPT ELECTRICAL / TRENCH ROUTE',x+10,y+10,5.2,True)
        if d.get('trench_length_ft'):
            label(c,f"~{d['trench_length_ft']:.0f} FT - DEPTH TBD / UTILITY COORDINATION REQUIRED",x+10,y+2,4.9)
    else:
        label(c,'UTILITY / TRENCH ROUTE: TBD - COORDINATE WITH UTILITY / FIELD VERIFY',MAP_X+14,MAP_Y+MAP_H-44,5.1)

    # access / ADA route
    ar=geom(d.get('access_route'))
    if ar is not None:
        c.setLineWidth(.8); c.setDash(2,2); draw_geom(c,ar,tx,'other'); c.setDash()
        p=ar.interpolate(.5,normalized=True); x,y=tx(p.x,p.y); label(c,'ADA ACCESSIBLE ROUTE - CONCEPT',x+6,y+6,4.9,True)

    # Parcel edge dimensions. Show every measured edge carried in the source
    # record, not an arbitrary first-six subset. Very short segments are still
    # omitted only when the source itself did not create a dimension record.
    for i,pd in enumerate(d.get('parcel_dimensions',[])):
        dim_line(c,pd['a'],pd['b'],tx,f"{pd['ft']:.0f} FT",5 + (i%2)*4)

    # Attachment E close-up / call-out. This combines the clean full-parcel
    # sheet with the detailed charging-area style supplied by the founder.
    draw_charging_detail(c,d,zone,tx)

    # notes / symbols
    north_arrow(c); scale_bar(c,tx,minx,miny)
    c.setFont('Helvetica',4.8)
    note_x=MAP_X+12; note_y=MAP_Y+8
    c.drawString(note_x,note_y,'EXISTING CONDITIONS FROM AVAILABLE PUBLIC GIS / PARCEL DATA. UNMAPPED FEATURES ARE UNKNOWN, NOT ABSENT.')

    # Title block
    y0=24; h=82
    c.setLineWidth(.8); c.rect(24,y0,PW-48,h,stroke=1,fill=0)
    # vertical divisions
    x1=260; x2=760; x3=1050
    for x in (x1,x2,x3): c.line(x,y0,x,y0+h)
    # RIVET brand cell
    label(c,'RIVET',42,y0+47,18,True)
    label(c,'EV INFRASTRUCTURE INTELLIGENCE',42,y0+34,7)
    label(c,'PRELIMINARY / NOT FOR CONSTRUCTION',42,y0+16,6.5,True)
    # center title
    label(c,'PRELIMINARY SITE PLAN',(x1+x2)/2,y0+54,13,True,'center')
    text_fit(c,d['address'].split(',')[0],x1+16,y0+36,x2-x1-32,9,'Helvetica-Bold')
    rest=', '.join(d['address'].split(',')[1:]).strip()
    text_fit(c,rest,x1+16,y0+23,x2-x1-32,7.3,'Helvetica')
    label(c,f"PARCEL: {d.get('parcel_id','TBD')}",x1+16,y0+9,6.3)
    # notes cell
    label(c,'GENERAL NOTES',x2+12,y0+62,7,True)
    notes=[
      '1. Public-GIS preliminary concept; final survey, civil, utility and ADA design required.',
      '2. Existing vs. proposed utilities shall be confirmed before application issue.',
      '3. Missing mapped features are UNKNOWN, not proof of absence.',
      '4. Proposed stall/equipment geometry is a fit-check concept only; final configuration TBD.',
      '5. Floodplain, wetlands, stormwater, elevations and disturbance depths require project verification.'
    ]
    yy=y0+50
    for n in notes:
        text_fit(c,n,x2+12,yy,x3-x2-20,5.1,'Helvetica'); yy-=10
    # sheet cell
    c.line(x3,y0+54,PW-24,y0+54); c.line(x3,y0+28,PW-24,y0+28)
    label(c,f"SHEET C-{int(d['site']):02d}",x3+10,y0+62,8,True)
    label(c,f"DATE: {DATE}",x3+10,y0+39,6.5)
    label(c,'SCALE: GRAPHIC',x3+10,y0+13,6.5)

    c.showPage(); c.save()


def main():
    files=sorted(SRC.glob('site_*.json'))
    made=[]; errors=[]
    for fp in files:
        try:
            d=json.loads(fp.read_text())
            out=OUT/f"RIVET_Site_{int(d['site']):02d}_Preliminary_Site_Plan.pdf"
            make_sheet(d,out); made.append(out)
            print('RENDERED',d['site'],d['address'])
        except Exception as e:
            errors.append((fp.name,repr(e))); print('ERROR',fp.name,repr(e))
    # combine
    if made:
        writer=PdfWriter()
        for p in sorted(made):
            r=PdfReader(str(p))
            for page in r.pages: writer.add_page(page)
        combo=OUT/'RIVET_VDOT_NEVI_26_Site_Preliminary_Plans.pdf'
        with open(combo,'wb') as f: writer.write(f)
        zpath=OUT/'RIVET_VDOT_NEVI_26_Site_Preliminary_Plans.zip'
        with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED) as z:
            for p in sorted(made): z.write(p,p.name)
            z.write(combo,combo.name)
        print('COMBINED',combo,combo.stat().st_size,'ZIP',zpath,zpath.stat().st_size)
    (OUT/'render_summary.json').write_text(json.dumps({'count':len(made),'errors':errors},indent=2))

if __name__=='__main__': main()