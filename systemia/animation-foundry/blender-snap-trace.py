"""Blender native 120 Hz finger-trace extractor. Does NOT approve a shot.
blender -b character.blend --disable-autoexec -P blender-snap-trace.py -- MAP.json TRACE.json
"""
import bpy, json, math, sys
from pathlib import Path
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else []
if len(args)!=2: raise SystemExit('Expected MAP.json OUT.json')
mapping,out=[Path(x).resolve() for x in args]
out.parent.mkdir(parents=True,exist_ok=True)
cfg=json.loads(mapping.read_text())
scene=bpy.context.scene
report={'schema':'evercraft.animation.snap-trace.v1','source':'blender_world_pose_bones',
        'sourceBlend':Path(bpy.data.filepath).name,'sampleRateHz':120,'samples':[],
        'audio':{'snapTimeSec':cfg.get('snapAudioTimeSec')},
        'creativeApproved':False}
try:
    arm=bpy.data.objects[cfg['armature']]
    if arm.type!='ARMATURE':raise ValueError('mapped_name_not_armature')
    bones=cfg['bones']
    for key in ('thumbTip','middleTip','wrist','palm'):
        if bones.get(key) not in arm.pose.bones:raise ValueError('missing_rig_bone:'+key)
    mpu=float(cfg['metersPerBlenderUnit'])
    if not (0<mpu<=10):raise ValueError('bad_meters_per_unit')
    rate=scene.render.fps/scene.render.fps_base
    duration=float(cfg.get('durationSec',.45))
    if not .2<=duration<=2:raise ValueError('bad_duration')
    start=int(cfg.get('startFrame',scene.frame_start))
    for i in range(int(round(duration*120))+1):
        t=i/120
        ff=start+t*rate; fr=math.floor(ff)
        scene.frame_set(fr,subframe=ff-fr)
        bpy.context.view_layer.update()
        sample={'timeSec':round(t,6)}
        for k in ('thumbTip','middleTip','wrist','palm'):
            p=arm.matrix_world @ arm.pose.bones[bones[k]].tail
            sample[k]=[round(v*mpu,6) for v in (p.x,p.y,p.z)]
        report['samples'].append(sample)
    report['boneMapping']=bones;report['metersPerBlenderUnit']=mpu
    report['status']='EXTRACTED_NOT_REVIEWED'
except Exception as exc:
    report['status']='HELD';report['blockers']=[type(exc).__name__+':'+str(exc)]
finally:
    out.write_text(json.dumps(report,indent=2))
if report['status']!='EXTRACTED_NOT_REVIEWED':
    raise SystemExit('SNAP_TRACE_EXTRACTION_HELD '+str(report['blockers']))
print('REAL_RIG_SNAP_TRACE_EXTRACTED',len(report['samples']))
