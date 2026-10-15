export async function checkHudInput(page) {
 const checks=[],add=(id,passed,details={})=>checks.push({id,passed,...details});
 const metrics=await page.evaluate(async()=>{
  const e=window.__editor,m=e.playerHud.metrics,original=m.getRenderer;let reads=0;
  m.getRenderer=()=>{reads++;return original();};
  const reset=e.terrainView.renderer.info.reset;
  for(let i=0;i<5;i++)m.update(i*600);
  const disabled={reads,resetSame:reset===e.terrainView.renderer.info.reset,enabled:m.enabled};
  const {writeHudMetricsPreference}=await import('/src/editor/player/hud/HudMetricsPreference.js');
  writeHudMetricsPreference(true);m.update(4000);m.update(4600);
  const enabled={reads,enabled:m.enabled,persisted:localStorage.getItem('world.hud.metrics.v1')};
  writeHudMetricsPreference(false);const afterReads=reads;
  for(let i=0;i<5;i++)m.update(5000+i*600);
  const restored={reads,resetSame:reset===e.terrainView.renderer.info.reset};m.getRenderer=original;
  return {disabled,enabled,restored,afterReads};
 });
 add('metrics default off without sampling',!metrics.disabled.enabled&&metrics.disabled.reads===0&&metrics.disabled.resetSame,metrics);
 add('metrics preference updates immediately and persists',metrics.enabled.enabled&&metrics.enabled.reads>0&&metrics.enabled.persisted==='true');
 add('metrics disabling removes renderer wrapper and sampling',metrics.restored.reads===metrics.afterReads&&metrics.restored.resetSame);
 const state=await page.evaluate(()=>{
  const e=window.__editor,canvas=e.terrainView.renderer.domElement;
  const snapshot=()=>JSON.stringify({camera:e.viewModeController.camera.position.toArray(),rotation:e.viewModeController.camera.rotation.toArray(),
   mode:e.viewModeController.mode,origin:e.terrainView.floatingOrigin.getState(),terrainRevision:e.terrainView.worldStore.revision,
   size:[canvas.width,canvas.height],exposure:e.terrainView.renderer.toneMappingExposure,pointer:document.pointerLockElement===canvas});
  const before=snapshot(),roots=[...document.querySelectorAll('[data-capture-ui]')],own=roots.map(n=>[n.hidden,n.inert,n.getAttribute('aria-hidden'),n.style.visibility]);
  const entered=e.hudVisibility.setCapture(true),hidden=roots.every(n=>getComputedStyle(n).visibility==='hidden'&&n.inert&&n.getAttribute('aria-hidden')==='true');
  e.hudVisibility.setCapture(false);
  return {entered,hidden,unchanged:before===snapshot(),restored:JSON.stringify(own)===JSON.stringify(roots.map(n=>[n.hidden,n.inert,n.getAttribute('aria-hidden'),n.style.visibility]))};
 });add('capture preserves camera renderer world and own UI states',Object.values(state).every(Boolean),state);
 await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('F8');
 add('F8 enters capture',await page.evaluate(()=>window.__editor.hudVisibility.captured));
 const repeat=await page.evaluate(()=>{
  const event=new KeyboardEvent('keydown',{key:'F8',code:'F8',repeat:true,cancelable:true,bubbles:true});window.dispatchEvent(event);
  return window.__editor.hudVisibility.captured&&!event.defaultPrevented;
 });add('repeated F8 ignored',repeat);
 await page.keyboard.press('Escape');
 add('Escape restores HUD then runs the existing pause action',await page.evaluate(()=>!window.__editor.hudVisibility.captured&&window.__editor.viewModeController.paused));
 await page.evaluate(()=>window.__editor.viewModeController.resume());
 await page.evaluate(()=>{const input=document.createElement('input');input.id='hud-qa-input';document.body.append(input);input.focus();});
 await page.keyboard.press('F8');add('text input owns F8',!await page.evaluate(()=>window.__editor.hudVisibility.captured));
 await page.evaluate(()=>document.getElementById('hud-qa-input').remove());
 for(const kind of ['modal','loading','error']) {
  await page.evaluate(kind=>{const n=document.createElement('div');n.id='hud-qa-blocker';n.style.cssText='position:fixed;inset:0;z-index:9999';
   if(kind==='modal')n.setAttribute('aria-modal','true');if(kind==='loading')n.className='loading-overlay';if(kind==='error')n.dataset.worldError='';document.body.append(n);},kind);
  await page.keyboard.press('F8');add(`${kind} blocks capture`,!await page.evaluate(()=>window.__editor.hudVisibility.captured));
  await page.evaluate(()=>document.getElementById('hud-qa-blocker').remove());
 }
 await page.keyboard.press('F8');await page.evaluate(()=>window.__editor.viewModeController.setMode('edit'));
 add('return to edit restores HUD and retains its mode-owned hidden state',await page.evaluate(()=>!window.__editor.hudVisibility.captured&&window.__editor.playerHud.element.hidden));
 return checks;
}
export async function measureHudLayout(page) {
 return page.evaluate(()=>{
  const hud=window.__editor.playerHud;hud.hints.wake();
  const nodes={legend:hud.hints.element,minimap:hud.minimap.element,metrics:hud.metrics.element,spells:document.querySelector('.spell-dock')},bounds={};
  for(const [name,node] of Object.entries(nodes))if(node&&!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden') {
   const b=node.getBoundingClientRect();bounds[name]={x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};
  }
  const overlaps=[];for(const [a,A] of Object.entries(bounds))for(const [b,B] of Object.entries(bounds))if(a<b&&A.x<B.right&&A.right>B.x&&A.y<B.bottom&&A.bottom>B.y)overlaps.push([a,b]);
  const linear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
  const luminance=rgb=>rgb.reduce((v,c,i)=>v+linear(c)*[.2126,.7152,.0722][i],0);
  const rgb=css=>css.match(/[\d.]+/g).map(Number),style=getComputedStyle(hud.hints.element),backing=rgb(style.backgroundColor),contrasts=[];
  for(const bg of [[255,255,255],[0,0,0],[215,189,131],[37,133,142]])for(const selector of ['.hud-legend','.hud-keys dd']) {
   const foreground=rgb(getComputedStyle(hud.element.querySelector(selector)).color),composited=backing.slice(0,3).map((c,i)=>c*backing[3]+bg[i]*(1-backing[3]));
   const a=luminance(foreground),b=luminance(composited);contrasts.push((Math.max(a,b)+.05)/(Math.min(a,b)+.05));
  }
  return {bounds,overlaps,contrasts,keysHidden:getComputedStyle(hud.hints.keys).display==='none'};
 });
}
