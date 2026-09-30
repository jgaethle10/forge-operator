import argparse,json,hashlib,copy,math
from pathlib import Path
from shapely.geometry import shape, mapping, LineString, box, Point
from shapely.ops import nearest_points
from shapely import affinity

from paths import DATA_ROOT, COMPILER_ROOT
ROOT=DATA_ROOT
MODELS=COMPILER_ROOT/'models'
OUT=COMPILER_ROOT/'geometry'
OUT.mkdir(parents=True,exist_ok=True)

TOL=1.0


def oriented_template(poly):
    r=poly.minimum_rotated_rectangle
    pts=list(r.exterior.coords)[:4]
    edges=[]
    for a,b in zip(pts,pts[1:]+pts[:1]):
        dx=b[0]-a[0]; dy=b[1]-a[1]; L=math.hypot(dx,dy)
        edges.append((L,math.degrees(math.atan2(dy,dx))))
    edges.sort(reverse=True)
    long_len,long_ang=edges[0]
    short_len=min(e[0] for e in edges)
    return long_len,short_len,long_ang

def make_oriented_rect(cx,cy,long_len,short_len,angle):
    g=box(-long_len/2,-short_len/2,long_len/2,short_len/2)
    g=affinity.rotate(g,angle,origin=(0,0),use_radians=False)
    return affinity.translate(g,cx,cy)

def fit_zone_to_parking(zone,parcel,buildings,parking_features,stall_count=6):
    legacy_long,legacy_short,legacy_angle=oriented_template(zone)
    # A second, engineering-derived template is allowed when the inherited proposal itself is bad.
    # 9 ft typical stall width x N stalls, plus a 12 ft conceptual rear/equipment/clearance band.
    module_long=max(2,stall_count)*9.0*0.3048
    module_short=(18.0+12.0)*0.3048
    oldc=zone.centroid
    template_modes=[
      ('legacy-footprint',legacy_long,legacy_short,[legacy_angle,legacy_angle+90]),
      ('stall-derived-module',module_long,module_short,[legacy_angle,legacy_angle+90,0,90])
    ]
    all_candidates=[]
    for mode,long_len,short_len,base_angles in template_modes:
      candidates=[]
      for f,surf0 in parking_features:
        surf=surf0.intersection(parcel)
        if surf.is_empty or surf.area < long_len*short_len*1.05: continue
        safe=surf.buffer(-0.35)
        if safe.is_empty: safe=surf
        # Add parking-surface principal angles to the orientation search.
        try:
          _,_,surf_angle=oriented_template(surf)
          angles=list(dict.fromkeys(base_angles+[surf_angle,surf_angle+90]))
        except Exception:
          angles=base_angles
        minx,miny,maxx,maxy=safe.bounds
        step=max(1.25,min(long_len,short_len)/6.0)
        y=miny
        while y<=maxy+1e-6:
          x=minx
          while x<=maxx+1e-6:
            pt=Point(x,y)
            if safe.covers(pt):
              for ang in angles:
                cand=make_oriented_rect(x,y,long_len,short_len,ang)
                if not parcel.buffer(-0.1).covers(cand): continue
                if not surf.buffer(0.25).covers(cand): continue
                collision=False; nearest_b=9999.0
                for bf,bg in buildings:
                  if cand.intersection(bg).area>.2:
                    collision=True; break
                  nearest_b=min(nearest_b,cand.distance(bg))
                if collision: continue
                movement=oldc.distance(cand.centroid)
                # Prefer modest movement, then proximity to host/building without collision.
                score=movement + min(nearest_b,80)*0.10
                candidates.append((score,movement,nearest_b,cand,clean_name(f.get('name')) or 'mapped parking',ang))
            x+=step
          y+=step
      if candidates:
        candidates.sort(key=lambda x:(x[0],x[1],x[2]))
        sc,mv,nb,cand,name,ang=candidates[0]
        return cand,{'surface':name,'solver_mode':mode,'movement_m':round(mv,2),'nearest_building_m':round(nb,2),'score':round(sc,2),'template_long_m':round(long_len,2),'template_short_m':round(short_len,2),'angle_deg':round(ang,2),'candidate_count':len(candidates),'stall_count':stall_count}
    return None,None

def clean_name(v):
    return ' '.join(str(v or '').split())

def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()

def geoms(d,klass):
    out=[]
    for f in d.get('features',[]):
        if f.get('class')!=klass: continue
        try:
            g=shape(f.get('geometry'))
            if not g.is_empty: out.append((f,g))
        except Exception: pass
    return out

def line_between(a,b):
    p,q=nearest_points(a,b)
    return LineString([(p.x,p.y),(q.x,q.y)])

def _trench_building_hits(seg,buildings):
    hits=[]
    for f,g in buildings:
        core=g.buffer(-.15) if g.area>1 else g
        if core.is_empty: core=g
        inter=seg.intersection(core)
        if not inter.is_empty and getattr(inter,'length',0)>.5:
            hits.append(f.get('name') or 'EXISTING BUILDING')
    return hits

def power_target_points(g):
    if g.is_empty: return []
    if g.geom_type=='Point': return [g]
    if g.geom_type in ('LineString','LinearRing'):
        pts=[g.interpolate(g.length*i/20 if g.length else 0) for i in range(21)]
        pts += [Point(xy) for xy in list(g.coords)]
        return pts
    pts=[]
    for part in getattr(g,'geoms',[]): pts += power_target_points(part)
    return pts

def choose_safe_power_trench(zone,powers,buildings):
    candidates=[]
    for f,g in powers:
        for target in power_target_points(g):
            p,_=nearest_points(zone.boundary,target)
            seg=LineString([(p.x,p.y),(target.x,target.y)])
            if seg.length<2.0: continue
            if _trench_building_hits(seg,buildings): continue
            candidates.append((seg.length,seg,f))
    if not candidates: return None,None
    candidates.sort(key=lambda x:x[0])
    return candidates[0][1],candidates[0][2]

def compile_geometry(n):
    src=MODELS/f'site_{n:02d}.json'
    if not src.exists(): raise RuntimeError(f'frozen model missing for site {n}')
    d=json.load(open(src)); out=copy.deepcopy(d)
    parcel=shape(d['parcel']); zone=shape(d['ev_zone'])
    failures=[]; warnings=[]; metrics={}
    if not parcel.is_valid or parcel.is_empty: failures.append('INVALID_PARCEL')
    if not zone.is_valid or zone.is_empty or zone.area<=1: failures.append('INVALID_EV_ZONE')

    buildings=[(f,g) for f,g in geoms(d,'building') if g.intersects(parcel.buffer(TOL))]
    parking=[(f,g) for f,g in geoms(d,'parking') if g.intersects(parcel.buffer(TOL))]
    host_surface_state='verified-mapped-parking' if parking else 'host-surface-unresolved'
    input_zone=mapping(zone)
    def zone_state(z):
        ratio=z.intersection(parcel).area/max(z.area,1e-9)
        col=[]
        for f,g in buildings:
            a=z.intersection(g).area
            if a>.5: col.append({'name':f.get('name') or 'EXISTING BUILDING','overlap_sqm':round(a,2)})
        return ratio,col
    ratio,collisions=zone_state(zone)
    relocation=None
    if ratio < .985 or collisions:
        if not parking:
            failures.append('HOST_SURFACE_UNRESOLVED')
            relocated=None; relmeta=None
        else:
            relocated,relmeta=fit_zone_to_parking(zone,parcel,buildings,parking,int(d.get('compiler_meta',{}).get('stall_count') or 6))
        if relocated is not None:
            zone=relocated; relocation={'reason':['EV_ZONE_EXITS_PARCEL'] if ratio<.985 else [],'input_collisions':collisions,'solver':relmeta}
            if collisions: relocation['reason'].append('EV_ZONE_BUILDING_COLLISION')
            ratio,collisions=zone_state(zone)
            warnings.append('EV_ZONE_RELOCATED_BY_GENERIC_PARKING_SOLVER')
        else:
            if ratio < .985: failures.append('EV_ZONE_EXITS_PARCEL')
            if collisions: failures.append('EV_ZONE_BUILDING_COLLISION')
    metrics['ev_zone_inside_parcel_ratio']=ratio
    metrics['building_collisions']=collisions
    metrics['ev_zone_relocation']=relocation
    metrics['host_surface_state']=host_surface_state
    metrics['host_parking_feature_count']=len(parking)

    # Accessible route: independent semantic primitive from EV zone toward nearest on-parcel building edge.
    access=None; access_basis=''
    if buildings:
        f,g=min(buildings,key=lambda fg:zone.distance(fg[1]))
        access=line_between(zone.boundary,g.boundary)
        access_basis=f"nearest source-derived building edge: {f.get('name') or 'existing building'}"
    elif d.get('access_route'):
        access=shape(d['access_route']); access_basis='existing proposed access route retained; no on-parcel building geometry available'
    if access is None or access.is_empty or access.length<.5:
        failures.append('ACCESS_ROUTE_DEGENERATE')
    else:
        metrics['access_length_m']=round(access.length,3)

    # Electrical/trench concept: map to actual power when available, else a DISTINCT parcel/service edge.
    powers=geoms(d,'power')
    if powers:
        trench,power_feature=choose_safe_power_trench(zone,powers,buildings)
        if trench is not None:
            trench_basis='shortest building-clear mapped power target; proposed route only, utility coordination required'
            trench_anchor_state='source-derived-power-anchor'
        else:
            trench=line_between(zone.boundary,parcel.boundary)
            trench_basis='mapped power present but no building-clear nondegenerate direct route resolved; parcel/service-edge fallback; actual utility point requires utility coordination'
            trench_anchor_state='proposed-parcel-edge-fallback'
    else:
        trench=line_between(zone.boundary,parcel.boundary)
        trench_basis='nearest parcel/service edge; proposed route only, actual utility point requires utility coordination'
        trench_anchor_state='proposed-parcel-edge-anchor'
    if trench.is_empty or trench.length<2.0:
        failures.append('TRENCH_ROUTE_DEGENERATE')
    metrics['trench_length_m']=round(trench.length,3)
    metrics['trench_length_ft']=round(trench.length*3.28084,1)

    # Semantic separation: access and trench may cross, but must not be effectively the same segment.
    if access is not None and not access.is_empty:
        hd=access.hausdorff_distance(trench); metrics['access_trench_hausdorff_m']=round(hd,3)
        sameish=hd<1.0 and abs(access.length-trench.length)<1.0
        if sameish: failures.append('ACCESS_TRENCH_SEMANTIC_COLLAPSE')

    # Trench must not run through a building interior beyond a tiny endpoint tolerance.
    trench_hits=_trench_building_hits(trench,buildings)
    metrics['trench_building_hits']=trench_hits
    if trench_hits: failures.append('TRENCH_CROSSES_BUILDING')

    # Primitive contract. These are PROPOSED planning geometries, never observed utilities/civil design.
    stall_count=int(d.get('compiler_meta',{}).get('stall_count') or 6)
    primitives={
      'ev_zone':{'state':'proposed','geometry':mapping(zone),'basis':'generic parking-surface solver relocation' if relocation else 'frozen proposed EV fit zone','input_geometry':input_zone if relocation else None,'relocation':relocation},
      'access_route':{'state':'proposed','geometry':mapping(access) if access is not None else None,'basis':access_basis,'limit':'concept path only; final ADA geometry/slopes/clearances require design verification'},
      'trench_route':{'state':'proposed','geometry':mapping(trench),'basis':trench_basis,'anchor_state':trench_anchor_state,'limit':'concept route only; not a utility locate, capacity approval, or construction route'},
      'stall_module':{'state':'proposed','count':stall_count,'typical_width_ft':9,'typical_depth_ft':18,'basis':'preliminary fit-study module; final dimensions/code compliance verify'},
      'equipment_module':{'state':'proposed','components':['EVSE dispensers','converter/power cabinets','switchgear/transformer coordination zone'],'basis':'concept equipment architecture; OEM/electrical design verify'}
    }
    out['ev_zone']=mapping(zone)
    out['access_route']=mapping(access) if access is not None else None
    out['trench_route']=mapping(trench)
    out['trench_length_ft']=metrics['trench_length_ft']
    out['trench_route_state']='proposed_concept_not_observed_utility'
    out['trench_route_basis']=trench_basis
    out['geometry_compiler']={
      'version':'KSS-GEOMETRY-COMPILER-v2',
      'source_model_sha256':sha(src),
      'primitives':primitives,
      'metrics':metrics,
      'warnings':warnings,
      'failures':failures,
      'passed':not failures
    }
    dst=OUT/f'site_{n:02d}.json'; dst.write_text(json.dumps(out,indent=2))
    print('GEOMETRY',n,'PASS' if not failures else 'FAIL','failures',failures,'access_m',metrics.get('access_length_m'),'trench_ft',metrics.get('trench_length_ft'),'sha',sha(dst))
    if failures: raise RuntimeError(f'site {n} geometry failures: {failures}')

ap=argparse.ArgumentParser(); ap.add_argument('--sites',nargs='+',type=int,required=True); args=ap.parse_args()
for n in args.sites: compile_geometry(n)