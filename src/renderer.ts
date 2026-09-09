import * as pc from 'playcanvas';
import {terrain,SPAWNS,MAPS} from '../server/simulation.mjs';
import {COLORS,type State,type Unit,type Point,type Base,type GameEvent,type Kind} from './types';

const RAD=180/Math.PI;
type Model={root:pc.Entity;body:pc.Entity;turret:pc.Entity|null;last:pc.Vec3;dust:number;recoil:number};
type Effect={entity:pc.Entity;life:number;max:number;from:pc.Vec3;to:pc.Vec3;type:'shot'|'fire'|'smoke'|'dust';size:number};
export class Battlefield {
  app:pc.Application;camera:pc.Entity;sun:pc.Entity;world:pc.Entity;
  focus=new pc.Vec3(0,0,0);zoom=68;yaw=30;state:State|null=null;me='';selected=new Set<string>();
  private materials=new Map<string,pc.StandardMaterial>();private containers=new Map<string,pc.ContainerResource>();
  private models=new Map<string,Model>();private bases=new Map<string,pc.Entity>();private pumps:{root:pc.Entity;arm:pc.Entity;flag:pc.Entity;id:number}[]=[];
  private effects:Effect[]=[];private wrecks:pc.Entity[]=[];private labels:CanvasRenderingContext2D;private hudCanvas:HTMLCanvasElement;
  private time=0;private groundTexture:pc.Texture|null=null;private groundMaterial:pc.StandardMaterial|null=null;
  onFrame:((dt:number)=>void)|null=null;onError:((message:string)=>void)|null=null;
  constructor(canvas:HTMLCanvasElement,hud:HTMLCanvasElement){
    this.app=new pc.Application(canvas,{graphicsDeviceOptions:{antialias:true,alpha:false,powerPreference:'high-performance'}});
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);this.app.setCanvasResolution(pc.RESOLUTION_AUTO);this.app.graphicsDevice.maxPixelRatio=Math.min(devicePixelRatio,1.5);
    this.app.scene.ambientLight=new pc.Color(.48,.53,.48);this.app.scene.fog.type='linear';this.app.scene.fog.color=new pc.Color(.44,.47,.40);this.app.scene.fog.start=145;this.app.scene.fog.end=260;
    this.camera=new pc.Entity('Camera');this.camera.addComponent('camera',{clearColor:new pc.Color(.44,.47,.40),projection:pc.PROJECTION_ORTHOGRAPHIC,orthoHeight:25,nearClip:.1,farClip:400});this.app.root.addChild(this.camera);
    this.sun=new pc.Entity('Sun');this.sun.addComponent('light',{type:'directional',color:new pc.Color(1,.91,.76),intensity:1.45,castShadows:true,shadowDistance:160,shadowResolution:2048,shadowBias:.04,normalOffsetBias:.05});this.sun.setEulerAngles(55,-35,0);this.app.root.addChild(this.sun);
    const fill=new pc.Entity('Sky fill');fill.addComponent('light',{type:'directional',color:new pc.Color(.76,.86,1),intensity:.45,castShadows:false});fill.setEulerAngles(38,145,0);this.app.root.addChild(fill);
    this.world=new pc.Entity('World');this.app.root.addChild(this.world);this.hudCanvas=hud;this.labels=hud.getContext('2d')!;
    this.app.on('update',(dt:number)=>this.update(Math.min(dt,.05)));this.app.start();window.addEventListener('resize',()=>this.resize());this.resize();
  }
  resize(){this.app.resizeCanvas();this.hudCanvas.width=innerWidth*devicePixelRatio;this.hudCanvas.height=innerHeight*devicePixelRatio;this.labels.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);}
  setQuality(q:string){this.app.graphicsDevice.maxPixelRatio=q==='low'?1:Math.min(devicePixelRatio,q==='high'?2:1.5);this.sun.light!.shadowResolution=q==='high'?4096:q==='low'?1024:2048;this.sun.light!.castShadows=q!=='low';this.resize();}
  async load(){const names=['tank','scout','artillery','rock0','rock1','rock2'];await Promise.all(names.map(name=>new Promise<void>(resolve=>{this.app.assets.loadFromUrl(`/models/${name}.glb`,'container',(err,asset)=>{if(!err&&asset)this.containers.set(name,asset.resource as pc.ContainerResource);else this.onError?.('Не удалось загрузить '+name);resolve();});})));this.preview();}
  private mat(hex:string,emissive=false){const key=hex+emissive;if(this.materials.has(key))return this.materials.get(key)!;const m=new pc.StandardMaterial();m.diffuse=new pc.Color().fromString(hex);m.useMetalness=true;m.gloss=.15;if(emissive){m.emissive=new pc.Color().fromString(hex);m.emissiveIntensity=1.3;}m.update();this.materials.set(key,m);return m;}
  private shape(type:string,name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,hex:string,parent=this.world){const e=new pc.Entity(name);e.addComponent('render',{type,material:this.mat(hex),castShadows:sy>.35&&type!=='plane',receiveShadows:true});e.setLocalPosition(x,y,z);e.setLocalScale(sx,sy,sz);parent.addChild(e);return e;}
  private beam(a:pc.Vec3,b:pc.Vec3,width:number,hex:string,parent=this.world){const d=b.clone().sub(a),e=this.shape('box','Support',0,0,0,width,width,d.length(),hex,parent);e.setLocalPosition(a.clone().add(b).mulScalar(.5));e.setLocalEulerAngles(-Math.atan2(d.y,Math.hypot(d.x,d.z))*RAD,Math.atan2(d.x,d.z)*RAD,0);return e;}
  private clear(){this.world.destroy();this.groundMaterial?.destroy();this.groundTexture?.destroy();this.world=new pc.Entity('World');this.app.root.addChild(this.world);this.models.clear();this.bases.clear();this.pumps=[];this.effects=[];this.wrecks=[];}
  private ground(){
    const t=document.createElement('canvas');t.width=t.height=1024;const c=t.getContext('2d')!,pixels=c.createImageData(1024,1024);let seed=73;const rnd=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
    for(let z=0;z<1024;z++)for(let x=0;x<1024;x++){const i=(z*1024+x)*4,n=(rnd()-.5)*12+Math.sin(x*.07+Math.sin(z*.014)*4)*2.5+Math.sin(z*.019+x*.011)*7;pixels.data[i]=154+n;pixels.data[i+1]=139+n;pixels.data[i+2]=105+n;pixels.data[i+3]=255;}c.putImageData(pixels,0,0);
    const px=(v:number)=>(v+72)/144*1024;c.strokeStyle='#c8b89344';c.lineCap='round';c.lineWidth=30;
    for(const [x,z] of SPAWNS){c.beginPath();c.moveTo(px(x),px(z));c.bezierCurveTo(px(x*.7),px(z),px(x*.45),px(z*.4),px(0),px(0));c.stroke();}
    for(let i=0;i<9000;i++){const x=rnd()*1024,y=rnd()*1024;c.fillStyle=rnd()>.5?'#4c513c20':'#eee1bd28';c.fillRect(x,y,rnd()*2+.5,rnd()*1.5+.5);}
    const texture=new pc.Texture(this.app.graphicsDevice,{mipmaps:true,anisotropy:8});texture.setSource(t);this.groundTexture=texture;const material=new pc.StandardMaterial();material.diffuseMap=texture;material.gloss=0;material.update();this.groundMaterial=material;
    this.shape('plane','Sand',0,-.02,0,144,1,144,'#a29471').render!.meshInstances[0].material=material;
    terrain().forEach((r,i)=>this.rock(r.x,r.z,r.r,r.h,i));
    // Скальные гряды за границей карты не мешают проходам внутри неё.
    for(let i=0;i<36;i++){const a=i/36*Math.PI*2,x=Math.cos(a)*76,z=Math.sin(a)*76;this.rock(x,z,4+rnd()*4,5+rnd()*6,i);}
    for(let i=0;i<280;i++){const x=rnd()*132-66,z=rnd()*132-66;if(terrain().some(r=>Math.hypot(r.x-x,r.z-z)<r.r+1))continue;if(i%3===0){const s=.16+rnd()*.3;this.shape('sphere','Stone',x,s*.3,z,s*2,s*.7,s,'#8c846c');}else{for(let k=0;k<2;k++){const tuft=this.shape('cone','Dry grass',x+(rnd()-.5)*.5,.16,z,.14,.35,.14,'#777b56');tuft.setEulerAngles(rnd()*35,rnd()*180,20);}}}
    // Пограничные столбики и небольшие руины за игровым периметром.
    for(let i=-60;i<=60;i+=12)for(const [x,z] of [[i,-60],[i,60],[-60,i],[60,i]]){this.shape('box','Boundary post',x,.45,z,.16,.9,.16,'#928e71');this.shape('box','Marker',x,.83,z,.24,.18,.24,'#d9c89b');}
    for(const z of [-65,65]){for(let i=0;i<4;i++){const wall=this.shape('box','Ruined wall',-8+i*4,1+(i%2)*.5,z,3.7,2+(i%2),.8,'#8d876e');wall.setEulerAngles(0,6,0);}for(let i=0;i<8;i++)this.shape('box','Rubble',-10+i*3,.25,z+3,1.2,.5,.8,'#88836b').setEulerAngles(0,i*17,9);}
  }
  private rock(x:number,z:number,r:number,h:number,i:number){const asset=this.containers.get('rock'+i%3);if(asset){const e=asset.instantiateRenderEntity();this.world.addChild(e);e.setPosition(x,h*.18,z);e.setLocalScale(r,h,r);e.setEulerAngles(0,i*71,0);}else this.shape('sphere','Rock',x,h*.3,z,r*2,h,r*1.7,'#95836a');}
  private base(b:Base,hex:string){const root=new pc.Entity(b.id);this.world.addChild(root);root.setPosition(b.x,0,b.z);this.bases.set(b.id,root);
    this.shape('box','Concrete foundation',0,.08,0,11,.16,10,'#878b7b',root);this.shape('box','Hangar',0,1.65,0,7,3.1,5.5,'#59685d',root);this.shape('box','Roof',0,3.27,0,7.2,.24,5.8,'#84917b',root);
    this.shape('box','Entrance',0,1.2,2.79,4.4,2.4,.07,'#1d2d29',root);for(let i=-2;i<=2;i++)this.shape('box','Door slat',i*.75,1.2,2.85,.07,2.3,.07,'#63735f',root);
    for(const x of [-3.2,3.2]){this.shape('box','Team paint',x,1.7,2.83,.25,2.7,.06,hex,root);this.shape('box','Lamp',x,2.9,2.92,.2,.15,.15,'#e6d6a1',root);}
    for(let i=0;i<4;i++)this.shape('box','Vent',-.8+i*.55,3.47,0,.28,.2,1.6,'#34483d',root);
    this.shape('box','Utility room',3.8,.85,-.4,2.2,1.7,3.5,'#69776a',root);this.shape('cylinder','Tank',-4,1.1,-1.3,1.5,2.2,1.5,'#9c9c84',root);
    this.shape('cylinder','Mast',3.7,4,-3.5,.12,8,.12,'#7e8b78',root);for(const x of [2.4,5])this.beam(new pc.Vec3(x,0,-3.5),new pc.Vec3(3.7,5,-3.5),.05,'#6a7c67',root);
    const radar=this.shape('sphere','Radar dish',3.7,7,-3.5,2.2,.25,1.7,'#b1b69e',root);radar.setEulerAngles(30,0,25);this.shape('box','Flag',4.6,5.4,-3.5,1.8,.8,.04,hex,root);
    for(let i=0;i<5;i++)this.shape('box','Supplies',-4.2+i*.7,.48,3.6,.6,.9,.85,'#718168',root);
    this.shape('plane','Service apron',0,.025,b.z>0?-11:11,7,1,5,'#989985',root);for(const x of [-3,3])this.shape('box','Repair line',x,.05,b.z>0?-11:11,.12,.025,5,'#d5d1a2',root);
  }
  private pump(o:Point){const root=new pc.Entity('Oil '+o.id);this.world.addChild(root);root.setPosition(o.x,0,o.z);
    this.shape('box','Foundation',0,.1,0,4.4,.2,4.5,'#8e8e79',root);for(const x of [-.8,.8]){this.beam(new pc.Vec3(x,0,-1),new pc.Vec3(x,3.8,0),.16,'#465c50',root);this.beam(new pc.Vec3(x,0,1.1),new pc.Vec3(x,3.8,0),.16,'#465c50',root);}
    const arm=new pc.Entity('Pump arm');root.addChild(arm);arm.setLocalPosition(0,3.9,0);this.shape('box','Beam',0,0,0,.3,.4,4.2,'#a69e76',arm);this.shape('box','Horse head',0,-.5,-2,.6,1.2,.4,'#536454',arm);
    this.shape('cylinder','Rod',0,1.5,-2,.07,3,.07,'#b6bba1',root);this.shape('box','Engine',1.7,.5,.7,1.2,.9,1.5,'#6c7a60',root);this.shape('cylinder','Storage',-2,1.1,1,1,2.2,1,'#969b7c',root);
    this.shape('cylinder','Flagpole',2,2.2,-1,.06,4.4,.06,'#aeb697',root);const flag=this.shape('box','Flag',2.6,4,-1,1.2,.6,.04,'#bfc4a4',root);this.pumps.push({root,arm,flag,id:o.id});
  }
  preview(){if(this.state)return;this.clear();this.ground();this.focus.set(-2,0,4);this.zoom=70;this.base({id:'preview-base',owner:'',x:-22,z:17,hp:1,maxHp:1},COLORS[0]);MAPS.dunes.points.forEach(([x,z],id)=>this.pump({id,x,z,owner:null,captor:null,capture:0,contested:false}));(['tank','scout','artillery'] as Kind[]).forEach((type,i)=>{this.unit({id:'preview-'+i,owner:'',type,x:4+i*5,z:2-i*3,hp:1,maxHp:1,angle:.2,turret:.2,repairing:false,order:null,waypoints:[]});});}
  begin(state:State,me:string){this.state=state;this.me=me;this.clear();this.ground();for(const b of state.bases)this.base(b,this.team(b.owner));for(const p of state.points)this.pump(p);this.home();this.zoom=65;}
  sync(state:State){this.state=state;for(const b of state.bases){const e=this.bases.get(b.id);if(e)e.enabled=b.hp>0;}for(const p of this.pumps){const point=state.points[p.id];p.flag.render!.meshInstances[0].material=this.mat(this.team(point.owner));}}
  home(){const b=this.state?.bases.find(b=>b.owner===this.me);if(b)this.focus.set(b.x,0,b.z+(b.z>0?-7:7));}
  team(id:string|null){const p=this.state?.players.find(p=>p.id===id);return p?COLORS[p.slot]:'#c3bea0';}
  private unit(u:Unit){const root=new pc.Entity(u.id),body=new pc.Entity('Body');this.world.addChild(root);root.addChild(body);root.setPosition(u.x,0,u.z);const asset=this.containers.get(u.type);let turret:pc.Entity|null=null;
    if(asset){const model=asset.instantiateRenderEntity();body.addChild(model);turret=model.findByName('Turret') as pc.Entity|null;}else{this.shape('box','Hull',0,.7,0,2.3,1,3.5,'#677959',body);}
    this.shape('box','Identification',0,1.49,-1.3,1.35,.035,.27,this.team(u.owner),body);
    const m={root,body,turret,last:new pc.Vec3(u.x,0,u.z),dust:0,recoil:0};this.models.set(u.id,m);return m;
  }
  event(event:GameEvent){if(event.type==='shot'){const from=new pc.Vec3(event.x,1.9,event.z),to=new pc.Vec3(event.tx!,1,event.tz!),e=this.shape('sphere','Tracer',event.x,1.9,event.z,.15,.15,.5,'#ffe2a4');e.render!.meshInstances[0].material=this.mat('#ffdca1',true);this.effects.push({entity:e,life:.22,max:.22,from,to,type:'shot',size:.15});const m=this.models.get(event.from!);if(m)m.recoil=.2;this.particle('fire',event.tx!,.6,event.tz!,event.heavy?1.2:.5,.35);}
    if(event.type==='explosion'){this.particle('fire',event.x,1,event.z,event.heavy?5:2,.7);for(let i=0;i<4;i++)this.particle('smoke',event.x+(i%2-.5),1+i*.4,event.z+(i/2-.5),1.5+i*.3,3+i*.25);const wreck=this.shape('box','Wreck',event.x,.4,event.z,2,.65,3,'#343e35');wreck.setEulerAngles(4,this.time*33,6);this.wrecks.push(wreck);if(this.wrecks.length>35)this.wrecks.shift()!.destroy();}}
  private particle(type:'fire'|'smoke'|'dust',x:number,y:number,z:number,size:number,life:number){if(this.effects.length>160)return;const hex=type==='fire'?'#e2a359':type==='smoke'?'#6e7567':'#afa27e';const e=this.shape('sphere',type,x,y,z,size,size,size,hex);e.render!.castShadows=false;if(type==='fire')e.render!.meshInstances[0].material=this.mat(hex,true);this.effects.push({entity:e,life,max:life,from:new pc.Vec3(x,y,z),to:new pc.Vec3(x+.7,y+(type==='dust'?.4:4),z),type,size});}
  screen(x:number,y:number,z:number){return this.camera.camera!.worldToScreen(new pc.Vec3(x,y,z));}
  worldAt(x:number,y:number){const a=this.camera.camera!.screenToWorld(x,y,1),b=this.camera.camera!.screenToWorld(x,y,300),d=b.sub(a);return a.add(d.mulScalar(-a.y/d.y));}
  hit(x:number,y:number,own=false){if(!this.state)return;return [...this.state.units,...(own?[]:this.state.bases)].filter(u=>u.hp>0&&(!own||u.owner===this.me)).map(u=>({u,p:this.screen(u.x,1,u.z)})).filter(({p})=>Math.hypot(p.x-x,p.y-y)<22).sort((a,b)=>Math.hypot(a.p.x-x,a.p.y-y)-Math.hypot(b.p.x-x,b.p.y-y))[0]?.u;}
  private update(dt:number){this.time+=dt;this.onFrame?.(dt);const a=this.yaw/RAD;this.focus.x=pc.math.clamp(this.focus.x,-58,58);this.focus.z=pc.math.clamp(this.focus.z,-58,58);
    if(!this.state)this.yaw=30+Math.sin(this.time*.02)*6;
    this.camera.setPosition(this.focus.x+Math.sin(a)*this.zoom,this.zoom*.95,this.focus.z+Math.cos(a)*this.zoom);this.camera.lookAt(this.focus);this.camera.camera!.orthoHeight=this.zoom*.37;
    if(this.state){for(const u of this.state.units){const m=this.models.get(u.id)||this.unit(u);const pos=m.root.getPosition(),next=new pc.Vec3(pc.math.lerp(pos.x,u.x,Math.min(1,dt*15)),0,pc.math.lerp(pos.z,u.z,Math.min(1,dt*15)));m.root.setPosition(next);m.body.setLocalEulerAngles(0,pc.math.lerpAngle(m.body.getLocalEulerAngles().y,u.angle*RAD,Math.min(1,dt*8)),0);m.turret?.setLocalEulerAngles(0,(u.turret-m.body.getLocalEulerAngles().y/RAD)*RAD,0);m.recoil=Math.max(0,m.recoil-dt);m.body.setLocalPosition(0,0,-Math.sin(m.recoil/.2*Math.PI)*.14);m.dust-=dt;if(next.distance(m.last)>.03&&m.dust<=0){m.dust=.35;this.particle('dust',u.x,.2,u.z,.42,.85);}m.last.copy(next);}
      for(const [id,m] of this.models)if(!this.state.units.some(u=>u.id===id)){m.root.destroy();this.models.delete(id);}
    }
    for(const p of this.pumps)p.arm.setLocalEulerAngles(Math.sin(this.time*1.4+p.id)*13,0,0);
    for(const e of this.effects){e.life-=dt;const t=1-e.life/e.max;e.entity.setPosition(new pc.Vec3().lerp(e.from,e.to,t));if(e.type==='shot')e.entity.lookAt(e.to);else{const size=e.size*(e.type==='fire'?Math.sin(t*Math.PI):(.5+t));e.entity.setLocalScale(size,size,size);}if(e.life<=0)e.entity.destroy();}this.effects=this.effects.filter(e=>e.life>0);this.drawLabels();
  }
  private drawLabels(){const c=this.labels;c.clearRect(0,0,innerWidth,innerHeight);if(!this.state)return;c.font='10px "Segoe UI",sans-serif';c.textAlign='center';
    for(const o of this.state.points){const p=this.screen(o.x,5.8,o.z);if(p.x<0||p.x>innerWidth||p.y<60||p.y>innerHeight)continue;c.fillStyle='#15221edf';c.fillRect(p.x-28,p.y-9,56,19);c.fillStyle=this.team(o.owner);c.fillText(o.contested?'СПОР':`◈ ${o.id+1}`,p.x,p.y+4);if(o.capture){c.fillStyle=this.team(o.captor);c.fillRect(p.x-28,p.y+11,56*o.capture,3);}}
    for(const u of this.state.units){const m=this.models.get(u.id);if(!m)continue;const pos=m.root.getPosition(),p=this.screen(pos.x,3.4,pos.z),ground=this.screen(pos.x,.12,pos.z),selected=this.selected.has(u.id);if(p.x<0||p.x>innerWidth||p.y<60||p.y>innerHeight)continue;
      if(selected){c.strokeStyle=this.team(u.owner);c.lineWidth=1.6;const size=pc.math.clamp(135/this.zoom,1.3,5)*9;c.beginPath();c.ellipse(ground.x,ground.y,size,size*.57,0,0,Math.PI*2);c.stroke();}
      if(selected||u.hp<u.maxHp||u.owner!==this.me){c.fillStyle='#17271beb';c.fillRect(p.x-16,p.y-2,32,4);c.fillStyle=u.hp/u.maxHp<.3?'#eda17d':this.team(u.owner);c.fillRect(p.x-16,p.y-2,32*u.hp/u.maxHp,4);if(u.repairing){c.fillStyle='#d1eaa1';c.fillText('+',p.x+22,p.y+3);}}
      if(selected&&u.order){let prev=ground;c.strokeStyle=this.team(u.owner)+'88';c.lineWidth=1;c.setLineDash([4,5]);for(const w of u.waypoints){const d=this.screen(w.x,.15,w.z);c.beginPath();c.moveTo(prev.x,prev.y);c.lineTo(d.x,d.y);c.stroke();prev=d;}c.setLineDash([]);c.strokeRect(prev.x-3,prev.y-3,6,6);}
    }
    for(const b of this.state.bases){if(b.hp<=0)continue;const p=this.screen(b.x,8,b.z);c.fillStyle='#18271ede';c.fillRect(p.x-38,p.y-12,76,21);c.fillStyle=this.team(b.owner);c.fillText(b.owner===this.me?'ВАШ ШТАБ':'ШТАБ',p.x,p.y+1);c.fillRect(p.x-38,p.y+11,76*b.hp/b.maxHp,3);}
  }
  drawMap(canvas:HTMLCanvasElement,preview=false){const c=canvas.getContext('2d')!,w=canvas.width,h=canvas.height,xy=(x:number,z:number)=>[(x+62)/124*w,(z+62)/124*h];c.fillStyle='#25392f';c.fillRect(0,0,w,h);c.strokeStyle='#a2b98115';for(let i=1;i<8;i++){c.beginPath();c.moveTo(i*w/8,0);c.lineTo(i*w/8,h);c.stroke();c.beginPath();c.moveTo(0,i*h/8);c.lineTo(w,i*h/8);c.stroke();}
    for(const r of terrain()){const [x,y]=xy(r.x,r.z);c.fillStyle='#6d7958';c.beginPath();c.ellipse(x,y,r.r/124*w,r.r/124*h,0,0,Math.PI*2);c.fill();}
    const points=this.state?.points??MAPS.dunes.points.map(([x,z],id)=>({x,z,id,owner:null}));for(const o of points){const [x,y]=xy(o.x,o.z);c.strokeStyle=this.team(o.owner);c.lineWidth=1.5;c.strokeRect(x-4,y-4,8,8);}
    if(preview||!this.state){SPAWNS.forEach(([x,z],i)=>{const [px,py]=xy(x,z);c.fillStyle=COLORS[i];c.fillRect(px-6,py-6,12,12);c.font='10px sans-serif';c.textAlign='center';c.fillText('0'+(i+1),px,py+20);});return;}
    for(const b of this.state.bases){if(b.hp<=0)continue;const [x,y]=xy(b.x,b.z);c.fillStyle=this.team(b.owner);c.fillRect(x-5,y-4,10,8);}for(const u of this.state.units){const [x,y]=xy(u.x,u.z);c.fillStyle=this.team(u.owner);c.fillRect(x-1.5,y-1.5,3,3);}
    c.strokeStyle='#d7e7bd';c.lineWidth=.8;c.beginPath();for(const [i,[x,y]] of [[0,[0,66]],[1,[innerWidth,66]],[2,[innerWidth,innerHeight]],[3,[0,innerHeight]]] as [number,[number,number]][]){const p=this.worldAt(x,y),[mx,my]=xy(p.x,p.z);if(i===0)c.moveTo(mx,my);else c.lineTo(mx,my);}c.closePath();c.stroke();
  }
}
