"""Evercraft character appeal V4: replace scary hair, warm studio light.
Runs after character-art-pass-v3, before posing. Look-dev, NOT approved.
"""
import bpy,math
from mathutils import Vector
for o in list(bpy.data.objects):
    if o.name.startswith(('WavyBlondeLock_','WispyBangs_','CrownHair',
                          'LooseTopBun','LavenderHairScrunchie')):
        bpy.data.objects.remove(o,do_unlink=True)
def mat(name,col,rough=.55):
    m=bpy.data.materials.new(name);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*col,1)
    bs.inputs['Roughness'].default_value=rough
    m.diffuse_color=(*col,1)
    return m
warm_skin=mat('WarmFairSkin',(.92,.68,.58),.58)
honey=mat('HoneyBlonde',(.91,.63,.23),.57)
highlight=mat('ButterBlonde',(1,.78,.35),.5)
shadow=mat('HairWarmBrown',(.60,.35,.11),.65)
violet=mat('VioletVelvet',(.32,.14,.62),.77)
room=mat('LavenderStudioBackdrop',(.19,.10,.31),.81)
for ob in bpy.data.objects:
    if ob.type!='MESH':continue
    for i,old in enumerate(ob.data.materials):
        if old is None:continue
        n=old.name.lower()
        if 'skin' in n:ob.data.materials[i]=warm_skin
        elif 'hair' in n or 'blonde' in n:ob.data.materials[i]=honey
        elif 'hoodie' in n or 'purple' in n:ob.data.materials[i]=violet
        elif not old.use_nodes:
            ob.data.materials[i]=mat('Studio_'+old.name,tuple(old.diffuse_color[:3]))
    for p in ob.data.polygons:p.use_smooth=True

# Intentionally molded locks, not thin wobbly tubes.
ball('HairCrownMold',(0,.09,2.62),(.56,.44,.28),honey,'head',28,18)
ball('LooseHighBun',(0,.13,2.82),(.32,.27,.18),honey,'head',24,14)
ball('LavenderScrunchie',(0,.14,2.75),(.25,.27,.052),violet,'head',24,14)
for s,label in [(-1,'L'),(1,'R')]:
    ball('HairSide_'+label,(s*.46,-.02,2.42),(.16,.24,.34),honey,'head',24,16)
    for i in range(7):
        x=s*(.12+i*.052)
        z=2.70+.025*math.sin(i*1.8)
        strand=ball('FullBang_'+label+str(i),(x,-.34,z),
                   (.071,.103,.15),highlight if i%4==0 else honey,
                   'head',20,12)
        strand.rotation_euler[1]=s*(-.13+.03*i)
    for i in range(4):
        ball('Curl_'+label+str(i),(s*(.48+.04*i),.02,2.38-.105*i),
             (.10,.16,.17),highlight if i==1 else honey,'head',18,12)
    # Lower raised skin covers much of the eye, softening the fixed stare.
    ball('SoftUpperLid_'+label,(s*.202,-.496,2.394),
         (.143,.039,.076),warm_skin,'head',22,14)
    ball('SoftLowerLid_'+label,(s*.202,-.485,2.203),
         (.128,.032,.031),warm_skin,'head',22,12)

# An actual lit portrait, not Workbench gray-plastic preview.
scene.render.engine='CYCLES'
scene.cycles.samples=14
scene.render.resolution_x=640;scene.render.resolution_y=360
scene.render.resolution_percentage=100
scene.world.use_nodes=True
bg=scene.world.node_tree.nodes.get('Background')
bg.inputs['Color'].default_value=(.16,.09,.27,1)
bg.inputs['Strength'].default_value=.7
scene.view_settings.view_transform='AgX'
stage=bpy.data.objects.get('Blockout_floor')
if stage:stage.data.materials.clear();stage.data.materials.append(room)
def light(name,position,power,color,size):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    ob=bpy.data.objects.new(name,d);scene.collection.objects.link(ob)
    ob.location=position;ob.rotation_euler=(Vector((0,0,2.18))-ob.location).to_track_quat('-Z','Y').to_euler()
light('KeyWarm',(-2.4,-2.4,4.4),540,(1,.84,.74),3.5)
light('FillCool',(2,-1.5,3.7),250,(.66,.57,1),2.6)
light('GoldenRim',(1.1,1.7,3.2),700,(1,.72,.39),2.2)
cam.location=(0,-3.65,2.43)
cam.rotation_euler=(Vector((0,-.02,2.15))-cam.location).to_track_quat('-Z','Y').to_euler()
cam.data.lens=47
scene['art_pass']='v4_warm_studio_hair_volume_study'
scene['visual_approval']='NOT_GRANTED'
