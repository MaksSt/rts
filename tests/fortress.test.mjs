import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,command,step,spawn,snapshot} from '../server/simulation.mjs';
import {BUILDINGS,TYPES,MAP,SPAWNS,economy} from '../server/rules.mjs';
import {findPath,clearSegment,obstacles} from '../server/navigation.mjs';
const players=Array.from({length:4},(_,slot)=>({id:String(slot),slot,name:'P'+slot}));
function fixture(){const s=createMatch(players);s.units=[];s.players[0].credits=20000;return s;}
function advance(s,seconds){for(let n=0;n<Math.ceil(seconds*10);n++)step(s,.1);}
function structure(s,type,x,z,owner='0'){const t=BUILDINGS[type],b={id:'test-'+s.nextId++,type,owner,x,z,hp:t.hp,maxHp:t.hp,left:0,turret:0,cooldown:0,damagedAt:-20};s.buildings.push(b);return b;}
test('карта на четверых: дальние приказы используют расширенные границы, скалы и крепости обходятся',()=>{
  const s=fixture();assert.equal(s.points.length,9);assert.equal(MAP.half*2,224);assert.equal(new Set(SPAWNS.map(p=>p.join(','))).size,4);
  const u=spawn(s,'0','scout',-98,-90);command(s,'0',{type:'move',ids:[u.id],x:98,z:90});assert.equal(u.order.x,98);assert.equal(u.order.z,90);
  const blocks=obstacles(s),route=findPath(u,{x:98,z:90},blocks);assert.ok(route.length);let from=u;for(const to of route){assert.ok(clearSegment(from,to,blocks));from=to;}assert.ok(Math.hypot(from.x-98,from.z-90)<3);
});
test('крепость стреляет сама, улучшения оружия и брони реально меняют бой',()=>{
  const s=fixture(),b=s.bases[0],enemy=spawn(s,'1','heavy',b.x+25,b.z);enemy.cooldown=100;
  step(s,.1);assert.equal(enemy.hp,TYPES.heavy.hp-32);assert.ok(snapshot(s).events.some(e=>e.from===b.id));
  assert.equal(command(s,'0',{type:'upgrade',upgrade:'weapons'}),null);assert.ok(command(s,'0',{type:'upgrade',upgrade:'armor'}));s.units=[];advance(s,16.1);assert.equal(s.players[0].upgrades.weapons,1);
  const target=spawn(s,'1','heavy',b.x+34,b.z);target.cooldown=100;b.cooldown=0;step(s,.1);assert.equal(target.hp,TYPES.heavy.hp-44);
  s.units=[];b.hp=2000;assert.equal(command(s,'0',{type:'upgrade',upgrade:'armor'}),null);advance(s,14.1);assert.equal(b.maxHp,4200);assert.equal(b.hp,3000);
});
test('стройка проверяет границы, перекрытия, владельца, лимиты и деньги; отмена не дублирует возврат',()=>{
  const s=fixture(),p=s.players[0],start=p.credits;
  for(const c of [{building:'__proto__',x:-62,z:76},{building:'generator',x:NaN,z:76},{building:'generator',x:0,z:0},{building:'generator',x:-82,z:76},{building:'generator',x:-112,z:76}])assert.ok(command(s,'0',{type:'build',...c}));
  assert.equal(p.credits,start);assert.equal(command(s,'0',{type:'build',building:'generator',x:-62,z:76}),null);const b=s.buildings[0];assert.equal(p.credits,start-250);
  assert.ok(command(s,'0',{type:'build',building:'refinery',x:-62,z:76}));assert.ok(command(s,'1',{type:'cancelBuild',id:b.id}));assert.ok(command(s,'1',{type:'upgrade',upgrade:'__proto__'}));
  b.hp=b.maxHp/2;const before=p.credits;assert.equal(command(s,'0',{type:'cancelBuild',id:b.id}),null);assert.equal(p.credits-before,93);assert.ok(command(s,'0',{type:'cancelBuild',id:b.id}));assert.equal(p.credits-before,93);
  p.credits=0;assert.ok(command(s,'0',{type:'build',building:'generator',x:-62,z:76}));assert.equal(s.buildings.length,0);
});
test('готовая добыча приносит ресурсы; потеря энергии отключает добычу, цех и оборону',()=>{
  const s=fixture();assert.equal(command(s,'0',{type:'build',building:'refinery',x:-62,z:76}),null);assert.equal(economy(s,'0').income,4);advance(s,14.1);assert.equal(economy(s,'0').income,14);const before=s.players[0].credits;step(s,1);assert.equal(s.players[0].credits-before,14);
  const generator=structure(s,'generator',-100,50);structure(s,'refinery',-65,90);structure(s,'refinery',-45,88);const workshop=structure(s,'workshop',-97,92),gun=structure(s,'turret',-55,95);
  assert.equal(economy(s,'0').speed,1.25);assert.ok(economy(s,'0').powered.has(gun.id));generator.hp=0;step(s,.1);
  const e=economy(s,'0');assert.equal(e.capacity,12);assert.equal(e.income,34);assert.equal(e.speed,1);assert.equal(e.powered.has(workshop.id),false);assert.equal(e.powered.has(gun.id),false);
  assert.ok(command(s,'0',{type:'build',building:'turret',x:-102,z:76}));
  const enemy=spawn(s,'1','heavy',-40,100);enemy.cooldown=100;step(s,.1);assert.equal(enemy.hp,TYPES.heavy.hp);
});
test('цех ускоряет производство, промышленность открывает тяжёлые машины, ремонтный носитель лечит союзников',()=>{
  const s=fixture();assert.ok(command(s,'0',{type:'produce',unit:'heavy'}));assert.ok(command(s,'0',{type:'build',building:'mine',x:-62,z:76}));
  assert.equal(command(s,'0',{type:'upgrade',upgrade:'logistics'}),null);advance(s,20.1);assert.equal(command(s,'0',{type:'produce',unit:'heavy'}),null);structure(s,'workshop',-102,76);advance(s,11);assert.ok(s.units.some(u=>u.type==='heavy'));assert.equal(s.players[0].queue.length,0);
  const u=spawn(s,'0','tank',0,0),carrier=spawn(s,'0','repair',5,0);u.hp=100;step(s,1);assert.equal(u.hp,112);assert.equal(carrier.hp,200);
});
test('вражеские постройки можно уничтожить, урон по площади не задевает союзников',()=>{
  const s=fixture(),target=structure(s,'refinery',0,0,'1'),a=spawn(s,'0','rocket',0,-38),ally=spawn(s,'0','tank',2,1);ally.cooldown=100;
  const enemy=spawn(s,'1','heavy',-2,1);enemy.cooldown=100;command(s,'0',{type:'attack',ids:[a.id],x:0,z:0,target:target.id});step(s,.1);assert.equal(target.hp,BUILDINGS.refinery.hp-95);assert.ok(enemy.hp<TYPES.heavy.hp);assert.equal(ally.hp,TYPES.tank.hp);
  target.hp=1;a.cooldown=0;step(s,.1);assert.ok(!s.buildings.includes(target));assert.ok(s.events.some(e=>e.type==='explosion'));
});
