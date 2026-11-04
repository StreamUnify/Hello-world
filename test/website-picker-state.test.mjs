import assert from 'node:assert/strict';
import test from 'node:test';
import {pickSearchId,initialSettings,safeUrl,providerLabel,providersFor} from '../website-pick-together-model.mjs';
test('website picker display helpers preserve real provider costs and safe links',()=>{
 assert.equal(safeUrl('javascript:alert(1)'),'');
 assert.equal(safeUrl('http://example.com'),'');
 assert.equal(safeUrl('https://user:secret@example.com'),'');
 assert.equal(safeUrl('https://example.com'),'https://example.com/');
 assert.equal(providerLabel({type:'Rent'}),'Rent · extra cost');
 assert.equal(providerLabel({type:'Subscription'}),'Subscription required');
 assert.equal(providerLabel({type:'Ad-supported'}),'Free with ads');
 assert.equal(providerLabel({type:'Subscription',extraCost:true}),'Separate add-on subscription required');
 assert.equal(providerLabel({type:'Subscription',addon:{id:1}}),'Separate add-on subscription required');
 assert.equal(providerLabel({type:'Subscription',costNote:'Separate add-on subscription required'}),'Separate add-on subscription required');
 assert.deepEqual(providersFor({providers:[1]}),[1]);
 assert.notEqual(initialSettings(),initialSettings());
});
test('website picker uses real API and handles failures and stale responses',async()=>{
let Class;
globalThis.HTMLElement=class{attachShadow(){this.shadowRoot={};}};
globalThis.customElements={define(name,c){assert.equal(name,'su-web-pick-together');Class=c;}};
globalThis.document={getElementById(){return null;},querySelector(){return null;},addEventListener(){}};
globalThis.window={addEventListener(){},membershipReady:Promise.resolve(),StreamUnifyI18n:{locale:'en-US'}};
await import('../website-pick-together-ui.mjs');
const p=new Class();p.render=()=>{};p.focusHeading=()=>{};
assert.ok(p.form().includes('at least one selected genre from each of you'));
assert.ok(p.form().includes('Add a mood or favorite movie'));assert.ok(p.form().includes('Horror'));assert.ok(p.form().includes('mood tonight <span class="muted">(optional)'));assert.ok(p.settings.people.every(person=>person.mood===''));
const moodButton={dataset:{mood:'Fun',person:'0'},parentElement:{querySelectorAll:()=>[]}};p.shadowRoot={getElementById:()=>null};p.click({target:{closest:()=>moodButton}});assert.equal(p.settings.people[0].mood,'Fun');p.click({target:{closest:()=>moodButton}});assert.equal(p.settings.people[0].mood,'');
assert.ok(!p.form().includes('tradeoff'));

const seeded=new Class();seeded.render=()=>{};
document.querySelectorAll=()=>[{dataset:{service:'netflix'},checked:true,closest:()=>({querySelector:()=>({textContent:'Netflix'})})}];
seeded.seedServices();assert.deepEqual(seeded.settings.services,['netflix']);
const fallback=new Class();fallback.render=()=>{};document.querySelectorAll=()=>[];fallback.seedServices();assert.deepEqual(fallback.settings.services,[]);
assert.doesNotMatch(p.form(),/data-service=|id="runtime"|How much time do you have/);
let currentServices=['netflix','addon:amazon:max'];
window.StreamUnifyServices={selected:()=>currentServices};
seeded.seedServices();assert.deepEqual(seeded.settings.services,currentServices);
assert.equal(seeded.settings.runtime,999);
seeded.resultMode=true;seeded.picks=[{name:'Old selection'}];currentServices=['hulu'];seeded.seedServices();assert.equal(seeded.resultMode,false);assert.deepEqual(seeded.picks,[]);assert.deepEqual(seeded.settings.services,['hulu']);
currentServices=[];seeded.seedServices();assert.deepEqual(seeded.settings.services,[]);
currentServices=['netflix'];
let request;
globalThis.fetch=async(url,options)=>{request={url,options};return {ok:true,json:async()=>({results:[{name:'<Real title>',runtime:null,providers:[{name:'Netflix',type:'Subscription'}]}],country:'US',availability:'partial',notices:['Favorite not recognized']})};};
await p.search();assert.equal(p.picks.length,1);assert.equal(p.loading,false);assert.equal(p.notices.length,2);assert.ok(request.url.startsWith('/api/pick-together?'));const params=new URL(request.url,'https://example.com').searchParams;assert.deepEqual(JSON.parse(params.get('preferences')),p.settings);assert.equal(params.get('language'),'en-US');assert.ok(p.results().includes('&lt;Real title&gt;'));assert.ok(p.results().includes('Runtime unavailable'));assert.ok(p.results().includes('Subscription required'));assert.ok(!p.results().includes('Favorite not recognized'));assert.ok(!p.results().includes('Some availability information could not be checked'));assert.equal(params.get('preferences')&&JSON.parse(params.get('preferences')).runtime,999);assert.deepEqual(JSON.parse(params.get('preferences')).services,['netflix']);
assert.ok(p.results().includes('Each result matches at least one selected genre from each person.'));
assert.ok(p.results().includes('TOP SHARED GENRE MATCH'));
window.STREAMUNIFY_API_BASE='https://native-api.example';await p.search();assert.ok(request.url.startsWith('https://native-api.example/api/pick-together?'));delete window.STREAMUNIFY_API_BASE;
let resolve;globalThis.fetch=()=>new Promise(r=>resolve=r);const pending=p.search();await new Promise(r=>setTimeout(r,0));assert.ok(p.results().includes('Finding your shared matches…'));assert.ok(!p.results().includes('Each result matches'));assert.ok(!p.results().includes('No shared matches found'));p.cancelRequest();assert.equal(p.loading,false);resolve({ok:true,json:async()=>({results:[{name:'Stale title'}]})});await pending;assert.equal(p.picks.length,0);assert.equal(p.resultMode,false);
globalThis.fetch=async()=>({ok:false,json:async()=>({error:'Source unavailable'})});await p.search();assert.equal(p.error,'Source unavailable');assert.equal(p.loading,false);assert.ok(p.results().includes('We couldn’t finish your search'));assert.ok(!p.results().includes('No shared matches found'));
window.StreamUnifyMembership={enabled:true,search:async(url,id)=>{assert.ok(url.startsWith('/api/pick-together?'));assert.ok(id);return {results:[],availability:'ok'};}};await p.search();assert.equal(p.error,'');assert.ok(p.results().includes('No shared matches found among the movies checked'));
});

test('native webview fallback generates a valid secure UUID when randomUUID is unavailable',()=>{
 let called=false;const id=pickSearchId({getRandomValues(bytes){called=true;bytes.fill(255);return bytes;}});
 assert.equal(called,true);assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});
