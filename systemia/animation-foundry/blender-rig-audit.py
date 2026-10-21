"""Run inside Blender: blender -b character.blend -P blender-rig-audit.py -- out.json
A structural rig proof, not proof of artistic quality or design fidelity.
"""
import sys, json, hashlib
from pathlib import Path
try:
    import bpy
except ImportError as exc:
    raise SystemExit('Requires Blender Python runtime (bpy); no rig evidence was produced') from exc

out = Path(sys.argv[-1])
scene_file = Path(bpy.data.filepath)
if not scene_file.is_file():
    raise SystemExit('Saved .blend file required')
armatures = [obj for obj in bpy.data.objects if obj.type == 'ARMATURE']
meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
shape_keys = sum(sum(1 for key in obj.data.shape_keys.key_blocks if key.name != 'Basis')
                 for obj in meshes if obj.data.shape_keys is not None)
deform_bones = sum(sum(1 for bone in arm.data.bones if bone.use_deform) for arm in armatures)
cameras = [obj for obj in bpy.data.objects if obj.type == 'CAMERA']
proof = {
  'schema':'evercraft.animation.blender-rig-audit.v1',
  'modelSha256':hashlib.sha256(scene_file.read_bytes()).hexdigest(),
  'blenderVersion':'.'.join(map(str, bpy.app.version)),
  'armatureCount':len(armatures),
  'deformBoneCount':deform_bones,
  'meshCount':len(meshes),
  'facialShapeKeys':shape_keys,
  'cameraCount':len(cameras),
  'status':'passed' if armatures and deform_bones>=18 and meshes and shape_keys>=3 and cameras else 'held',
  'note':'Structural proof only: no evidence of artistic quality, visual match, lip sync or performance.'
}
out.parent.mkdir(parents=True,exist_ok=True)
out.write_text(json.dumps(proof,indent=2))
print(json.dumps(proof,indent=2))
if proof['status'] != 'passed':
    raise SystemExit(1)
