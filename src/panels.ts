import {TYPES,CATEGORIES,BUILDINGS,UPGRADES,economy,FORMATIONS} from '../server/rules.mjs';
import {$,type State,type Kind,type BuildingKind,type UpgradeKind} from './types';
type Panel='squad'|'vehicles'|'buildings'|'fortress';
const titles={squad:'Отряд',vehicles:'Техника',buildings:'Постройки',fortress:'Крепость'};
export class TacticalPanels {
  active:Panel|null=null;
  private deck=document.querySelector<HTMLElement>('.command-deck')!;
  private state:State|null=null;private me='';private category='armor';private buildingSignature='';
  constructor(private send:(c:object)=>void,private build:(type:BuildingKind)=>void,private focus:(x:number,z:number)=>void){
    const selection=this.deck.querySelector('.selection')!,orders=this.deck.querySelector('.orders')!,production=this.deck.querySelector('.production')!;
    this.deck.replaceChildren();this.deck.classList.add('tactical-drawer');
    const head=document.createElement('div');head.className='drawer-heading';head.innerHTML='<span id="drawer-title">Командование</span><button id="collapse-panel" aria-label="Свернуть панель">⌄</button>';this.deck.append(head);
    for(const name of Object.keys(titles) as Panel[]){const panel=document.createElement('section');panel.id='panel-'+name;panel.className='drawer-content';panel.hidden=true;this.deck.append(panel);}
    $('panel-squad').append(selection,orders);
    const tactics=document.createElement('div');tactics.className='tactics-options';tactics.innerHTML='<label for="formation">Построение</label><select id="formation" aria-label="Построение отряда"></select><button id="toggle-left-orders" aria-pressed="false">Приказы: ПКМ</button><button id="toggle-ranges" aria-pressed="false">Дальность</button>';$('panel-squad').append(tactics);for(const [value,name] of Object.entries(FORMATIONS)){const option=document.createElement('option');option.value=value;option.textContent=name;$('formation').append(option);}
    $('panel-vehicles').append(production);
    const filters=document.createElement('div');filters.className='category-tabs';filters.setAttribute('aria-label','Категории техники');
    for(const [id,name] of Object.entries(CATEGORIES)){const b=document.createElement('button');b.textContent=name;b.dataset.category=id;b.onclick=()=>{this.category=id;this.filter();};filters.append(b);}
    production.querySelector('.eyebrow')!.after(filters);const cards=production.querySelector('.cards')!;cards.replaceChildren();
    for(const [id,t] of Object.entries(TYPES)){
      const b=document.createElement('button');b.dataset.unit=id;b.dataset.category=t.category;b.innerHTML=`<img src="/portraits/${id}.png" alt=""><div><strong>${t.name}</strong><small>${t.role}</small><span>◈ ${t.cost}<small>${t.time} с</small></span><small class="tech-lock">${t.tier?'Промышленность I':'Доступно сразу'}</small></div>`;
      b.title=`${t.hp} HP · ${t.speed} м/с · ${t.range?`дальность ${t.range} м · урон ${t.damage}`:'ремонт союзников в радиусе 11 м'}`;b.onclick=()=>this.send({type:'produce',unit:id});cards.append(b);
    }
    $('panel-buildings').innerHTML='<p class="panel-intro">Выберите постройку, затем свободное место у штаба. Зелёный контур — можно строить. ПКМ / Esc — отмена.</p><div class="building-cards"></div><div id="owned-buildings" aria-label="Ваши постройки"></div>';
    const icons={generator:'ϟ',refinery:'◈',mine:'▥',workshop:'⚒',turret:'⌖'};
    for(const [id,t] of Object.entries(BUILDINGS)){
      const b=document.createElement('button');b.dataset.building=id;b.className='building-card';b.innerHTML=`<span class="building-mark">${icons[id as BuildingKind]}</span><div><strong>${t.name}</strong><small>${t.role}</small><span>◈ ${t.cost} · ${t.time} с <small data-limit></small></span><small class="tech-lock">${t.tier?'Промышленность I':''}</small></div>`;b.onclick=()=>this.build(id as BuildingKind);$('panel-buildings').querySelector('.building-cards')!.append(b);
    }
    $('panel-fortress').innerHTML='<div class="fortress-summary"><div><small>ОБОРОНИТЕЛЬНЫЙ ШТАБ</small><h2 id="fortress-health"></h2></div><button id="fortress-home">⌂ Показать штаб</button></div><p id="fortress-stats"></p><div id="research-progress" role="status"></div><div class="upgrade-cards"></div>';
    for(const [id,t] of Object.entries(UPGRADES)){const b=document.createElement('button');b.dataset.upgrade=id;b.innerHTML=`<div><strong>${t.name}</strong><b data-level></b></div><small>${t.role}</small><span data-cost></span>`;b.onclick=()=>this.send({type:'upgrade',upgrade:id});$('panel-fortress').querySelector('.upgrade-cards')!.append(b);}
    $('fortress-home').onclick=()=>{const b=this.state?.bases.find(b=>b.owner===this.me);if(b){this.focus(b.x,b.z);this.open(null);}};
    const dock=document.createElement('nav');dock.className='tactical-dock';dock.setAttribute('aria-label','Панели командования');dock.innerHTML='<span id="squad-summary">6 единиц</span>';
    for(const id of Object.keys(titles) as Panel[]){const b=document.createElement('button');b.id='dock-'+id;b.setAttribute('aria-controls','panel-'+id);b.setAttribute('aria-expanded','false');b.innerHTML=`<span>${{squad:'▦',vehicles:'▰',buildings:'▥',fortress:'⌂'}[id]}</span>${titles[id]}<small id="badge-${id}"></small>`;b.onclick=()=>this.open(this.active===id?null:id);dock.append(b);}
    $('ui').append(dock);$('collapse-panel').onclick=()=>this.open(null);
    const energy=document.createElement('div');energy.className='resource energy';energy.innerHTML='<span>ϟ</span><div><b id="power">0 / 12</b><small>ЭНЕРГИЯ</small></div>';document.querySelector('.battle-top #fullscreen')!.before(energy);
    const tools=document.createElement('div');tools.className='battle-tools';tools.innerHTML='<button id="toggle-status" aria-expanded="false">Обстановка</button><button id="toggle-map" aria-expanded="true">Миникарта</button><button id="input-lock" title="Полный экран с захватом клавиатуры">⛶ Захват клавиш</button>';$('ui').append(tools);
    const status=document.querySelector<HTMLElement>('.battle-status')!,map=document.querySelector<HTMLElement>('.battle-map')!;status.hidden=true;
    $('toggle-status').onclick=()=>{status.hidden=!status.hidden;$('toggle-status').setAttribute('aria-expanded',String(!status.hidden));};
    $('toggle-map').onclick=()=>{map.hidden=!map.hidden;$('toggle-map').setAttribute('aria-expanded',String(!map.hidden));};
    const log=document.createElement('details');log.className='battle-log';log.innerHTML='<summary>Сводка боя <span id="log-count">0</span></summary><ol id="battle-events"></ol>';$('ui').append(log);this.filter();this.open(null);
  }
  report(message:string,time:number){const list=$('battle-events'),row=document.createElement('li'),clock=document.createElement('time');clock.textContent=Math.floor(time/60).toString().padStart(2,'0')+':'+Math.floor(time%60).toString().padStart(2,'0');row.append(clock,document.createTextNode(message));list.prepend(row);while(list.children.length>30)list.lastElementChild!.remove();$('log-count').textContent=String(list.children.length);}
  clearLog(){$('battle-events').replaceChildren();$('log-count').textContent='0';}
  open(panel:Panel|null){this.active=panel;this.deck.hidden=!panel;for(const id of Object.keys(titles) as Panel[]){$('panel-'+id).hidden=id!==panel;$('dock-'+id).setAttribute('aria-expanded',String(id===panel));$('dock-'+id).classList.toggle('active',id===panel);}if(panel)$('drawer-title').textContent=titles[panel];$('ui').classList.toggle('drawer-open',!!panel);}
  private filter(){document.querySelectorAll<HTMLButtonElement>('.category-tabs button').forEach(b=>{const active=b.dataset.category===this.category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});document.querySelectorAll<HTMLElement>('.cards [data-unit]').forEach(b=>b.hidden=b.dataset.category!==this.category);}
  update(s:State,me:string,connected:boolean,selected:number){
    this.state=s;this.me=me;const p=s.players.find(p=>p.id===me)!;const e=economy(s,me),available=connected&&p.alive&&!s.ended;
    $('income').textContent=`+${e.income} / сек`;$('power').textContent=`${e.demand} / ${e.capacity}`;$('power').classList.toggle('power-warning',e.demand>e.capacity);$('capture').textContent=`${s.points.filter(p=>p.owner===me).length} / ${s.points.length} ВЫШЕК`;
    $('squad-summary').textContent=selected?`${selected} ед. выделено`:'Отряд не выбран';$('badge-vehicles').textContent=p.queue.length?String(p.queue.length):'';$('badge-buildings').textContent=String(s.buildings.filter(b=>b.owner===me).length);$('badge-fortress').textContent=p.research?Math.ceil(p.research.left)+'с':'';
    document.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(b=>{const t=TYPES[b.dataset.unit as Kind];b.disabled=!available||p.credits<t.cost||p.queue.length>=5||s.units.filter(u=>u.owner===me).length+p.queue.length>=30||p.upgrades.logistics<t.tier;b.querySelector<HTMLElement>('.tech-lock')!.textContent=p.upgrades.logistics<t.tier?'🔒 Промышленность I':'';});
    document.querySelectorAll<HTMLButtonElement>('[data-building]').forEach(b=>{const t=BUILDINGS[b.dataset.building as BuildingKind],count=s.buildings.filter(x=>x.owner===me&&x.type===b.dataset.building).length;b.disabled=!available||p.credits<t.cost||p.upgrades.logistics<t.tier||count>=t.limit||(t.power>0&&e.demand+t.power>e.capacity);b.querySelector('[data-limit]')!.textContent=`${count} / ${t.limit}`;b.querySelector('.tech-lock')!.textContent=p.upgrades.logistics<t.tier?'🔒 Промышленность I':t.power>0&&e.demand+t.power>e.capacity?'Нужна электростанция':'';});
    const base=s.bases.find(b=>b.owner===me)!;$('fortress-health').textContent=`${Math.max(0,Math.ceil(base.hp))} / ${base.maxHp} HP`;$('fortress-stats').textContent=`Орудие: ${32+p.upgrades.weapons*12} урона · ${31+p.upgrades.weapons*4} м · ремонт ${8+p.upgrades.repair*6} HP/с · производство ×${e.speed.toFixed(2)}`;
    $('research-progress').textContent=p.research?`${UPGRADES[p.research.type].name} → ${p.upgrades[p.research.type]+1} · ${Math.ceil(p.research.left)} с`:'Выберите направление развития крепости';
    document.querySelectorAll<HTMLButtonElement>('[data-upgrade]').forEach(b=>{const id=b.dataset.upgrade as UpgradeKind,t=UPGRADES[id],level=p.upgrades[id];b.querySelector('[data-level]')!.textContent=`${level} / ${t.max}`;b.querySelector('[data-cost]')!.textContent=level>=t.max?'МАКСИМУМ':`◈ ${t.cost*(level+1)} · ${t.time*(level+1)} с`;b.disabled=!available||!!p.research||level>=t.max||p.credits<t.cost*(level+1);});
    const buildings=s.buildings.filter(b=>b.owner===me),signature=buildings.map(b=>b.id+':'+(b.left>0)).join(',');
    if(signature!==this.buildingSignature){this.buildingSignature=signature;const list=$('owned-buildings');list.replaceChildren();for(const b of buildings){const row=document.createElement('div');row.className='owned-building';row.innerHTML=`<button data-focus-building="${b.id}">${BUILDINGS[b.type].name} ↗</button><span id="building-state-${b.id}"></span>`;row.querySelector('button')!.onclick=()=>{this.focus(b.x,b.z);this.open(null);};if(b.left>0){const cancel=document.createElement('button');cancel.textContent='Отменить';cancel.title='Возврат до 75% стоимости с учётом повреждений';cancel.onclick=()=>this.send({type:'cancelBuild',id:b.id});row.append(cancel);}list.append(row);}}
    for(const b of buildings)$('building-state-'+b.id).textContent=b.left>0?Math.ceil(b.left)+'с':b.powered?'Работает':'Нет энергии';
  }
}
