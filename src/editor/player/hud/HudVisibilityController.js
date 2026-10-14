const CAPTURE_ROOTS = '.player-hud, .spell-menu, .free-flight-hints, .perf-qa-overlay, .view-mode-switcher, .sidebar, .natural-toolbar, .viewport-toolbar, .fps-average';
/** Presentation-only visibility; component hidden state and the world continue unchanged. */
export class HudVisibilityController {
  constructor({ root = document, isBlocked = () => false, isReady = () => true }) {
    Object.assign(this,{root,isBlocked,isReady});this.captured=false;this.previous=new Map();
    for(const node of root.querySelectorAll(CAPTURE_ROOTS))node.dataset.captureUi='';
  }
  setCapture(hidden) {
    if(hidden===this.captured)return true;
    if(hidden&&(this.isBlocked()||!this.isReady()))return false;
    this.captured=hidden;
    if(hidden) {
      for(const node of this.root.querySelectorAll('[data-capture-ui]')) {
        this.previous.set(node,{visibility:node.style.visibility,inert:node.inert,aria:node.getAttribute('aria-hidden')});
        node.style.visibility='hidden';node.inert=true;node.setAttribute('aria-hidden','true');
      }
    } else {
      for(const [node,state] of this.previous) {
        node.style.visibility=state.visibility;node.inert=state.inert;
        if(state.aria===null)node.removeAttribute('aria-hidden');else node.setAttribute('aria-hidden',state.aria);
      }
      this.previous.clear();
    }
    return true;
  }
  toggle() {return this.setCapture(!this.captured);}
  dispose() {this.setCapture(false);}
}
