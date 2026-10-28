"""Kennedy Animation Foundry | genuine Blender rig BLOCKOUT.
Run with blender -b -t 2 --python build-kennedy-rig-blockout.py -- OUTPUT_DIRECTORY
Deliberately a production pipeline test; NOT approved model or visual fidelity.
"""
import bpy, math, json, sys, os
from pathlib import Path
from mathutils import Vector

args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)!=1: raise SystemExit("Usage: blender -b --python build-kennedy-rig-blockout.py -- OUT_DIR")
out=Path(args[0]).resolve(); out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene
scene.name="KENNEDY | ARMATURE BLOCKOUT | NO ART APPROVAL"
scene.render.engine='BLENDER_WORKBENCH'
scene.render.resolution_x=640;scene.render.resolution_y=360
scene.render.resolution_percentage=100
scene.render.fps=12;scene.frame_start=1;scene.frame_end=48
scene.display.shading.light='STUDIO'
scene.display.shading.color_type='MATERIAL'
scene.display.shading.show_cavity=True
scene.display.shading.cavity_type='BOTH'
scene.display.shading.background_type='WORLD'
scene.display.shading.background_color=(0.15,0.11,0.22)
scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG'
scene.render.filepath=str(out/'frames'/'frame_')
(out/'frames').mkdir(exist_ok=True)
scene['production_id']='kennedy-one-snap-away'
scene['stage']='RIGGED_3D_BLOCKOUT_NOT_VISUAL_MATCH'
scene['visual_approval']='NOT_REQUESTED_NOT_GRANTED'
scene['target_visual_style']='cinematic_stylized_3d'
scene['character_traits']='blonde tousled hair; fair skin; blue eyes; soft cheek and nose freckles'

def material(name,color):
    m=bpy.data.materials.new(name)
    m.diffuse_color=tuple(color)+(1,)
    return m
skin=material('Skin__very_fair',(0.96,.76,.68))
purple=material('Hoodie__violet',(.40,.18,.67))
violet=material('Lavender',(.62,.38,.88))
blonde=material('Hair__blonde',(.93,.69,.22))
lightblonde=material('Hair__highlight',(1.,.81,.4))
white=material('Eyes_white',(.94,.95,1))
blue=material('Eyes_blue',(.13,.4,.89))
pupil=material('Eye_pupils',(.06,.045,.10))
rose=material('Cheeks__rose',(.82,.35,.42))
dark=material('Face_lines',(.19,.08,.19))

bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0))
arm=bpy.context.object; arm.name='Kennedy_CTRL_Rig'
arm.show_in_front=True
for b in list(arm.data.edit_bones):arm.data.edit_bones.remove(b)
B=[
 ('root',None,(0,0,.15),(0,0,.95)),
 ('spine','root',(0,0,.95),(0,0,1.66)),
 ('neck','spine',(0,0,1.66),(0,0,1.91)),
 ('head','neck',(0,0,1.91),(0,0,2.62)),
 ('upper_arm_L','spine',(-.40,0,1.59),(-.68,0,1.28)),
 ('forearm_L','upper_arm_L',(-.68,0,1.28),(-.69,0,.95)),
 ('hand_L','forearm_L',(-.69,0,.95),(-.68,-.04,.82)),
 ('upper_arm_R','spine',(.40,0,1.59),(.68,0,1.28)),
 ('forearm_R','upper_arm_R',(.68,0,1.28),(.72,0,.95)),
 ('hand_R','forearm_R',(.72,0,.95),(.76,-.04,.82)),
 ('thumb_R','hand_R',(.73,-.05,.86),(.62,-.10,.91)),
 ('index_R','hand_R',(.75,-.05,.82),(.8,-.1,.68)),
 ('middle_R','hand_R',(.77,-.05,.82),(.84,-.1,.67)),
 ('ring_R','hand_R',(.66,-.05,.805),(.68,-.08,.71)),
 ('pinky_R','hand_R',(.771,-.05,.805),(.785,-.07,.739)),
 ('middle_L','hand_L',(-.735,-.05,.805),(-.75,-.08,.692)),
 ('ring_L','hand_L',(-.66,-.05,.805),(-.68,-.08,.713)),
 ('pinky_L','hand_L',(-.771,-.05,.805),(-.785,-.07,.739)),
 ('thumb_L','hand_L',(-.7,-.04,.86),(-.61,-.08,.90)),
 ('index_L','hand_L',(-.68,-.04,.82),(-.72,-.09,.68)),
 ('hip_L','root',(-.19,0,.92),(-.21,0,.71)),
 ('shin_L','hip_L',(-.21,0,.71),(-.24,-.02,.16)),
 ('foot_L','shin_L',(-.24,-.02,.16),(-.24,-.24,.1)),
 ('hip_R','root',(.19,0,.92),(.21,0,.71)),
 ('shin_R','hip_R',(.21,0,.71),(.24,-.02,.16)),
 ('foot_R','shin_R',(.24,-.02,.16),(.24,-.24,.1))
]
for name,parent,head,tail in B:
    eb=arm.data.edit_bones.new(name); eb.head=head; eb.tail=tail
    if parent:eb.parent=arm.data.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
arm.data.display_type='STICK'
for bone in arm.data.bones:bone.use_deform=True

def bind(mesh,bone):
    # Apply object transforms so armature rest coordinates and mesh are same space.
    bpy.ops.object.select_all(action='DESELECT')
    mesh.select_set(True);bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    vg=mesh.vertex_groups.new(name=bone)
    vg.add(list(range(len(mesh.data.vertices))),1,'REPLACE')
    mod=mesh.modifiers.new('Skin_to_'+bone,'ARMATURE');mod.object=arm
    return mesh

def ball(name,at,sc,mat,bone=None,segments=16,rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,location=at)
    obj=bpy.context.object;obj.name=name
    obj.scale=sc;obj.data.materials.append(mat)
    if bone:bind(obj,bone)
    return obj

def bar(name,p1,p2,radius,mat,bone):
    mid=(Vector(p1)+Vector(p2))*0.5;vec=Vector(p2)-Vector(p1)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=radius,depth=vec.length,
        location=mid)
    o=bpy.context.object;o.name=name;o.rotation_euler=vec.to_track_quat('Z','Y').to_euler()
    o.data.materials.append(mat);bind(o,bone)
    return o

ball('Head__skin',(0,-.04,2.22),(.53,.43,.60),skin,'head',32,20)
ball('Torso__purple',(0,0,1.32),(.48,.29,.61),purple,'spine',24,14)
ball('Hood__lavender',(0,.13,1.73),(.44,.20,.19),violet,'spine')
ball('Waist',(0,0,.95),(.42,.29,.27),violet,'root')
for side,s in [('L',-1),('R',1)]:
    b=bar('UpperArm_'+side,(s*.40,0,1.58),(s*.68,0,1.29),.155,purple,'upper_arm_'+side)
    b=bar('Forearm_'+side,(s*.68,0,1.29),(s*.70,0,.95),.13,purple,'forearm_'+side)
    ball('Hand_'+side,(s*.70,-.025,.88),(.13,.09,.19),skin,'hand_'+side)
    bar('Thigh_'+side,(s*.20,0,.87),(s*.21,0,.57),.20,violet,'hip_'+side)
    bar('Shin_'+side,(s*.21,0,.57),(s*.24,-.01,.16),.14,violet,'shin_'+side)
    ball('Slipper_'+side,(s*.24,-.19,.09),(.22,.33,.11),purple,'foot_'+side)
# Real mesh with actual shape keys and vertex-group skinning.
head=bpy.data.objects['Head__skin']
head.shape_key_add(name='Basis',from_mix=False)
for keyname in ['Smile_cheeks','Curious_brows','Surprise_face','Soft_squint']:
    kb=head.shape_key_add(name=keyname,from_mix=False)
    for v in head.data.vertices:
        # mesh positions baked into local data; modify face surface subtly
        if v.co.y < -.23 and 1.95 < v.co.z < 2.40:
            dx=abs(v.co.x)
            if keyname=='Smile_cheeks' and dx>.25:kb.data[v.index].co.z+=.035
            if keyname=='Curious_brows' and v.co.z>2.32:kb.data[v.index].co.z+=.025
            if keyname=='Surprise_face' and dx<.19:kb.data[v.index].co.y-=.018
            if keyname=='Soft_squint' and v.co.z>2.3:kb.data[v.index].co.z-=.015
for side,s in [('L',-1),('R',1)]:
    ball('EyeWhite_'+side,(s*.215,-.409,2.30),(.165,.072,.188),white,'head')
    ball('Iris_'+side,(s*.215,-.474,2.295),(.105,.035,.125),blue,'head')
    ball('Pupil_'+side,(s*.21,-.505,2.298),(.043,.016,.065),pupil,'head')
    ball('Brow_'+side,(s*.22,-.429,2.53),(.18,.031,.036),blonde,'head')
    ball('Cheek_'+side,(s*.315,-.388,2.03),(.117,.025,.064),rose,'head')
    for n in range(5):
        x=s*(.23+.047*(n%3));z=2.08+(.028*((n*3)%4))
        ball('Freckle_'+side+'_'+str(n),(x,-.445,z),(.012,.010,.013),rose,'head',8,6)
ball('Nose',(0,-.47,2.12),(.085,.075,.10),skin,'head')
ball('Smile',(0,-.476,1.973),(.175,.027,.035),dark,'head')
# A helmet-like base plus clumps and looser golden waves; acknowledged BLOCKOUT.
ball('BlondeHairCap',(0,.02,2.62),(.55,.45,.32),blonde,'head',28,16)
for i in range(18):
    a=i*2*math.pi/18
    x=.46*math.cos(a);y=.38*math.sin(a)
    z=2.65+(.08*math.sin(i*1.3))
    length=.2+.16*(.5+.5*math.sin(i*2.2))
    ball('HairClump_%02d'%i,(x,y,z),(.12,.12,length),lightblonde if i%5==0 else blonde,'head')
for i in range(6):
    x=(-.26+i*.103);z=2.71-.05*(i%3)
    ball('LooseFringe_%02d'%i,(x,-.40,z),(.10,.09,.22),blonde,'head')
# Three stars on hoodie, each mesh skinned to torso.
for x,z in [(-.15,1.38),(.20,1.21),(0,1.56)]:
    ball('StarOnHoodie_%s'%z,(x,-.282,z),(.06,.018,.060),lightblonde,'spine',10,8)

bpy.ops.object.camera_add(location=(.06,-6.4,2.19))
cam=bpy.context.object;cam.name='Camera_character_3D';cam.data.lens=45
direction=Vector((0,-.03,1.56))-cam.location
cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
scene.camera=cam
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.03))
floor=bpy.context.object;floor.name='Blockout_floor';floor.data.materials.append(material('floor',(.14,.10,.23)))
# Replace the first-generation mannequin face, hair and hands with real
# Blender geometry; fail rather than silently skipping the approved art pass.
ART_PASS=Path(__file__).resolve().with_name('character-art-pass-v3.py')
if not ART_PASS.is_file():raise RuntimeError('Character art pass missing; hold render')
exec(compile(ART_PASS.read_text(),str(ART_PASS),'exec'),globals())

# V4 appeal study must be authored by a separate visible rigged 3D art file.
APPEAL=Path(__file__).resolve().with_name('character-appeal-v4.py')
if not APPEAL.is_file():raise RuntimeError('V4 art file missing; render held')
exec(compile(APPEAL.read_text(),str(APPEAL),'exec'),globals())

# Animation: calm glance -> notice -> anticipate -> snap -> relax; all 3D pose data.
def pose_key(frame,torso=0,head_z=0,upper=-0.10,forearm=0,hand=0,index=0,thumb=0,smile=0,middle=0,ring=0,pinky=0):
    scene.frame_set(frame)
    values={'spine':('Y',torso),'head':('Z',head_z),
      'upper_arm_R':('Z',upper),'forearm_R':('Z',forearm),
      'hand_R':('Z',hand),'index_R':('X',index),'thumb_R':('X',thumb),
      'middle_R':('X',middle),'ring_R':('X',ring),'pinky_R':('X',pinky)}
    for bone,(axis,angle) in values.items():
        pb=arm.pose.bones[bone]
        pb.rotation_mode='XYZ'
        v=[0,0,0];v['XYZ'.index(axis)]=angle
        pb.rotation_euler=v
        pb.keyframe_insert(data_path='rotation_euler',frame=frame,group=bone)
    head.data.shape_keys.key_blocks['Smile_cheeks'].value=smile
    head.data.shape_keys.key_blocks['Smile_cheeks'].keyframe_insert(data_path='value',frame=frame)

pose_key(1,head_z=-.14,smile=.10)
pose_key(9,head_z=.05,upper=-.1,smile=.55)
# A real multi-joint performance curve, not the old single static finger point.
# Staging: raise -> middle/thumb pressure -> one-frame release -> reaction.
pose_key(18,head_z=.12,upper=-.70,forearm=-.65,hand=.28,index=.15,thumb=-.20,middle=.23,ring=.10,pinky=.16,smile=.9)
pose_key(23,head_z=.11,upper=-.81,forearm=-.87,hand=.37,index=.17,thumb=-.40,middle=.73,ring=.25,pinky=.30,smile=1)
pose_key(24,head_z=.11,upper=-.82,forearm=-.90,hand=.40,index=.19,thumb=-.46,middle=.94,ring=.25,pinky=.30,smile=1)
pose_key(25,head_z=.12,upper=-.84,forearm=-.92,hand=-.12,index=.12,thumb=.30,middle=-.38,ring=.14,pinky=.18,smile=1)
pose_key(26,head_z=.12,upper=-.82,forearm=-.90,hand=.08,index=-.20,thumb=-.35,middle=-.18,ring=.12,pinky=.12,smile=1)
pose_key(29,head_z=.08,upper=-.78,forearm=-.83,hand=.10,index=.1,thumb=.10,middle=.05,ring=.08,pinky=.10,smile=.85)
pose_key(48,head_z=-.08,upper=-.13,forearm=0,hand=0,index=0,thumb=0,smile=.30)



# Solve actual bone-tip contact and finger flick from joint geometry.
# If unreachable, fail this prototype rather than faking a snap.
SOLVER=Path(__file__).resolve().with_name('solve-finger-snap-pose.py')
if not SOLVER.is_file():raise RuntimeError('SNAP_SOLVER_MISSING')
exec(compile(SOLVER.read_text(),str(SOLVER),'exec'),globals())

# Finger performance is objective evidence only. The creative gate still
# requires a human closeup to decide whether the finger SNAP reads.
right_digts=['thumb_R','index_R','middle_R','ring_R','pinky_R']
if any(b not in arm.pose.bones for b in right_digts):
    raise RuntimeError('SNAP_RIG_BLOCKED: missing independent right digits')
scene.frame_set(24)
press_middle=float(arm.pose.bones['middle_R'].rotation_euler.x)
scene.frame_set(25)
release_middle=float(arm.pose.bones['middle_R'].rotation_euler.x)
release_delta=abs(press_middle-release_middle)
if release_delta<.8:
    raise RuntimeError('SNAP_RIG_BLOCKED: insufficient middle finger release')

# Fail if the hand does not visibly travel: the first rig was structurally
# sound but only twisted along bone axes and never performed a readable snap.
from bpy_extras.object_utils import world_to_camera_view
def projected_hand(frame):
    scene.frame_set(frame); bpy.context.view_layer.update()
    hand_world=arm.matrix_world @ arm.pose.bones['hand_R'].tail
    q=world_to_camera_view(scene,cam,hand_world)
    return {'x':round(q.x*640,2),'y':round((1-q.y)*360,2),
            'worldZ':round(hand_world.z,3)}
start=projected_hand(1); raised=projected_hand(24); released=projected_hand(26)
screenTravel=math.hypot(raised['x']-start['x'],raised['y']-start['y'])
if screenTravel<42:
    raise RuntimeError('VISIBLE_SNAP_MOTION_BLOCKED: wrist movement %.1fpx (<42px)'%screenTravel)
if abs(released['x']-raised['x'])+abs(released['y']-raised['y'])<2:
    raise RuntimeError('SNAP_RELEASE_BLOCKED: no distinguishable contact/release motion')

scene.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Kennedy_Rigged3D_BLOCKOUT.blend'))
# Use actual Blender rendered pixels, not generated storyboard stills.
lookdev_mode=os.environ.get('EVERCRAFT_LOOKDEV_ONLY')=='1'
render_frames=[1,18,26,40] if lookdev_mode else list(range(1,49))
for f in render_frames:
    scene.frame_set(f)
    scene.render.filepath=str(out/'frames'/('frame_%04d.png'%f))
    bpy.ops.render.render(write_still=True)

# Two actual Blender closeups at snap compression and release. This is not
# a substitute for viewing the moving hand, but makes failures observable.
scene.frame_set(24);bpy.context.view_layer.update()
_press=arm.matrix_world @ arm.pose.bones['hand_R'].tail
scene.frame_set(25);bpy.context.view_layer.update()
_release=arm.matrix_world @ arm.pose.bones['hand_R'].tail
_focus=(_press+_release)*.5
_cam_location=cam.location.copy();_cam_rotation=cam.rotation_euler.copy()
_cam_lens=cam.data.lens
cam.location=_focus+Vector((0,-1.65,.12))
cam.rotation_euler=(_focus-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.lens=55
for f,name in ((24,'SnapPress_Closeup.png'),(25,'SnapRelease_Closeup.png')):
    scene.frame_set(f)
    scene.render.filepath=str(out/name)
    bpy.ops.render.render(write_still=True)
cam.location=_cam_location
cam.rotation_euler=_cam_rotation
cam.data.lens=_cam_lens
report={'schema':'evercraft.animation.3d-rig-blockout.v1','frames':48,'fps':12,
  'model':'Kennedy_Rigged3D_BLOCKOUT.blend','stage':'lookdev_stills' if lookdev_mode else 'engineering-blockout',
  'rendered_frames':len(render_frames),
  'visual_design_approved':False,'performance_approved':False,
  'armature_bones':len(arm.data.bones),'face_shapes':len(head.data.shape_keys.key_blocks)-1,
  'snap_middle_release_radians':round(release_delta,3),
  'snap_solver':snap_geometry,
  'independent_right_finger_bones':right_digts,
  'snap_creative_approval':False,
  'snap_closeup_stills':['SnapPress_Closeup.png','SnapRelease_Closeup.png'],
  'screen_hand_travel_px':round(screenTravel,2),'start_wrist':start,'snap_contact_wrist':raised,'snap_release_wrist':released,
  'note':'V4 Blender 3D look-development study. Warm lighting and shaped hair. NOT creative-approved.'}
(out/'proof.json').write_text(json.dumps(report,indent=2))
print('BLOCKOUT COMPLETE',json.dumps(report))
