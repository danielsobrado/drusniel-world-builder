import assert from 'node:assert/strict';
import test from 'node:test';
import { HudVisibilityController } from '../src/editor/player/hud/HudVisibilityController.js';
import { readHudMetricsPreference,writeHudMetricsPreference,HUD_METRICS_STORAGE_KEY } from '../src/editor/player/hud/HudMetricsPreference.js';
class Element {
 constructor(){this.style={visibility:''};this.attrs=new Map();this.dataset={};this.inert=false;this.hidden=false;}
 getAttribute(k){return this.attrs.get(k)??null;}setAttribute(k,v){this.attrs.set(k,v);}removeAttribute(k){this.attrs.delete(k);}
 toggleAttribute(k,on){if(on)this.attrs.set(k,'');else this.attrs.delete(k);}
}
function fixture(options={}) {
 const a=new Element(),b=new Element(),html=new Element();b.hidden=true;b.setAttribute('aria-hidden','true');b.inert=true;b.style.visibility='collapse';
 const root={documentElement:html,querySelectorAll:()=>[a,b]},controller=new HudVisibilityController({root,...options});
 return {a,b,html,controller};
}
test('capture restores own style, inert and ARIA while preserving changes to component hidden state',()=>{
 const {a,b,html,controller}=fixture();
 assert.equal(controller.setCapture(true),true);assert.equal(a.inert,true);assert.equal(a.getAttribute('aria-hidden'),'true');assert.ok(html.attrs.has('data-world-capture'));
 b.hidden=false;a.hidden=true;
 controller.setCapture(false);assert.equal(a.hidden,true);assert.equal(b.hidden,false);assert.equal(a.style.visibility,'');assert.equal(a.inert,false);assert.equal(a.getAttribute('aria-hidden'),null);
 assert.equal(b.style.visibility,'collapse');assert.equal(b.inert,true);assert.equal(b.getAttribute('aria-hidden'),'true');assert.ok(!html.attrs.has('data-world-capture'));
});
test('blocked and unready worlds refuse entry; restoring and disposal always work',()=>{
 let blocked=true,ready=true;const {a,controller}=fixture({isBlocked:()=>blocked,isReady:()=>ready});
 assert.equal(controller.toggle(),false);assert.equal(a.inert,false);blocked=false;ready=false;assert.equal(controller.toggle(),false);
 ready=true;assert.equal(controller.toggle(),true);blocked=true;ready=false;controller.dispose();assert.equal(a.inert,false);assert.equal(controller.captured,false);
});
test('metrics default off, persist only valid booleans and tolerate unavailable storage',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},target=new EventTarget();let changed;
 target.addEventListener('world:hud-metrics',event=>{changed=event.detail.enabled;});
 for(const value of [undefined,'false','1','invalid']){values.set(HUD_METRICS_STORAGE_KEY,value);assert.equal(readHudMetricsPreference(storage),false);}
 writeHudMetricsPreference(true,{storage,target});assert.equal(changed,true);assert.equal(readHudMetricsPreference(storage),true);
 writeHudMetricsPreference(false,{storage,target});assert.equal(readHudMetricsPreference(storage),false);
 assert.equal(readHudMetricsPreference({getItem(){throw new Error('denied');}}),false);
});
