# Fallen Studio · controlled physically based glass material acceptance canary
# Uses Blender Cycles, real geometry, IOR / transmission, softbox reflections.
# Illustrative synthetic contract: no private screenshots, no buyer data.
import bpy, math, os, json, hashlib, time
from mathutils import Vector
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.render.engine='CYCLES'
scene.cycles.samples=52
scene.cycles.use_denoising=False
scene.render.resolution_x=480
scene.render.resolution_y=854
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.render.film_transparent=False
scene.render.engine='CYCLES'
scene.view_settings.view_transform='Filmic'

def mat(name,color,metallic=0.0,roughness=.4,transmission=0.0,ior=1.45):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*color,1)
    m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Metallic'].default_value=metallic
    p.inputs['Roughness'].default_value=roughness
    inp=p.inputs.get('Transmission Weight') or p.inputs.get('Transmission')
    if inp: inp.default_value=transmission
    if p.inputs.get('IOR'): p.inputs['IOR'].default_value=ior
    return m

graphite=mat('matte graphite studio surface',(.023,.028,.037),.07,.58)
paper=mat('warm uncoated contract paper',(.88,.85,.80),0,.92)
black=mat('print ink charcoal',(.05,.075,.10),0,.73)
amber=mat('printed amber marker',(.70,.31,.12),0,.6)
glass=mat('physically transmissive bevelled optical glass',(.91,.955,1.0),.0,.055,1.0,1.49)

def cube(name,scale,loc,material,bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob=bpy.context.object;ob.name=name
    ob.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(material)
    if bevel:
      mod=ob.modifiers.new('physically rounded glass edges','BEVEL')
      mod.width=bevel;mod.segments=9
      if hasattr(mod,'affect'): mod.affect='EDGES'
      for poly in ob.data.polygons: poly.use_smooth=True
    return ob

cube('deep studio backdrop',(9,11,.16),(0,0,-.28),graphite,.08)
cube('printed meeting sheet',(3.55,5.45,.047),(0,0,-.12),paper,.025)

def text_obj(value,x,y,size,material):
    curve=bpy.data.curves.new('engraved document glyphs','FONT')
    curve.body=value;curve.size=size;curve.extrude=.0002
    ob=bpy.data.objects.new(value,curve);bpy.context.collection.objects.link(ob)
    ob.location=(x,y,-.085)
    ob.data.materials.append(material)
    return ob

text_obj('PROJECT COORDINATION',-1.46,2.06,.155,black)
text_obj('NOVEMBER 02',-1.46,1.66,.29,black)
text_obj('CONSTRUCTION START',-1.45,1.15,.13,amber)
text_obj('PERMIT SUBMISSION',-1.45,.90,.13,black)
for j in range(11):
    text_obj('...........................................................',-1.42,.44-j*.26,.085,black)

# This is a CLOSED 3D volume, not a transparent flat plane.
optic=cube('solid bevelled refractive glass specimen',(3.04,3.5,.24),(.08,-.12,.47),glass,.135)
optic.rotation_euler[0]=math.radians(10)
optic.rotation_euler[1]=math.radians(-5)
optic.rotation_euler[2]=math.radians(5)

world=bpy.data.worlds.new('dark studio ambient')
scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.17,.19,.25,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.14

def softbox(name,location,power,color,size,scale_y):
    bpy.ops.object.light_add(type='AREA',location=location)
    lamp=bpy.context.object;lamp.name=name
    lamp.data.energy=power;lamp.data.shape='RECTANGLE'
    lamp.data.size=size;lamp.data.size_y=scale_y
    lamp.data.color=color
    direction=Vector((0,0,.02))-lamp.location
    lamp.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()

softbox('large cool softbox',(-3.8,1.6,5),520,(.66,.80,1),1.2,3.3)
softbox('large warm opposing softbox',(3.9,-.3,4.6),560,(1,.76,.54),1.1,4.0)
softbox('broad white reflection',(0.1,4.6,3.2),130,(1,1,1),4.1,1.3)

bpy.ops.object.camera_add(location=(1.6,-3.0,5.9))
camera=bpy.context.object;scene.camera=camera
camera.data.type='PERSP';camera.data.lens=48
target=Vector((0,0,.05))
camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
camera.data.lens=42

outdir='/tmp/fallen-glass-cycles'
os.makedirs(outdir,exist_ok=True)
start=time.time()
for i in range(3):
    # Independent camera movement demonstrates correct refraction/parallax.
    u=i/2
    camera.location.x=(1.0+1.1*u)
    camera.location.y=-3.0+.45*math.sin(u*math.pi)
    camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler()
    optic.rotation_euler[1]=math.radians(-7+14*u)
    scene.render.filepath=f'{outdir}/glass_{i:02d}.png'
    bpy.ops.render.render(write_still=True)
receipt={'schema':'evercraft.fallen.cycles-glass-material.v1',
 'renderer':f'Blender {bpy.app.version_string} Cycles CPU',
 'frames':[], 'camera_positions':3,
 'glass':{'geometric_thickness_m':.24,'ior':1.49,'roughness':.055,
          'transmission':1.0,'bevel_width_m':.135},
 'fixture':'synthetic printed sheet; not Relay private data',
 'material_review':'oblique perspective / differential softboxes / actual geometric thickness',
 'rights':'original procedural test scene',
 'full_film_approval':False,'commercial_ready':False,
 'elapsed_seconds':round(time.time()-start,1)}
for i in range(3):
    f=f'{outdir}/glass_{i:02d}.png'
    data=open(f,'rb').read()
    receipt['frames'].append({'path':os.path.basename(f),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
open(f'{outdir}/receipt.json','w').write(json.dumps(receipt,indent=2)+'\n')
print('FALLEN_MATERIAL_RECEIPT',json.dumps(receipt))
