import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../membership-client-src.js',import.meta.url),'utf8');
const drawSource=source.slice(source.indexOf('function draw(){'),source.indexOf('\nasync function api('));
function draw({freeLaunch=true,native=false,user={id:'verified-user'},status={plan:'premium',free_launch:true},billingManagementEnabled=true}={}){
 const nodes=new Map(),node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',firstChild:{textContent:''}});return nodes.get(id);};
 const plans=[{dataset:{plan:'monthly'}},{dataset:{plan:'annual'}}],restoreButton={};
 const ctx={config:{enabled:true,freeLaunch,billingEnabled:!freeLaunch,billingManagementEnabled,stores:{apple:!freeLaunch,google:!freeLaunch}},status,user,authView:'signin',recovery:false,signupButton:{},button:{},drawHomepagePlans(){},drawResend(){},native:()=>native,nativePlatform:()=> 'ios',storePrices:{monthly:{priceString:'$2.99'},annual:{priceString:'$30'}},selectedPlan:null,dialog:{querySelectorAll:()=>plans},restoreButton,$:node};
 vm.createContext(ctx);vm.runInContext(drawSource+'\ndraw();',ctx);
 return {nodes,node,ctx,plans,restoreButton};
}
test('free launch hides new payment choices and retains permitted website subscription management',()=>{
 const t=draw();assert.equal(t.ctx.button.textContent,'Free launch access');
 assert.match(t.node('accountStatus').textContent,/Unlimited searches and watchlists during the free launch period/);
 for(const id of ['signupFreeTier','signupRenewal','accountPlanSummary','accountWallets','signupWallets'])assert.equal(t.node(id).hidden,true,id);
 assert.ok(t.plans.every(p=>p.hidden));assert.equal(t.node('accountPortal').hidden,false);assert.equal(t.node('accountContinue').hidden,false);
 assert.equal(t.node('accountContinue').textContent,'Continue exploring');assert.match(t.node('membershipPriceNote').textContent,/Streaming provider subscriptions are separate/);
 const blocked=draw({billingManagementEnabled:false});assert.equal(blocked.node('accountPortal').hidden,true);
});
test('native free launch avoids new purchase prompts while preserving store cancellation access',()=>{
 const t=draw({native:true});assert.ok(t.plans.every(p=>p.hidden));assert.equal(t.restoreButton.hidden,true);
 assert.equal(t.node('accountWallets').hidden,true);assert.equal(t.node('accountPortal').hidden,false);assert.equal(t.node('accountPortal').textContent,'Manage store subscriptions');
});
test('free launch presentation never pretends an unverified guest has Premium',()=>{
 const t=draw({user:null,status:null});assert.equal(t.ctx.button.textContent,'Sign in');assert.equal(t.node('accountPlans').hidden,true);
 assert.equal(t.node('accountStatus').textContent,'Sign in to your StreamUnify account.');
 assert.match(source,/get premium\(\)\{return status\?\.plan==='premium';\}/);
});
test('turning launch mode off preserves normal paid account choices and labels',()=>{
 const t=draw({freeLaunch:false,status:{plan:'free',remaining:9}});assert.equal(t.ctx.button.textContent,'My account');
 assert.ok(t.plans.every(p=>!p.hidden));assert.equal(t.node('accountWallets').hidden,false);assert.equal(t.node('signupFreeTier').hidden,false);
 assert.equal(t.node('accountContinue').textContent,'Continue with Free');assert.equal(t.node('accountStatus').textContent,'9 of 10 searches remaining.');
 const paid=draw({freeLaunch:false,status:{plan:'premium'}});assert.equal(paid.ctx.button.textContent,'Premium');assert.equal(paid.node('accountContinue').hidden,true);
});
test('new purchase handler fails closed in launch mode before invoking store or web checkout',()=>{
 assert.match(source,/b\.onclick=\(\)=>action\(async\(\)=>\{if\(config\?\.freeLaunch\)throw Error\('Free launch access is active\. No purchase is needed\.'\);if\(native\(\)\)/);
 assert.match(source,/if\(!config\.freeLaunch\)storePrices=await nativeProducts/);
});

const homepageSource=source.slice(source.indexOf('function drawHomepagePlans(){'),source.indexOf('\ndrawHomepagePlans();'));
test('website and native homepage replace paid cards with free account guidance without starting checkout',()=>{
 for(const onDevice of [false,true]){
  const paid=[{},{}],free=[{}],web=[{}],references=[{}],storePrices=[{dataset:{suStorePrice:'monthly'}}],buttons=[{dataset:{suMembership:'monthly'}},{dataset:{suMembership:'free-launch'}}],note={},calls=[];
  const ctx={config:{enabled:true,freeLaunch:true,stores:{apple:false}},client:{},native:()=>onDevice,nativePlatform:()=> 'ios',nativePlanText:()=> 'unused',storePricesState:'ready',storePrices:{},busy:false,user:null,authView:'signin',selectedPlan:'annual',sessionStorage:{removeItem:()=>calls.push('clear-plan')},document:{querySelectorAll:q=>({'[data-su-paid-only]':paid,'[data-su-free-launch]':free,'[data-su-web-pricing]':web,'[data-su-web-reference]':references,'[data-su-store-price]':storePrices,'[data-su-membership]':buttons}[q]||[])},$:id=>id==='suPlansStatus'?note:{focus(){}},setAuthView:v=>calls.push(v),show:()=>calls.push('show')};
  vm.createContext(ctx);vm.runInContext(homepageSource+'\ndrawHomepagePlans();',ctx);
  assert.ok(paid.every(p=>p.hidden));assert.ok(free.every(p=>!p.hidden));assert.ok(web.every(p=>p.hidden));assert.ok(storePrices.every(p=>p.hidden));assert.equal(buttons[0].hidden,true);
  assert.match(note.textContent,/Unlimited searches and watchlists/);buttons[1].onclick();assert.equal(ctx.selectedPlan,null);assert.deepEqual(calls,['clear-plan','signup','show']);
 }
});

test('paid pricing stays hidden until membership configuration confirms paid mode',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const tags=[...html.matchAll(/<[^>]+data-su-paid-only[^>]*>/g)].map(m=>m[0]);assert.ok(tags.length>=4);assert.ok(tags.every(tag=>/\bhidden\b/.test(tag)));
 const paid=[{}],ctx={config:undefined,client:{},native:()=>false,nativePlatform:()=> 'ios',nativePlanText:()=>'',storePricesState:'loading',storePrices:{},busy:false,document:{querySelectorAll:q=>q==='[data-su-paid-only]'?paid:[]},$:()=>({})};
 vm.createContext(ctx);vm.runInContext(homepageSource+'\ndrawHomepagePlans();',ctx);assert.equal(paid[0].hidden,true);
 ctx.config={enabled:true,freeLaunch:false};vm.runInContext('drawHomepagePlans();',ctx);assert.equal(paid[0].hidden,false);
 ctx.config={enabled:true,freeLaunch:true};vm.runInContext('drawHomepagePlans();',ctx);assert.equal(paid[0].hidden,true);
});
