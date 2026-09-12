import {MAP,SPAWNS,MAPS,terrain} from '../server/rules.mjs';
// Рисуем поверхность из одного seed; коллизии и высоты проходов не меняются.
export function terrainTexture(){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=2048;const c=canvas.getContext('2d')!,size=canvas.width;
  let seed=73;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;},px=(v:number)=>(v+MAP.ground/2)/MAP.ground*size;
  const data=c.createImageData(size,size);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){const i=(z*size+x)*4,dune=Math.sin(x*.019+Math.sin(z*.012)*2)*3+Math.sin(x*.006+z*.009)*8,grain=(random()-.5)*15;data.data[i]=154+dune+grain;data.data[i+1]=133+dune+grain;data.data[i+2]=94+dune+grain;data.data[i+3]=255;}c.putImageData(data,0,0);
  // Пересохшее русло, слои наносов и мелкая каменная крошка.
  for(let band=0;band<3;band++){c.strokeStyle=['#826d4530','#e4c69230','#625c3f22'][band];c.lineWidth=65-band*17;c.beginPath();for(let z=-128;z<=128;z+=2){const x=12*Math.sin(z*.028)+13+band*2;if(z===-128)c.moveTo(px(x),px(z));else c.lineTo(px(x),px(z));}c.stroke();}
  const road=(x:number,z:number)=>{for(const [width,color] of [[9,'#60573f38'],[6.8,'#cabb9770'],[.18,'#e9d5a442']] as [number,string][]){c.strokeStyle=color;c.lineWidth=width*size/MAP.ground;c.beginPath();c.moveTo(px(x),px(z));c.bezierCurveTo(px(x*.7),px(z),px(x*.45),px(z*.4),px(0),px(0));c.stroke();}for(const offset of [-1.4,1.4]){c.strokeStyle='#584d3638';c.lineWidth=.32*size/MAP.ground;c.beginPath();c.moveTo(px(x+offset),px(z));c.bezierCurveTo(px(x*.7+offset),px(z),px(x*.45+offset),px(z*.4),px(offset),px(0));c.stroke();}};
  c.lineCap='round';for(const [x,z] of SPAWNS)road(x,z);
  for(const [x,z] of MAPS.dunes.points){c.fillStyle='#b5a180';c.fillRect(px(x-5),px(z-5),10*size/MAP.ground,10*size/MAP.ground);c.strokeStyle='#6e624b77';c.lineWidth=2;c.strokeRect(px(x-5),px(z-5),10*size/MAP.ground,10*size/MAP.ground);for(let i=0;i<7;i++){c.fillStyle=i%2?'#554e3e':'#d4bb78';c.fillRect(px(x-4+i*1.2),px(z+4.4),.8*size/MAP.ground,.24*size/MAP.ground);}}
  for(const r of terrain()){const gradient=c.createRadialGradient(px(r.x),px(r.z),r.r*size/MAP.ground*.5,px(r.x),px(r.z),r.r*size/MAP.ground*1.8);gradient.addColorStop(0,'#594d3b99');gradient.addColorStop(1,'#73664b00');c.fillStyle=gradient;c.fillRect(px(r.x-r.r*2),px(r.z-r.r*2),r.r*4*size/MAP.ground,r.r*4*size/MAP.ground);}
  for(let i=0;i<130;i++){const x=random()*size,z=random()*size,r=3+random()*12;c.lineWidth=2;c.strokeStyle='#594b3330';c.beginPath();c.ellipse(x,z,r,r*.7,random()*3,0,Math.PI*2);c.stroke();}
  for(let i=0;i<45000;i++){const x=random()*size,z=random()*size;c.fillStyle=random()>.5?'#54492f30':'#efdfbc40';c.fillRect(x,z,.5+random()*2,.5+random()*2);}
  return canvas;
}
