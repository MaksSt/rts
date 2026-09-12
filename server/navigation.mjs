import {MAP,BUILDINGS} from './rules.mjs';
// Сетка 2 м; диагонали не проходят сквозь углы препятствий.
const CELL=2,MIN=-MAP.half+2,SIZE=1-MIN,COUNT=SIZE*SIZE;
const coord=n=>Math.max(0,Math.min(SIZE-1,Math.round((n-MIN)/CELL)));
export function obstacles(s){return [...s.rocks,...s.bases.filter(b=>b.hp>0).map(b=>({x:b.x,z:b.z,r:MAP.baseRadius})),...(s.buildings??[]).filter(b=>b.hp>0).map(b=>({x:b.x,z:b.z,r:BUILDINGS[b.type].radius}))];}
export function clearSegment(a,b,blocks,padding=1.35){
  const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  return blocks.every(r=>{const t=len?Math.max(0,Math.min(1,((r.x-a.x)*dx+(r.z-a.z)*dz)/len)):0;return Math.hypot(a.x+t*dx-r.x,a.z+t*dz-r.z)>r.r+padding;});
}
// obstacles() создаёт неизменяемый снимок. Приказ отряду переиспользует одну сетку.
const grids=new WeakMap();
function gridFor(blocks){
  if(grids.has(blocks))return grids.get(blocks);
  const grid=new Uint8Array(COUNT);
  for(const r of blocks){const radius=r.r+1.6;
    for(let z=coord(r.z-radius);z<=coord(r.z+radius);z++)for(let x=coord(r.x-radius);x<=coord(r.x+radius);x++)if((MIN+x*CELL-r.x)**2+(MIN+z*CELL-r.z)**2<radius**2)grid[z*SIZE+x]=1;
  }
  grids.set(blocks,grid);return grid;
}
class Heap {
  items=[];
  push(node){const a=this.items;let i=a.length;a.push(node);while(i>0){const p=(i-1)>>1;if(a[p].f<=node.f)break;a[i]=a[p];i=p;}a[i]=node;}
  pop(){const a=this.items,first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1].f<a[child].f)child++;if(a[child].f>=last.f)break;a[i]=a[child];i=child;}a[i]=last;}return first;}
}
export function findPath(start,goal,blocks){
  const grid=gridFor(blocks),blocked=(x,z)=>x<0||z<0||x>=SIZE||z>=SIZE||grid[z*SIZE+x]===1;
  const nearest=p=>{const ox=coord(p.x),oz=coord(p.z);for(let radius=0;radius<SIZE;radius++){let best=null,dist=Infinity;for(let x=ox-radius;x<=ox+radius;x++)for(let z=oz-radius;z<=oz+radius;z++){if(radius&&Math.max(Math.abs(x-ox),Math.abs(z-oz))!==radius)continue;if(blocked(x,z))continue;const d=(MIN+x*CELL-p.x)**2+(MIN+z*CELL-p.z)**2;if(d<dist){best={x,z};dist=d;}}if(best)return best;}return null;};
  const from=nearest(start),to=nearest(goal);if(!from||!to)return [];
  const end={x:MIN+to.x*CELL,z:MIN+to.z*CELL};if(clearSegment(start,end,blocks))return [end];
  const initial=from.z*SIZE+from.x,final=to.z*SIZE+to.x;
  const score=new Float64Array(COUNT).fill(Infinity),parents=new Int32Array(COUNT).fill(-1),closed=new Uint8Array(COUNT),open=new Heap();
  const h=(x,z)=>{const dx=Math.abs(x-to.x),dz=Math.abs(z-to.z);return Math.max(dx,dz)+(Math.SQRT2-1)*Math.min(dx,dz);};
  score[initial]=0;open.push({k:initial,f:h(from.x,from.z)});
  while(open.items.length){const {k}=open.pop();if(closed[k])continue;
    if(k===final){const route=[];let cursor=k;while(cursor!==initial){route.push({x:MIN+(cursor%SIZE)*CELL,z:MIN+Math.floor(cursor/SIZE)*CELL});cursor=parents[cursor];if(cursor<0)return [];}
      route.reverse();const smooth=[];let anchor=start,i=0;while(i<route.length){let furthest=i;while(furthest+1<route.length&&clearSegment(anchor,route[furthest+1],blocks))furthest++;smooth.push(route[furthest]);anchor=route[furthest];i=furthest+1;}return smooth;
    }
    closed[k]=1;const px=k%SIZE,pz=Math.floor(k/SIZE);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=px+dx,z=pz+dz,nk=z*SIZE+x;if(blocked(x,z)||closed[nk]||(dx&&dz&&(blocked(px+dx,pz)||blocked(px,pz+dz))))continue;const g=score[k]+(dx&&dz?Math.SQRT2:1);if(g<score[nk]){score[nk]=g;parents[nk]=k;open.push({k:nk,f:g+h(x,z)});}}
  }
  return [];
}
