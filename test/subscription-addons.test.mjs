import test from 'node:test';
import assert from 'node:assert/strict';
import {addonIdentity,sourceAddon,watchmodeOffer} from '../provider-entitlements-src.mjs';
import {createCatalog} from '../catalog.mjs';
import {matchingServices,cleanAlertPreferences} from '../availability-policy.mjs';
import {restrictCatalog} from '../membership-policy.mjs';
test('explicit channel routes stay separate from base and from other hosts',()=>{
 const names=['HBO Max Amazon Channel','MAX (Via Amazon Prime)','HBO Max Apple TV Channel','Max Roku Channel','HBO (Via Hulu)','STARZ YouTube Primetime Channel'];
 assert.equal(addonIdentity(names[0]).id,addonIdentity(names[1]).id);
 assert.equal(new Set(names.map(n=>addonIdentity(n).id)).size,5);
 for(const name of ['Prime Video','HBO Max','Hulu','Amazon Video'])assert.equal(addonIdentity(name),null);
 assert.equal(addonIdentity('constructor Amazon Channel').id,'addon:amazon:constructor');
});
test('directory explicit hosts support unfamiliar channels without inventing regions',()=>{
 const row={id:800,name:'Independent Film Club',type:'sub',host_source_id:900,host_source:'Regional Host',regions:['CA']};
 assert.equal(sourceAddon(row,'US'),null);assert.equal(sourceAddon({...row,regions:null},'CA'),null);
 assert.equal(sourceAddon({...row,host_source_id:null},'CA'),null);
 assert.equal(sourceAddon(row,'CA').id,'addon:source:800');assert.equal(sourceAddon(row,'CA').url,'');
 const known={...row,name:'MAX',host_source:'Amazon',host_source_id:24,regions:['US']};
 assert.equal(sourceAddon(known,'US').id,'addon:amazon:max');
 assert.equal(sourceAddon({...known,name:'HBO Max Amazon Channel',host_source:'Hulu'},'US'),null);
});
test('offer types preserve paid subscription, rental, ads and unknown/authentication boundaries',()=>{
 const row={region:'US',name:'Example',web_url:'https://example.com/title',source_id:7};
 for(const [type,expected]of Object.entries({sub:'Subscription',free:'Ad-supported',rent:'Rent',buy:'Buy'}))assert.equal(watchmodeOffer({...row,type},'US').type,expected);
 for(const type of ['tve','unknown','constructor'])assert.equal(watchmodeOffer({...row,type},'US'),null);
 assert.equal(watchmodeOffer({...row,type:'sub'},'CA'),null);
 assert.equal(watchmodeOffer({...row,type:'sub',web_url:'javascript:alert(1)'},'US').url,'');
 assert.equal(watchmodeOffer({...row,type:'sub',web_url:'https://user:pass@example.com/'},'US').url,'');
});
test('backend alert preferences and membership do not conflate add-ons with free-tier bases',()=>{
 const channel={name:'HBO Max Amazon Channel',type:'Subscription'};
 assert.deepEqual(matchingServices([channel],['max','prime']),[]);
 assert.deepEqual(matchingServices([channel],['addon:amazon:max']),['addon:amazon:max']);
 assert.equal(restrictCatalog([{providers:[channel]}],{plan:'free'}).length,0);
 assert.equal(restrictCatalog([{providers:[{name:'MAX',type:'Subscription',addon:{id:'addon:amazon:max'}}]}],{plan:'free'}).length,0);
 assert.equal(cleanAlertPreferences({country:'US',services:['addon:amazon:max']},{plan:'premium'}).service_ids[0],'addon:amazon:max');
 assert.throws(()=>cleanAlertPreferences({country:'US',services:['addon:amazon:max']},{plan:'free'}),/Premium/);
 assert.throws(()=>cleanAlertPreferences({country:'US',services:['addon:unknown:bad']},{plan:'premium'}),/Invalid/);
 assert.deepEqual(matchingServices([{name:'Independent',type:'Rent',addon:{id:'addon:source:80'}}],['addon:source:80']),[]);
});
function fixture(){
 const calls=[];const directory=[{id:444,name:'MAX',type:'sub',host_source_id:24,host_source:'Amazon',regions:['US']}];
 const catalog=createCatalog({env:{TMDB_API_KEY:'test',WATCHMODE_API_KEY:'test'},fetcher:async value=>{
 const u=new URL(value);calls.push(u);const p=u.pathname;
 if(u.hostname.includes('watchmode')){
  if(p==='/v1/sources/')return Response.json(directory);
  return Response.json([{source_id:444,name:'MAX',type:'sub',region:'US',web_url:'https://www.amazon.com/gp/video/detail/verified'}, {source_id:7,name:'Free Service',type:'free',region:'US',web_url:null},{source_id:8,name:'Rental',type:'rent',region:'US',price:3.99},{source_id:9,name:'TVE',type:'tve',region:'US'}]);
 }
 if(p.endsWith('/watch/providers'))return Response.json({results:{US:{flatrate:[{provider_id:1825,provider_name:'HBO Max Amazon Channel'}]}}});
 if(p.includes('/watch/providers/'))return Response.json({results:[{provider_id:1825,provider_name:'HBO Max Amazon Channel'},{provider_id:9,provider_name:'Amazon Prime Video'}]});
 if(/\/movie\/\d+$/.test(p))return Response.json({id:Number(p.split('/').at(-1)),title:'Test',overview:'Description',credits:{cast:[]}});
 return Response.json({results:[{id:10719,media_type:'movie',title:'Test'}]});
 }});return{catalog,calls};
}
test('all-title enrichment joins source IDs, deduplicates route and keeps verified links',async()=>{
 const {catalog}=fixture();const result=await catalog.search('Test','US',{moviesTvOnly:true});const providers=result.results[0].providers;
 assert.equal(providers.filter(p=>p.type==='Subscription').length,1);
 assert.equal(providers[0].addon.id,'addon:amazon:max');assert.equal(providers[0].url,'https://www.amazon.com/gp/video/detail/verified');
 assert.equal(providers.find(p=>p.name==='Free Service').type,'Ad-supported');assert.equal(providers.some(p=>p.name==='TVE'),false);
 const details=await catalog.details('movie',123,'US');assert.equal(details.title.providers[0].addon.id,'addon:amazon:max');
 const alerts=await catalog.availability('movie',123,'US');assert.equal(alerts.providers[0].addon.id,'addon:amazon:max');
});
test('registry merges both directories, retains current country and caches requests',async()=>{
 const {catalog,calls}=fixture();const result=await catalog.providerAddons('US');assert.equal(result.country,'US');assert.equal(result.services.length,1);assert.equal(result.services[0].id,'addon:amazon:max');
 assert.deepEqual(result.services[0].countries,['US']);assert.equal(result.sources.watchmode,'ok');
 await catalog.providerAddons('US');assert.equal(calls.filter(u=>u.pathname==='/v1/sources/').length,1);
 await catalog.providerAddons('CA');assert.equal(calls.filter(u=>u.pathname==='/v1/sources/').length,2);
});
test('directory failure never turns an ambiguous MAX channel into a base subscription',async()=>{
 const catalog=createCatalog({env:{TMDB_API_KEY:'test',WATCHMODE_API_KEY:'test'},fetcher:async value=>{
  const u=new URL(value);
  if(u.pathname==='/v1/sources/')throw Error('offline');
  if(u.hostname.includes('watchmode'))return Response.json([{source_id:444,name:'MAX',type:'sub',region:'US'},{source_id:445,name:'HBO Max Amazon Channel',type:'sub',region:'US'},{source_id:7,name:'Free',type:'free',region:'US'}]);
  if(u.pathname.endsWith('/watch/providers'))return Response.json({results:{US:{}}});
  return Response.json({results:[{id:12,media_type:'movie',title:'Test'}]});
 }});
 const r=await catalog.search('Test','US',{moviesTvOnly:true});
 assert.equal(r.results[0].providers.some(p=>p.name==='MAX'),false);
 assert.equal(r.results[0].providers.find(p=>p.name==='HBO Max Amazon Channel').addon.id,'addon:amazon:max');
 assert.equal(r.results[0].providers.find(p=>p.name==='Free').type,'Ad-supported');
});

test('missing host fields never establish a direct subscription',async()=>{
 const catalog=createCatalog({env:{TMDB_API_KEY:'test',WATCHMODE_API_KEY:'test'},fetcher:async value=>{
  const u=new URL(value);
  if(u.pathname==='/v1/sources/')return Response.json([{id:33,name:'MAX',type:'sub',regions:['US']},{id:34,name:'Netflix',type:'sub',regions:['US'],host_source:null,host_source_id:null}]);
  if(u.hostname.includes('watchmode'))return Response.json([{source_id:33,name:'MAX',type:'sub',region:'US'},{source_id:34,name:'Netflix',type:'sub',region:'US'}]);
  if(u.pathname.endsWith('/watch/providers'))return Response.json({results:{US:{}}});
  return Response.json({results:[{id:12,media_type:'movie',title:'Test'}]});
 }});
 const r=await catalog.search('Test','US',{moviesTvOnly:true});assert.deepEqual(r.results[0].providers.map(p=>p.name),['Netflix']);
});
test('subscription enrichment includes results beyond the former first-three cutoff',async()=>{
 const called=[];const catalog=createCatalog({env:{TMDB_API_KEY:'test',WATCHMODE_API_KEY:'test'},fetcher:async value=>{
 const u=new URL(value);
 if(u.pathname==='/v1/sources/')return Response.json([{id:9,name:'Netflix',type:'sub',host_source:null,host_source_id:null,regions:['US']}]);
 if(u.hostname.includes('watchmode')){called.push(u.pathname);return Response.json([{source_id:9,name:'Netflix',type:'sub',region:'US'}]);}
 if(u.pathname.endsWith('/watch/providers'))return Response.json({results:{US:{}}});
 return Response.json({results:Array.from({length:5},(_,i)=>({id:i+1,media_type:'movie',title:'Film '+i}))});
 }});
 const r=await catalog.search('','US',{moviesTvOnly:true});assert.equal(called.length,5);assert.ok(r.results.every(t=>t.providers.some(p=>p.type==='Subscription')));
});
