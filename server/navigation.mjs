// A* на сетке 2 м. Диагонали не проходят через углы препятствий.
const CELL = 2, SIZE = 59, MIN = -58;
const key = (x,z) => z*SIZE+x;
const coord = n => Math.max(0,Math.min(SIZE-1,Math.round((n-MIN)/CELL)));
export function obstacles(s){return [...s.rocks,...s.bases.filter(b=>b.hp>0).map(b=>({x:b.x,z:b.z,r:5.5}))];}
export function clearSegment(a,b,blocks,padding=1.35){
  const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
  return blocks.every(r=>{const t=len?Math.max(0,Math.min(1,((r.x-a.x)*dx+(r.z-a.z)*dz)/len)):0;return Math.hypot(a.x+t*dx-r.x,a.z+t*dz-r.z)>r.r+padding;});
}
export function findPath(start,goal,blocks){
  const blocked=(x,z)=>x<0||z<0||x>=SIZE||z>=SIZE||blocks.some(r=>Math.hypot(MIN+x*CELL-r.x,MIN+z*CELL-r.z)<r.r+1.6);
  const nearest=(p)=>{const ox=coord(p.x),oz=coord(p.z);for(let radius=0;radius<SIZE;radius++){let best=null,dist=Infinity;for(let x=ox-radius;x<=ox+radius;x++)for(let z=oz-radius;z<=oz+radius;z++){if(radius&&Math.max(Math.abs(x-ox),Math.abs(z-oz))!==radius)continue;if(blocked(x,z))continue;const d=Math.hypot(MIN+x*CELL-p.x,MIN+z*CELL-p.z);if(d<dist){best={x,z};dist=d;}}if(best)return best;}return null;};
  const from=nearest(start),to=nearest(goal);if(!from||!to)return [];
  const end={x:MIN+to.x*CELL,z:MIN+to.z*CELL};if(clearSegment(start,end,blocks))return [end];
  const scores=new Map([[key(from.x,from.z),0]]),parents=new Map(),open=[from],closed=new Set();
  const h=(p)=>Math.hypot(p.x-to.x,p.z-to.z);
  while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(scores.get(key(open[i].x,open[i].z))+h(open[i])<scores.get(key(open[bi].x,open[bi].z))+h(open[bi]))bi=i;
    const p=open.splice(bi,1)[0],pk=key(p.x,p.z);if(p.x===to.x&&p.z===to.z){const route=[];let k=pk;while(k!==key(from.x,from.z)){route.push({x:MIN+(k%SIZE)*CELL,z:MIN+Math.floor(k/SIZE)*CELL});k=parents.get(k);if(k===undefined)return [];}route.reverse();const smooth=[];let anchor=start,i=0;while(i<route.length){let furthest=i;while(furthest+1<route.length&&clearSegment(anchor,route[furthest+1],blocks))furthest++;smooth.push(route[furthest]);anchor=route[furthest];i=furthest+1;}return smooth;}
    closed.add(pk);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const x=p.x+dx,z=p.z+dz,nk=key(x,z);if(blocked(x,z)||closed.has(nk)||(dx&&dz&&(blocked(p.x+dx,p.z)||blocked(p.x,p.z+dz))))continue;const g=scores.get(pk)+Math.hypot(dx,dz);if(g<(scores.get(nk)??Infinity)){parents.set(nk,pk);scores.set(nk,g);if(!open.some(n=>n.x===x&&n.z===z))open.push({x,z});}}
  }return [];
}
