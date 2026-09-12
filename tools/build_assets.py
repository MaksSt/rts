"""Оригинальные модели и портреты техники. Blender --background --python tools/build_assets.py"""
import bpy, math, os, random
from mathutils import Vector
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
OUT=os.path.join(ROOT,'public','models');ICONS=os.path.join(ROOT,'public','portraits');SOURCE=os.path.join(ROOT,'assets')
for folder in [OUT,ICONS,SOURCE]:os.makedirs(folder,exist_ok=True)
def mat(name,c,metal=0):
    m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*c,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=.68
    return m
armor=mat('Armor',(.32,.39,.30),.3);camo=mat('Camouflage',(.19,.25,.20),.2);sand=mat('Sand plates',(.54,.53,.38),.15)
dark=mat('Rubber',(.032,.043,.04));steel=mat('Steel',(.14,.18,.17),.55);optic=mat('Optics',(.16,.47,.50),.75);white=mat('Markings',(.79,.82,.64));lamp=mat('Headlights',(.85,.78,.47));rockmat=mat('Sandstone',(.48,.35,.22))
def box(name,loc,scale,m,parent=None,bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Armor bevel','BEVEL');mod.width=bevel;mod.segments=2
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    o.data.materials.append(m)
    if parent:o.parent=parent
    return o
def cyl(name,loc,radius,depth,m,rotation=(0,0,0),parent=None,vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc,rotation=rotation);o=bpy.context.object;o.name=name;o.data.materials.append(m)
    if parent:o.parent=parent
    return o
def clear():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
def merge(parent,name):
    objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent==parent]
    if not objs:return
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True);bpy.context.view_layer.objects.active=o
        for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.context.view_layer.objects.active=objs[0];bpy.ops.object.join();bpy.context.object.name=name
def export(name):
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',export_apply=True)
def portrait(name):
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
    scene.render.resolution_x=384;scene.render.resolution_y=240;scene.render.resolution_percentage=100;scene.render.film_transparent=True
    scene.world.color=(.35,.35,.35)
    bpy.ops.object.camera_add(location=(6,-8,6));cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=6.8;scene.camera=cam
    for pos,power,size in [((2,-4,8),1300,5),((-5,1,4),900,4),((0,5,6),1500,3)]:
        bpy.ops.object.light_add(type='AREA',location=pos);l=bpy.context.object;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(-l.location).to_track_quat('-Z','Y').to_euler()
    scene.render.image_settings.file_format='PNG';scene.render.filepath=os.path.join(ICONS,name+'.png');bpy.ops.render.render(write_still=True)
def finish_vehicle(kind,turret):
    # Мелкие функциональные детали остаются частью двух объединённых мешей.
    rng=random.Random(430+sum(map(ord,kind)))
    for x in [-.7,.7]:
        box('Tool bracket',(x,1.3,1.43),(.15,.8,.08),steel)
        cyl('Recovery cable',(x,1.55,1.6),.11,.72,steel,(math.pi/2,0,0),vertices=10)
        cyl('Exhaust pipe',(x*1.1,1.82,1.23),.13,.65,dark,(math.pi/2,0,0))
        box('Tail light',(x,2.05,.95),(.19,.1,.13),lamp)
    box('Radio case',(-.48,.48,2.23),(.4,.5,.23),camo,turret)
    for x in [-.65,.65]:
        for y in [-1.35,-.8,.65,1.35]:
            cyl('Fastener',(x,y,1.41),.035,.025,steel,vertices=8)
    # Небольшое различие панелей вместо одинакового пластика.
    shades=[]
    for factor in [.82,.94,1.07]:
        shades.append(mat(kind+' weathered panel '+str(factor),tuple(v*factor for v in (.32,.39,.30)),.22))
    for obj in list(bpy.context.scene.objects):
        if obj.type=='MESH' and obj.data.materials and obj.data.materials[0]==armor and rng.random()<.35:
            obj.data.materials[0]=rng.choice(shades)
    if kind not in ['buggy','repair','rocket']:
        for x in [-.88,.88]:
            box('Turret applique',(x,.2,2.06),(.18,.95,.21),sand,turret)
            box('Optical shield',(x,-.54,1.95),(.24,.21,.27),steel,turret)
            box('Optical lens',(x,-.66,1.95),(.15,.03,.1),optic,turret)

for kind in ['tank','scout','artillery']:
    clear();length=4.25 if kind=='artillery' else 3.8 if kind=='tank' else 3.65;width=2.5 if kind!='scout' else 2.15
    box('Lower hull',(0,0,.7),(width,length,.8),armor,bevel=.22)
    box('Sloped glacis',(0,-length*.27,1.1),(width-.25,length*.42,.5),sand,bevel=.2)
    box('Engine deck',(0,length*.28,1.17),(width-.25,length*.42,.36),armor,bevel=.09)
    for x in [-width/2,width/2]:
        if kind=='scout':
            for y in [-1.2,0,1.2]:
                cyl('All terrain tire',(x,y,.48),.48,.36,dark,(0,math.pi/2,0),vertices=16)
                cyl('Wheel rim',(x*1.15,y,.48),.25,.06,steel,(0,math.pi/2,0))
            box('Fender',(x,0,1.04),(.45,3.6,.14),sand)
        else:
            box('Track belt',(x,0,.46),(.52,length+.15,.8),dark,bevel=.2)
            for y in [-1.5,-.9,-.3,.3,.9,1.5]:
                cyl('Road wheel',(x*1.04,y,.43),.29,.54,steel,(0,math.pi/2,0))
                cyl('Hub',(x*1.24,y,.43),.10,.025,sand,(0,math.pi/2,0))
            for i in range(16):
                y=-length/2+i*length/15;box('Track link',(x,y,.88),(.56,.10,.07),steel,bevel=.01)
            for i in range(5):box('Side armor',(x*1.1,-1.35+i*.65,1.05),(.14,.56,.45),sand if i%2 else armor,bevel=.02)
    for y in [.72,.94,1.16,1.38]:box('Engine cooling',(.1,y,1.37),(1.5,.10,.04),dark,bevel=.01)
    for x in [-.75,.75]:
        cyl('Tow hook',(x,-length/2-.02,.65),.1,.14,steel,(math.pi/2,0,0))
        box('Headlight',(x,-length/2+.03,1.04),(.24,.08,.17),lamp)
        box('Rear fuel box',(x,length/2+.05,1.1),(.44,.28,.6),armor)
    bpy.ops.object.empty_add();turret=bpy.context.object;turret.name='Turret'
    if kind=='scout':
        box('Remote turret',(0,-.2,1.6),(1.05,1.3,.46),armor,turret,.14);barrel=1.4;height=1.78
        box('Vision block',(.37,-.82,1.8),(.24,.10,.18),optic,turret,.01)
    elif kind=='artillery':
        box('Artillery cabin',(0,.25,1.8),(1.85,2.1,1.15),armor,turret,.13);barrel=3.7;height=2.05
        for x in [-.96,.96]:box('Cabin panel',(x,.25,1.95),(.08,1.25,.6),sand,turret,.02)
        box('Breech',(0,-.8,2.08),(.7,.7,.6),steel,turret,.1)
    else:
        box('Faceted turret',(0,-.12,1.67),(1.9,1.9,.77),armor,turret,.26);barrel=2.6;height=1.85
        for x in [-.8,.8]:
            for y in [-.72,-.36,0]:box('Reactive armor',(x,y,2.00),(.46,.30,.12),sand,turret,.035)
        for x in [-1.02,1.02]:
            for i in range(3):cyl('Smoke launcher',(x,.1+i*.2,1.9),.065,.27,steel,(0,math.pi/2,0),turret,8)
    cyl('Barrel',(0,-1-barrel/2,height),.095 if kind=='scout' else .145,barrel,steel,(math.pi/2,0,0),turret)
    cyl('Thermal sleeve',(0,-1.5,height),.2,.72,armor,(math.pi/2,0,0),turret)
    box('Muzzle',(0,-1-barrel,height),(.22 if kind=='scout' else .34,.35,.25),steel,turret,.025)
    cyl('Hatch',(.4,.38,2.13 if kind=='tank' else 2.41 if kind=='artillery' else 1.87),.32,.1,steel,parent=turret)
    cyl('Antenna',(-.62,.72,2.62),.015,1.65,steel,parent=turret,vertices=6)
    box('Optics',(-.48,-.65,2.12 if kind=='tank' else height+.16),(.25,.18,.16),optic,turret,.015)
    for x in [-.65,.65]:box('TeamMark',(x,-1.3,1.38),(.26,.42,.025),white)
    box('Stowage',(0,.9,1.89),(1.4,.4,.35),camo,turret,.04)
    finish_vehicle(kind,turret)
    merge(turret,'TurretArmor');merge(None,'Chassis');export(kind)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'));portrait(kind)
# Дополнительные классы с разными силуэтами и функциональным оборудованием.
for kind in ['buggy','heavy','destroyer','rocket','repair']:
    clear();tracked=kind in ['heavy','destroyer'];width=2.8 if kind=='heavy' else 2.15;length=4.4 if kind!='buggy' else 3.1
    box('Armored chassis',(0,0,.72),(width,length,.72),armor,bevel=.18)
    for x in [-width/2,width/2]:
        if tracked:
            box('Track',(x,0,.47),(.6,length+.2,.82),dark,bevel=.18)
            for y in [-1.7,-1,-.3,.4,1.1,1.8]:
                cyl('Road wheel',(x*1.07,y,.48),.31,.6,steel,(0,math.pi/2,0))
            for i in range(6):box('Armored skirt',(x*1.17,-1.75+i*.68,1.04),(.18,.6,.6),sand,bevel=.05)
        else:
            for y in ([-1.1,1.1] if kind=='buggy' else [-1.6,.1,1.6]):
                cyl('Tire',(x,y,.5),.51,.4,dark,(0,math.pi/2,0),vertices=16)
                cyl('Hub',(x*1.22,y,.5),.23,.07,sand,(0,math.pi/2,0))
    box('Engine hood',(0,-length*.34,1.17),(width-.3,length*.27,.3),sand)
    for x in [-.78,.78]:box('Lamp',(x,-length/2-.03,1.03),(.26,.12,.2),lamp)
    bpy.ops.object.empty_add();turret=bpy.context.object;turret.name='Turret'
    if kind=='buggy':
        for x in [-.77,.77]:
            for y in [-.3,.75]:box('Roll cage',(x,y,1.7),(.1,.1,1.1),steel)
        box('Roll roof',(0,.22,2.26),(1.66,1.2,.12),steel)
        box('Seat',(0,.4,1.3),(1.3,.7,.6),dark)
        box('Machine gun',(0,-.2,2.47),(.5,.7,.34),armor,turret)
        cyl('Barrel',(0,-1,2.47),.065,1.2,steel,(math.pi/2,0,0),turret)
        cyl('Spare wheel',(0,1.72,1.16),.47,.24,dark,(math.pi/2,0,0))
    elif kind in ['heavy','destroyer']:
        low=kind=='destroyer';height=1.65 if low else 2.05
        box('Casemate' if low else 'Heavy turret',(0,0,height),(2.02,2.4,.65 if low else 1.1),armor,turret,.25)
        for x in [-.82,.82]:
            for y in [-.8,-.3,.2,.7]:box('Reactive armor',(x,y,height+.56),(.5,.38,.18),sand,turret)
        barrel=4.1 if low else 2.8
        cyl('Cannon',(0,-1.2-barrel/2,height+.15),.17,barrel,steel,(math.pi/2,0,0),turret)
        cyl('Sleeve',(0,-2,height+.15),.25,1.2,armor,(math.pi/2,0,0),turret)
        box('Muzzle brake',(0,-1.2-barrel,height+.15),(.47,.35,.3),dark,turret)
        cyl('Commander hatch',(.55,.6,height+.62),.34,.13,steel,parent=turret)
        box('Laser sight',(-.55,-1.23,height+.2),(.4,.1,.18),optic,turret)
    else:
        box('Truck cabin',(0,-1.3,1.72),(1.95,1.45,1.4),armor,bevel=.12)
        box('Windshield',(0,-2.04,1.97),(1.6,.06,.53),optic,bevel=.015)
        if kind=='rocket':
            box('Launcher support',(0,.6,1.48),(1.7,2,.65),steel,turret)
            for x in [-.64,0,.64]:
                for z in [1.97,2.57]:
                    cyl('Launch tube',(x,.45,z),.27,2.9,sand,(math.pi/2,0,0),turret)
                    cyl('Tube opening',(x,-1.03,z),.22,.04,dark,(math.pi/2,0,0),turret)
        else:
            box('Repair module',(0,.7,1.55),(1.9,2.25,1.05),sand)
            box('Crane pedestal',(0,.6,2.2),(.6,.6,.8),armor,turret)
            box('Crane boom',(0,0,2.85),(.24,2.7,.3),steel,turret)
            cyl('Repair cable',(0,-1.25,2.3),.035,.85,steel,parent=turret,vertices=6)
            for x in [-.97,.97]:
                box('Service stripe',(x,.7,1.65),(.03,1.3,.17),white)
                box('Service mark',(x,.7,1.65),(.04,.18,.66),white)
    cyl('Antenna',(-.65,1.45,2.5),.015,1.7,steel,vertices=6)
    finish_vehicle(kind,turret)
    merge(turret,'TurretArmor');merge(None,'Chassis');export(kind)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'));portrait(kind)
# Гранёные скалы с неодинаковыми слоями и естественным силуэтом.
for variant in range(3):
    clear();random.seed(51+variant)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3,radius=1);o=bpy.context.object;o.name='Sandstone'
    for v in o.data.vertices:
        z=v.co.z;v.co.x*=1+random.uniform(-.15,.15);v.co.y*=.8+random.uniform(-.12,.12);v.co.z=max(-.22,z*.85)
        if z>.45:v.co.x*=.78
        v.co.x*=1+.06*math.sin(z*24);v.co.y*=1+.04*math.sin(z*24)
    o.data.materials.append(rockmat);o.data.materials.append(sand)
    o.data.update()
    for face in o.data.polygons:face.material_index=1 if face.center.z>.15 and (int(face.center.z*14)%3==0 or random.random()>.85) else 0
    export('rock'+str(variant))
print('ASSETS_READY',OUT)
