"""Create a reference-locked, EMPTY stylized-3D scene, not a fake character render.
Blender: blender -b --python blender-scene-bootstrap.py -- ref.png shot.blend
"""
import sys
from pathlib import Path
try:
    import bpy
    from mathutils import Vector
except ImportError as exc:
    raise SystemExit('Blender bpy runtime required; no project created') from exc

if '--' not in sys.argv or len(sys.argv[sys.argv.index('--') + 1:]) != 2:
    raise SystemExit('Usage: blender -b --python blender-scene-bootstrap.py -- REFERENCE.png OUTPUT.blend')
ref_path, out_path = map(Path, sys.argv[sys.argv.index('--') + 1:])
if not ref_path.is_file() or out_path.suffix.lower() != '.blend':
    raise SystemExit('Input must be an existing image and output must end .blend')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.name='Kennedy | One Snap Away | LOCKED VISUAL REFERENCE'
scene.render.engine='BLENDER_EEVEE_NEXT'
scene.render.resolution_x=1920
scene.render.resolution_y=1080
scene.render.resolution_percentage=100
scene.render.fps=24
scene.frame_start=1
scene.frame_end=120
scene.view_settings.view_transform='AgX'
scene['visual_style_lock']='cinematic_stylized_3d'
scene['asset_stage']='SCENE_TEMPLATE_ONLY_NO_CHARACTER_MESH'

collections={}
for name in ['REFERENCE_DO_NOT_RENDER','CHARACTER_MODEL_REQUIRED','CHARACTER_RIG_REQUIRED',
             'FACIAL_SHAPES_REQUIRED','HAIR_GROOM_REQUIRED','BEDROOM_STAGE','MAGIC_VFX',
             'STUDIO_LIGHTS','SHOT_CAMERAS']:
    group=bpy.data.collections.new(name)
    scene.collection.children.link(group)
    collections[name]=group

def move(obj, col):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collections[col].objects.link(obj)

bpy.ops.object.empty_add(type='IMAGE',location=(-3,0,1.85))
ref=bpy.context.object
ref.name='CANONICAL_REFERENCE_not_a_character_mesh'
ref.empty_display_size=2.3
ref.data=bpy.data.images.load(str(ref_path.resolve()))
ref.data.pack()
ref.empty_image_depth='FRONT'
ref.hide_render=True
move(ref,'REFERENCE_DO_NOT_RENDER')

bpy.ops.mesh.primitive_plane_add(size=2,location=(0,0,0))
floor=bpy.context.object
floor.name='StageFloor_BLOCKOUT'
floor.scale=(5,5,1)
move(floor,'BEDROOM_STAGE')
mat=bpy.data.materials.new('Lavender_Blockout')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value=(0.31,0.20,0.42,1)
    bsdf.inputs['Roughness'].default_value=0.8
floor.data.materials.append(mat)

def aim(obj, point):
    obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()

bpy.ops.object.camera_add(location=(0,-8.4,3.15))
cam=bpy.context.object
cam.name='SHOT_01_40mm'
cam.data.lens=40
scene.camera=cam
aim(cam,(0,0,1.4))
move(cam,'SHOT_CAMERAS')

for name,pos,rgb,power,size in [
    ('Key_Lavender',(-3,-2.8,5.5),(0.78,0.63,1.0),900,4.0),
    ('Fill_Gold',(2.4,-2.3,3.6),(1.0,0.75,0.52),500,3.0),
    ('Rim_Violet',(1.5,2.2,4.2),(0.57,0.28,1.0),1200,2.2)]:
    bpy.ops.object.light_add(type='AREA',location=pos)
    light=bpy.context.object
    light.name=name
    light.data.energy=power
    light.data.shape='DISK'
    light.data.size=size
    light.data.color=rgb
    aim(light,(0,0,1.3))
    move(light,'STUDIO_LIGHTS')

scene.world.color=(0.09,0.07,0.14)
out_path.parent.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(out_path.resolve()))
print('SCENE_TEMPLATE_CREATED; NO CHARACTER MODEL; RELEASE HELD:',out_path)
