import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {WebSocket} from 'ws';
function client(){return new Promise((resolve,reject)=>{const ws=new WebSocket('ws://127.0.0.1:5189/ws'),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));ws.on('error',reject);ws.on('open',()=>resolve({ws,messages,send:m=>ws.send(JSON.stringify(m)),wait:async(pred)=>{const until=Date.now()+5000;while(Date.now()<until){const i=messages.findIndex(pred);if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,20));}throw Error('Message timeout: '+pred.toString());}}));});}
test('WebSocket: список комнат, 4 игрока, команды, переподключение, истечение резерва и повторный матч',async()=>{
  const child=spawn(process.execPath,['server/index.mjs','--production'],{env:{...process.env,PORT:'5189',HOST:'127.0.0.1',RECONNECT_GRACE_MS:'1600'},stdio:['ignore','pipe','pipe']});const clients=[];
  try{await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Server timeout')),5000);child.stdout.once('data',()=>{clearTimeout(t);resolve();});child.once('error',reject);});
    assert.equal((await(await fetch('http://127.0.0.1:5189/health')).json()).ok,true);
    const a=await client();clients.push(a);const aid=(await a.wait(m=>m.type==='welcome')).id;a.send({type:'create',name:'A',title:'Friends test'});const lobby=await a.wait(m=>m.type==='lobby');a.send({type:'start'});assert.match((await a.wait(m=>m.type==='error')).message,/2 игрока/);
    for(const name of ['B','C','D']){const c=await client();clients.push(c);c.send({type:'join',name,code:lobby.code});await c.wait(m=>m.type==='lobby');}
    const extra=await client();clients.push(extra);extra.send({type:'list'});const list=await extra.wait(m=>m.type==='rooms');assert.equal(list.rooms[0].name,'Friends test');assert.equal(list.rooms[0].players,4);assert.equal(list.rooms[0].map,'dunes');extra.send({type:'join',name:'E',code:lobby.code});assert.match((await extra.wait(m=>m.type==='error')).message,/4 игрока/);
    const b=clients[1],bs=await b.wait(m=>m.type==='session');b.send({type:'start'});for(const c of clients.slice(0,4))c.send({type:'ready',ready:true});await a.wait(m=>m.type==='lobby'&&m.players.every(p=>p.ready));a.send({type:'start'});const start=await a.wait(m=>m.type==='start');assert.equal(start.state.units.length,24);assert.equal(start.state.points.length,5);assert.deepEqual(start.state,(await b.wait(m=>m.type==='start')).state);
    const unit=start.state.units.find(u=>u.owner===aid);a.send({type:'command',command:{type:'move',ids:[unit.id],x:0,z:0}});assert.ok((await b.wait(m=>m.type==='state'&&m.state.units.find(u=>u.id===unit.id).x!==unit.x)).state.time>0);
    a.send({type:'command',command:{type:'produce',unit:'scout'}});const producing=await a.wait(m=>m.type==='state'&&m.state.players.find(p=>p.id===aid).queue.length===1);const queueId=producing.state.players.find(p=>p.id===aid).queue[0].id;a.send({type:'command',command:{type:'cancel',id:queueId}});await a.wait(m=>m.type==='state'&&m.state.players.find(p=>p.id===aid).queue.length===0);
    b.ws.close();const lost=await a.wait(m=>m.type==='state'&&m.state.connections.some(c=>c.id===bs.id&&!c.connected));assert.equal(lost.state.players.find(p=>p.id===bs.id).alive,true);
    extra.send({type:'resume',code:lobby.code,token:'я'.repeat(64)});await extra.wait(m=>m.type==='resume_failed');
    const recovered=await client();clients.push(recovered);recovered.send({type:'resume',code:lobby.code,token:bs.token});const resumed=await recovered.wait(m=>m.type==='resumed');assert.equal((await recovered.wait(m=>m.type==='session')).id,bs.id);assert.equal(resumed.state.players.find(p=>p.id===bs.id).alive,true);
    extra.send({type:'list'});assert.equal((await extra.wait(m=>m.type==='rooms'&&m.rooms[0]?.status==='playing')).rooms[0].status,'playing');
    clients[2].send({type:'leave'});clients[3].send({type:'leave'});recovered.ws.close();const end=await a.wait(m=>m.type==='state'&&m.state.ended);assert.equal(end.state.winner,aid);
    a.send({type:'rematch'});const reset=await a.wait(m=>m.type==='lobby'&&m.players.length===1);assert.equal(reset.players[0].ready,false);a.send({type:'leave'});await a.wait(m=>m.type==='left');extra.send({type:'list'});assert.equal((await extra.wait(m=>m.type==='rooms'&&m.rooms.length===0)).rooms.length,0);
  }finally{for(const c of clients)c.ws.terminate();child.kill();}
});
