#!/usr/bin/env python3
"""Offline articulated 2D performance from owned RGBA cutout art + recorded voice.

Not a rigging-quality, identity, phoneme-sync or publication approval claim.
"""
import argparse,hashlib,json,math,pathlib,subprocess
from PIL import Image

SCHEMA='evercraft.fallen.toon-puppet-rig.v1'
def fail(ok,reason):
    if not ok: raise ValueError('toon_puppet_'+reason)
def sha(b):return hashlib.sha256(b).hexdigest()
def command(args):
    r=subprocess.run(args,capture_output=True)
    if r.returncode:raise RuntimeError('toon_puppet_process_failed:'+args[0]+':'+r.stderr.decode('utf8','replace')[-500:])
    return r.stdout
def multiply(a,b):
    return (a[0]*b[0]+a[1]*b[3],a[0]*b[1]+a[1]*b[4],a[0]*b[2]+a[1]*b[5]+a[2],
            a[3]*b[0]+a[4]*b[3],a[3]*b[1]+a[4]*b[4],a[3]*b[2]+a[4]*b[5]+a[5])
def local(pivot,rotation,translation,scale):
    theta=math.radians(rotation)
    co,si=math.cos(theta)*scale,math.sin(theta)*scale
    px,py=pivot;tx,ty=translation
    return (co,-si,px-co*px+si*py+tx,si,co,py-si*px-co*py+ty)
def invert(m):
    det=m[0]*m[4]-m[1]*m[3]
    fail(abs(det)>.01,'singular_layer_transform')
    return (m[4]/det,-m[1]/det,(m[1]*m[5]-m[4]*m[2])/det,
            -m[3]/det,m[0]/det,(m[3]*m[2]-m[0]*m[5])/det)
def bounded(value,lo,hi,reason):
    fail(type(value) in (float,int) and math.isfinite(value) and lo<=value<=hi,reason)
    return float(value)
def asset(root,name,expected,max_bytes):
    fail(isinstance(name,str) and 0<len(name)<=200 and not name.startswith('/')
         and not name.startswith('\\') and '\\' not in name and '\0' not in name,
         'asset_name_invalid')
    fail(all(part not in ('','.','..') for part in name.split('/')),'asset_traversal')
    p=root/name
    fail(p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(root),'asset_unsafe')
    fail(0<p.stat().st_size<=max_bytes,'asset_size_invalid')
    raw=p.read_bytes()
    fail(isinstance(expected,str) and len(expected)==64 and sha(raw)==expected,'asset_digest_mismatch')
    return p
def validate(scene,root):
    fail(scene.get('schema')==SCHEMA,'schema_invalid')
    for key in ('packetDigest','shotId','actorId'):
        fail(isinstance(scene.get(key),str) and len(scene[key])>=4,'binding_missing:'+key)
    width,height,fps,duration=(scene.get(x) for x in ('width','height','fps','durationSec'))
    fail(type(width)==int and width%2==0 and 320<=width<=1280,'canvas_width_invalid')
    fail(type(height)==int and height%2==0 and 180<=height<=720,'canvas_height_invalid')
    fail(type(fps)==int and 24<=fps<=30,'fps_invalid')
    bounded(duration,1,10,'duration_invalid')
    fail(abs(round(duration*fps)-duration*fps)<.001,'duration_not_frame_aligned')
    layers=scene.get('layers')
    fail(isinstance(layers,list) and 2<=len(layers)<=12,'layer_count_invalid')
    by_id={}
    facial_groups={}
    facial_pixels={}
    for layer in layers:
        key=layer.get('id')
        fail(isinstance(key,str) and 2<=len(key)<=60 and key not in by_id,'layer_id_invalid')
        fail(layer.get('actorId')==scene['actorId'],'layer_actor_mismatch')
        fail(isinstance(layer.get('referenceAssetId'),str) and layer['referenceAssetId'],
             'layer_reference_missing')
        fail(layer.get('file','').lower().endswith('.png'),'layer_png_required')
        p=asset(root,layer['file'],layer.get('sha256'),5*1024*1024)
        with Image.open(p) as im:
            fail(im.format=='PNG' and im.mode=='RGBA','layer_must_be_rgba_png')
            fail(im.size==(width,height),'layer_canvas_mismatch')
            fail(im.getchannel('A').getbbox() is not None,'layer_empty_alpha')
            group=layer.get('switchGroup')
            variant=layer.get('variant')
            if group is not None or variant is not None:
                fail(group in ('mouth','eyes','brows') and isinstance(variant,str)
                     and 2<=len(variant)<=24 and variant.replace('_','').isalnum(),
                     'facial_group_or_variant_invalid')
                facial_groups.setdefault(group,{})
                fail(variant not in facial_groups[group],'duplicate_facial_variant')
                facial_groups[group][variant]=key
                facial_pixels[(group,variant)]=sha(im.tobytes())
        pivot=layer.get('pivotPx')
        fail(isinstance(pivot,list) and len(pivot)==2,'pivot_missing')
        for value,limit in zip(pivot,(width,height)):bounded(value,0,limit,'pivot_out_of_bounds')
        fail(type(layer.get('zIndex'))==int and 0<=layer['zIndex']<=100,'z_index_invalid')
        by_id[key]=layer
    for group,variants in facial_groups.items():
        fail(2<=len(variants)<=6,'facial_variant_count_invalid:'+group)
        fail(len({facial_pixels[(group,v)] for v in variants})==len(variants),
             'facial_variants_pixel_identical:'+group)
        members=[by_id[id] for id in variants.values()]
        first=members[0]
        fail(all(m.get('parentId')==first.get('parentId') and
                 m['pivotPx']==first['pivotPx'] and
                 m['zIndex']==first['zIndex'] for m in members),
             'facial_layer_alignment_invalid:'+group)
    for key,layer in by_id.items():
        parent=layer.get('parentId')
        fail(parent is None or parent in by_id,'parent_missing')
        fail(parent!=key,'self_parent')
        chain={key}
        while parent:
            fail(parent not in chain,'parent_cycle')
            chain.add(parent);parent=by_id[parent].get('parentId')
    keys=scene.get('keyframes')
    fail(isinstance(keys,list) and 2<=len(keys)<=36,'keyframe_count_invalid')
    previous=-1.;changes=0
    for keyframe in keys:
        t=bounded(keyframe.get('atSec'),0,duration,'keyframe_time_invalid')
        fail(t>=previous+.05,'keyframes_out_of_order')
        previous=t
        states=keyframe.get('layers')
        fail(isinstance(states,dict) and set(states)==set(by_id),'keyframe_layer_set_mismatch')
        for state in states.values():
            fail(set(state)=={'rotationDeg','translatePx','scale'},'transform_fields_invalid')
            bounded(state['rotationDeg'],-130,130,'rotation_out_of_bounds')
            bounded(state['scale'],.7,1.3,'scale_out_of_bounds')
            vec=state['translatePx']
            fail(isinstance(vec,list) and len(vec)==2,'translation_invalid')
            bounded(vec[0],-width*.3,width*.3,'translate_x_out_of_bounds')
            bounded(vec[1],-height*.3,height*.3,'translate_y_out_of_bounds')
            if state['rotationDeg'] or vec != [0,0] or state['scale']!=1:changes+=1
    fail(keys[0]['atSec']==0,'first_keyframe_must_be_zero')
    fail(keys[-1]['atSec']<=duration-.25,'last_keyframe_too_late')
    fail(changes>0,'all_frames_static')
    tracks=scene.get('facialTracks',[])
    fail(isinstance(tracks,list) and len(tracks)<=3,'facial_tracks_invalid')
    named={}
    total_frames=round(duration*fps)
    for track in tracks:
        group=track.get('group')
        fail(group in facial_groups and group not in named,'facial_track_unknown_or_duplicate')
        fail(track.get('source')=='authored_frame_timing','facial_source_not_authored')
        events=track.get('events')
        fail(isinstance(events,list) and 2<=len(events)<=40,
             'facial_events_missing_or_excessive')
        last=-1;previous_variant=None;states=set()
        for event in events:
            frame=event.get('atFrame')
            variant=event.get('variant')
            fail(type(frame)==int and 0<=frame<total_frames and frame>last,
                 'facial_event_frame_invalid')
            fail(variant in facial_groups[group],'facial_variant_missing')
            fail(variant!=previous_variant,'facial_event_repetition_invalid')
            last=frame;previous_variant=variant
            states.add(variant)
        fail(events[0]['atFrame']==0 and len(states)>=2,'facial_track_not_switching')
        if group=='mouth':
            fail(track.get('cueId')==scene.get('voice',{}).get('cueId'),
                 'mouth_track_voice_cue_mismatch')
        else:
            fail(track.get('cueId') is None,'nonmouth_cue_not_allowed')
        named[group]=track
    fail(set(named)==set(facial_groups),'facial_track_group_coverage_invalid')
    audio=scene.get('voice')
    fail(isinstance(audio,dict) and audio.get('cueId') and audio.get('voiceProfileId'),
         'bound_voice_missing')
    audio_path=asset(root,audio.get('file'),audio.get('sha256'),20*1024*1024)
    raw=json.loads(command(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(audio_path)]))
    stream=next((s for s in raw.get('streams',[]) if s.get('codec_type')=='audio'),None)
    length=float(raw.get('format',{}).get('duration') or (stream or {}).get('duration') or 0)
    fail(stream is not None and .2<=length<=duration+.01,'voice_duration_invalid')
    return by_id,audio_path,facial_groups,named
def tween(keys,t,layer_id):
    if t>=keys[-1]['atSec']:return keys[-1]['layers'][layer_id]
    i=next(i for i in range(len(keys)-1) if keys[i]['atSec']<=t<keys[i+1]['atSec'])
    a,b=keys[i],keys[i+1]
    u=(t-a['atSec'])/(b['atSec']-a['atSec'])
    u=u*u*(3-2*u)
    p,q=a['layers'][layer_id],b['layers'][layer_id]
    return {'rotationDeg':p['rotationDeg']*(1-u)+q['rotationDeg']*u,
            'translatePx':[p['translatePx'][i]*(1-u)+q['translatePx'][i]*u for i in range(2)],
            'scale':p['scale']*(1-u)+q['scale']*u}
def render(scene,assets,out):
    root=pathlib.Path(assets).resolve(strict=True)
    layers,audio,facial_groups,facial_tracks=validate(scene,root)
    output=pathlib.Path(out).resolve()
    fail(output!=root and not output.is_relative_to(root),'output_inside_source_bundle')
    output.mkdir(parents=True,exist_ok=True)
    width,height,fps=scene['width'],scene['height'],scene['fps']
    frame_count=round(scene['durationSec']*fps)
    images={key:Image.open(root/layer['file']).convert('RGBA') for key,layer in layers.items()}
    transforms={}
    facial_counts={group:{variant:0 for variant in variants}
                   for group,variants in facial_groups.items()}
    facial_event_samples={group:[] for group in facial_tracks}
    def facial_variant(group,index):
        events=facial_tracks[group]['events']
        return next(event['variant'] for event in reversed(events)
                    if event['atFrame']<=index)
    def world(layer_id,t):
        if layer_id in transforms:return transforms[layer_id]
        layer=layers[layer_id];pose=tween(scene['keyframes'],t,layer_id)
        matrix=local(layer['pivotPx'],pose['rotationDeg'],pose['translatePx'],pose['scale'])
        parent=layer.get('parentId')
        result=multiply(world(parent,t),matrix) if parent else matrix
        transforms[layer_id]=result
        return result
    movie=output/'puppet-motion-review.mp4'
    audio_filter='[1:a]aresample=48000,apad,atrim=duration='+str(scene['durationSec'])+',asetpts=PTS-STARTPTS[a]'
    proc=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','error','-y',
      '-f','rawvideo','-pix_fmt','rgb24','-s',f'{width}x{height}','-r',str(fps),
      '-i','pipe:0','-i',str(audio),'-filter_complex',audio_filter,
      '-map','0:v:0','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','22',
      '-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',
      '-frames:v',str(frame_count),str(movie)],stdin=subprocess.PIPE,stderr=subprocess.PIPE)
    examples={}
    try:
        for frame_index in range(frame_count):
            t=frame_index/fps
            transforms.clear()
            canvas=Image.new('RGBA',(width,height),(16,19,30,255))
            visible={group:facial_variant(group,frame_index) for group in facial_tracks}
            for group,variant in visible.items():
                facial_counts[group][variant]+=1
                if any(e['atFrame']==frame_index for e in facial_tracks[group]['events']):
                    facial_event_samples[group].append({
                        'atFrame':frame_index,'variant':variant,
                        'artSha256':layers[facial_groups[group][variant]]['sha256']})
            for key,layer in sorted(layers.items(),key=lambda entry:(entry[1]['zIndex'],entry[0])):
                group=layer.get('switchGroup')
                if group and visible[group]!=layer['variant']:continue
                warped=images[key].transform((width,height),Image.Transform.AFFINE,
                  invert(world(key,t)),resample=Image.Resampling.BICUBIC)
                canvas=Image.alpha_composite(canvas,warped)
            rgb=canvas.convert('RGB')
            if frame_index in {0,round(frame_count*.25),round(frame_count*.5),
                              round(frame_count*.75),frame_count-1}:
                examples[str(frame_index)]=sha(rgb.tobytes())
            proc.stdin.write(rgb.tobytes())
        proc.stdin.close()
        errors=proc.stderr.read()
        fail(proc.wait(timeout=45)==0,'encoder_failed:'+errors.decode('utf8','replace')[-280:])
        proc.stderr.close()
    finally:
        if proc.poll() is None:proc.kill()
        for im in images.values():im.close()
    fail(len(set(examples.values()))>=3,'no_visible_animated_change')
    probed=json.loads(command(['ffprobe','-v','error','-count_frames',
      '-show_streams','-show_format','-of','json',str(movie)]))
    video=next(x for x in probed['streams'] if x['codec_type']=='video')
    audio_stream=next(x for x in probed['streams'] if x['codec_type']=='audio')
    fail(video['codec_name']=='h264' and audio_stream['codec_name']=='aac','codec_mismatch')
    fail(int(video.get('nb_read_frames','0'))==frame_count,'render_frame_count_mismatch')
    result={'schema':'evercraft.fallen.toon-puppet-motion-receipt.v1',
      'state':'articulated_2d_preview_not_creative_admission',
      'packetDigest':scene['packetDigest'],'shotId':scene['shotId'],'actorId':scene['actorId'],
      'sourcePartSha256':{id:part['sha256'] for id,part in layers.items()},
      'voiceSha256':scene['voice']['sha256'],'voiceCueId':scene['voice']['cueId'],
      'fps':fps,'frameCount':frame_count,'width':width,'height':height,
      'videoSha256':sha(movie.read_bytes()),'videoPath':str(movie),
      'frameSampleDigests':examples,'articulatedJointTransformsExecuted':True,
      'authoredFacialSpritesSwitched':bool(facial_tracks),
      'facialSwitchSamples':facial_event_samples,
      'facialVisibleFrameCounts':facial_counts,
      'facialTimingSource':'authored_integer_frames' if facial_tracks else None,
      'audioPhonemeAlignmentMeasured':False,
      'characterIdentityVerified':False,'anatomyQualityVerified':False,
      'naturalVoicePerformanceVerified':False,'lipSyncVerified':False,
      'phonemeTimingVerified':False,'musicMastered':False,'humanCreativeApproved':False,
      'commercialRightsIndependentlyVerified':False,'publicationAuthority':False}
    (output/'puppet-motion-receipt.json').write_text(json.dumps(result,indent=2)+'\n')
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--rig-json',required=True)
    p.add_argument('--assets',required=True)
    p.add_argument('--out',required=True)
    args=p.parse_args()
    print(json.dumps(render(json.loads(pathlib.Path(args.rig_json).read_text()),
                            args.assets,args.out),indent=2))
