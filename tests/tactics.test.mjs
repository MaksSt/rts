import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatch,command,spawn,step,snapshot} from '../server/simulation.mjs';
import {formationOffset,veteranRank,TYPES} from '../server/rules.mjs';
const players=[{id:'a',slot:0,name:'A'},{id:'b',slot:1,name:'B'}];
test('построения задают разные позиции без изменения чужих приказов',()=>{
  for(const formation of ['line','column','spread','wedge']){const s=createMatch(players),units=s.units.filter(u=>u.owner==='a'),enemy=s.units.find(u=>u.owner==='b');
    assert.equal(command(s,'a',{type:'move',ids:[...units.map(u=>u.id),enemy.id],x:0,z:0,formation}),null);
    assert.equal(new Set(units.map(u=>`${u.order.x}:${u.order.z}`)).size,6);assert.equal(enemy.order,null);
    const offsets=units.map((_,i)=>formationOffset(i,6,formation));assert.deepEqual(units.map(u=>({x:u.order.x,z:u.order.z})),offsets);
    if(formation==='column')assert.equal(new Set(offsets.map(p=>p.x)).size,2);if(formation==='spread')assert.equal(offsets[1].x-offsets[0].x,6.5);
    assert.ok(command(s,'a',{type:'move',ids:units.map(u=>u.id),x:0,z:0,formation:'__proto__'}));
  }
});
test('экипаж получает опыт за уничтожение врага; ветераны наносят дополнительный урон',()=>{
  const s=createMatch(players);s.units=[];s.rocks=[];const tank=spawn(s,'a','tank',0,0);tank.kills=1;
  let target=spawn(s,'b','tank',0,12);target.hp=1;target.cooldown=100;step(s,.1);assert.equal(tank.kills,2);assert.equal(veteranRank(tank.kills),1);assert.equal(s.players[0].kills,1);
  target=spawn(s,'b','heavy',0,12);target.cooldown=100;tank.cooldown=0;step(s,.1);assert.ok(Math.abs(target.hp-(TYPES.heavy.hp-TYPES.tank.damage*1.12))<1e-8);
  assert.equal(snapshot(s).units.find(u=>u.id===tank.id).kills,2);assert.equal(veteranRank(5),2);assert.equal(veteranRank(500),2);
});
