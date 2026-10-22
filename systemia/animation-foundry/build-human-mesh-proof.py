"""Evercraft Animation Foundry | MPFB human-mesh feasibility gate
Usage: blender -b -t 2 --python build-human-mesh-proof.py -- /tmp/mpfb2/src /tmp/out
This is a neutral 3D base mesh, NOT a sculpt or portrait of Kennedy, not a cartoon.
Fail closed rather than substituting our old sphere/cylinder puppet.
"""
import sys, json, hashlib
from pathlib import Path

if '--' not in sys.argv or len(sys.argv[sys.argv.index('--')+1:])!=2:
    raise SystemExit('Usage: blender -b --python build-human-mesh-proof.py -- MPFB_SRC OUTPUT_DIR')
src,out=(Path(p).resolve() for p in sys.argv[sys.argv.index('--')+1:])
out.mkdir(parents=True,exist_ok=True)
if not (src/'mpfb'/'__init__.py').is_file():
    raise SystemExit('BLOCKED: MPFB source not found; no mannequin fallback')

import bpy
from mathutils import Vector
if bpy.app.version < (4,2,0):
    raise SystemExit('BLOCKED: MPFB requires Blender >=4.2')
# MPFB is a Blender extension. Import with its registered repository namespace.
# Directly importing 'mpfb' breaks bpy.utils.extension_path_user().
import importlib, addon_utils
ext_name='bl_ext.evercraft_local.mpfb'
addon_utils.enable(ext_name,default_set=False,persistent=True)
HumanService=importlib.import_module(ext_name+'.services.humanservice').HumanService

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
human=HumanService.create_human()
if human is None or human.type!='MESH' or len(human.data.vertices)<5000:
    raise RuntimeError('BLOCKED: MPFB did not produce a usable human mesh')
human.name='Neutral_Human_BaseMesh_NOT_Kennedy'
rig=HumanService.add_builtin_rig(human,'default')
if rig is None or rig.type!='ARMATURE' or len(rig.data.bones)<25:
    raise RuntimeError('BLOCKED: no verified MPFB skeletal rig')
for p in human.data.polygons:p.use_smooth=True

# Neutral preview stage. No fabricated skin/eyes/hair likeness or child portrait.
scene=bpy.context.scene
scene.name='MPFB_CC0_HUMAN_BASELINE_NEUTRAL_MESH'
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=640;scene.render.resolution_y=360
scene.render.resolution_percentage=100
scene.display.shading.color_type='MATERIAL'
scene.display.shading.light='STUDIO'
scene.display.shading.background_type='WORLD'
scene.display.shading.background_color=(.18,.16,.23)
scene.view_settings.view_transform='Standard'
scene['identity']='neutral_reference_basemesh'
scene['human_approval']='NOT_GRANTED'
scene['kennedy_look']='NOT_MODELED'
# Position camera relative to actual bounding box of MPFB's natural scale.
corners=[human.matrix_world @ Vector(corner) for corner in human.bound_box]
minimum=[min(v[i] for v in corners) for i in range(3)]
maximum=[max(v[i] for v in corners) for i in range(3)]
height=maximum[2]-minimum[2]
center=Vector(((minimum[0]+maximum[0])*.5,(minimum[1]+maximum[1])*.5,
               (minimum[2]+maximum[2])*.5))
bpy.ops.object.camera_add(location=center+Vector((0,-max(2.4,height*2.5),height*.2)))
cam=bpy.context.object;cam.name='NeutralMeshStudioCamera';cam.data.lens=42
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam
scene.frame_set(1)
out_blend=out/'Neutral_MPFB_BaseMesh_Real3D.blend'
bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(out/'Neutral_Mesh_Studio_Proof.png')
bpy.ops.render.render(write_still=True)
proof={
 'schema':'evercraft.animation.human-basemesh-proof.v1',
 'status':'passed',
 'blender_version':'.'.join(map(str,bpy.app.version)),
 'mesh_vertices':len(human.data.vertices),
 'mesh_faces':len(human.data.polygons),
 'rig_bones':len(rig.data.bones),
 'height_units':round(height,3),
 'mpfb_license_source':'GPLv3',
 'mpfb_generated_assets_license':'CC0 per MPFB license',
 'visual_approval':False,
 'kennedy_character_match':False,
 'face_animation_verified':False,
 'note':'Neutral MakeHuman community basemesh, not final likeness/hair/skin/outfit/animation.'
}
(out/'human_mesh_proof.json').write_text(json.dumps(proof,indent=2))
print('MPFB_NEUTRAL_HUMAN_PROOF',json.dumps(proof))
