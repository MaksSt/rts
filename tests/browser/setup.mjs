import {spawn} from 'node:child_process';
export default async function setup(){
  // Прямой дочерний процесс: не оставляет shell/web-server после теста на Windows.
  const server=spawn(process.execPath,['server/index.mjs','--production'],{env:{...process.env,PORT:'5190',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe'],windowsHide:true});
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Browser test server timeout')),7000);server.stdout.once('data',()=>{clearTimeout(timer);resolve();});server.once('error',e=>{clearTimeout(timer);reject(e);});server.once('exit',code=>{clearTimeout(timer);reject(Error('Browser test server exited: '+code));});});}catch(e){server.kill();throw e;}
  return async()=>{server.kill();await new Promise(resolve=>{if(server.exitCode!==null){resolve();return;}server.once('exit',resolve);});};
}
