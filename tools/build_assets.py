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
        mod=o.modifiers.new('Armor bevel','BEVEL');mod.width=bevel;mod.segments=1
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
    merge(turret,'TurretArmor');merge(None,'Chassis');export(kind)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SOURCE,kind+'.blend'));portrait(kind)
# Гранёные скалы с неодинаковыми слоями и естественным силуэтом.
for variant in range(3):
    clear();random.seed(51+variant)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1);o=bpy.context.object;o.name='Sandstone'
    for v in o.data.vertices:
        z=v.co.z;v.co.x*=1+random.uniform(-.15,.15);v.co.y*=.8+random.uniform(-.12,.12);v.co.z=max(-.22,z*.85)
        if z>.45:v.co.x*=.7
    o.data.materials.append(rockmat);o.data.materials.append(sand)
    for face in o.data.polygons:face.material_index=1 if face.center.z>.4 and random.random()>.5 else 0
    export('rock'+str(variant))
print('ASSETS_READY',OUT)
