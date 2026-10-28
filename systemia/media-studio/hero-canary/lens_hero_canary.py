#!/usr/bin/env python3
"""
Evercraft || Fallen Studios
Hero canary: precision camera lens, originally modeled procedurally in Blender.
No third-party model/texture assets. Not customer documentary evidence.
Blender 4.x Cycles, two-second 9:16 preview at 24 fps.

blender -b -t 6 --python lens_hero_canary.py -- --output /workspace/lens-canary --save-only --gpu
blender -b /workspace/lens-canary.blend -a
"""
import bpy
import sys
import math
from mathutils import Vector
from pathlib import Path

def cli(flag, default):
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return argv[argv.index(flag) + 1] if flag in argv and len(argv) > argv.index(flag) + 1 else default

out = Path(cli("--output", "/tmp/fallen-lens-canary")).resolve()
save_only = "--save-only" in sys.argv
preview_still = "--preview-still" in sys.argv
out.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.samples = 48
scene.cycles.use_denoising = not preview_still  # packaged Blender lacks OpenImageDenoiser
if preview_still:
    scene.cycles.samples = 12
scene.render.resolution_x = 540
scene.render.resolution_y = 960
scene.render.resolution_percentage = 50 if preview_still else 100
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(out) + "_"
scene.frame_start, scene.frame_end = 1, 48
scene.render.fps = 24
scene.view_settings.view_transform = "AgX"
scene.world.color = (0.015, 0.015, 0.016)

# Render on CPU if GPU devices have not been explicitly provisioned.
# The remote rendering operator may opt into Cycles GPU only after an observed device preflight.
scene.cycles.device = "CPU"
if "--gpu" in sys.argv:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    activated = False
    for backend in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            gpu_devices = [d for d in prefs.devices if d.type in ("OPTIX", "CUDA")]
            if not gpu_devices:
                continue
            for device in prefs.devices:
                device.use = device in gpu_devices
            activated = True
            scene.cycles.device = "GPU"
            break
        except Exception:
            continue
    if not activated:
        raise RuntimeError("no_compatible_cycles_gpu; refusing silent CPU fallback")

def mat(name, base, metallic=0, roughness=0.4, transmission=0):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*base,1)
    m.use_nodes=True
    bs=m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value=(*base,1)
    bs.inputs["Metallic"].default_value=metallic
    bs.inputs["Roughness"].default_value=roughness
    bs.inputs["Transmission Weight"].default_value=transmission
    return m

black=mat("anodized charcoal aluminum",(0.032,0.038,0.046),0.8,0.27)
ribmat=mat("anodized satin grip",(0.045,0.05,0.056),0.77,0.44)
steel=mat("brushed silver chromium",(0.32,0.35,0.39),0.92,0.23)
warm=mat("subtle warm champagne metal",(0.28,0.19,0.105),0.82,0.29)
glass=mat("coated optical glass blue-black",(0.005,0.017,0.036),0.12,0.095,0.15)
innerglass=mat("deep internal optical element",(0.005,0.008,0.012),0.08,0.065,0.20)
floor=mat("matte graphite studio plinth",(0.045,0.046,0.047),0.09,0.68)

def bevel(obj, amount=.015, segments=3):
    mod=obj.modifiers.new("machined edge radius","BEVEL")
    mod.width=amount
    mod.segments=segments
    obj.modifiers.new("weighted corner normals","WEIGHTED_NORMAL")

def cyl(name,r,depth,z,material,bevelsize=.012,verts=128):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=r,depth=depth,location=(0,0,z))
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(material)
    if bevelsize:bevel(obj,bevelsize)
    return obj

# Grounded engineered object; same silhouette/axis across 48 frames.
cyl("machined base shell",0.67,0.25,0.16,black)
cyl("barrel main body",0.59,1.25,0.76,black)
cyl("lower grip collar",0.695,0.22,0.47,ribmat)
cyl("focus ring foundation",0.695,0.4,1.03,ribmat)
cyl("upper shoulder black steel",0.67,0.19,1.37,black)
cyl("front lens raised bezel",0.685,0.15,1.55,steel)
cyl("front optical cover",0.565,0.018,1.642,glass,0.003)
cyl("second concentric optical element",0.44,0.012,1.657,innerglass,0.002)
cyl("coated central lens",0.34,0.009,1.667,glass,0.002)
cyl("fine optical center",0.09,0.009,1.674,innerglass,0.002)

def ring(name, radius, thickness, z, material):
    bpy.ops.mesh.primitive_torus_add(major_segments=144,minor_segments=12,
        location=(0,0,z),major_radius=radius,minor_radius=thickness)
    obj=bpy.context.object
    obj.name=name
    obj.data.materials.append(material)
    return obj

for name,r,th,z,material in [
    ("base retaining ring",0.63,0.025,0.24,steel),
    ("lower trim",0.695,0.015,0.58,warm),
    ("focus ring edge A",0.69,0.013,0.825,steel),
    ("focus ring edge B",0.69,0.013,1.232,steel),
    ("upper champagne hairline",0.65,0.012,1.468,warm),
    ("front circular rim",0.647,0.035,1.643,steel),
    ("front black mask",0.558,0.025,1.654,black),
    ("inner internal seal",0.433,0.015,1.664,warm),
]:
    ring(name,r,th,z,material)

# Individual machined vertical knurls produce real contact shadows.
for i in range(96):
    ang=2*math.pi*i/96
    bpy.ops.mesh.primitive_cube_add(size=1,location=(.695*math.cos(ang),.695*math.sin(ang),1.03))
    o=bpy.context.object
    o.name=f"focus grip knurl {i:03d}"
    o.dimensions=(.018,.035,.36)
    o.rotation_euler.z=ang
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(steel if i%24==0 else black)
    bevel(o,.006,2)

# Screw recess details around front rim; visually tiny and physically grounded.
for i in range(8):
    ang=2*math.pi*(i+.5)/8
    bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.021,depth=.007,
      location=(.619*math.cos(ang),.619*math.sin(ang),1.644))
    o=bpy.context.object
    o.name=f"front fastening {i:02d}"
    o.data.materials.append(black)

# Studio pedestal and environment, no neon lights, random HUDs, or floating geometry.
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,0,-.13))
stage=bpy.context.object
stage.name="solid graphite table"
stage.dimensions=(200,200,.25)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
stage.data.materials.append(floor)

def area(name,location,power,color,size,size_y=None):
    data=bpy.data.lights.new(name,'AREA')
    data.energy=power
    data.color=color
    data.shape="RECTANGLE"
    data.size=size
    data.size_y=size_y or size
    obj=bpy.data.objects.new(name,data)
    bpy.context.collection.objects.link(obj)
    obj.location=location
    rotation=(Vector((0,0,0.9))-obj.location).to_track_quat('-Z','Y')
    obj.rotation_euler=rotation.to_euler()

area("large creamy softbox upper left",(-3,-2,5),700,(1,.93,.84),3.5,4.5)
area("long clean rim strip",(2.7,1.2,4.0),470,(0.81,0.88,1.0),1.3,4.4)
area("subtle front detail fill",(1,-4,2.1),110,(1,1,1),2.7,2)
area("glass reflection overhead",(0.4,0.9,4.8),230,(1,1,1),1.7,1.0)

focus=bpy.data.objects.new("focus target",None)
bpy.context.collection.objects.link(focus)
focus.location=(0,0,1.2)
cam_data=bpy.data.cameras.new("hero cinema camera")
cam=bpy.data.objects.new("hero cinema camera",cam_data)
bpy.context.collection.objects.link(cam)
scene.camera=cam
cam.data.type="PERSP"
cam.data.lens=85
cam.data.dof.use_dof=True
cam.data.dof.focus_object=focus
cam.data.dof.aperture_fstop=5.6
cam.data.lens=65
for frame,location in [(1,(2.4,-3.9,2.5)),(48,(1.48,-3.1,2.9))]:
    cam.location=location
    cam.rotation_euler=(Vector((0,0,1.05))-cam.location).to_track_quat('-Z','Y').to_euler()
    cam.keyframe_insert(data_path="location",frame=frame)
    cam.keyframe_insert(data_path="rotation_euler",frame=frame)
# Portable editability proof; no GPU charges and no proprietary source imagery.
bpy.ops.wm.save_as_mainfile(filepath=str(out)+".blend")
if preview_still:
    scene.frame_set(24)
    scene.render.filepath = str(out) + "_still.png"
    bpy.ops.render.render(write_still=True)
elif not save_only:
    bpy.ops.render.render(animation=True)
print("EVERCRAFT_HERO_CANARY_SCENE_SAVED",str(out)+".blend")
