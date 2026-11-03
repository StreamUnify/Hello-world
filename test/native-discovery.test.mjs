import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {nativeDiscoveryHtml,nativeDiscoveryHelpers} from '../scripts/native-discovery.mjs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function setup(){
 const controls={search:{value:''},genreFilter:{value:''}};
 const c=vm.createContext({selected:new Set(),isAvailable:s=>s.eligible!==false,mappedProviders:t=>t.providers||[],SERVICES:[],norm:s=>s.toLowerCase().replace(/[^a-z0-9]/g,''),window:{},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),label:p=>'<span class="price-label">'+p.type+'</span>',filter:'all',searchContext:null,actorSearch:null,activeRating:'',$:id=>controls[id]});
 vm.runInContext(html.slice(html.indexOf('function providerOfferTier('),html.indexOf('function qualifying('))+nativeDiscoveryHelpers,c);
 return {c,controls};
}
const offer=(name,type='Subscription',extras={})=>({name,type,service:{id:name,name,...extras}});
const title=(id,providers)=>({id,name:'Title '+id,providers});
test('one native offer preserves owned/free priority, tiers, escaping and source data',()=>{
 const {c}=setup();c.selected.add('mine');
 const providers=[offer('rent','Rent'),offer('free','free'),offer('mine')];
 const t=title(1,providers),before=JSON.stringify(t);
 assert.equal(c.nativePrimaryProvider(t).name,'mine');
 let output=c.nativeCardProvider(t);assert.match(output,/✓ mine/);assert.match(output,/Included with selected subscription/);assert.doesNotMatch(output,/>rent|>free/);
 c.selected.delete('mine');assert.equal(c.nativePrimaryProvider(t).name,'free');
 c.selected.add('rent');assert.equal(c.nativePrimaryProvider(t).name,'free');
 assert.equal(JSON.stringify(t),before);
 assert.equal(c.nativePrimaryProvider(title(2,[offer('ineligible','Subscription',{eligible:false}),offer('free','FREE')])).name,'free');
 assert.match(c.nativeCardProvider(title(3,[offer('<test>','Buy')])),/&lt;test>/);
 assert.equal(c.nativeCardProvider(title(4,[])),'');
});
test('one offer does not disguise an add-on as its host subscription',()=>{
 const {c}=setup();const p=offer('HBO Max via Prime Video Channels','Subscription',{id:'addon:amazon:max',addon:true,hostId:'prime'});
 const t=title(1,[p]);let output=c.nativeCardProvider(t);assert.match(output,/HBO Max via Prime Video Channels/);assert.match(output,/Add-on subscription required/);
 c.selected.add('prime');assert.doesNotMatch(c.nativeCardProvider(t),/Included/);
 c.selected.add('addon:amazon:max');assert.match(c.nativeCardProvider(t),/Included with selected add-on/);
});
test('Discover selects four popular source-ranked titles across distinct actual primary hosts',()=>{
 const {c}=setup();const list=[title(1,[offer('netflix')]),title(2,[offer('netflix')]),title(3,[offer('prime')]),title(4,[offer('disney')]),title(5,[offer('hulu')]),title(6,[offer('tubi','free')])];
 assert.deepEqual(Array.from(c.nativeDiscoveryTitles(list),t=>t.id),[1,3,4,5]);assert.equal(list.length,6);
 assert.equal(list[0].providers.length,1);
});
test('fewer distinct services fills with popular valid titles, never invents availability or duplicates',()=>{
 const {c}=setup();const list=[title(1,[offer('netflix')]),title(2,[offer('netflix')]),title(3,[offer('netflix')]),title(4,[]),title(5,[offer('netflix')]),title(1,[offer('disney')])];
 assert.deepEqual(Array.from(c.nativeDiscoveryTitles(list),t=>t.id),[1,2,3,5]);
 assert.equal(c.nativeDiscoveryTitles([title(1,[])]).length,0);
 assert.equal(c.nativeDiscoveryTitles(list.slice(0,2)).length,2);
});
test('host diversity never overrides primary offer ownership/free ordering',()=>{
 const {c}=setup();c.selected.add('netflix');
 const list=[title(1,[offer('netflix'),offer('prime')]),title(2,[offer('netflix'),offer('disney')]),title(3,[offer('free','free'),offer('hulu')]),title(4,[offer('prime')])];
 assert.equal(c.nativePrimaryProvider(list[1]).name,'netflix');
 assert.deepEqual(Array.from(c.nativeDiscoveryTitles(list),t=>t.id),[1,2,3,4]);
});
test('search, actor, genre, rating, filters and watchlist keep all results',()=>{
 const {c,controls}=setup();const list=Array.from({length:7},(_,i)=>title(i,[offer('netflix')]));
 for(const key of ['searchContext','actorSearch','activeRating']){c[key]='active';assert.equal(c.nativeDiscoveryTitles(list),list);c[key]=key==='activeRating'?'':null;}
 for(const filter of ['saved','mine','free','movie','series']){c.filter=filter;assert.equal(c.nativeDiscoveryTitles(list),list);}c.filter='all';
 for(const key of ['search','genreFilter']){controls[key].value='active';assert.equal(c.nativeDiscoveryTitles(list),list);controls[key].value='';}
});
test('native packaging changes cards only; website, carousel and full detail remain intact',()=>{
 const mobile=nativeDiscoveryHtml(html);
 assert.doesNotMatch(html,/nativeDiscoveryTitles|nativeCardProvider|su-native-discovery/);
 assert.match(mobile,/nativeCardProvider\(t\)\|\|'<span class="provider">Check watch options/);
 assert.match(mobile,/renderProviderGroups\(t,true\)/);
 assert.equal(mobile.slice(mobile.indexOf('function spotlightFilms()')),html.slice(html.indexOf('function spotlightFilms()')));
 assert.match(mobile,/const providers=orderedProviders\(item\)/);
 for(const script of mobile.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)){if(!/application\/ld\+json/.test(script[1]))new vm.Script(script[2]);}
 assert.throws(()=>nativeDiscoveryHtml(mobile),/exactly once/);
});
test('packaged CSP hashes match every native inline script',()=>{
 const mobile=readFileSync(new URL('../www/index.html',import.meta.url),'utf8');
 for(const script of mobile.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)){if(script[1].trim())assert.ok(mobile.includes("'sha256-"+createHash('sha256').update(script[1]).digest('base64')+"'"));}
});
