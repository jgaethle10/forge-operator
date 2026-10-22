"""Character art PASS V3 for the rigged Blender engineering proof.
Execute from build-kennedy-rig-blockout.py after camera is created and before keyframes.
This is editable 3D geometry, not AI storyboard cutouts or an art-approved model.
The surrounding script supplies: bpy, arm, scene, skin, blonde, lightblonde,
white, blue, pupil, rose, dark, purple, violet, ball, bar, bind, cam.
"""
import math
from mathutils import Vector

def artmat(name,c):
    m=bpy.data.materials.new(name)
    m.diffuse_color=(*c,1)
    return m

lashes=artmat('SoftWarmBrown',(0.22,0.105,0.075))
freckles=artmat('WarmSubtleFreckles',(0.72,0.45,0.34))
lips=artmat('SoftPinkLips',(0.67,0.27,0.33))
shine=artmat('EyeCatchlight',(1.0,0.98,0.94))
golden=artmat('GoldenStrands',(0.99,0.79,0.35))
warmlight=artmat('HoneyBlonde',(0.99,0.72,0.27))
goldclip=artmat('LavenderHairTie',(0.68,0.39,0.84))

# Keep existing skin/head as rigged geometry, but remove replacement-prone
# face features and the banana-shaped hair clumps from the mannequin.
prefixes=('EyeWhite_','Iris_','Pupil_','Brow_','Cheek_','Freckle_',
          'HairClump_','LooseFringe_')
exact=('BlondeHairCap','Nose','Smile','Hand_L','Hand_R')
for obj in list(bpy.data.objects):
    if obj.name in exact or obj.name.startswith(prefixes):
        bpy.data.objects.remove(obj,do_unlink=True)

# Smooth *mesh* normals without altering the rigging or vertex groups.
for o in bpy.data.objects:
    if o.type=='MESH' and o.name!='Blockout_floor':
        for p in o.data.polygons: p.use_smooth=True

def stroke(name,coords,radius,mat,bone='head'):
    cr=bpy.data.curves.new(name,'CURVE')
    cr.dimensions='3D';cr.resolution_u=12;cr.bevel_resolution=3
    cr.bevel_depth=radius
    spl=cr.splines.new('POLY');spl.points.add(len(coords)-1)
    for p,v in zip(spl.points,coords):p.co=(*v,1)
    obj=bpy.data.objects.new(name,cr)
    scene.collection.objects.link(obj)
    obj.data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH')
    mesh=bpy.context.object
    bind(mesh,bone)
    for face in mesh.data.polygons:face.use_smooth=True
    return mesh

# Rounded, slightly almond eyes with pale lids, controlled gaze, small catchlights.
# Face looks toward camera (negative Y).
eyes=[]
for s,label in [(-1,'L'),(1,'R')]:
    x=s*.202
    ball('NaturalEyeWhite_'+label,(x,-.439,2.29),(.145,.057,.118),
         white,'head',24,16)
    iris=ball('BrightBlueIris_'+label,(x+s*.008,-.492,2.287),
        (.071,.021,.084),blue,'head',20,16)
    eyes.append(iris)
    ball('Pupil_'+label,(x+s*.008,-.510,2.293),
         (.030,.014,.050),pupil,'head',16,12)
    ball('EyeGlint_'+label,(x-s*.016,-.523,2.322),
        (.020,.011,.025),shine,'head',10,8)
    # Top lid and soft bottom lid: readable without huge staring eyeballs.
    stroke('LidTop_'+label,[(x-s*.128,-.477,2.322),
        (x-s*.072,-.496,2.369),(x,-.504,2.379),
        (x+s*.085,-.492,2.361),(x+s*.140,-.458,2.324)],
        .016,lashes)
    stroke('LidLower_'+label,[(x-s*.122,-.475,2.247),
        (x,-.499,2.207),(x+s*.126,-.465,2.250)],
        .009,freckles)
    stroke('ExpressiveBrow_'+label,[(x-s*.135,-.416,2.48),
        (x-s*.075,-.444,2.513),(x+s*.01,-.450,2.519),
        (x+s*.110,-.427,2.495)],.022,lashes)
    # Restrained diffuse blush, no oversized candy circles.
    ball('WarmCheek_'+label,(s*.345,-.343,2.11),(.102,.024,.054),
        artmat('cheek_color_'+label,(.92,.57,.54)),'head',14,10)
    # Small freckles across cheeks: subtle placement rather than painted dots.
    for i in range(7):
        a=(i*2.17)%5.4
        fx=s*(.230+.019*(i%4))
        fz=2.123+.025*math.sin(a)
        fy=-.43+.009*(i%3)
        ball('TinyFreckle_'+label+'_'+str(i),(fx,fy,fz),
            (.006,.005,.006),freckles,'head',8,6)
ball('SoftNose',(0,-.477,2.123),(.080,.055,.071),skin,'head',20,12)
stroke('SmallCurvedSmile',[(-.115,-.476,1.993),
    (-.055,-.484,1.970),(0,-.485,1.965),
    (.055,-.484,1.971),(.119,-.465,2.001)],.015,lips)

# Hair becomes dozens of separate, full 3D, bone-skinned soft locks, not
# upright sausages. Messy half-up style: smooth-ish blonde, loose waves/strays.
ball('CrownHair',(0,.040,2.60),(.555,.43,.265),
     blonde,'head',28,18)
ball('LooseTopBun',(0,.095,2.825),(.32,.29,.17),
     blonde,'head',24,14)
ball('LavenderHairScrunchie',(0,.045,2.768),(.25,.275,.046),
     goldclip,'head',18,12)

# Layers of loose waves frame face, with deterministic asymmetry.
for i in range(34):
    s=-1 if i%2==0 else 1
    k=i//2
    u=k/16
    x0=s*(.06+.42*u)
    y0=-.39+.08*(i%4)/3
    z0=2.73-.10*abs(x0)
    length=.43+.28*(.5+.5*math.sin(i*1.7))
    coords=[]
    for j in range(12):
        t=j/11
        x=x0+s*(.036*math.sin(t*5.6+i*.7)+.025*t)
        y=y0+(.015*math.sin(t*9+i))
        z=z0-length*t-.03*math.sin(2*t+u)
        coords.append((x,y,z))
    stroke('WavyBlondeLock_%02d'%i,coords,
        .022 if i%3 else .027, golden if i%6==0 else (warmlight if i%5==0 else blonde))
# A few flyaway strands crossing forehead, stopping before the eyes.
for j in range(13):
    x=-.38+j*.062
    points=[]
    for k in range(9):
        t=k/8
        points.append((x+.045*math.sin(4*t+j),
                       -.445-.008*math.sin(t*3+j),
                       2.73-.27*t+.022*math.cos(t*9+j)))
    stroke('WispyBangs_%02d'%j,points,.010 if j%2 else .014,
           golden if j%4==0 else blonde)

# Distinct palm and five fingers per hand, each curved capsule. Full bone
# linking for thumb, index, middle; ring and pinky skin to palm for now.
finger_material=skin
for s,side in [(-1,'L'),(1,'R')]:
    palm=ball('AnatomicalPalm_'+side,(s*.709,-.025,.866),
        (.092,.073,.124),skin,'hand_'+side,20,12)
    for n in range(4):
        x=s*(.66+n*.037)
        tipz=.691 if n in (1,2) else (.717 if n==0 else .739)
        bname=('index_'+side,'middle_'+side,'ring_'+side,'pinky_'+side)[n]
        # Each of the four digits is now assigned its own control bone.
        # A future deform pass must add segmented phalanges and better skin weights.
        stroke('Finger_%s_%d'%(side,n),
          [(x,-.052,.805),(x+s*.006,-.063,.757),
           (x+s*.013,-.071,tipz)],.027 if n<3 else .022,skin,bname)
        ball('Fingertip_%s_%d'%(side,n),
            (x+s*.013,-.071,tipz),(.027,.030,.032),skin,bname,10,8)
    stroke('Thumb_'+side,[(s*.638,-.060,.89),
        (s*.590,-.085,.850),(s*.576,-.092,.806)],
        .035,skin,'thumb_'+side)

# Hair, eyes and hands are all editable rigged geometry, not inserted images.
# This is still an artist-work-in-progress, not a human-approved sculpt.
cam.location=(0,-4.30,2.14)
direction=Vector((0,-.02,1.85))-cam.location
cam.rotation_euler=direction.to_track_quat('-Z','Y').to_euler()
cam.data.lens=45

scene['character_art_pass']='v3_tousled_hair_face_five_fingers'
scene['human_approval']='HELD'
