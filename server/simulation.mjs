import {findPath,obstacles,clearSegment} from './navigation.mjs';
export const TYPES = {
  tank: {name:'Бастион',role:'Основной боевой танк',cost:300,time:8,hp:300,speed:5,range:21,damage:38,reload:1.7},
  scout: {name:'Вектор',role:'Разведывательный БТР',cost:180,time:5,hp:155,speed:8.5,range:16,damage:14,reload:.65},
  artillery: {name:'Гром',role:'Самоходная артиллерия',cost:420,time:10,hp:165,speed:3.8,range:34,damage:72,reload:3.4},
};
export const MAPS = {
  dunes:{name:'Железные дюны',seed:73,description:'Пустынное плато · 4 позиции · 5 нефтяных вышек',points:[[0,0],[-22,20],[22,-20],[22,20],[-22,-20]]},
};
export const SPAWNS=[[-42,35],[42,-35],[42,35],[-42,-35]];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function terrain(_map='dunes'){return [[9,23,3.6,5.5],[31,5,4.2,7],[47,16,3.2,4],[13,46,5.2,7.5]].flatMap(([x,z,r,h])=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz])=>({x:x*sx,z:z*sz,r,h})));}
export function createMatch(players,map='dunes'){
  const s={time:0,tick:0,map,units:[],bases:[],points:MAPS[map].points.map(([x,z],id)=>({id,x,z,owner:null,capture:0,captor:null,contested:false})),players:players.map(p=>({id:p.id,slot:p.slot,name:p.name,credits:800,queue:[],alive:true,kills:0,produced:0,rally:null})),events:[],nextId:1,winner:null,ended:false,rocks:terrain(map)};
  for(const p of s.players){const [x,z]=SPAWNS[p.slot],dir=z>0?-1:1;s.bases.push({id:'base-'+p.id,owner:p.id,x,z,hp:2400,maxHp:2400});p.rally={x,z:z+dir*14};for(let i=0;i<6;i++)spawn(s,p.id,i<3?'tank':i<5?'scout':'artillery',x+(i%3)*4.2-4.2,z+dir*(10+Math.floor(i/3)*4.4));}return s;
}
export function spawn(s,owner,type,x,z){const t=TYPES[type],u={id:'u'+s.nextId++,owner,type,x,z,hp:t.hp,maxHp:t.hp,angle:0,turret:0,cooldown:0,order:null,orders:[],path:[],repath:0,damagedAt:-20,repairing:false};s.units.push(u);return u;}
function assign(s,u,order){u.order=order;u.path=order?findPath(u,order,obstacles(s)):[];u.repath=0;}
export function command(s,owner,c){
  const p=s.players.find(p=>p.id===owner);if(!p?.alive||s.ended)return 'Матч завершён для вас';if(!c||typeof c!=='object')return 'Неверный приказ';
  if(c.type==='produce'){const t=typeof c.unit==='string'&&Object.hasOwn(TYPES,c.unit)?TYPES[c.unit]:null;if(!t)return 'Неизвестная техника';if(p.queue.length>=5)return 'Очередь заполнена';if(s.units.filter(u=>u.owner===owner).length+p.queue.length>=30)return 'Лимит техники: 30';if(p.credits<t.cost)return 'Недостаточно ресурсов';p.credits-=t.cost;p.queue.push({id:'q'+s.nextId++,type:c.unit,left:t.time});return null;}
  if(c.type==='cancel'){const index=p.queue.findIndex(q=>q.id===c.id);if(index<0)return 'Заказ уже выполнен';const [q]=p.queue.splice(index,1);p.credits+=TYPES[q.type].cost;return null;}
  if(c.type==='rally'){if(!Number.isFinite(c.x)||!Number.isFinite(c.z))return 'Неверная позиция';p.rally={x:clamp(c.x,-56,56),z:clamp(c.z,-56,56)};return null;}
  if(!['move','attack','stop','hold'].includes(c.type)||!Array.isArray(c.ids)||c.ids.length>30)return 'Неверный приказ';
  if(!['stop','hold'].includes(c.type)&&(!Number.isFinite(c.x)||!Number.isFinite(c.z)))return 'Неверная позиция';
  const units=s.units.filter(u=>u.owner===owner&&c.ids.includes(u.id));
  units.forEach((u,i)=>{if(c.type==='stop'||c.type==='hold'){u.orders=[];assign(s,u,null);return;}const order={type:c.type,x:clamp(c.x+(i%5-Math.min(units.length-1,4)/2)*3.5,-56,56),z:clamp(c.z+Math.floor(i/5)*3.5,-56,56),target:typeof c.target==='string'?c.target:null};if(c.append&&u.order){if(u.orders.length<8)u.orders.push(order);}else{u.orders=[];assign(s,u,order);}});return null;
}
export function eliminate(s,id){const p=s.players.find(p=>p.id===id);if(!p?.alive)return;p.alive=false;p.queue=[];s.units=s.units.filter(u=>u.owner!==id);const base=s.bases.find(b=>b.owner===id);base.hp=0;for(const o of s.points)if(o.owner===id)o.owner=null;}
export function step(s,dt){
  if(s.ended)return;s.time+=dt;s.tick++;s.events=[];const blocks=obstacles(s);
  for(const p of s.players){if(!p.alive)continue;p.credits=Math.min(99999,p.credits+dt*(4+s.points.filter(o=>o.owner===p.id).length*12));if(p.queue.length){p.queue[0].left-=dt;if(p.queue[0].left<=0){const b=s.bases.find(b=>b.owner===p.id),q=p.queue.shift(),u=spawn(s,p.id,q.type,b.x+(s.nextId%3-1)*3.5,b.z+(b.z>0?-10:10));p.produced++;if(p.rally)assign(s,u,{type:'move',...p.rally,target:null});s.events.push({type:'produced',owner:p.id,unit:q.type,x:u.x,z:u.z});}}}
  const targets=[...s.units,...s.bases];
  for(const u of s.units){if(u.hp<=0)continue;const t=TYPES[u.type];u.cooldown-=dt;u.repath-=dt;u.repairing=false;
    const enemies=targets.filter(e=>e.owner!==u.owner&&e.hp>0);let target=u.order?.target?enemies.find(e=>e.id===u.order.target):null;
    const canFire=e=>distance(e,u)<=t.range&&(u.type==='artillery'||clearSegment(u,e,s.rocks,.2));
    if(!target)target=enemies.filter(canFire).sort((a,b)=>distance(a,u)-distance(b,u))[0];const inRange=target&&canFire(target);
    if(inRange){u.turret=Math.atan2(target.x-u.x,target.z-u.z);if(u.cooldown<=0){u.cooldown=t.reload;const wasAlive=target.hp>0;target.hp-=t.damage;target.damagedAt=s.time;s.events.push({type:'shot',from:u.id,owner:u.owner,x:u.x,z:u.z,tx:target.x,tz:target.z,heavy:u.type==='artillery'});if(wasAlive&&target.hp<=0)s.players.find(p=>p.id===u.owner).kills++;}}
    if(u.order&&!(inRange&&u.order.type==='attack')){
      if(u.order.target&&target&&u.repath<=0){u.path=findPath(u,target,blocks);u.repath=1;}
      if(u.path.length){const dest=u.path[0],d=distance(u,dest);if(d<.6){u.path.shift();}else{const v=Math.min(d,t.speed*dt);u.x+=(dest.x-u.x)/d*v;u.z+=(dest.z-u.z)/d*v;u.angle=Math.atan2(dest.x-u.x,dest.z-u.z);if(!inRange)u.turret=u.angle;}}
      if(!u.path.length&&!u.order.target)assign(s,u,u.orders.shift()??null);
      if(u.order?.target&&!enemies.some(e=>e.id===u.order.target))assign(s,u,u.orders.shift()??null);
    }
    const base=s.bases.find(b=>b.owner===u.owner);if(base?.hp>0&&distance(base,u)<17&&s.time-u.damagedAt>5&&u.hp<u.maxHp&&!inRange){u.hp=Math.min(u.maxHp,u.hp+dt*8);u.repairing=true;}
  }
  // Раздвигание корпусов и жёсткая граница препятствий после шага движения.
  for(let i=0;i<s.units.length;i++){const a=s.units[i];for(let j=i+1;j<s.units.length;j++){const b=s.units[j],dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d<2.5){const nx=d>0?dx/d:1,nz=d>0?dz/d:0,n=(2.5-d)*.5;a.x+=nx*n;a.z+=nz*n;b.x-=nx*n;b.z-=nz*n;}}for(const r of blocks){const dx=a.x-r.x,dz=a.z-r.z,d=Math.hypot(dx,dz);if(d<r.r+1.25){a.x=r.x+(d?dx/d:1)*(r.r+1.25);a.z=r.z+(d?dz/d:0)*(r.r+1.25);}}a.x=clamp(a.x,-58,58);a.z=clamp(a.z,-58,58);}
  for(const u of s.units.filter(u=>u.hp<=0))s.events.push({type:'explosion',x:u.x,z:u.z});s.units=s.units.filter(u=>u.hp>0);
  for(const b of s.bases)if(b.hp<=0&&s.players.find(p=>p.id===b.owner).alive){s.events.push({type:'explosion',x:b.x,z:b.z,heavy:true});eliminate(s,b.owner);}
  for(const o of s.points){const owners=[...new Set(s.units.filter(u=>distance(u,o)<8).map(u=>u.owner))];o.contested=owners.length>1;if(owners.length===1&&owners[0]!==o.owner){if(o.captor!==owners[0]){o.captor=owners[0];o.capture=0;}o.capture+=dt/8;if(o.capture>=1){o.owner=owners[0];o.capture=0;o.captor=null;s.events.push({type:'capture',owner:o.owner,x:o.x,z:o.z});}}else{o.capture=Math.max(0,o.capture-dt/8);if(!o.capture)o.captor=null;}}
  const alive=s.players.filter(p=>p.alive);if(alive.length<=1){s.ended=true;s.winner=alive[0]?.id??null;}
}
export function snapshot(s){const {rocks,nextId,...rest}=s;return {...rest,units:s.units.map(({path,orders,cooldown,repath,damagedAt,...u})=>({...u,waypoints:[...(u.order?[{x:u.order.x,z:u.order.z}]:[]),...orders.map(o=>({x:o.x,z:o.z}))]}))};}
