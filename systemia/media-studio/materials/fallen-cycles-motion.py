# Fallen Studio | Cycles genuine volumetric optic motion benchmark
# 60 continuous frames; synthetic printed contract; no customer files.
# Path-traced refraction with biconvex thickness, studio reflection and moving camera.
import bpy, math, os, json, time, hashlib
from mathutils import Vector

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene
sc.render.engine="CYCLES"
sc.cycles.device="CPU"
sc.cycles.samples=10
sc.cycles.use_denoising=False
sc.cycles.max_bounces=7
sc.cycles.transmission_bounces=6
sc.render.resolution_x=320
sc.render.resolution_y=568
sc.render.resolution_percentage=100
sc.render.image_settings.file_format="PNG"
sc.view_settings.view_transform="Filmic"
sc.render.film_transparent=False

def material(name,color,rough=.4,metal=0,trans=0,ior=1.48):
    mat=bpy.data.materials.new(name)
    mat.use_nodes=True
    p=mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value=(*color,1)
    p.inputs["Roughness"].default_value=rough
    p.inputs["Metallic"].default_value=metal
    inp=p.inputs.get("Transmission Weight") or p.inputs.get("Transmission")
    if inp:inp.default_value=trans
    if p.inputs.get("IOR"):p.inputs["IOR"].default_value=ior
    return mat

ink=material("printed graphite",(.05,.06,.075),.8)
amber=material("printed amber",(.66,.28,.10),.5)
paper=material("neutral ivory uncoated paper",(.78,.78,.73),.9)
table=material("charcoal studio table",(.012,.017,.025),.44)
glass=material("biconvex physically refractive optical glass",(.90,.96,1),.025,0,1,1.49)
darkedge=material("optical black anodized lettering",(.02,.03,.05),.33)

def block(name,scale,loc,mat,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=bpy.context.object;ob.name=name;ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    if bevel:
        m=ob.modifiers.new("soft physical edge","BEVEL");m.width=bevel;m.segments=5
        m2=ob.modifiers.new("weighted normals","WEIGHTED_NORMAL")
    return ob

block("matte black office surface",(12,12,.15),(0,0,-.29),table,.02)
block("contract sheet",(3.45,5.5,.05),(0,0,-.10),paper,.025)

def label(body,x,y,size,mat):
    curve=bpy.data.curves.new("print","FONT");curve.body=body;curve.size=size
    obj=bpy.data.objects.new(body,curve);bpy.context.collection.objects.link(obj)
    obj.location=(x,y,-.068);obj.data.materials.append(mat);return obj

label("PROJECT COORDINATION",-1.45,2.20,.15,ink)
label("NOVEMBER 02",-1.45,1.66,.30,ink)
label("WORK START DATE",-1.40,1.13,.145,amber)
label("PERMIT SUBMISSION",-1.40,.77,.145,ink)
for i in range(12):
    label("..................................................................",-1.40,.32-i*.245,.08,ink)

# Double spherical cap (closed solid glass) whose center thickness exceeds edge.
# Independent Z surfaces give genuine refractive normals rather than opacity.
radius=1.18
rings=17
sectors=88
vertices=[]
faces=[]
for surface in (0,1):
    for j in range(rings+1):
        r=max(.006,radius*j/rings)
        sag=.26*(1-math.sqrt(max(0,1-(r/(radius*1.08))**2)))
        z=(.18-sag) if surface==0 else (-.18+sag)
        for k in range(sectors):
            angle=2*math.pi*k/sectors
            vertices.append((r*math.cos(angle),r*math.sin(angle),z))
step=(rings+1)*sectors
for j in range(rings):
    for k in range(sectors):
        a=j*sectors+k;b=j*sectors+(k+1)%sectors
        c=(j+1)*sectors+(k+1)%sectors;d=(j+1)*sectors+k
        faces.append((d,c,b,a))
        faces.append((step+a,step+b,step+c,step+d))
for k in range(sectors):
    nxt=(k+1)%sectors
    faces.append((rings*sectors+k,rings*sectors+nxt,step+rings*sectors+nxt,step+rings*sectors+k))
mesh=bpy.data.meshes.new("solid biconvex optics mesh")
mesh.from_pydata(vertices,[],faces);mesh.update()
optic=bpy.data.objects.new("single physical refractive lens",mesh)
bpy.context.collection.objects.link(optic);optic.data.materials.append(glass)
optic.location=(.02,.76,.60)
for p in mesh.polygons:p.use_smooth=True
# Correct irregular polygons and orientation.
bpy.context.view_layer.objects.active=optic
optic.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
if hasattr(bpy.ops.mesh,'normals_make_consistent'): bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")
optic.select_set(False)

world=bpy.data.worlds.new("low-key studio world");world.use_nodes=True
world.node_tree.nodes["Background"].inputs["Color"].default_value=(.07,.09,.13,1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value=.28
sc.world=world

def light(name,loc,power,color,sizex,sizey):
    bpy.ops.object.light_add(type="AREA",location=loc)
    o=bpy.context.object;o.name=name;o.data.energy=power
    o.data.shape="RECTANGLE";o.data.size=sizex;o.data.size_y=sizey;o.data.color=color
    o.rotation_euler=(Vector((0,.5,.1))-o.location).to_track_quat("-Z","Y").to_euler()

light("cool overhead softbox",(-2.4,1.4,3.8),370,(.71,.83,1),2.4,1.3)
light("warm raking edge",(2.4,.2,3.0),360,(1,.79,.59),1.0,3.0)
light("rear soft reflection",(.2,3.6,4.4),180,(1,1,1),3.0,1.0)

bpy.ops.object.camera_add(location=(1.55,-3.2,5.6))
cam=bpy.context.object;sc.camera=cam
cam.data.type="PERSP";cam.data.lens=48
cam.data.clip_end=100
target=Vector((0,.58,-.08))
cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()

out="/tmp/fallen-cycles-motion"
os.makedirs(out,exist_ok=True)
framecount=60
start=time.time()
results=[]
for i in range(framecount):
    t=i/(framecount-1)
    ease=t*t*(3-2*t)
    # A single evolving shot with continuous camera trajectory and real depth.
    cam.location=(1.55-1.10*ease,-3.2+1.08*ease,5.6-1.64*ease)
    cam.rotation_euler=(target-cam.location).to_track_quat("-Z","Y").to_euler()
    optic.location.x=.02+.11*math.sin(math.pi*t)
    optic.location.z=.60+.13*math.sin(math.pi*t)
    optic.rotation_euler=(math.radians(6*math.sin(math.pi*t)),
                         math.radians(-7+15*ease),
                         math.radians(5*math.sin(2*math.pi*t)))
    sc.render.filepath=f"{out}/frame_{i:03d}.png"
    bpy.ops.render.render(write_still=True)
    data=open(sc.render.filepath,"rb").read()
    results.append({"frame":i,"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)})
# control shares identical camera, illumination and geometry position except optic hidden.
optic.hide_render=True
sc.render.filepath=f"{out}/control_without_glass.png"
bpy.ops.render.render(write_still=True)
control=open(sc.render.filepath,"rb").read()
receipt={
 "schema":"evercraft.fallen.cycles-continuous-optics.v1",
 "renderer":"Blender Cycles CPU", "source":"synthetic document only",
 "fps":20,"frames":framecount,"width":320,"height":568,
 "pathtraced_transmission":True,"optical_geometry":"closed biconvex lens",
 "glass_ior":1.49,"sampling":10,
 "control_same_final_camera_no_glass_sha256":hashlib.sha256(control).hexdigest(),
 "frame_receipts":results,
 "elapsed_seconds":round(time.time()-start,2),
 "cinematic_release_approved":False,"replaces_rc11":False,
}
open(f"{out}/receipt.json","w").write(json.dumps(receipt,indent=2)+"\n")
print("FALLEN_OPTICAL_MOTION",json.dumps({k:v for k,v in receipt.items() if k!="frame_receipts"}))
