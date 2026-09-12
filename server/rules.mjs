// Общие правила карты, производства и экономики для сервера и интерфейса.
export const MAP = {half:112, ground:256, baseRadius:10.5, buildRadius:43};
export const CATEGORIES = {light:'Разведка',armor:'Бронетехника',artillery:'Артиллерия',support:'Поддержка'};
export const FORMATIONS={line:'Линия',column:'Колонна',spread:'Рассредоточение',wedge:'Клин'};
export function formationOffset(index,count,formation='line'){
  if(formation==='column')return {x:(index%2-.5)*3.8,z:Math.floor(index/2)*4};
  if(formation==='spread'){const width=Math.min(count,5);return {x:(index%width-(width-1)/2)*6.5,z:Math.floor(index/width)*6.5};}
  if(formation==='wedge'){if(index===0)return {x:0,z:0};const row=Math.ceil(index/2);return {x:(index%2?-1:1)*row*3.7,z:row*3.7};}
  return {x:(index%5-Math.min(count-1,4)/2)*3.5,z:Math.floor(index/5)*3.5};
}
export const veteranRank=kills=>kills>=5?2:kills>=2?1:0;
export const TYPES = {
  buggy:{name:'Искра',role:'Быстрый рейдер',category:'light',tier:0,cost:120,time:4,hp:95,speed:12,range:15,damage:9,reload:.45,indirect:false,splash:0,heal:0},
  scout:{name:'Вектор',role:'Разведывательный БТР',category:'light',tier:0,cost:180,time:5,hp:155,speed:8.5,range:18,damage:14,reload:.65,indirect:false,splash:0,heal:0},
  tank:{name:'Бастион',role:'Основной боевой танк',category:'armor',tier:0,cost:300,time:8,hp:300,speed:5,range:23,damage:38,reload:1.7,indirect:false,splash:0,heal:0},
  heavy:{name:'Монолит',role:'Тяжёлый штурмовой танк',category:'armor',tier:1,cost:650,time:15,hp:620,speed:3.5,range:25,damage:65,reload:2.2,indirect:false,splash:0,heal:0},
  destroyer:{name:'Копьё',role:'Дальнобойный истребитель танков',category:'armor',tier:1,cost:480,time:11,hp:225,speed:5.3,range:33,damage:90,reload:3,indirect:false,splash:0,heal:0},
  artillery:{name:'Гром',role:'Самоходная артиллерия',category:'artillery',tier:0,cost:420,time:10,hp:165,speed:3.8,range:42,damage:72,reload:3.4,indirect:true,splash:3.5,heal:0},
  rocket:{name:'Шквал',role:'Ракетная система · урон по площади',category:'artillery',tier:1,cost:600,time:14,hp:180,speed:4.8,range:47,damage:95,reload:4.8,indirect:true,splash:6,heal:0},
  repair:{name:'Оплот',role:'Мобильный ремонт · 12 HP/с',category:'support',tier:0,cost:260,time:7,hp:200,speed:6.2,range:0,damage:0,reload:1,indirect:false,splash:0,heal:12},
};
export const BUILDINGS = {
  generator:{name:'Электростанция',role:'+16 энергии для построек',category:'economy',cost:250,time:10,hp:600,radius:4,power:-16,income:0,limit:5,tier:0,range:0,damage:0,reload:1},
  refinery:{name:'Нефтепереработка',role:'+10 ресурсов/с · 4 энергии',category:'economy',cost:450,time:14,hp:700,radius:5,power:4,income:10,limit:4,tier:0,range:0,damage:0,reload:1},
  mine:{name:'Рудный комбинат',role:'+18 ресурсов/с · 7 энергии',category:'economy',cost:800,time:20,hp:850,radius:5,power:7,income:18,limit:2,tier:1,range:0,damage:0,reload:1},
  workshop:{name:'Сборочный цех',role:'+25% скорости производства · 5 энергии',category:'support',cost:550,time:16,hp:800,radius:5,power:5,income:0,limit:2,tier:0,range:0,damage:0,reload:1},
  turret:{name:'Орудийный бастион',role:'Защита периметра · 3 энергии',category:'defense',cost:350,time:12,hp:850,radius:3,power:3,income:0,limit:6,tier:0,range:28,damage:27,reload:1.15},
};
export const UPGRADES = {
  weapons:{name:'Орудийный комплекс',role:'+12 урона и +4 м дальности за уровень',cost:450,time:16,max:2},
  armor:{name:'Фортификация',role:'+1000 прочности и восстановление 1000 HP',cost:400,time:14,max:2},
  logistics:{name:'Военная промышленность',role:'Ур. 1: тяжёлая техника и комбинат. Каждый уровень: +15% производства',cost:600,time:20,max:2},
  repair:{name:'Ремонтный гарнизон',role:'+6 HP/с ремонта техники и +3 HP/с штабу вне боя за уровень',cost:350,time:12,max:2},
};
export const SPAWNS=[[-82,76],[82,-76],[82,76],[-82,-76]];
export const MAPS={dunes:{name:'Железные дюны',seed:73,description:'224 × 224 м · 4 крепости · 9 нефтяных вышек',points:[[0,0],[-42,40],[42,-40],[42,40],[-42,-40],[0,65],[0,-65],[65,0],[-65,0]]}};
export function terrain(_map='dunes') {return [[15,28,5,8],[53,19,5.5,9],[100,35,4.5,6],[25,96,6,10],[58,61,4.5,7],[28,52,4,5]].flatMap(([x,z,r,h])=>[[-1,-1],[-1,1],[1,-1],[1,1]].map(([sx,sz])=>({x:x*sx,z:z*sz,r,h})));}
export function economy(s,owner){
  const p=s.players.find(p=>p.id===owner),own=(s.buildings??[]).filter(b=>b.owner===owner&&b.hp>0);
  const capacity=12+own.filter(b=>b.left<=0&&BUILDINGS[b.type].power<0).reduce((n,b)=>n-BUILDINGS[b.type].power,0);
  let used=0,income=4+s.points.filter(o=>o.owner===owner).length*12,workshops=0;
  const powered=new Set();
  // Порядок постройки определяет приоритет при потере электростанции.
  for(const b of own){const t=BUILDINGS[b.type];if(t.power<=0){powered.add(b.id);continue;}if(used+t.power<=capacity){used+=t.power;powered.add(b.id);if(b.left<=0){income+=t.income;if(b.type==='workshop')workshops++;}}}
  const demand=own.reduce((n,b)=>n+Math.max(0,BUILDINGS[b.type].power),0);
  return {capacity,used,demand,income,speed:1+workshops*.25+(p?.upgrades?.logistics??0)*.15,powered};
}
export function placementError(s,owner,type,x,z){
  if(typeof type!=='string'||!Object.hasOwn(BUILDINGS,type))return 'Неизвестная постройка';
  if(!Number.isFinite(x)||!Number.isFinite(z))return 'Неверная позиция';
  const t=BUILDINGS[type],base=s.bases.find(b=>b.owner===owner&&b.hp>0);
  if(!base||Math.hypot(x-base.x,z-base.z)>MAP.buildRadius)return 'Стройте не дальше 43 м от штаба';
  if(Math.abs(x)>MAP.half-t.radius-2||Math.abs(z)>MAP.half-t.radius-2)return 'За границей карты';
  const blocks=[...terrain(s.map),...s.bases.filter(b=>b.hp>0).map(b=>({...b,r:MAP.baseRadius})),...(s.buildings??[]).filter(b=>b.hp>0).map(b=>({...b,r:BUILDINGS[b.type].radius})),...s.points.map(p=>({...p,r:5}))];
  if(blocks.some(b=>Math.hypot(x-b.x,z-b.z)<t.radius+b.r+3))return 'Нужен свободный участок с проходом вокруг';
  if(s.units.some(u=>u.hp>0&&Math.hypot(x-u.x,z-u.z)<t.radius+2))return 'На участке находится техника';
  if(Math.hypot(x-base.x,z-(base.z+(base.z>0?-15:15)))<t.radius+7)return 'Оставьте выезд из ангара свободным';
  return null;
}
