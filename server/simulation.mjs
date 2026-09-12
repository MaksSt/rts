import {findPath,obstacles,clearSegment} from './navigation.mjs';
import {TYPES,MAPS,SPAWNS,MAP,BUILDINGS,UPGRADES,terrain,economy,placementError,FORMATIONS,formationOffset,veteranRank} from './rules.mjs';
export {TYPES,MAPS,SPAWNS,terrain} from './rules.mjs';
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createMatch(players,map='dunes'){
  const s={time:0,tick:0,map,units:[],bases:[],buildings:[],points:MAPS[map].points.map(([x,z],id)=>({id,x,z,owner:null,capture:0,captor:null,contested:false})),players:players.map(p=>({id:p.id,slot:p.slot,name:p.name,credits:1200,queue:[],upgrades:{weapons:0,armor:0,logistics:0,repair:0},research:null,alive:true,kills:0,produced:0,rally:null})),events:[],nextId:1,winner:null,ended:false,rocks:terrain(map)};
  for(const p of s.players){const [x,z]=SPAWNS[p.slot],dir=z>0?-1:1;s.bases.push({id:'base-'+p.id,owner:p.id,x,z,hp:3200,maxHp:3200,turret:0,cooldown:0,damagedAt:-20});p.rally={x,z:z+dir*23};for(let i=0;i<6;i++)spawn(s,p.id,i<3?'tank':i<5?'scout':'artillery',x+(i%3)*4.2-4.2,z+dir*(16+Math.floor(i/3)*4.4));}return s;
}
export function spawn(s,owner,type,x,z){const t=TYPES[type],u={id:'u'+s.nextId++,owner,type,x,z,hp:t.hp,maxHp:t.hp,angle:0,turret:0,kills:0,cooldown:0,order:null,orders:[],path:[],repath:0,damagedAt:-20,repairing:false};s.units.push(u);return u;}
function assign(s,u,order,blocks=obstacles(s)){u.order=order;u.path=order?findPath(u,order,blocks):[];u.repath=0;}
export function command(s,owner,c){
  const p=s.players.find(p=>p.id===owner);if(!p?.alive||s.ended)return 'Матч завершён для вас';if(!c||typeof c!=='object')return 'Неверный приказ';
  if(c.type==='produce'){
    const t=typeof c.unit==='string'&&Object.hasOwn(TYPES,c.unit)?TYPES[c.unit]:null;
    if(!t)return 'Неизвестная техника';if(p.upgrades.logistics<t.tier)return 'Требуется Военная промышленность I';if(p.queue.length>=5)return 'Очередь заполнена';if(s.units.filter(u=>u.owner===owner).length+p.queue.length>=30)return 'Лимит техники: 30';if(p.credits<t.cost)return 'Недостаточно ресурсов';
    p.credits-=t.cost;p.queue.push({id:'q'+s.nextId++,type:c.unit,left:t.time});return null;
  }
  if(c.type==='cancel'){const index=p.queue.findIndex(q=>q.id===c.id);if(index<0)return 'Заказ уже выполнен';const [q]=p.queue.splice(index,1);p.credits+=TYPES[q.type].cost;return null;}
  if(c.type==='build'){
    const error=placementError(s,owner,c.building,c.x,c.z);if(error)return error;const t=BUILDINGS[c.building];
    if(p.upgrades.logistics<t.tier)return 'Требуется Военная промышленность I';if(s.buildings.filter(b=>b.owner===owner&&b.type===c.building&&b.hp>0).length>=t.limit)return 'Лимит построек этого типа';if(p.credits<t.cost)return 'Недостаточно ресурсов';
    const power=economy(s,owner);if(t.power>0&&power.demand+t.power>power.capacity)return 'Недостаточно энергии. Постройте электростанцию';
    p.credits-=t.cost;s.buildings.push({id:'b'+s.nextId++,owner,type:c.building,x:c.x,z:c.z,hp:t.hp,maxHp:t.hp,left:t.time,turret:0,cooldown:0,damagedAt:-20});
    const blocks=obstacles(s);for(const u of s.units)if(u.order)assign(s,u,u.order,blocks);return null;
  }
  if(c.type==='cancelBuild'){const b=s.buildings.find(b=>b.id===c.id&&b.owner===owner&&b.hp>0);if(!b||b.left<=0)return 'Можно отменить только незавершённую стройку';p.credits+=Math.floor(BUILDINGS[b.type].cost*.75*b.hp/b.maxHp);s.buildings=s.buildings.filter(x=>x!==b);return null;}
  if(c.type==='upgrade'){
    const t=typeof c.upgrade==='string'&&Object.hasOwn(UPGRADES,c.upgrade)?UPGRADES[c.upgrade]:null;if(!t)return 'Неизвестное улучшение';if(p.research)return 'Уже выполняется улучшение';const level=p.upgrades[c.upgrade];if(level>=t.max)return 'Максимальный уровень';const cost=t.cost*(level+1);if(p.credits<cost)return 'Недостаточно ресурсов';p.credits-=cost;p.research={type:c.upgrade,left:t.time*(level+1),total:t.time*(level+1)};return null;
  }
  if(c.type==='rally'){if(!Number.isFinite(c.x)||!Number.isFinite(c.z))return 'Неверная позиция';p.rally={x:clamp(c.x,-MAP.half+2,MAP.half-2),z:clamp(c.z,-MAP.half+2,MAP.half-2)};return null;}
  if(!['move','attack','stop','hold'].includes(c.type)||!Array.isArray(c.ids)||c.ids.length>30)return 'Неверный приказ';
  if(!['stop','hold'].includes(c.type)&&(!Number.isFinite(c.x)||!Number.isFinite(c.z)))return 'Неверная позиция';
  if(c.formation!==undefined&&!Object.hasOwn(FORMATIONS,c.formation))return 'Неизвестное построение';
  const units=s.units.filter(u=>u.owner===owner&&c.ids.includes(u.id)),blocks=obstacles(s);
  units.forEach((u,i)=>{if(c.type==='stop'||c.type==='hold'){u.orders=[];assign(s,u,null,blocks);return;}const offset=formationOffset(i,units.length,c.formation);const order={type:c.type,x:clamp(c.x+offset.x,-MAP.half+2,MAP.half-2),z:clamp(c.z+offset.z,-MAP.half+2,MAP.half-2),target:typeof c.target==='string'?c.target:null};if(c.append&&u.order){if(u.orders.length<8)u.orders.push(order);}else{u.orders=[];assign(s,u,order,blocks);}});return null;
}
export function eliminate(s,id){const p=s.players.find(p=>p.id===id);if(!p?.alive)return;p.alive=false;p.queue=[];p.research=null;s.units=s.units.filter(u=>u.owner!==id);s.buildings=s.buildings.filter(b=>b.owner!==id);s.bases.find(b=>b.owner===id).hp=0;for(const o of s.points)if(o.owner===id)o.owner=null;}
function fire(s,source,target,weapon,targets){
  source.cooldown=weapon.reload;
  const rank=veteranRank(source.kills??0),multiplier=1+rank*.12;
  for(const e of targets){if(e.owner===source.owner||e.hp<=0)continue;const d=distance(e,target);if(e!==target&&(!weapon.splash||d>weapon.splash))continue;const damage=weapon.damage*multiplier*(e===target?1:.65*(1-d/(weapon.splash+1)));e.hp-=damage;e.damagedAt=s.time;if(e.hp<=0){s.players.find(p=>p.id===source.owner).kills++;if('orders' in source)source.kills++;}}
  s.events.push({type:'shot',from:source.id,owner:source.owner,x:source.x,z:source.z,tx:target.x,tz:target.z,heavy:!!weapon.indirect,unit:'orders' in source?source.type:undefined});
}
export function step(s,dt){
  if(s.ended)return;s.time+=dt;s.tick++;s.events=[];
  for(const b of s.buildings){if(b.hp<=0||b.left<=0)continue;b.left=Math.max(0,b.left-dt);if(b.left===0)s.events.push({type:'built',owner:b.owner,x:b.x,z:b.z});}
  const blocks=obstacles(s),economies=new Map();
  for(const p of s.players){if(!p.alive)continue;const e=economy(s,p.id);economies.set(p.id,e);p.credits=Math.min(99999,p.credits+dt*e.income);
    if(p.research){p.research.left-=dt;if(p.research.left<=0){const type=p.research.type;p.upgrades[type]++;p.research=null;const b=s.bases.find(b=>b.owner===p.id);if(type==='armor'){b.maxHp+=1000;b.hp=Math.min(b.maxHp,b.hp+1000);}s.events.push({type:'upgraded',owner:p.id,x:b.x,z:b.z});}}
    if(p.queue.length){p.queue[0].left-=dt*e.speed;if(p.queue[0].left<=0){const b=s.bases.find(b=>b.owner===p.id),q=p.queue.shift(),u=spawn(s,p.id,q.type,b.x+(s.nextId%3-1)*3.5,b.z+(b.z>0?-15:15));p.produced++;if(p.rally)assign(s,u,{type:'move',...p.rally,target:null},blocks);s.events.push({type:'produced',owner:p.id,unit:q.type,x:u.x,z:u.z});}}
  }
  const targets=[...s.units,...s.bases,...s.buildings];
  // Штаб и орудийные бастионы автоматически защищают периметр.
  for(const b of [...s.bases,...s.buildings]){
    if(b.hp<=0||b.left>0)continue;const p=s.players.find(p=>p.id===b.owner);if(!p.alive)continue;const weapon=b.type?BUILDINGS[b.type]:{range:31+p.upgrades.weapons*4,damage:32+p.upgrades.weapons*12,reload:1.3};
    if(b.type&&!economies.get(b.owner).powered.has(b.id))continue;b.cooldown-=dt;
    if(weapon.damage){const enemy=targets.filter(e=>e.owner!==b.owner&&e.hp>0&&distance(e,b)<=weapon.range&&clearSegment(b,e,s.rocks,.2)).sort((a,c)=>distance(a,b)-distance(c,b))[0];if(enemy){b.turret=Math.atan2(enemy.x-b.x,enemy.z-b.z);if(b.cooldown<=0)fire(s,b,enemy,weapon,targets);}}
    if(!b.type&&p.upgrades.repair&&s.time-b.damagedAt>8)b.hp=Math.min(b.maxHp,b.hp+dt*3*p.upgrades.repair);
  }
  for(const u of s.units){if(u.hp<=0)continue;const t=TYPES[u.type];u.cooldown-=dt;u.repath-=dt;u.repairing=false;
    const enemies=targets.filter(e=>e.owner!==u.owner&&e.hp>0);let target=u.order?.target?enemies.find(e=>e.id===u.order.target):null;
    const canFire=e=>t.damage>0&&distance(e,u)<=t.range&&(t.indirect||clearSegment(u,e,s.rocks,.2));
    if(!target)target=enemies.filter(canFire).sort((a,b)=>distance(a,u)-distance(b,u))[0];const inRange=target&&canFire(target);
    if(inRange){u.turret=Math.atan2(target.x-u.x,target.z-u.z);if(u.cooldown<=0)fire(s,u,target,t,targets);}
    if(u.order&&!(inRange&&u.order.type==='attack')){
      if(u.order.target&&target&&u.repath<=0){u.path=findPath(u,target,blocks);u.repath=1;}
      if(u.path.length){const dest=u.path[0],d=distance(u,dest);if(d<.6)u.path.shift();else{const v=Math.min(d,t.speed*dt);u.angle=Math.atan2(dest.x-u.x,dest.z-u.z);u.x+=(dest.x-u.x)/d*v;u.z+=(dest.z-u.z)/d*v;if(!inRange)u.turret=u.angle;}}
      if(!u.path.length&&!u.order.target)assign(s,u,u.orders.shift()??null,blocks);
      if(u.order?.target&&!enemies.some(e=>e.id===u.order.target))assign(s,u,u.orders.shift()??null,blocks);
    }
    const base=s.bases.find(b=>b.owner===u.owner),p=s.players.find(p=>p.id===u.owner);
    if(base?.hp>0&&distance(base,u)<24&&s.time-u.damagedAt>5&&u.hp<u.maxHp&&!inRange){u.hp=Math.min(u.maxHp,u.hp+dt*(8+6*p.upgrades.repair));u.repairing=true;}
  }
  for(const carrier of s.units.filter(u=>u.hp>0&&TYPES[u.type].heal)){for(const u of s.units){if(u.id!==carrier.id&&u.owner===carrier.owner&&u.hp>0&&u.hp<u.maxHp&&distance(carrier,u)<11){u.hp=Math.min(u.maxHp,u.hp+dt*TYPES[carrier.type].heal);u.repairing=true;}}}
  // Раздвигание корпусов и граница препятствий после шага движения.
  for(let i=0;i<s.units.length;i++){const a=s.units[i];for(let j=i+1;j<s.units.length;j++){const b=s.units[j],dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);if(d<2.5){const nx=d>0?dx/d:1,nz=d>0?dz/d:0,n=(2.5-d)*.5;a.x+=nx*n;a.z+=nz*n;b.x-=nx*n;b.z-=nz*n;}}for(const r of blocks){const dx=a.x-r.x,dz=a.z-r.z,d=Math.hypot(dx,dz);if(d<r.r+1.25){a.x=r.x+(d?dx/d:1)*(r.r+1.25);a.z=r.z+(d?dz/d:0)*(r.r+1.25);}}a.x=clamp(a.x,-MAP.half+2,MAP.half-2);a.z=clamp(a.z,-MAP.half+2,MAP.half-2);}
  for(const u of s.units.filter(u=>u.hp<=0))s.events.push({type:'explosion',x:u.x,z:u.z});s.units=s.units.filter(u=>u.hp>0);
  for(const b of s.buildings.filter(b=>b.hp<=0))s.events.push({type:'explosion',x:b.x,z:b.z,heavy:true});s.buildings=s.buildings.filter(b=>b.hp>0);
  for(const b of s.bases)if(b.hp<=0&&s.players.find(p=>p.id===b.owner).alive){s.events.push({type:'explosion',x:b.x,z:b.z,heavy:true});eliminate(s,b.owner);}
  for(const o of s.points){const owners=[...new Set(s.units.filter(u=>distance(u,o)<8).map(u=>u.owner))];o.contested=owners.length>1;if(owners.length===1&&owners[0]!==o.owner){if(o.captor!==owners[0]){o.captor=owners[0];o.capture=0;}o.capture+=dt/8;if(o.capture>=1){o.owner=owners[0];o.capture=0;o.captor=null;s.events.push({type:'capture',owner:o.owner,x:o.x,z:o.z});}}else{o.capture=Math.max(0,o.capture-dt/8);if(!o.capture)o.captor=null;}}
  const alive=s.players.filter(p=>p.alive);if(alive.length<=1){s.ended=true;s.winner=alive[0]?.id??null;}
}
export function snapshot(s){const {rocks,nextId,...rest}=s;return {...rest,buildings:s.buildings.map(({cooldown,damagedAt,...b})=>({...b,powered:economy(s,b.owner).powered.has(b.id)})),units:s.units.map(({path,orders,cooldown,repath,damagedAt,...u})=>({...u,waypoints:[...(u.order?[{x:u.order.x,z:u.order.z}]:[]),...orders.map(o=>({x:o.x,z:o.z}))]}))};}
