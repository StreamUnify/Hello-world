import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog,safeUrl} from '../catalog.mjs';
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers});

test('unconfigured sources require no outbound calls',async()=>{
 const c=createCatalog({env:{},fetcher:()=>{throw Error('unexpected')}});
 const r=await c.search('hello','US');
 assert.deepEqual(r.results,[]);
 assert.equal(r.sources.youtube,'not_configured');
});
test('one provider failure preserves normalized results from the others',async()=>{
 const c=createCatalog({env:{YOUTUBE_API_KEY:'private-key',PODCAST_INDEX_KEY:'key',PODCAST_INDEX_SECRET:'secret'},fetcher:async u=>String(u).includes('googleapis')?response({},429):response({feeds:[{id:4,title:'A podcast',link:'https://example.com',description:'<b>Hello</b>'}]})});
 const r=await c.search('hello','US');
 assert.equal(r.sources.youtube,'rate_limited');
 assert.equal(r.sources.podcasts,'ok');
 assert.equal(r.results[0].id,'podcast:4');
 assert.equal(r.results[0].desc,'Hello');
 assert.ok(!JSON.stringify(r).includes('private-key'));
});
test('deduplicates concurrent requests, caches results, and backs off on quota errors',async()=>{
 let calls=0,time=1000;
 const c=createCatalog({env:{YOUTUBE_API_KEY:'key'},now:()=>time,fetcher:async()=>{calls++;return response({},429,{'Retry-After':'120'})}});
 await Promise.all([c.search('hello','US'),c.search('hello','US')]);
 assert.equal(calls,1);
 await c.search('different','US');assert.equal(calls,1);
 time+=121000;await c.search('different','US');assert.equal(calls,2);
 let goodCalls=0;
 const good=createCatalog({env:{YOUTUBE_API_KEY:'key'},fetcher:async()=>{goodCalls++;return response({items:[]})}});
 await good.search('hi','US');await good.search('hi','US');assert.equal(goodCalls,1);
});
test('TMDB numeric IDs remain stable; Watchmode only adds regional free links',async()=>{
 const c=createCatalog({env:{TMDB_API_KEY:'key',WATCHMODE_API_KEY:'key'},fetcher:async u=>{
  u=String(u);
  if(u.includes('watchmode'))return response([{region:'US',name:'Tubi',type:'free',web_url:'https://tubitv.com/a'},{region:'CA',name:'Other',type:'free',web_url:'https://example.com'},{region:'US',name:'TVE',type:'tve',web_url:'https://example.com'}]);
  if(u.includes('watch/providers'))return response({results:{US:{link:'https://themoviedb.org/watch',flatrate:[{provider_id:8,provider_name:'Netflix'}]}}});
  return response({results:[{id:20,media_type:'movie',title:'Movie'},{id:30,media_type:'person',name:'Person'}]});
 }});
 const r=await c.search('hi','US');
 assert.equal(r.results.length,1);assert.equal(r.results[0].id,200);
 assert.deepEqual(r.results[0].providers.map(x=>x.name),['Netflix','Tubi']);
 assert.equal(r.sources.watchmode,'ok');
});
test('Twitch app token is reused and all external links use HTTPS',async()=>{
 let tokens=0;
 const c=createCatalog({env:{TWITCH_CLIENT_ID:'id',TWITCH_CLIENT_SECRET:'secret'},fetcher:async u=>{
 if(String(u).includes('oauth2')){tokens++;return response({access_token:'token',expires_in:3600})}
 return response({data:[{id:'3',display_name:'Channel',broadcaster_login:'channel',is_live:true}]});
 }});
 const r=await c.search('one','US');await c.search('two','US');
 assert.equal(tokens,1);assert.equal(r.results[0].id,'twitch:3');assert.equal(r.results[0].live,true);
 for(const u of ['javascript:alert(1)','data:text/html,x','http://example.com',''])assert.equal(safeUrl(u),'');
});
