import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../membership-client-src.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('function drawHomepagePlans(){'),source.indexOf('\ndrawHomepagePlans();'));
function setup(overrides={}){
  const web=[{hidden:false}],monthly={dataset:{suStorePrice:'monthly'}},annual={dataset:{suStorePrice:'annual'}},buttons=[{dataset:{suMembership:'monthly'}}],note={};
  const calls=[];
  const ctx={native:()=>false,config:{enabled:true},client:{},busy:false,user:null,authView:'signin',storePrices:{},document:{querySelectorAll:s=>({'[data-su-web-pricing]':web,'[data-su-store-price]':[monthly,annual],'[data-su-membership]':buttons}[s]||[])},$:id=>id==='suPlansStatus'?note:{focus:()=>calls.push('focus')},setAuthView:v=>{ctx.authView=v;calls.push(v);},show:()=>calls.push('show'),...overrides};
  vm.createContext(ctx);vm.runInContext(fn+'\ndrawHomepagePlans();',ctx);
  return {ctx,web,monthly,annual,buttons,note,calls,draw:()=>vm.runInContext('drawHomepagePlans()',ctx)};
}
test('web cards retain web prices and open existing signup flow, not checkout',()=>{
  const t=setup();assert.equal(t.web[0].hidden,false);assert.equal(t.monthly.hidden,true);assert.equal(t.buttons[0].disabled,false);t.buttons[0].onclick();assert.deepEqual(t.calls,['signup','show','focus']);
});
test('disabled membership never opens account or checkout from homepage',()=>{
  const t=setup({config:{enabled:false}});assert.equal(t.buttons[0].disabled,true);t.buttons[0].onclick();assert.deepEqual(t.calls,[]);assert.match(t.note.textContent,/not enabled/);
});
test('native cards never show hardcoded web prices, including during config loading',()=>{
  const t=setup({native:()=>true,config:undefined,client:undefined});assert.equal(t.web[0].hidden,true);assert.equal(t.monthly.hidden,false);assert.match(t.monthly.textContent,/See store pricing/);assert.equal(t.buttons[0].disabled,true);
});
test('native prices use localized store values without invented savings',()=>{
  const t=setup({native:()=>true,storePrices:{monthly:{priceString:'€3,49'},annual:{priceString:'€34,99'}}});assert.match(t.monthly.textContent,/€3,49 \/ month/);assert.match(t.annual.textContent,/€34,99 \/ year/);assert.doesNotMatch(t.annual.textContent,/16%|\$30/);
});
test('interrupted verification and password setup are not discarded',()=>{
  for(const authView of ['checkemail','password']){const t=setup({authView});t.buttons[0].onclick();assert.deepEqual(t.calls,['show']);assert.equal(t.ctx.authView,authView);}
});
test('existing users open membership dialog without restarting registration',()=>{
  const t=setup({user:{id:'test'}});t.buttons[0].onclick();assert.deepEqual(t.calls,['show']);
});
test('unavailable account service and busy actions cannot enter card flow',()=>{
  for(const state of [{client:undefined},{busy:true}]){const t=setup(state);assert.equal(t.buttons[0].disabled,true);t.buttons[0].onclick();assert.deepEqual(t.calls,[]);}
});
