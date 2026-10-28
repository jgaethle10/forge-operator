"""Blender Animation Foundry | artist-ready character asset preflight.
Structural only. Requires a Blender-opened file. Never approves appearance.
Usage: blender -b character.blend -P studio-character-preflight.py -- report.json
Exit 10 means held/expected for unfinished characters.
"""
import bpy,sys,json,hashlib
from pathlib import Path
from collections import Counter
out=Path(sys.argv[-1])
objs=list(bpy.data.objects)
rigs=[o for o in objs if o.type=='ARMATURE']
meshes=[o for o in objs if o.type=='MESH']
deform=sum(sum(int(b.use_deform) for b in a.data.bones) for a in rigs)
bones={b.name.lower() for a in rigs for b in a.data.bones}
face_keys=sum(max(0,len(o.data.shape_keys.key_blocks)-1)
              for o in meshes if o.data.shape_keys)
shape_n=[k.name.lower() for o in meshes if o.data.shape_keys
         for k in o.data.shape_keys.key_blocks]
names={o.name.lower() for o in objs}
materials=[m for o in meshes for m in o.data.materials if m]
nodes=sum(int(m.use_nodes and m.node_tree is not None) for m in materials)
eyes=sum(int('eye' in n or 'iris' in n) for n in names)
hair=sum(int('hair' in n or 'bang' in n or 'curl' in n) for n in names)
clothes=sum(int(any(t in n for t in ('hoodie','shirt','pants','sleeve','dress','costume'))) for n in names)
finger_bones=sum(int(any(t in b for t in ('finger','thumb','index','middle','ring','pinky','pinkie'))) for b in bones)
facial_bones=sum(int(any(t in b for t in ('eye','lid','brow','cheek','mouth','lip','jaw','tongue'))) for b in bones)
facial_names=('smile','blink','lid','mouth','vowel','phoneme','jaw','brow','cheek','squint','open')
expression_types=sum(int(any(t in n for t in facial_names)) for n in shape_n)
lights=[o for o in objs if o.type=='LIGHT']
cameras=[o for o in objs if o.type=='CAMERA']
tests={
  'complete_deforming_skeleton':deform>=55,
  'full_hand_finger_controls':finger_bones>=10,
  'facial_performance_controls':face_keys>=15 or facial_bones>=25,
  'expression_range':expression_types>=8,
  'actual_model_mesh':sum(len(o.data.vertices) for o in meshes)>=8000,
  'character_costume_exists':clothes>=3,
  'hair_asset_exists':hair>=3,
  'eye_geometry_exists':eyes>=2,
  'skin_and_fabric_materials':nodes>=3,
  'studio_three_light_setup':len(lights)>=3,
  'framed_camera':len(cameras)>=1
}
issues=[name for name,ok in tests.items() if not ok]
result={'schema':'evercraft.animation.artist_ready_audit.v1',
        'status':'HELD' if issues else 'STRUCTURAL_CANDIDATE',
        'failures':issues,'passes':[k for k,v in tests.items() if v],
        'metrics':{'deform_bones':deform,'finger_bones':finger_bones,
          'facial_bones':facial_bones,'face_shape_keys':face_keys,
          'expression_keys':expression_types,'hair_objects':hair,
          'costume_objects':clothes,'material_nodes':nodes,
          'lights':len(lights),'cameras':len(cameras)},
        'human_visual_approval':False,
        'disclaimer':'A complete rig is not proof of resemblance, appeal, motion, quality or release.'}
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(result,indent=2))
print('ARTIST_READY_AUDIT',json.dumps(result))
if issues:raise SystemExit(10)
