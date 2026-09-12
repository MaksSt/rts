import * as pc from 'playcanvas';
import {terrainTexture} from './terrain-texture';
import {terrain,SPAWNS,MAPS,MAP,TYPES,BUILDINGS,placementError,veteranRank} from '../server/rules.mjs';
import {COLORS,type State,type Unit,type Point,type Base,type GameEvent,type Kind,type Building,type BuildingKind} from './types';

const RAD=180/Math.PI;
type Model={root:pc.Entity;body:pc.Entity;turret:pc.Entity|null;last:pc.Vec3;dust:number;recoil:number;smoke:number};
type Effect={entity:pc.Entity;life:number;max:number;from:pc.Vec3;to:pc.Vec3;type:'shot'|'fire'|'smoke'|'dust';size:number};
export class Battlefield {
  app:pc.Application;camera:pc.Entity;sun:pc.Entity;world:pc.Entity;
  focus=new pc.Vec3(0,0,0);zoom=68;yaw=30;state:State|null=null;me='';selected=new Set<string>();
  private materials=new Map<string,pc.StandardMaterial>();private containers=new Map<string,pc.ContainerResource>();
  private models=new Map<string,Model>();private bases=new Map<string,pc.Entity>();private pumps:{root:pc.Entity;arm:pc.Entity;flag:pc.Entity;id:number}[]=[];
  private effects:Effect[]=[];private wrecks:pc.Entity[]=[];private labels:CanvasRenderingContext2D;private hudCanvas:HTMLCanvasElement;
  showRanges=false;private trails:pc.Entity[]=[];private orderMarker:{x:number;z:number;attack:boolean;left:number}|null=null;
  placement:{type:BuildingKind;x:number;z:number}|null=null;
  private facilities=new Map<string,pc.Entity>();private guns=new Map<string,pc.Entity>();
  private time=0;private groundTexture:pc.Texture|null=null;private groundMaterial:pc.StandardMaterial|null=null;
  onFrame:((dt:number)=>void)|null=null;onError:((message:string)=>void)|null=null;
  constructor(canvas:HTMLCanvasElement,hud:HTMLCanvasElement){
    this.app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:false,powerPreference:'high-performance'}});
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);this.app.setCanvasResolution(pc.RESOLUTION_AUTO);this.app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);
    this.app.scene.ambientLight=new pc.Color(.48,.53,.48);this.app.scene.fog.type='linear';this.app.scene.fog.color=new pc.Color(.44,.47,.40);this.app.scene.fog.start=240;this.app.scene.fog.end=390;
    this.camera=new pc.Entity('Camera');this.camera.addComponent('camera',{clearColor:new pc.Color(.44,.47,.40),projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:25,nearClip:.1,farClip:550});this.app.root.addChild(this.camera);
    this.sun=new pc.Entity('Sun');this.sun.addComponent('light',{type:'directional',color:new pc.Color(1,.91,.76),intensity:1.45,castShadows:true,shadowDistance:160,shadowResolution:2048,shadowBias:.04,normalOffsetBias:.05});this.sun.setEulerAngles(55,-35,0);this.app.root.addChild(this.sun);
    const fill=new pc.Entity('Sky fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.76,.86,1),intensity:.45,castShadows:false});fill.setEulerAngles(38,145,0);this.app.root.addChild(fill);
    this.world=new pc.Entity('World');this.app.root.addChild(this.world);this.hudCanvas=hud;this.labels=hud.getContext('2d')!;
    this.app.on('update',(dt:number)=>this.update(Math.min(dt,.05)));this.app.start();window.addEventListener('resize',()=>this.resize());this.resize();
  }
  resize(){this.app.resizeCanvas();this.hudCanvas.width=innerWidth*devicePixelRatio;this.hudCanvas.height=innerHeight*devicePixelRatio;this.labels.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
  setQuality(q:string){this.app.graphicsDevice.maxPixelRatio=q==='low'?1:Math.min(devicePixelRatio,q==='high'?2:1.5);this.sun.light!.shadowResolution=q==='high'?4096:q==='low'?1024:2048;this.sun.light!.castShadows=q!=='low';this.resize();}
  async load(){const names=[...Object.keys(TYPES),'rock0','rock1','rock2'];await Promise.all(names.map(name=>new Promise<void>(resolve=>{this.app.assets.loadFromUrl(`/models/${name}.glb`,'container',(err,asset)=>{if(!err&&asset)this.containers.set(name,asset.resource as pc.ContainerResource);else this.onError?.('Не удалось загрузить '+name);resolve();});})));this.preview();}
  private mat(hex:string,emissive=false){const key=hex+emissive;if(this.materials.has(key))return this.materials.get(key)!;const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);m.useMetalness=true;m.metalness=.08;m.gloss=.18;if(emissive){m.emissive=new pc.Color().fromString(hex);m.emissiveIntensity=1.3;}m.update();this.materials.set(key,m);return m;}
  private shape(type:string,name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,hex:string,parent=this.world){const e=new pc.Entity(name);e.addComponent('render',{type,material:this.mat(hex),castShadows:sy>.35&&type!=='plane',receiveShadows:true});e.setLocalPosition(x,y,z);e.setLocalScale(sx,sy,sz);parent.addChild(e);return e;}
  private beam(a:pc.Vec3,b:pc.Vec3,width:number,hex:string,parent=this.world){const d=b.clone().sub(a),e=this.shape('box','Support',0,0,0,width,width,d.length(),hex,parent);e.setLocalPosition(a.clone().add(b).mulScalar(.5));e.setLocalEulerAngles(-Math.atan2(d.y,Math.hypot(d.x,d.z))*RAD,Math.atan2(d.x,d.z)*RAD,0);return e;}
  private clear(){this.world.destroy();this.groundMaterial?.destroy();this.groundTexture?.destroy();this.world=new pc.Entity('World');this.app.root.addChild(this.world);this.models.clear();this.bases.clear();this.facilities.clear();this.guns.clear();this.pumps=[];this.effects=[];this.wrecks=[];this.trails=[];this.orderMarker=null;}
  private ground(){
    const t=terrainTexture();let seed=810;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    const texture=new pc.Texture(this.app.graphicsDevice,{mipmaps:true,anisotropy:8});texture.setSource(t);this.groundTexture=texture;const material=new pc.StandardMaterial();material.diffuseMap=texture;material.gloss=0;material.update();this.groundMaterial=material;
    this.shape('plane','Sand',0,-.02,0,MAP.ground,1,MAP.ground,'#a29471').render!.meshInstances[0].material=material;
    terrain().forEach((r,i)=>{
      this.rock(r.x,r.z,r.r,r.h,i);
      for(let j=0;j<5;j++){const a=j/5*Math.PI*2+i;this.rock(r.x+Math.cos(a)*r.r*.58,r.z+Math.sin(a)*r.r*.58,r.r*(.17+rnd()*.15),r.h*.22,i+j);}
      // Заброшенное оборудование стоит внутри уже непроходимой скальной зоны.
      if(i%4===0){const root=new pc.Entity('Abandoned survey camp');this.world.addChild(root);root.setPosition(r.x-r.r*.55,0,r.z);
        this.shape('box','Survey shelter',0,.85,0,2,1.7,2.8,'#827865',root);
        this.shape('box','Roof',0,1.78,0,2.2,.15,3,'#a8a28a',root);
        for(let n=0;n<3;n++)this.shape('box','Crate',-1.25,.35,-.9+n*.65,.6,.7,.55,'#656f53',root);
        this.shape('cylinder','Radio mast',1,2.5,-1,.08,5,.08,'#8f9781',root);
      }
    });
    // Скальные гряды за границей карты не мешают проходам внутри неё.
    for(let i=0;i<52;i++){const a=i/52*Math.PI*2,x=Math.cos(a)*132,z=Math.sin(a)*132;this.rock(x,z,4+rnd()*4,5+rnd()*6,i);}
    for(let i=0;i<420;i++){const x=rnd()*240-120,z=rnd()*240-120;if(terrain().some(r=>Math.hypot(r.x-x,r.z-z)<r.r+1))continue;if(i%3===0){const s=.16+rnd()*.3;this.shape('sphere','Stone',x,s*.3,z,s*2,s*.7,s,'#8c846c');}else{for(let k=0;k<2;k++){const tuft=this.shape('cone','Dry grass',x+(rnd()-.5)*.5,.16,z,.14,.35,.14,'#777b56');tuft.setEulerAngles(rnd()*35,rnd()*180,20);}}}
    // Пограничные столбики и небольшие руины за игровым периметром.
    for(let i=-MAP.half;i<=MAP.half;i+=16)for(const [x,z] of [[i,-MAP.half],[i,MAP.half],[-MAP.half,i],[MAP.half,i]]){this.shape('box','Boundary post',x,.45,z,.16,.9,.16,'#928e71');this.shape('box','Marker',x,.83,z,.24,.18,.24,'#d9c89b');}
    for(const z of [-120,120]){for(let i=0;i<4;i++){const wall=this.shape('box','Ruined wall',-8+i*4,1+(i%2)*.5,z,3.7,2+(i%2),.8,'#8d876e');wall.setEulerAngles(0,6,0);}for(let i=0;i<8;i++)this.shape('box','Rubble',-10+i*3,.25,z+3,1.2,.5,.8,'#88836b').setEulerAngles(0,i*17,9);}
  }
  private rock(x:number,z:number,r:number,h:number,i:number){const asset=this.containers.get('rock'+i%3);if(asset){const e=asset.instantiateRenderEntity();this.world.addChild(e);e.setPosition(x,h*.18,z);e.setLocalScale(r,h,r);e.setEulerAngles(0,i*71,0);}else this.shape('sphere','Rock',x,h*.3,z,r*2,h,r*1.7,'#95836a');}
  private base(b:Base,hex:string){const root=new pc.Entity(b.id);this.world.addChild(root);root.setPosition(b.x,0,b.z);this.bases.set(b.id,root);
    this.shape('box','Concrete foundation',0,.08,0,16,.16,16,'#878b7b',root);this.shape('box','Hangar',0,1.65,0,7,3.1,5.5,'#59685d',root);this.shape('box','Roof',0,3.27,0,7.2,.24,5.8,'#84917b',root);
    this.shape('box','Entrance',0,1.2,2.79,4.4,2.4,.07,'#1d2d29',root);for(let i=-2;i<=2;i++)this.shape('box','Door slat',i*.75,1.2,2.85,.07,2.3,.07,'#63735f',root);
    for(const x of [-3.2,3.2]){this.shape('box','Team paint',x,1.7,2.83,.25,2.7,.06,hex,root);this.shape('box','Lamp',x,2.9,2.92,.2,.15,.15,'#e6d6a1',root);}
    for(let i=0;i<4;i++)this.shape('box','Vent',-.8+i*.55,3.47,0,.28,.2,1.6,'#34483d',root);
    this.shape('box','Utility room',3.8,.85,-.4,2.2,1.7,3.5,'#69776a',root);this.shape('cylinder','Tank',-4,1.1,-1.3,1.5,2.2,1.5,'#9c9c84',root);
    this.shape('cylinder','Mast',3.7,4,-3.5,.12,8,.12,'#7e8b78',root);for(const x of [2.4,5])this.beam(new pc.Vec3(x,0,-3.5),new pc.Vec3(3.7,5,-3.5),.05,'#6a7c67',root);
    const radar=this.shape('sphere','Radar dish',3.7,7,-3.5,2.2,.25,1.7,'#b1b69e',root);radar.setEulerAngles(30,0,25);this.shape('box','Flag',4.6,5.4,-3.5,1.8,.8,.04,hex,root);
    for(const z of [-6.3,6.3])for(let x=-5.2;x<=5.2;x+=1.3){if(Math.abs(x)<2.5)continue;this.shape('box','Sandbag',x,2.12,z,1.15,.36,.55,'#b4a585',root);}
    for(const x of [-6.4,6.4]){this.shape('box','Vent grille',x,3.31,-6.8,1.1,.08,1.5,'#4a5a50',root);this.shape('box','Floodlight',x,3.65,6.8,.5,.28,.3,'#eadab0',root);}
    this.shape('box','Operations window',2,2.2,2.86,1,.55,.05,'#71948c',root);
    for(let i=0;i<5;i++)this.shape('box','Supplies',-4.2+i*.7,.48,3.6,.6,.9,.85,'#718168',root);
    const gun=this.gun(root,0,3.5,0,hex,1.3);this.guns.set(b.id,gun);
    for(const x of [-6.8,6.8])for(const z of [-6.8,6.8]){
      this.shape('box','Corner bunker',x,1.5,z,2.4,3,2.4,'#647164',root);
      this.shape('box','Armored cap',x,3.05,z,2.8,.35,2.8,'#919780',root);
      this.shape('box','Observation slit',x,2.25,z+(z>0?1.22:-1.22),1.3,.28,.08,'#152d2a',root);
      this.shape('cylinder','Beacon',x,3.55,z,.15,.55,.15,hex,root);
    }
    for(const x of [-7,7])this.shape('box','Fortress wall',x,1.0,0,.6,2,11,'#8b8f78',root);
    for(const z of [-7,7])for(const x of [-4.8,4.8])this.shape('box','Gate wall',x,1,z,3.6,2,.6,'#8b8f78',root);
    this.shape('plane','Service apron',0,.025,b.z>0?-16:16,9,1,8,'#989985',root);
    for(const x of [-4,4])this.shape('box','Repair line',x,.05,b.z>0?-16:16,.12,.025,8,'#d5d1a2',root);
  }
  private gun(parent:pc.Entity,x:number,y:number,z:number,hex:string,scale=1){
    const root=new pc.Entity('Defense turret');parent.addChild(root);root.setLocalPosition(x,y,z);root.setLocalScale(scale,scale,scale);
    this.shape('cylinder','Bearing',0,.2,0,2,.4,2,'#394b42',root);
    this.shape('box','Turret armor',0,.7,0,2.4,1,2.2,'#667760',root);
    for(const x of [-.52,.52])this.shape('box','Autocannon',x,.75,2.15,.18,.18,3,'#283b34',root);
    this.shape('box','Team stripe',0,1.22,0,1.8,.06,.3,hex,root);
    return root;
  }
  private facility(b:Building){
    const root=new pc.Entity(b.id),t=BUILDINGS[b.type],hex=this.team(b.owner);this.world.addChild(root);root.setPosition(b.x,0,b.z);this.facilities.set(b.id,root);
    this.shape('box','Foundation',0,.1,0,t.radius*1.5,.2,t.radius*1.5,'#929681',root);
    this.shape('box','Faction stripe',0,.24,-t.radius*.7,t.radius*1.35,.04,.3,hex,root);
    if(b.type==='turret'){
      this.shape('cylinder','Concrete bastion',0,1,0,4,2,4,'#8d947f',root);
      this.guns.set(b.id,this.gun(root,0,2,0,hex));
    }else if(b.type==='generator'){
      this.shape('box','Turbine house',0,1,0,4,2,4.5,'#596e66',root);
      for(const x of [-1.1,1.1]){this.shape('cylinder','Exhaust',x,3.2,.9,.65,3,.65,'#909b8c',root);this.shape('cylinder','Exhaust cap',x,4.8,.9,.9,.2,.9,'#384b42',root);}
      for(let i=0;i<5;i++)this.shape('box','Cooling fin',0,2.15,-1+i*.38,3,.2,.15,'#bcc2a4',root);
      this.shape('box','Power cabinet',2.3,.8,0,.8,1.6,2,hex,root);
    }else if(b.type==='refinery'){
      for(const x of [-2,1.5]){this.shape('cylinder','Oil reservoir',x,1.7,0,2.5,3.4,2.5,'#b2ad91',root);this.shape('cylinder','Tank lid',x,3.45,0,2.6,.2,2.6,'#677c67',root);}
      this.beam(new pc.Vec3(-2,.8,1.6),new pc.Vec3(2,.8,1.6),.35,'#444f43',root);
      this.shape('box','Control cabin',.5,1,-2.4,2.4,2,1.7,'#5f7564',root);
      this.shape('cylinder','Distillation column',-2.8,3,-2.3,.9,6,.9,'#879b89',root);
    }else if(b.type==='mine'){
      this.shape('box','Processing hall',0,1.6,1,6,3.2,3.6,'#6a7967',root);
      for(const x of [-2.6,2.6])this.beam(new pc.Vec3(x,.2,-2.5),new pc.Vec3(x,5,0),.22,'#afb498',root);
      this.shape('box','Gantry',0,5,0,6,.5,1,'#b5a778',root);
      this.beam(new pc.Vec3(0,4,0),new pc.Vec3(0,.6,-3),1.4,'#35463d',root);
      this.shape('sphere','Ore pile',2,.6,-2.7,2.7,1.2,2,'#81755e',root);
    }else{
      this.shape('box','Assembly hangar',0,1.6,0,6.5,3.2,5.7,'#677d6c',root);
      this.shape('box','Hangar roof',0,3.3,0,7,.35,6,'#9ba289',root);
      this.shape('box','Service door',0,1.25,2.88,4,2.5,.08,'#253e37',root);
      for(const x of [-2.7,2.7])this.shape('box','Warning stripe',x,1.6,2.92,.22,3,.07,hex,root);
      this.shape('box','Crane rail',0,4.25,0,7.5,.25,.3,'#bac0a1',root);
      for(const x of [-3.2,3.2])this.shape('box','Crane support',x,2.2,0,.2,4.4,.2,'#899d83',root);
    }
    for(const x of [-t.radius*.7,t.radius*.7])for(const z of [-t.radius*.7,t.radius*.7])this.shape('box','Scaffold',x,2,z,.1,4,.1,'#d5b47b',root).tags.add('scaffold');
    return root;
  }
  private pump(o:Point){const root=new pc.Entity('Oil '+o.id);this.world.addChild(root);root.setPosition(o.x,0,o.z);
    this.shape('box','Foundation',0,.1,0,4.4,.2,4.5,'#8e8e79',root);for(const x of [-.8,.8]){this.beam(new pc.Vec3(x,0,-1),new pc.Vec3(x,3.8,0),.16,'#465c50',root);this.beam(new pc.Vec3(x,0,1.1),new pc.Vec3(x,3.8,0),.16,'#465c50',root);}
    const arm=new pc.Entity('Pump arm');root.addChild(arm);arm.setLocalPosition(0,3.9,0);this.shape('box','Beam',0,0,0,.3,.4,4.2,'#a69e76',arm);this.shape('box','Horse head',0,-.5,-2,.6,1.2,.4,'#536454',arm);
    this.shape('cylinder','Rod',0,1.5,-2,.07,3,.07,'#b6bba1',root);this.shape('box','Engine',1.7,.5,.7,1.2,.9,1.5,'#6c7a60',root);this.shape('cylinder','Storage',-2,1.1,1,1,2.2,1,'#969b7c',root);
    for(let i=0;i<4;i++){const drum=this.shape('cylinder','Oil drum',-3.3,.6,-1.2+i*.75,.55,1.2,.55,'#62705c',root);this.shape('cylinder','Drum band',-3.3,.8,-1.2+i*.75,.58,.07,.58,'#b9ae86',root);drum.setEulerAngles(0,i*33,0);}
    for(const x of [-4.2,4.2])for(const z of [-4.2,4.2]){this.shape('cylinder','Safety bollard',x,.5,z,.15,1,.15,'#b6a575',root);this.shape('cylinder','Hazard band',x,.65,z,.16,.12,.16,'#465145',root);}
    this.shape('box','Service equipment',3,.65,2.8,1.5,1.3,1.2,'#6b8274',root);
    this.shape('cylinder','Flagpole',2,2.2,-1,.06,4.4,.06,'#aeb697',root);const flag=this.shape('box','Flag',2.6,4,-1,1.2,.6,.04,'#bfc4a4',root);this.pumps.push({root,arm,flag,id:o.id});
  }
  preview(){if(this.state)return;this.clear();this.ground();this.focus.set(-2,0,4);this.zoom=70;this.base({id:'preview-base',owner:'',x:-22,z:17,hp:1,maxHp:1,turret:0},COLORS[0]);MAPS.dunes.points.forEach(([x,z],id)=>this.pump({id,x,z,owner:null,captor:null,capture:0,contested:false}));(['tank','scout','artillery'] as Kind[]).forEach((type,i)=>{this.unit({id:'preview-'+i,owner:'',type,x:4+i*5,z:2-i*3,hp:1,maxHp:1,kills:0,angle:.2,turret:.2,repairing:false,order:null,waypoints:[]});});}
  begin(state:State,me:string){this.state=state;this.me=me;this.clear();this.ground();for(const b of state.bases)this.base(b,this.team(b.owner));for(const p of state.points)this.pump(p);this.home();this.zoom=78;this.sync(state);}
  sync(state:State){this.state=state;for(const b of state.bases){const e=this.bases.get(b.id);if(e)e.enabled=b.hp>0;this.guns.get(b.id)?.setLocalEulerAngles(0,b.turret*RAD,0);}for(const b of state.buildings){const e=this.facilities.get(b.id)||this.facility(b);e.setLocalScale(1,b.left>0?.35+.65*(1-b.left/BUILDINGS[b.type].time):1,1);for(const pole of e.findByTag('scaffold'))pole.enabled=b.left>0;this.guns.get(b.id)?.setLocalEulerAngles(0,b.turret*RAD,0);}for(const [id,e] of this.facilities)if(!state.buildings.some(b=>b.id===id)){e.destroy();this.facilities.delete(id);this.guns.delete(id);}for(const p of this.pumps){const point=state.points[p.id];p.flag.render!.meshInstances[0].material=this.mat(this.team(point.owner));}}
  home(){const b=this.state?.bases.find(b=>b.owner===this.me);if(b)this.focus.set(b.x,0,b.z+(b.z>0?-12:12));}
  team(id:string|null){const p=this.state?.players.find(p=>p.id===id);return p?COLORS[p.slot]:'#c3bea0';}
  private unit(u:Unit){const root=new pc.Entity(u.id),body=new pc.Entity('Body');this.world.addChild(root);root.addChild(body);root.setPosition(u.x,0,u.z);const asset=this.containers.get(u.type);let turret:pc.Entity|null=null;
    if(asset){const model=asset.instantiateRenderEntity();body.addChild(model);turret=model.findByName('Turret') as pc.Entity|null;}else{this.shape('box','Hull',0,.7,0,2.3,1,3.5,'#677959',body);}
    this.shape('box','Identification',0,1.49,-1.3,1.35,.035,.27,this.team(u.owner),body);
    const m={root,body,turret,last:new pc.Vec3(u.x,0,u.z),dust:0,recoil:0,smoke:0};this.models.set(u.id,m);return m;
  }
  markOrder(x:number,z:number,attack=false){this.orderMarker={x,z,attack,left:1.2};}
  event(event:GameEvent){if(event.type==='shot'&&this.effects.length<190){const from=new pc.Vec3(event.x,this.guns.has(event.from!)?5:1.9,event.z),to=new pc.Vec3(event.tx!,1,event.tz!),e=this.shape('sphere','Tracer',event.x,1.9,event.z,.15,.15,.5,'#ffe2a4');e.render!.meshInstances[0].material=this.mat('#ffdca1',true);this.effects.push({entity:e,life:.22,max:.22,from,to,type:'shot',size:.15});const m=this.models.get(event.from!);if(m)m.recoil=.2;this.particle('fire',event.x,from.y,event.z,.4,.1);this.particle('fire',event.tx!,.6,event.tz!,event.heavy?1.2:.5,.35);if(event.heavy)this.particle('dust',event.tx!,.15,event.tz!,2.7,1.1);}
    if(event.type==='explosion'){this.particle('fire',event.x,1,event.z,event.heavy?5:2,.7);for(let i=0;i<4;i++)this.particle('smoke',event.x+(i%2-.5),1+i*.4,event.z+(i/2-.5),1.5+i*.3,3+i*.25);const wreck=this.shape('box','Wreck',event.x,.4,event.z,2,.65,3,'#343e35');wreck.setEulerAngles(4,this.time*33,6);this.wrecks.push(wreck);if(this.wrecks.length>35)this.wrecks.shift()!.destroy();}}
  private particle(type:'fire'|'smoke'|'dust',x:number,y:number,z:number,size:number,life:number){if(this.effects.length>160)return;const hex=type==='fire'?'#e2a359':type==='smoke'?'#6e7567':'#afa27e';const e=this.shape('sphere',type,x,y,z,size,size,size,hex);e.render!.castShadows=false;if(type==='fire')e.render!.meshInstances[0].material=this.mat(hex,true);this.effects.push({entity:e,life,max:life,from:new pc.Vec3(x,y,z),to:new pc.Vec3(x+.7,y+(type==='dust'?.4:4),z),type,size});}
  screen(x:number,y:number,z:number){return this.camera.camera!.worldToScreen(new pc.Vec3(x,y,z));}
  worldAt(x:number,y:number){const a=this.camera.camera!.screenToWorld(x,y,1),b=this.camera.camera!.screenToWorld(x,y,300),d=b.sub(a);return a.add(d.mulScalar(-a.y/d.y));}
  hit(x:number,y:number,own=false){if(!this.state)return;return [...this.state.units,...(own?[]:[...this.state.bases,...this.state.buildings])].filter(u=>u.hp>0&&(!own||u.owner===this.me)).map(u=>({u,p:this.screen(u.x,1,u.z)})).filter(({p})=>Math.hypot(p.x-x,p.y-y)<22).sort((a,b)=>Math.hypot(a.p.x-x,a.p.y-y)-Math.hypot(b.p.x-x,b.p.y-y))[0]?.u;}
  private update(dt:number){this.time+=dt;if(this.orderMarker){this.orderMarker.left-=dt;if(this.orderMarker.left<=0)this.orderMarker=null;}this.onFrame?.(dt);const a=this.yaw/RAD;this.focus.x=pc.math.clamp(this.focus.x,-MAP.half+2,MAP.half-2);this.focus.z=pc.math.clamp(this.focus.z,-MAP.half+2,MAP.half-2);
    if(!this.state)this.yaw=30+Math.sin(this.time*.02)*6;
    this.camera.setPosition(this.focus.x+Math.sin(a)*this.zoom,this.zoom*.95,this.focus.z+Math.cos(a)*this.zoom);this.camera.lookAt(this.focus);this.camera.camera!.orthoHeight=this.zoom*.37;
    if(this.state){for(const u of this.state.units){const m=this.models.get(u.id)||this.unit(u);const pos=m.root.getPosition(),next=new pc.Vec3(pc.math.lerp(pos.x,u.x,Math.min(1,dt*15)),0,pc.math.lerp(pos.z,u.z,Math.min(1,dt*15)));m.root.setPosition(next);m.body.setLocalEulerAngles(0,pc.math.lerpAngle(m.body.getLocalEulerAngles().y,u.angle*RAD,Math.min(1,dt*8)),0);m.turret?.setLocalEulerAngles(0,(u.turret-m.body.getLocalEulerAngles().y/RAD)*RAD,0);m.recoil=Math.max(0,m.recoil-dt);const moving=next.distance(m.last)>.025;m.body.setLocalPosition(0,moving?Math.sin(this.time*15+u.x)*.025:0,-Math.sin(m.recoil/.2*Math.PI)*.14);m.smoke-=dt;if(u.hp/u.maxHp<.35&&m.smoke<=0){m.smoke=.8;this.particle('smoke',u.x,1.3,u.z,.45,1.5);}m.dust-=dt;if(next.distance(m.last)>.03&&m.dust<=0){m.dust=.35;this.particle('dust',u.x,.2,u.z,.42,.85);if(TYPES[u.type].speed<7){const trail=this.shape('plane','Track imprint',u.x,.008,u.z,2.4,1,.4,'#918467');trail.setEulerAngles(0,u.angle*RAD,0);this.trails.push(trail);if(this.trails.length>140)this.trails.shift()!.destroy();}}m.last.copy(next);}
      for(const [id,m] of this.models)if(!this.state.units.some(u=>u.id===id)){m.root.destroy();this.models.delete(id);}
    }
    for(const p of this.pumps)p.arm.setLocalEulerAngles(Math.sin(this.time*1.4+p.id)*13,0,0);
    for(const e of this.effects){e.life-=dt;const t=1-e.life/e.max;e.entity.setPosition(new pc.Vec3().lerp(e.from,e.to,t));if(e.type==='shot')e.entity.lookAt(e.to);else{const size=e.size*(e.type==='fire'?Math.sin(t*Math.PI):(.5+t));e.entity.setLocalScale(size,size,size);}if(e.life<=0)e.entity.destroy();}this.effects=this.effects.filter(e=>e.life>0);this.drawLabels();
  }
  private drawLabels(){const c=this.labels;c.clearRect(0,0,innerWidth,innerHeight);if(!this.state)return;c.font='10px "Segoe UI",sans-serif';c.textAlign='center';
    if(this.orderMarker){const m=this.orderMarker,p=this.screen(m.x,.12,m.z),radius=10+(1.2-m.left)*22;c.strokeStyle=m.attack?'#ffc2a1':'#d8efaf';c.globalAlpha=Math.min(1,m.left*2);c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,radius,radius*.55,0,0,Math.PI*2);c.stroke();c.fillStyle=c.strokeStyle;c.fillText(m.attack?'АТАКА':'ПРИКАЗ',p.x,p.y-18);c.globalAlpha=1;}
    for(const o of this.state.points){const p=this.screen(o.x,5.8,o.z);if(p.x<0||p.x>innerWidth||p.y<60||p.y>innerHeight)continue;c.fillStyle='#15221edf';c.fillRect(p.x-28,p.y-9,56,19);c.fillStyle=this.team(o.owner);c.fillText(o.contested?'СПОР':`◈ ${o.id+1}`,p.x,p.y+4);if(o.capture){c.fillStyle=this.team(o.captor);c.fillRect(p.x-28,p.y+11,56*o.capture,3);}}
    for(const u of this.state.units){const m=this.models.get(u.id);if(!m)continue;const pos=m.root.getPosition(),p=this.screen(pos.x,3.4,pos.z),ground=this.screen(pos.x,.12,pos.z),selected=this.selected.has(u.id);if(p.x<0||p.x>innerWidth||p.y<60||p.y>innerHeight)continue;
      if(selected&&this.showRanges){const r=TYPES[u.type].range||11;c.strokeStyle=this.team(u.owner)+'55';c.lineWidth=1;c.beginPath();for(let i=0;i<=48;i++){const a=i/48*Math.PI*2,p=this.screen(u.x+Math.cos(a)*r,.08,u.z+Math.sin(a)*r);if(!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.stroke();}
      const rank=veteranRank(u.kills);if(rank){c.fillStyle='#f3d395';c.fillText('★'.repeat(rank),p.x,p.y-8);}
      if(selected){c.strokeStyle=this.team(u.owner);c.lineWidth=1.6;const size=pc.math.clamp(135/this.zoom,1.3,5)*9;c.beginPath();c.ellipse(ground.x,ground.y,size,size*.57,0,0,Math.PI*2);c.stroke();}
      if(selected||u.hp<u.maxHp||u.owner!==this.me){c.fillStyle='#17271beb';c.fillRect(p.x-16,p.y-2,32,4);c.fillStyle=u.hp/u.maxHp<.3?'#eda17d':this.team(u.owner);c.fillRect(p.x-16,p.y-2,32*u.hp/u.maxHp,4);if(u.repairing){c.fillStyle='#d1eaa1';c.fillText('+',p.x+22,p.y+3);}}
      if(selected&&u.order){let prev=ground;c.strokeStyle=this.team(u.owner)+'88';c.lineWidth=1;c.setLineDash([4,5]);for(const w of u.waypoints){const d=this.screen(w.x,.15,w.z);c.beginPath();c.moveTo(prev.x,prev.y);c.lineTo(d.x,d.y);c.stroke();prev=d;}c.setLineDash([]);c.strokeRect(prev.x-3,prev.y-3,6,6);}
    }
    for(const b of this.state.buildings){const p=this.screen(b.x,6,b.z);if(p.x<0||p.x>innerWidth||p.y<60||p.y>innerHeight)continue;c.fillStyle='#18271ede';c.fillRect(p.x-53,p.y-12,106,21);c.fillStyle=b.powered?this.team(b.owner):'#f0b584';c.fillText(b.left>0?'СТРОИТСЯ '+Math.ceil(b.left)+'с':!b.powered?'НЕТ ЭНЕРГИИ':BUILDINGS[b.type].name,p.x,p.y+1);c.fillRect(p.x-53,p.y+11,106*Math.max(0,b.hp/b.maxHp),3);}
    if(this.placement){
      const {x,z,type}=this.placement,base=this.state.bases.find(b=>b.owner===this.me),valid=!placementError(this.state,this.me,type,x,z);
      const ring=(x:number,z:number,r:number,color:string)=>{c.strokeStyle=color;c.lineWidth=2;c.beginPath();for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,p=this.screen(x+Math.cos(a)*r,.1,z+Math.sin(a)*r);if(!i)c.moveTo(p.x,p.y);else c.lineTo(p.x,p.y);}c.stroke();};
      if(base)ring(base.x,base.z,MAP.buildRadius,'#d7eab366');ring(x,z,BUILDINGS[type].radius+1,valid?'#cdf994':'#ff8d79');
      if(BUILDINGS[type].range)ring(x,z,BUILDINGS[type].range,'#d7eab344');
      const p=this.screen(x,1,z);c.fillStyle=valid?'#e5ffd0':'#ffbba7';c.fillText(valid?'ЛКМ — построить':placementError(this.state,this.me,type,x,z)!,p.x,p.y-20);
    }
    for(const b of this.state.bases){if(b.hp<=0)continue;const p=this.screen(b.x,8,b.z);c.fillStyle='#18271ede';c.fillRect(p.x-38,p.y-12,76,21);c.fillStyle=this.team(b.owner);c.fillText(b.owner===this.me?'ВАШ ШТАБ':'ШТАБ',p.x,p.y+1);c.fillRect(p.x-38,p.y+11,76*b.hp/b.maxHp,3);}
  }
  drawMap(canvas:HTMLCanvasElement,preview=false){const c=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,xy=(x:number,z:number)=>[(x+MAP.half)/(MAP.half*2)*w,(z+MAP.half)/(MAP.half*2)*h];c.fillStyle='#25392f';c.fillRect(0,0,w,h);c.strokeStyle='#a2b98115';for(let i=1;i<8;i++){c.beginPath();c.moveTo(i*w/8,0);c.lineTo(i*w/8,h);c.stroke();c.beginPath();c.moveTo(0,i*h/8);c.lineTo(w,i*h/8);c.stroke();}
    for(const r of terrain()){const [x,y]=xy(r.x,r.z);c.fillStyle='#6d7958';c.beginPath();c.ellipse(x,y,r.r/(MAP.half*2)*w,r.r/(MAP.half*2)*h,0,0,Math.PI*2);c.fill();}
    const points=this.state?.points??MAPS.dunes.points.map(([x,z],id)=>({x,z,id,owner:null}));for(const o of points){const [x,y]=xy(o.x,o.z);c.strokeStyle=this.team(o.owner);c.lineWidth=1.5;c.strokeRect(x-4,y-4,8,8);}
    if(preview||!this.state){SPAWNS.forEach(([x,z],i)=>{const [px,py]=xy(x,z);c.fillStyle=COLORS[i];c.fillRect(px-6,py-6,12,12);c.font='10px sans-serif';c.textAlign='center';c.fillText('0'+(i+1),px,py+20);});return;}
    for(const b of this.state.bases){if(b.hp<=0)continue;const [x,y]=xy(b.x,b.z);c.fillStyle=this.team(b.owner);c.fillRect(x-5,y-4,10,8);}for(const u of this.state.units){const [x,y]=xy(u.x,u.z);c.fillStyle=this.team(u.owner);c.fillRect(x-1.5,y-1.5,3,3);}
    for(const b of this.state.buildings){const [x,y]=xy(b.x,b.z);c.fillStyle=b.powered?this.team(b.owner):'#edab79';c.fillRect(x-2.5,y-2.5,5,5);}
    c.strokeStyle='#d7e7bd';c.lineWidth=.8;c.beginPath();for(const [i,[x,y]] of [[0,[0,66]],[1,[innerWidth,66]],[2,[innerWidth,innerHeight]],[3,[0,innerHeight]]] as [number,[number,number]][]){const p=this.worldAt(x,y),[mx,my]=xy(p.x,p.z);if(i===0)c.moveTo(mx,my);else c.lineTo(mx,my);}c.closePath();c.stroke();
  }
}
