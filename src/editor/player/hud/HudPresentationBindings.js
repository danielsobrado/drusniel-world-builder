import { isTypingTarget } from '../../ui/gameplayOverlayConstants.js';
export function hasCaptureBlockingOverlay(root=globalThis.document) {
  return [...root.querySelectorAll('[aria-modal="true"],.loading-overlay,[data-world-error]')].some(node=>{
    if(node.closest('[hidden],[aria-hidden="true"]'))return false;
    const style=getComputedStyle(node);
    return style.display!=='none'&&style.visibility!=='hidden'&&node.getClientRects().length>0;
  });
}
/** UI input policy is separate from visibility and rendering. */
export class HudPresentationBindings {
  constructor({visibility,viewMode,escapeStack,viewport,target=globalThis,document:doc=globalThis.document}) {
    Object.assign(this,{visibility,viewMode,viewport,target,document:doc});
    this.onKeyDown=event=>{
      if(event.code!=='F8'||event.repeat||isTypingTarget(event.target))return;
      const ownsInput=this.visibility.captured || this.document.pointerLockElement===viewport
        || viewport.contains(this.document.activeElement) || this.document.activeElement===this.document.body;
      if(ownsInput&&this.visibility.toggle())event.preventDefault();
    };
    this.onCapture=()=>{this.visibility.setCapture(true);};
    target.addEventListener('keydown',this.onKeyDown,true);
    doc.addEventListener('world:hide-hud',this.onCapture);
    this.unregisterEscape=escapeStack.register(105,()=>{
      if(this.visibility.captured)this.visibility.setCapture(false);
      return false; // Restore first, then the existing Escape action runs in this same stack.
    },{label:'restore screenshot HUD'});
    this.unsubscribeMode=viewMode.subscribe(state=>{if(state.mode==='edit')visibility.setCapture(false);});
  }
  dispose() {
    this.target.removeEventListener('keydown',this.onKeyDown,true);
    this.document.removeEventListener('world:hide-hud',this.onCapture);
    this.unregisterEscape();this.unsubscribeMode();this.visibility.setCapture(false);
  }
}
