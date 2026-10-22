"""Fail-closed software audition of canonical Evercraft World Engine visual frames.

Input is the exact public `evercraft.world-engine.visual-frame.v1` schema and
`evercraft.world-engine.geometry.v1` geometry shapes. NOT a GPU renderer or full
replacement for World Engine's own verify/compile routines.
"""
import hashlib
import json
import math
import numpy as np


def _js_number(value):
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError('non_finite_value')
        if value.is_integer():
            return int(value)
    return value


def canonical(value):
    if isinstance(value, dict):
        return {key:canonical(v) for key,v in sorted(value.items())}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    return _js_number(value)


def sha(value):
    return hashlib.sha256(json.dumps(canonical(value), separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def fail_if(condition, label):
    if condition:raise ValueError(label)


def finite_numbers(values, label):
    fail_if(any(not isinstance(x,(float,int)) or isinstance(x,bool) or not math.isfinite(x) for x in values),label)


def validate_geometry(geom):
    fail_if(geom.get('schema') != 'evercraft.world-engine.geometry.v1','geometry_schema')
    fail_if(not isinstance(geom.get('id'),str) or not geom['id'],'geometry_id')
    fail_if(geom.get('primitive') != 'triangles','geometry_primitive')
    vertices=geom.get('positions',[])
    normals=geom.get('normals',[])
    fail_if(len(vertices)<9 or len(vertices)%3 or len(normals)!=len(vertices),'geometry_vertices_normals')
    finite_numbers(vertices+normals,'geometry_nonfinite')
    idx=geom.get('indices') or list(range(len(vertices)//3))
    fail_if(len(idx)%3 or len(idx)<3,'geometry_triangles')
    fail_if(any(type(i)!=int or i<0 or i>=len(vertices)//3 for i in idx),'geometry_indices')
    return True


def validate_frame(frame, geometries):
    fail_if(frame.get('schema')!='evercraft.world-engine.visual-frame.v1','frame_schema')
    digest=frame.get('digest')
    core={k:v for k,v in frame.items() if k!='digest'}
    fail_if(not isinstance(digest,str) or sha(core)!=digest,'frame_digest_mismatch')
    fail_if(not isinstance(frame.get('worldId'),str) or not frame['worldId'],'frame_world')
    fail_if(type(frame.get('tick'))!=int or frame['tick']<0,'frame_tick')
    fail_if(not isinstance(frame.get('timeSec'),(int,float)) or frame['timeSec']<0,'frame_time')
    cam=frame.get('camera',{})
    fail_if(not isinstance(cam,dict) or cam.get('projection',{}).get('type')!='perspective','camera_perspective_only')
    fail_if(not 1<cam['projection'].get('fovYDeg',0)<179,'camera_fov')
    fail_if(not 0<cam.get('near',0)<cam.get('far',0),'camera_clips')
    fail_if(not isinstance(cam.get('transform'),dict),'camera_transform')
    materials={m['id']:m for m in frame.get('materials',[])}
    fail_if(len(materials)!=len(frame.get('materials',[])),'material_duplicate')
    for m in materials.values():
        fail_if(m.get('model') not in ('pbr','unlit'),'material_model')
        c=m.get('baseColor',{})
        fail_if(any(not 0<=c.get(k,-1)<=1 for k in ('r','g','b','a')),'material_color')
        fail_if(m.get('textureRefs'),'textures_unimplemented')
        fail_if(m.get('alphaMode','opaque')!='opaque','alpha_unimplemented')
    geometries={g['id']:g for g in geometries}
    fail_if(len(geometries)==0,'geometry_missing')
    for g in geometries.values():validate_geometry(g)
    for r in frame.get('renderables',[]):
        comp=r.get('component',{})
        fail_if(comp.get('geometryRef') not in geometries,'renderable_geometry_missing')
        fail_if(comp.get('materialId') not in materials,'renderable_material_missing')
        fail_if(not isinstance(r.get('transform'),dict),'renderable_transform')
    fail_if(len(frame.get('lights',[]))>8,'light_limit')
    return True


def deg_rot(vec):
    x,y,z=np.deg2rad([vec.get(k,0) for k in ('x','y','z')]);
    cx,sx=math.cos(x),math.sin(x)
    cy,sy=math.cos(y),math.sin(y)
    cz,sz=math.cos(z),math.sin(z)
    rx=np.array([[1,0,0],[0,cx,-sx],[0,sx,cx]])
    ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]])
    rz=np.array([[cz,-sz,0],[sz,cz,0],[0,0,1]])
    return rz@ry@rx


def coordinates(transform, arr):
    p=transform['position'];scale=transform.get('scale',{'x':1,'y':1,'z':1})
    s=np.array([scale[k] for k in ('x','y','z')],dtype=np.float64)
    r=deg_rot(transform.get('rotationDeg',{}))
    return (arr*s)@r.T+np.array([p[k] for k in ('x','y','z')])


def camera_project(verts,cam,w,h):
    position=np.array([cam['transform']['position'][k] for k in ('x','y','z')])
    rotation=deg_rot(cam['transform'].get('rotationDeg',{}))
    v=(verts-position)@rotation
    depth=-v[:,2]
    f=(h/2)/math.tan(math.radians(cam['projection']['fovYDeg']/2))
    safe=np.maximum(depth,1e-7)
    x=w/2+f*v[:,0]/safe
    y=h/2-f*v[:,1]/safe
    return np.stack([x,y],axis=1),depth


def torus(id,major,minor,steps=28,tube=5):
    positions=[];normals=[];indices=[]
    for i in range(steps):
        a=2*math.pi*i/steps
        ca,sa=math.cos(a),math.sin(a)
        for j in range(tube):
            b=2*math.pi*j/tube
            cb,sb=math.cos(b),math.sin(b)
            positions += [(major+minor*cb)*ca,(major+minor*cb)*sa,minor*sb]
            normals += [ca*cb,sa*cb,sb]
    for i in range(steps):
        for j in range(tube):
            a=i*tube+j;b=((i+1)%steps)*tube+j
            c=((i+1)%steps)*tube+(j+1)%tube;d=i*tube+(j+1)%tube
            indices += [a,b,c,a,c,d]
    return dict(schema='evercraft.world-engine.geometry.v1',id=id,primitive='triangles',positions=positions,normals=normals,indices=indices)


def box_geometry(id):
    pts=np.array([[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]],float)
    idx=[0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,2,6,7,2,7,3,0,3,7,0,7,4,1,5,6,1,6,2]
    return dict(schema='evercraft.world-engine.geometry.v1',id=id,primitive='triangles',positions=pts.reshape(-1).tolist(),normals=[0,0,1]*8,indices=idx)
