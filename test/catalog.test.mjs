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

function smartCatalog(queries,lookups=[]) {
 return createCatalog({env:{TMDB_API_KEY:'key'},fetcher:async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/watch/providers'))return response({results:{US:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}});
  const q=u.searchParams.get('query');lookups.push(q);
  return response({results:Object.entries(queries).find(([key])=>key.toLowerCase()===q.toLowerCase())?.[1]||[]});
 }});
}
const potter={id:671,media_type:'movie',title:'Harry Potter and the Philosopher’s Stone',popularity:50};
const stranger={id:66732,media_type:'tv',name:'Stranger Things'};
test('missing spaces recover movie and TV titles with individual availability',async()=>{
 for(const [query,split,item] of [['harrypotter','harry potter',potter],['strangerthings','stranger things',stranger]]) {
  const calls=[],c=smartCatalog({[split]:[item]},calls),r=await c.search(query,'US');
  assert.equal(r.results[0].sourceId,item.id);
  assert.equal(r.results[0].providers[0].name,'Netflix');
  assert.equal(r.searchMatch.title,item.title||item.name);
  assert.equal(calls[0],query);assert.ok(calls.length<=4);
 }
});
test('minor typos and partial titles recover only close candidates',async()=>{
 const calls=[],c=smartCatalog({harry:[potter,{id:9,media_type:'movie',title:'An Unrelated Movie'}]},calls);
 const r=await c.search('harry poter','US');
 assert.deepEqual(r.results.map(x=>x.sourceId),[671]);
 assert.equal(r.searchMatch.query,'harry poter');
 const no=await smartCatalog({abcd:[potter]}).search('abcdefgh','US');
 assert.deepEqual(no.results,[]);assert.equal(no.searchMatch,undefined);
});
test('successful exact searches do not invoke correction or replace the query',async()=>{
 const calls=[],r=await smartCatalog({'Harry Potter':[potter]},calls).search('Harry Potter','US');
 assert.deepEqual(calls,['harry potter']);assert.equal(r.searchMatch,undefined);
});
test('learned catalog titles support corrections beyond the starter vocabulary',async()=>{
 const item={id:123,media_type:'tv',name:'Severance'},calls=[];
 const c=smartCatalog({Severance:[item]},calls);
 await c.search('Severance','US');
 const r=await c.search('severence','US');
 assert.equal(r.results[0].sourceId,123);assert.equal(r.searchMatch.title,'Severance');
});
test('failed correction lookups preserve other sources and are reported as partial',async()=>{
 let calls=0;
 const c=createCatalog({env:{TMDB_API_KEY:'key',PODCAST_INDEX_KEY:'key',PODCAST_INDEX_SECRET:'secret'},fetcher:async url=>{
  if(String(url).includes('podcastindex'))return response({feeds:[{id:5,title:'Podcast'}]});
  calls++;return calls===1?response({results:[]}):response({},500);
 }});
 const r=await c.search('harrypotter','US');
 assert.equal(r.results[0].type,'podcast');assert.equal(r.sources.tmdbFallback,'unavailable');
});

const actorPerson=(id,name)=>({id,name,media_type:'person',known_for_department:'Acting',known_for:[{id:999,title:'Known-for sample'}]});
function actorCatalog(people,credits,requests=[]){
 return createCatalog({env:{TMDB_API_KEY:'key'},fetcher:async url=>{
  const u=new URL(url);requests.push(u.pathname);
  if(u.pathname.endsWith('/watch/providers'))return response({results:{CA:{link:'https://example.com/watch',flatrate:[{provider_id:8,provider_name:'Netflix'}]}}});
  if(u.pathname.endsWith('/combined_credits'))return response({...credits,...(Array.isArray(credits.cast)?{cast:credits.cast.map(x=>({...x,media_type:x.media_type||'movie'}))}:{})});
  return response({results:people});
 }});
}
test('actor name searches return all acting credits across pages, not known-for titles or crew work',async()=>{
 const movies=Array.from({length:41},(_,i)=>({id:i+1,title:'Movie '+i,popularity:100-i,release_date:'2020-01-01',character:'Role '+i}));
 const calls=[],c=actorCatalog([actorPerson(31,'Tom Hanks')],{cast:[...movies,movies[0],{id:99,title:'Adult movie',adult:true}],crew:[{id:777,title:'Crew-only movie'}]},calls);
 const first=await c.search('Tom Hanks','CA');
 assert.deepEqual(first.actor,{id:31,name:'Tom Hanks',total:41,page:1,pages:3});
 assert.equal(first.results.length,18);assert.equal(first.results[0].character,'Role 0');
 assert.equal(first.results[0].providers[0].name,'Netflix');assert.equal(first.results[0].watchUrl,'https://example.com/watch');
 assert.equal(first.searchMatch,undefined);assert.equal(first.sources.tmdb,'ok');
 const second=await c.search('Tom Hanks','CA',{personId:31,page:2});
 const third=await c.search('Tom Hanks','CA',{personId:31,page:3});
 const ids=[...first.results,...second.results,...third.results].map(x=>x.sourceId);
 assert.equal(new Set(ids).size,41);assert.ok(!ids.includes(999)&&!ids.includes(777)&&!ids.includes(99));
 assert.equal(calls.filter(x=>x.endsWith('/combined_credits')).length,1);
 assert.equal(calls.filter(x=>x.endsWith('/watch/providers')).length,41);
});
test('partial and duplicate actor names require a selection and never mix filmographies',async()=>{
 const people=[actorPerson(1,'Chris Evans'),actorPerson(2,'Chris Hemsworth')];
 const calls=[],c=actorCatalog(people,{cast:[{id:8,title:'Selected actor movie'}]},calls);
 const choices=await c.search('Chris','US');
 assert.equal(choices.actor,undefined);assert.deepEqual(choices.actors.map(x=>x.name),people.map(x=>x.name));assert.deepEqual(choices.results,[]);
 assert.ok(!calls.some(x=>x.endsWith('/combined_credits')));
 const selected=await c.search('Chris','US',{personId:2});assert.equal(selected.actor.name,'Chris Hemsworth');
 assert.ok(calls.includes('/3/person/2/combined_credits'));
 const duplicate=await actorCatalog([actorPerson(1,'Chris Evans'),actorPerson(2,'Chris Evans')],{cast:[]}).search('Chris Evans','US');
 assert.equal(duplicate.actor,undefined);assert.equal(duplicate.actors.length,2);
});
test('actor credit failures are reported instead of fabricating empty filmographies',async()=>{
 const r=await actorCatalog([actorPerson(31,'Tom Hanks')],{}).search('Tom Hanks','US');
 assert.equal(r.sources.tmdb,'unavailable');assert.equal(r.actor,undefined);assert.deepEqual(r.results,[]);
 const c=actorCatalog([actorPerson(31,'Tom Hanks')],{cast:[]});
 const empty=await c.search('Tom Hanks','US');assert.equal(empty.actor.total,0);assert.equal(empty.sources.tmdb,'ok');
 const invalid=await c.search('Tom Hanks','US',{personId:999});assert.equal(invalid.sources.tmdb,'unavailable');
 const beyond=await c.search('Tom Hanks','US',{personId:31,page:2});assert.equal(beyond.sources.tmdb,'unavailable');
});

test('actor filmography includes movies and TV with colliding IDs and correct regional endpoints',async()=>{
 const calls=[],c=actorCatalog([actorPerson(17419,'Bryan Cranston')],{cast:[
  {id:42,media_type:'movie',title:'A Movie',popularity:20,character:'Movie role',release_date:'2020-01-01'},
  {id:42,media_type:'tv',name:'A Series',popularity:30,character:'Series role',first_air_date:'2008-01-20'},
  {id:42,media_type:'tv',name:'A Series',popularity:30,character:'Series role'},
  {id:43,media_type:'tv',name:'Adult TV',adult:true},
  {id:44,media_type:'person',title:'Invalid type'},
  {id:45,media_type:'tv',title:'Missing TV name'}
 ],crew:[{id:46,media_type:'tv',name:'Crew only'}]},calls);
 const r=await c.search('Bryan Cranston','CA');
 assert.equal(r.actor.total,2);
 assert.deepEqual(r.results.map(x=>[x.id,x.type,x.name,x.character]),[[421,'series','A Series','Series role'],[420,'movie','A Movie','Movie role']]);
 assert.ok(calls.includes('/3/tv/42/watch/providers'));assert.ok(calls.includes('/3/movie/42/watch/providers'));
 assert.ok(r.results.every(x=>x.providers[0].name==='Netflix'));
});


test('search case shares cached provider requests and preserves displayed spelling',async()=>{
 const calls=[],c=smartCatalog({rambo:[{id:1,media_type:'movie',title:'Rambo'}]},calls);
 for(const query of ['RAMBO','rambo','RaMbO']){
  const r=await c.search(query,'US');assert.equal(r.results[0].name,'Rambo');assert.equal(r.searchMatch,undefined);
 }
 assert.deepEqual(calls,['rambo']);
});
test('typo returned by initial provider still gets a correction',async()=>{
 const r=await smartCatalog({rambi:[{id:1,media_type:'movie',title:'Rambo'}]}).search('RAMBI','US');
 assert.equal(r.searchMatch.title,'Rambo');
});
function sharedCatalog({fail=false,duplicate=false}={}){
 return createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('search/person')){
   const name=u.searchParams.get('query');const id=name==='tom hanks'?1:name==='meg ryan'?2:3;
   return response({results:name==='missing'?[]:[actorPerson(id,name),...(duplicate&&id===2?[actorPerson(9,name)]:[])]});
  }
  if(u.pathname.endsWith('/combined_credits')){
   if(fail&&u.pathname.includes('/2/'))return response({},500);
   const id=Number(u.pathname.split('/').at(-2));
   return response({cast:[...Array.from({length:20},(_,i)=>({id:i+10,media_type:i%2?'tv':'movie',title:'Shared '+i,name:'Shared '+i})),{id:99+id,media_type:'movie',title:'Only '+id}, {id:10,media_type:'movie',title:'Shared 0'}],crew:[{id:500,title:'Crew'}]});
  }
  if(u.pathname.endsWith('/watch/providers'))return response({results:{US:{}}});
  return response({results:[]});
 }});
}
test('multiple actors intersect movie and TV acting credits, deduplicate and paginate',async()=>{
 const c=sharedCatalog();
 for(const separator of [' and ',', ',' & ',' + ']){
  const r=await c.search('TOM HANKS'+separator+'Meg Ryan','US');
  assert.equal(r.actor.total,20);assert.equal(r.actor.people.length,2);assert.equal(r.results.length,18);
  assert.ok(r.results.every(x=>x.name.startsWith('Shared')));
 }
 const r=await c.search('tom hanks and meg ryan','US',{page:2});assert.equal(r.results.length,2);
});
test('missing and ambiguous actors never silently return one actor’s credits',async()=>{
 for(const [catalog,q] of [[sharedCatalog(),'tom hanks and missing'],[sharedCatalog({duplicate:true}),'tom hanks and meg ryan']]){
  const r=await catalog.search(q,'US');assert.deepEqual(r.results,[]);assert.ok(r.actorNotice);assert.equal(r.actor,undefined);
 }
 const failed=await sharedCatalog({fail:true}).search('tom hanks and meg ryan','US');assert.equal(failed.sources.tmdb,'unavailable');assert.equal(failed.actor,undefined);
});


test('genre browsing uses discover for movie and TV genre IDs, filtering unsupported types',async()=>{
 const calls=[];
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/watch/providers'))return response({results:{US:{}}});
  return response({results:[{id:1,title:'Science movie',name:'Science series',genre_ids:[u.pathname.endsWith('/tv')?10765:878]},{id:2,title:'Other',name:'Other',genre_ids:[35]}]});
 }});
 const r=await c.search('','US',{genre:'scifi'});
 assert.deepEqual(new Set(r.results.map(x=>x.type)),new Set(['movie','series']));assert.equal(r.results.length,2);
 assert.equal(calls.find(u=>u.pathname.endsWith('discover/movie')).searchParams.get('with_genres'),'878');
 assert.equal(calls.find(u=>u.pathname.endsWith('discover/tv')).searchParams.get('with_genres'),'10765');
});
test('genre applies before acting-credit pagination and keeps total accurate',async()=>{
 const cast=Array.from({length:40},(_,i)=>({id:i+1,media_type:'movie',title:'Credit '+i,genre_ids:[i%2?35:18]}));
 const c=actorCatalog([actorPerson(31,'Tom Hanks')],{cast});
 const first=await c.search('TOM HANKS','CA',{genre:'comedy'});
 assert.equal(first.actor.total,20);assert.equal(first.results.length,18);
 const second=await c.search('tom hanks','CA',{genre:'comedy',personId:31,page:2});assert.equal(second.results.length,2);
});
test('movie titles with and keep title search when parts do not resolve to actors',async()=>{
 const item={id:22,media_type:'movie',title:'Pride and Prejudice',genre_ids:[10749]};
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>{
  const u=new URL(url);if(u.pathname.endsWith('search/person'))return response({results:[]});
  if(u.pathname.endsWith('/watch/providers'))return response({results:{}});
  return response({results:[item]});
 }});
 const r=await c.search('PRIDE AND PREJUDICE','US',{genre:'romance'});assert.equal(r.results[0].name,item.title);assert.equal(r.actor,undefined);
});
