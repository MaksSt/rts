type KeyboardAccess={lock:(codes?:string[])=>Promise<void>;unlock:()=>void};
const keyboard=()=> (navigator as Navigator&{keyboard?:KeyboardAccess}).keyboard;
const captured=['KeyT','KeyN','KeyW','KeyR','KeyL','KeyD','KeyO','KeyP','KeyS','KeyF','KeyH','KeyJ','KeyK','KeyU','KeyB','Tab','Backspace','F1','F3','F5','F6','F7','F11','ArrowLeft','ArrowRight','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Equal','Minus','NumpadAdd','NumpadSubtract'];
export class InputGuard {
  locked=false;
  constructor(private active:()=>boolean,private notify:(text:string)=>void,private change:()=>void){
    // Фильтр работает раньше игровых биндов и также защищает открытое меню матча.
    window.addEventListener('keydown',e=>{
      if(!this.active())return;
      const editing=e.target instanceof HTMLElement&&!!e.target.closest('input,textarea,select,[contenteditable=true]');
      if(editing&&!(e.altKey||(['KeyT','KeyN','KeyW','KeyR','KeyL','KeyO','KeyP','Tab'].includes(e.code)&&(e.ctrlKey||e.metaKey)))&&e.code!=='F5')return;
      if((e.ctrlKey||e.metaKey||e.altKey)||['F1','F3','F5','F6','F7','Backspace'].includes(e.code)){
        e.preventDefault();e.stopImmediatePropagation();
      }
    },true);
    window.addEventListener('auxclick',e=>{if(this.active()&&[1,3,4].includes(e.button))e.preventDefault();},true);
    window.addEventListener('pointerdown',e=>{if(this.active()&&[1,3,4].includes(e.button))e.preventDefault();},true);
    window.addEventListener('dragstart',e=>{if(this.active())e.preventDefault();},true);
    window.addEventListener('wheel',e=>{if(this.active()&&(e.ctrlKey||e.metaKey))e.preventDefault();},{passive:false,capture:true});
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement){this.release();this.change();}});
  }
  release(){keyboard()?.unlock();this.locked=false;}
  async fullscreen(retry=false){
    if(document.fullscreenElement&&(!retry||this.locked)){await document.exitFullscreen();return;}
    try{
      if(!document.fullscreenElement)await document.documentElement.requestFullscreen();
      if(this.active()&&window.isSecureContext&&keyboard()?.lock){
        // Esc остаётся доступен для выхода. ОС может оставить часть своих сочетаний.
        await keyboard()!.lock(captured);this.locked=true;this.notify('Захват клавиатуры включён · Esc — выход из полного экрана');
      }else this.notify(this.active()?'Полный экран включён. Для захвата системных клавиш нужны Chrome/Edge и HTTPS или localhost.':'Полный экран включён. Захват клавиш доступен во время матча.');
    }catch{this.locked=false;this.notify('Браузер не разрешил захват. Доступные сочетания фильтруются, предупреждение о выходе остаётся.');}
    this.change();
  }
}
