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

# V5 critique-driven study. RC15 visual review rejected the pill-shaped bangs,
# heavy static lids and circle "stars". KEEP creative approval HELD.
for obj in list(bpy.data.objects):
    if obj.name.startswith(('LidTop_','LidLower_','WarmCheek_')):
        bpy.data.objects.remove(obj,do_unlink=True)

# Muted golden/ash blonde and fair skin: the old warm-brown hair and sunburn
# lighting were unlike the supplied identity notes. These remain lookdev values.
honey.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.82,.61,.36,1)
highlight.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.96,.80,.55,1)
warm_skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.95,.79,.73,1)
freckle_mat=bpy.data.materials.get('WarmSubtleFreckles')
if freckle_mat:
    freckle_mat.diffuse_color=(.84,.61,.55,1)
for obj in bpy.data.objects:
    if obj.name.startswith('TinyFreckle_'):
        obj.scale=(.68,.55,.68)

ball('SculptedHairScalp',(0,.09,2.58),(.546,.405,.255),honey,'head',40,24)
# Mesh ribbons sit tangentially on the skull. Unlike spheres, they narrow
# toward their ends, have a defined flow direction, and do not rise in spikes.
def hair_ribbon(name,points,width,material):
    verts=[]
    n=len(points)-1
    for i,(x,y,z) in enumerate(points):
        t=i/n
        taper=.75+.25*math.sin(math.pi*t)
        if i==n: taper=.30
        w=width*taper
        verts.extend([(x-w/2,y,z),(x+w/2,y,z)])
    faces=[(2*i,2*i+1,2*i+3,2*i+2) for i in range(n)]
    mesh=bpy.data.meshes.new(name+'Mesh')
    mesh.from_pydata(verts,[],faces)
    mesh.update()
    ob=bpy.data.objects.new(name,mesh)
    scene.collection.objects.link(ob)
    mesh.materials.append(material)
    bind(ob,'head')
    bevel=ob.modifiers.new('HairSheetThickness','SOLIDIFY')
    bevel.thickness=.008
    bevel.offset=0
    for polygon in mesh.polygons: polygon.use_smooth=True
    return ob

# Side part with individual broad, tapered locks and staggered ends.
for i in range(15):
    x=-.46+i*.064
    p=[]
    for k in range(6):
        t=k/5
        p.append((x*(.81+.19*t)+.016*math.sin(t*3+i*.8),
                  -.26-.188*math.sin(t*math.pi*.66),
                  2.785-.29*t+.023*math.sin(i*.81+t*2)))
    hair_ribbon('SideSweptBang_%02d'%i,p,.081,
                highlight if i in (2,8,13) else honey)
for s,side in [(-1,'L'),(1,'R')]:
    for j in range(5):
        p=[]
        for k in range(8):
            t=k/7
            x=s*(.47+.038*j+.037*math.sin(math.pi*t*1.6+j))
            y=-.18+.06*j+.027*math.sin(t*4+j)
            z=2.67-.46*t-.035*(j%3)*t
            p.append((x,y,z))
        hair_ribbon('SideWave_%s_%d'%(side,j),p,.105,
                    highlight if j==2 else honey)
    # A thin skin-toned eyelid line replaces the enormous sleepy lid domes.
    x=s*.202
    lid=stroke('UpperEyelid_'+side,
               [(x-.125,-.469,2.337),(x-.061,-.504,2.365),
                (x,-.508,2.371),(x+.065,-.501,2.362),
                (x+.126,-.465,2.335)],
               .009,warm_skin,'head')

# Flatten circular garment beads into recognizable five-point star motifs.
for ob in list(bpy.data.objects):
    if ob.name.startswith('StarOnHoodie_'):
        bpy.data.objects.remove(ob,do_unlink=True)
for j,(x,z) in enumerate(((-.16,1.41),(.19,1.27),(.05,1.57))):
    verts=[]
    for k in range(10):
        a=math.pi/2+k*math.pi/5
        rad=.073 if k%2==0 else .028
        verts.append((x+rad*math.cos(a),-.308,z+rad*math.sin(a)))
    mesh=bpy.data.meshes.new('GarmentStarMesh_%d'%j)
    mesh.from_pydata(verts,[],[(0,1,2,3,4,5,6,7,8,9)])
    mesh.update()
    ob=bpy.data.objects.new('FivePointGarmentStar_%d'%j,mesh)
    scene.collection.objects.link(ob)
    ob.data.materials.append(highlight)
    bind(ob,'spine')

# Face acting is a real Blender object animation, not a render-only graphic.
# Eyes, pupils and catchlights shift together, brow reaction precedes smile.
for s,side in [(-1,'L'),(1,'R')]:
    for prefix in ('BrightBlueIris_','Pupil_','EyeGlint_'):
        o=bpy.data.objects.get(prefix+side)
        if o is None:continue
        default=o.location.copy()
        for frame,dx,dz in ((1,-.018,-.012),(8,-.017,-.008),
                            (14,.005,0),(18,.020,.008),
                            (26,.015,.008),(40,0,0),(48,-.008,0)):
            o.location=default+Vector((dx,0,dz))
            o.keyframe_insert(data_path='location',frame=frame)
        o.location=default
    brow=bpy.data.objects.get('ExpressiveBrow_'+side)
    if brow:
        initial=brow.location.copy()
        for frame,raise_z in ((1,-.012),(8,-.018),(14,.015),
                               (18,.038),(26,.033),(40,.007),(48,0)):
            brow.location=initial+Vector((0,0,raise_z))
            brow.keyframe_insert(data_path='location',frame=frame)
        brow.location=initial
    lid=bpy.data.objects.get('UpperEyelid_'+side)
    if lid:
        initial=lid.location.copy()
        for frame,lower in ((1,0),(10,0),(12,-.085),
                            (14,0),(18,0),(26,0),(48,0)):
            lid.location=initial+Vector((0,0,lower))
            lid.keyframe_insert(data_path='location',frame=frame)
        lid.location=initial
scene.frame_set(1)
# An actual lit portrait, not Workbench gray-plastic preview.
scene.render.engine='CYCLES'
scene.cycles.samples=28
# Distro Blender 4.0 can lack OpenImageDenoise; render without unsupported CPU denoiser.
for _layer in scene.view_layers:
    if hasattr(_layer,'cycles'):
        _layer.cycles.use_denoising=False
if hasattr(scene.cycles,'use_denoising'):
    scene.cycles.use_denoising=False
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
scene['art_pass']='v5_facial_reaction_tapered_hair_ribbons_stars_lookdev'
scene['visual_approval']='NOT_GRANTED'
