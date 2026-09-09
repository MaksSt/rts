type Session={id:string;code:string;token:string};
export class Connection {
  private socket:WebSocket|null=null;private retry=0;private timer:ReturnType<typeof setTimeout>|null=null;
  private session:Session|null=null;private lastMessage=performance.now();private closed=false;
  connected=false;latency=0;
  onMessage:(message:any)=>void=()=>{};onStatus:(connected:boolean,message:string)=>void=()=>{};
  constructor(){try{this.session=JSON.parse(sessionStorage.getItem('iron-session')||'null');}catch{}
    setInterval(()=>{if(this.connected){this.send({type:'ping',at:performance.now()});if(performance.now()-this.lastMessage>14000)this.socket?.close();}},3000);
    window.addEventListener('online',()=>{if(!this.connected)this.connect();});
  }
  connect(){if(this.socket&&(this.socket.readyState===WebSocket.OPEN||this.socket.readyState===WebSocket.CONNECTING))return;this.closed=false;const socket=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/ws`);this.socket=socket;
    socket.onopen=()=>{this.connected=true;this.retry=0;this.lastMessage=performance.now();this.onStatus(true,'Сервер в сети');};
    socket.onmessage=e=>{this.lastMessage=performance.now();const m=JSON.parse(e.data);if(m.type==='welcome'){if(this.session)this.send({type:'resume',code:this.session.code,token:this.session.token});else this.send({type:'list'});}
      if(m.type==='session'){this.session={id:m.id,code:m.code,token:m.token};try{sessionStorage.setItem('iron-session',JSON.stringify(this.session));}catch{}}
      if(m.type==='resume_failed'||m.type==='left'){this.forget();this.send({type:'list'});}
      if(m.type==='pong'){this.latency=Math.round(performance.now()-m.at);return;}this.onMessage(m);
    };
    socket.onerror=()=>{};
    socket.onclose=e=>{if(this.socket!==socket)return;this.connected=false;if(e.code===4001){this.closed=true;this.forget();this.onStatus(false,'Эта сессия открыта в другой вкладке');return;}this.onStatus(false,'Нет связи. Переподключаемся…');if(!this.closed){if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect(),Math.min(5000,700*++this.retry));}};
  }
  send(message:object){if(this.socket?.readyState===WebSocket.OPEN)this.socket.send(JSON.stringify(message));}
  forget(){this.session=null;try{sessionStorage.removeItem('iron-session');}catch{}}
}
