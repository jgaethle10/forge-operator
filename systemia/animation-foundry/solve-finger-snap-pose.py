"""Solve a physical thumb-to-middle-finger *bone tip* contact pose in Blender.

This runs after animation keyframes are authored. It adjusts actual joint
rotations, never invents contact metadata and never teleports finger bones.
It is a kinematic engineering test, NOT a hand-performance/art approval.
"""
import math
from mathutils import Vector

def _world_tail(bname):
    return arm.matrix_world @ arm.pose.bones[bname].tail

def _world_head(bname):
    return arm.matrix_world @ arm.pose.bones[bname].head

def _gap():
    return (_world_tail('thumb_R')-_world_tail('middle_R')).length

def _aim_to_target(name,target):
    pb=arm.pose.bones[name]
    pb.rotation_mode='XYZ'
    # Deterministic, bounded local-Euler coordinate search; no joint locations
    # altered and the mesh remains attached to the existing armature.
    best=float('inf')
    best_angles=Vector(pb.rotation_euler)
    for seed in [best_angles,Vector((0,0,0)),Vector((1,0,0)),Vector((-1,0,0))]:
        pb.rotation_euler=seed
        bpy.context.view_layer.update()
        for step in [0.90,0.45,0.17,0.06,0.018]:
            for _ in range(3):
                for axis in (0,1,2):
                    origin=pb.rotation_euler[axis]
                    candidates=[origin-step*2,origin-step,origin,origin+step,origin+step*2]
                    scores=[]
                    for angle in candidates:
                        pb.rotation_euler[axis]=max(-2.7,min(2.7,angle))
                        bpy.context.view_layer.update()
                        error=(_world_tail(name)-target).length
                        # Weak restraint on implausibly rotated joints.
                        scores.append((error+.00025*sum(abs(a) for a in pb.rotation_euler),
                                       float(pb.rotation_euler[axis])))
                    _,best_axis=min(scores)
                    pb.rotation_euler[axis]=best_axis
                    bpy.context.view_layer.update()
        err=(_world_tail(name)-target).length
        if err<best:
            best=err;best_angles=Vector(pb.rotation_euler)
    pb.rotation_euler=best_angles
    bpy.context.view_layer.update()
    return best,Vector(best_angles)

scene.frame_set(24)
bpy.context.view_layer.update()
ht=_world_head('thumb_R')
hm=_world_head('middle_R')
thumb_length=arm.pose.bones['thumb_R'].bone.length
middle_length=arm.pose.bones['middle_R'].bone.length
delta=hm-ht
sep=delta.length
if not abs(thumb_length-middle_length)<=sep<=thumb_length+middle_length:
    raise RuntimeError('NO_GEOMETRIC_BONE_CONTACT: true joint lengths cannot reach each other')
axis=delta.normalized()
along=(thumb_length**2-middle_length**2+sep**2)/(2*sep)
radius=math.sqrt(max(0.0,thumb_length**2-along**2))
down=arm.pose.bones['hand_R'].matrix.to_3x3() @ Vector((0,-1,0))
normal=down-axis*down.dot(axis)
if normal.length<1e-6:normal=Vector((1,0,0))-axis*axis.x
normal.normalize()
target=ht+axis*along+normal*radius
e_thumb,thumb_pose=_aim_to_target('thumb_R',target)
e_middle,middle_pose=_aim_to_target('middle_R',target)
if _gap()>.018:
    raise RuntimeError('FINGER_CONTACT_NOT_SOLVED: gap %.4f m; errors %.4f / %.4f'%(_gap(),e_thumb,e_middle))

# Save a simple lead-in / contact. Keep the actual intermediate degrees of
# rotation in Blender curves; do not fake tip coordinate tracks.
for frame,scale in ((23,.75),(24,1.)):
    scene.frame_set(frame)
    for name,angles in (('thumb_R',thumb_pose),('middle_R',middle_pose)):
        pb=arm.pose.bones[name]
        pb.rotation_mode='XYZ'
        pb.rotation_euler=angles*scale
        pb.keyframe_insert(data_path='rotation_euler',frame=frame,group=name)

scene.frame_set(25)
# Hold thumb in the actual contact orientation while finding middle-finger
# release. Otherwise Blender restores an OLD frame-25 thumb key and every
# candidate measures against a fingertip that has already moved away.
arm.pose.bones['thumb_R'].rotation_euler=thumb_pose
bpy.context.view_layer.update()
best=None
# Find a physically animated separation with relative finger movement,
# rather than letting wrist displacement masquerade as a finger snap.
# Sweep continuous joint increments along an already reachable flick
# direction, rather than sparsely enumerating rotations that can skip the
# narrow contact-to-release transition.
candidates=[]
for direction in (Vector((.7,.3,.15)),Vector((.7,-.3,.15)),
                  Vector((-.7,.3,.15)),Vector((-.7,-.3,.15))):
    for step in range(1,101):
        scale=step/100
        pb=arm.pose.bones['middle_R'];pb.rotation_mode='XYZ'
        pb.rotation_euler=middle_pose+direction*scale
        bpy.context.view_layer.update()
        gap=_gap()
        travel=(_world_tail('middle_R')-target).length
        if .038<=gap<=.09 and .025<=travel<=.09:
            score=abs(gap-.055)+.4*abs(travel-.043)+.001*scale
            candidates.append((score,gap,travel,Vector(pb.rotation_euler)))
if candidates:
    _,gap,travel,angles=min(candidates,key=lambda c:c[0])
    best=(gap,travel,angles)
if not best:
    raise RuntimeError('SNAP_FINGER_RELEASE_NOT_SOLVED_WITH_PLAUSIBLE_AMPLITUDE')
arm.pose.bones['middle_R'].rotation_euler=best[2]
arm.pose.bones['middle_R'].keyframe_insert(data_path='rotation_euler',frame=25,group='middle_R')
# Keep the thumb at the compress pose during the middle-finger flick;
# simultaneous extreme thumb motion produced a cartoonishly wide release.
thumb=arm.pose.bones['thumb_R']
thumb.rotation_euler=thumb_pose
thumb.keyframe_insert(data_path='rotation_euler',frame=25,group='thumb_R')
bpy.context.view_layer.update()
if _gap()<.033:
    raise RuntimeError('SNAP_RELEASE_GAP_TOO_SMALL')
# Frame 26 eases the fingers towards a slightly open position.
scene.frame_set(26)
# Short follow-through should not open the hand to a 30cm gap one frame later.
for name,angles in [('thumb_R',thumb_pose),
                    ('middle_R',middle_pose+(best[2]-middle_pose)*.72)]:
    pb=arm.pose.bones[name]
    pb.rotation_euler=angles
    pb.keyframe_insert(data_path='rotation_euler',frame=26,group=name)
scene.frame_set(24)
bpy.context.view_layer.update()
snap_geometry={'schema':'evercraft.animation.snap-pose-solver.v1',
    'contact_gap_m':round(_gap(),5),
    'target_armature_world':[round(float(v),4) for v in target],
    'thumb_fit_error_m':round(e_thumb,5),'middle_fit_error_m':round(e_middle,5),
    'release_gap_m':round(best[0],5),'release_middle_travel_m':round(best[1],5),
    'status':'GEOMETRY_ONLY_NOT_VISUALLY_APPROVED'}
print('SOLVED_TRUE_FINGER_CONTACT',snap_geometry)
