import http from 'node:http';
import {VERSION} from './version.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,timingSafeEqual} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {createMatch,step,command,snapshot,eliminate,MAPS} from './simulation.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const production=process.argv.includes('--production'),debug=process.env.DEBUG_REQUESTS==='1';
const grace=Number(process.env.RECONNECT_GRACE_MS||60000);
const rooms=new Map();
const log=(event,fields={})=>{if(debug)console.log(JSON.stringify({time:new Date().toISOString(),event,...fields}));};
const vite=production?null:await(await import('vite')).createServer({root,server:{middlewareMode:true},appType:'spa'});
const server=http.createServer(async(req,res)=>{
  const started=performance.now();let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);res.end();return;}
  res.on('finish',()=>log('http',{method:req.method,path:url.pathname.slice(0,160),status:res.statusCode,ms:Math.round(performance.now()-started),peer:req.socket.remoteAddress}));
  res.setHeader('X-Content-Type-Options','nosniff');
  if(url.pathname==='/health'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({ok:true,version:VERSION,rooms:rooms.size,connections:wss.clients.size}));return;}
  if(vite){vite.middlewares(req,res);return;}
  try{if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}const rel=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1),filename=path.resolve(root,'dist',rel);if(!filename.startsWith(path.join(root,'dist')+path.sep))throw Error();const data=await fs.readFile(filename),ext=path.extname(filename);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'})[ext]||'application/octet-stream');res.setHeader('Cache-Control',ext==='.html'?'no-cache':'public, max-age=300');res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192});
const send=(ws,msg)=>{if(ws?.readyState===WebSocket.OPEN&&ws.bufferedAmount<1024*1024)ws.send(JSON.stringify(msg));};
const broadcast=(r,msg)=>r.players.forEach(p=>p.connected&&send(p.ws,msg));
const roster=r=>r.players.map(({id,name,slot,ready,connected,expires})=>({id,name,slot,ready,connected,reconnectSeconds:connected?0:Math.max(0,Math.ceil((expires-Date.now())/1000))}));
const meta=r=>({code:r.code,map:r.map,host:r.host,players:roster(r)});
function lobby(r){broadcast(r,{type:'lobby',...meta(r)});}
function stateOf(r){return {...snapshot(r.match),connections:roster(r)};}
function transferHost(r){if(!r.players.some(p=>p.id===r.host&&p.connected)){r.host=r.players.find(p=>p.connected)?.id??r.host;broadcast(r,{type:'host',host:r.host});}}
function removePlayer(r,p){
  if(r.match){eliminate(r.match,p.id);p.expires=0;p.token='';p.connected=false;}else r.players=r.players.filter(x=>x!==p);
  transferHost(r);if(!r.match)lobby(r);
}
function leave(ws,explicit=false){
  const r=rooms.get(ws.room),p=r?.players.find(p=>p.id===ws.pid&&p.ws===ws);if(!p)return;ws.room=null;p.connected=false;p.ready=false;
  if(explicit||!r.match){removePlayer(r,p);log('leave',{room:r.code,explicit});}else{p.expires=Date.now()+grace;broadcast(r,{type:'notice',message:`${p.name}: потеря связи, ожидаем возврат ${Math.ceil(grace/1000)} сек.`});transferHost(r);log('disconnect',{room:r.code,graceMs:grace});}
  if(!r.players.some(p=>p.connected||p.expires>Date.now()))rooms.delete(r.code);
}
function roomList(){return [...rooms.values()].map(r=>({code:r.code,name:r.name,host:r.players.find(p=>p.id===r.host)?.name??'Командир',players:r.players.filter(p=>p.connected).length,capacity:4,status:r.match?(r.match.ended?'finished':'playing'):'waiting',map:r.map}));}
const tokenMatches=(a,b)=>typeof a==='string'&&typeof b==='string'&&/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
wss.on('connection',(ws,req)=>{
  ws.pid=randomUUID();ws.alive=true;ws.on('pong',()=>ws.alive=true);let count=0,windowStart=Date.now();send(ws,{type:'welcome',id:ws.pid});log('ws.open',{peer:req.socket.remoteAddress});
  ws.on('message',raw=>{
    if(Date.now()-windowStart>1000){count=0;windowStart=Date.now();}if(++count>40)return;
    let m;try{m=JSON.parse(raw.toString());if(!m||typeof m!=='object'||Array.isArray(m))return;}catch{log('ws.invalid');return;}
    if(m.type==='ping'){send(ws,{type:'pong',at:m.at});return;}
    if(m.type==='list'){send(ws,{type:'rooms',rooms:roomList()});return;}
    const error=message=>send(ws,{type:'error',message});const room=rooms.get(ws.room);
    if(m.type==='resume'){
      if(room)return;const r=rooms.get(String(m.code)),p=r?.players.find(p=>tokenMatches(p.token,m.token));
      if(!p||!r.match||p.expires===0||(!p.connected&&p.expires<Date.now())){send(ws,{type:'resume_failed',message:'Время возврата истекло или сервер был перезапущен.'});return;}
      const previous=p.ws;p.ws=ws;p.connected=true;p.expires=Infinity;ws.pid=p.id;ws.room=r.code;if(previous!==ws&&previous?.readyState===WebSocket.OPEN)previous.close(4001,'Session resumed');
      send(ws,{type:'session',id:p.id,code:r.code,token:p.token});send(ws,{type:'resumed',room:meta(r),state:stateOf(r)});broadcast(r,{type:'notice',message:p.name+' снова на связи'});log('resume',{room:r.code});return;
    }
    if(m.type==='create'||m.type==='join'){
      if(room)return error('Сначала покиньте текущую комнату');const name=typeof m.name==='string'?m.name.trim().slice(0,20):'';if(!name)return error('Введите позывной');
      let r;if(m.type==='create'){if(rooms.size>=100)return error('Сервер заполнен');let code;do{code=randomBytes(3).toString('hex').toUpperCase();}while(rooms.has(code));r={code,name:typeof m.title==='string'&&m.title.trim()?m.title.trim().slice(0,40):'Комната '+name,map:'dunes',host:ws.pid,players:[],match:null};rooms.set(code,r);}else{r=rooms.get(String(m.code).trim().toUpperCase());if(!r)return error('Комната не найдена. Проверьте код и адрес сервера.');if(r.match)return error('Матч уже начался');if(r.players.length>=4)return error('В комнате уже 4 игрока');}
      const slot=[0,1,2,3].find(n=>!r.players.some(p=>p.slot===n)),token=randomBytes(32).toString('hex');r.players.push({id:ws.pid,name,slot,ready:false,connected:true,expires:Infinity,token,ws});ws.room=r.code;send(ws,{type:'session',id:ws.pid,code:r.code,token});lobby(r);log(m.type,{room:r.code,players:r.players.length});return;
    }
    if(!room)return;
    if(m.type==='rename'&&!room.match){const name=typeof m.name==='string'?m.name.trim().slice(0,20):'';if(!name)return error('Введите позывной');room.players.find(p=>p.id===ws.pid).name=name;lobby(room);return;}
    if(m.type==='leave'){leave(ws,true);send(ws,{type:'left'});return;}
    if(m.type==='rematch'&&room.host===ws.pid&&room.match?.ended){room.match=null;room.players=room.players.filter(p=>p.connected);room.players.forEach(p=>{p.ready=false;p.expires=Infinity;});lobby(room);return;}
    if(room.match){if(m.type==='command'){const err=command(room.match,ws.pid,m.command);if(err)error(err);}return;}
    if(m.type==='ready')room.players.find(p=>p.id===ws.pid).ready=m.ready===true;
    if(m.type==='start'&&room.host===ws.pid){if(room.players.length<2||!room.players.every(p=>p.ready))return error('Нужны минимум 2 игрока, и все должны быть готовы');room.match=createMatch(room.players,room.map);broadcast(room,{type:'start',state:stateOf(room)});log('start',{room:room.code,players:room.players.length});return;}
    lobby(room);
  });ws.on('close',code=>{leave(ws);log('ws.close',{code});});ws.on('error',err=>log('ws.error',{code:err.code||'transport'}));
});
setInterval(()=>{for(const r of rooms.values()){
  for(const p of r.players)if(!p.connected&&p.expires>0&&p.expires<Date.now()){removePlayer(r,p);broadcast(r,{type:'notice',message:p.name+' не вернулся в матч'});}
  if(!r.players.some(p=>p.connected||p.expires>Date.now())){rooms.delete(r.code);continue;}
  if(r.match&&!r.match.ended){step(r.match,.1);broadcast(r,{type:'state',state:stateOf(r)});}
}},100);
setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},5000).unref();
setInterval(()=>{const msg={type:'rooms',rooms:roomList()};for(const ws of wss.clients)if(!ws.room)send(ws,msg);},2000).unref();
server.on('clientError',(_err,socket)=>{log('http.invalid');socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');});
const port=Number(process.env.PORT||5173),host=process.env.HOST||'0.0.0.0';server.listen(port,host,()=>console.log(`IRON DUNES ${VERSION} — ${host}:${port} (${production?'production':'development'}), /health, request logs: ${debug?'on':'off'}`));
