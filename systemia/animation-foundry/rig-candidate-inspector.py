"""External CC0/CC-BY Blender rig triage, not a character generator.
Run only on explicitly licensed, user-authorized assets, with Blender
--disable-autoexec, inside a disposable sandbox/CI runner.
Usage: blender --disable-autoexec -b -t 2 --python rig-candidate-inspector.py -- input.blend out/
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector
argv=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(argv)!=2:raise SystemExit('Usage: input.blend outdir')
src,out=Path(argv[0]).resolve(),Path(argv[1]).resolve()
out.mkdir(parents=True,exist_ok=True)
if not src.is_file() or src.suffix.lower()!='.blend':
    raise SystemExit('BLOCKED: input must be an existing .blend')
if bpy.app.autoexec_fail is False and not bpy.app.use_event_simulate:
    # CLI must be invoked with --disable-autoexec. No embedded scripts needed.
    pass
bpy.ops.wm.open_mainfile(filepath=str(src),load_ui=False)
meshes=[o for o in bpy.data.objects if o.type=='MESH']
rigs=[o for o in bpy.data.objects if o.type=='ARMATURE']
if not meshes or not rigs:raise SystemExit('BLOCKED: candidate missing mesh or armature')
bones={b.name.lower() for r in rigs for b in r.data.bones}
ctrl_bones=sum(1 for r in rigs for b in r.data.bones if not b.use_deform)
deform=sum(1 for r in rigs for b in r.data.bones if b.use_deform)
constraints=sum(len(pb.constraints) for r in rigs for pb in r.pose.bones)
ik=sum(1 for r in rigs for pb in r.pose.bones for c in pb.constraints if c.type=='IK')
shape_keys=[key.name for obj in meshes if obj.data.shape_keys
            for key in obj.data.shape_keys.key_blocks if key.name!='Basis']
fingers=[b for b in bones if any(w in b for w in
         ('finger','thumb','index','middle','ring','pinky','pinkie','metacarpal'))]
face=[b for b in bones if any(w in b for w in
      ('jaw','brow','lip','lid','mouth','cheek','tongue','eye'))]
mat_nodes=sum(1 for m in bpy.data.materials if m.use_nodes)
vcount=sum(len(o.data.vertices) for o in meshes)
if vcount<100:raise SystemExit('BLOCKED: no usable model geometry')
# Import-only preview. We never mutate/distribute the source .blend.
scene=bpy.context.scene
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=640;scene.render.resolution_y=480
scene.render.resolution_percentage=100
scene.display.shading.color_type='MATERIAL'
scene.display.shading.light='STUDIO'
scene.display.shading.show_cavity=True
scene.display.shading.background_type='WORLD'
scene.display.shading.background_color=(.19,.17,.26)
scene.view_settings.view_transform='Standard'
# Determine visible dimensions from evaluated mesh bounds (world transform).
corners=[]
for o in meshes:
    if o.hide_render:continue
    corners.extend(o.matrix_world @ Vector(c) for c in o.bound_box)
if not corners:raise SystemExit('BLOCKED: model geometry all hidden')
mins=Vector((min(v[i] for v in corners) for i in range(3)))
maxs=Vector((max(v[i] for v in corners) for i in range(3)))
center=(mins+maxs)*.5
extent=max(maxs[i]-mins[i] for i in range(3))
if not (0.01<extent<1e6):raise SystemExit('BLOCKED: implausible scene bounds')
# Our studio camera uses a 3/4 view and staged frontal view, not file cameras.
bpy.ops.object.camera_add(location=center+Vector((extent*.52,-extent*2.3,extent*.3)))
cam=bpy.context.object;cam.name='EVERCRAFT_RIG_BENCHMARK_CAMERA'
cam.data.type='ORTHO';cam.data.ortho_scale=extent*1.9
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
scene.camera=cam
scene.frame_set(1)
for label,offset in [('front',(0,-2.4,.18)),('three_quarter',(.9,-2.2,.18)),('side',(2.4,0,.18))]:
    cam.location=center+Vector(offset)*extent
    cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
    scene.render.image_settings.file_format='PNG'
    scene.render.filepath=str(out/('candidate_'+label+'.png'))
    bpy.ops.render.render(write_still=True)
# No approvals inferred from counts. This is technical triage.
proof={
  'schema':'evercraft.animation.external_rig_inspection.v1',
  'candidate_file':src.name,
  'mesh_count':len(meshes),'mesh_vertices':vcount,
  'armatures':len(rigs),'deform_bones':deform,'control_bones':ctrl_bones,
  'finger_named_bones':len(fingers),'face_named_bones':len(face),
  'shape_keys':len(shape_keys),'shape_key_examples':shape_keys[:20],
  'constraints':constraints,'ik_constraints':ik,'material_nodes':mat_nodes,
  'visual_approved':False,'kennedy_identity_match':False,
  'performance_approved':False,
  'note':'Rig benchmark only: neutral/third-party asset; not the intended original Kennedy character.'
}
(out/'rig_inspection.json').write_text(json.dumps(proof,indent=2))
print('EXTERNAL_RIG_INSPECTION',json.dumps(proof))
