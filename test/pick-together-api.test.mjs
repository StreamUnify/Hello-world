import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../catalog.mjs';
import {validatePickPreferences,matchedPickProviders,runPickTogether,pickScore} from '../pick-together-service.mjs';
const prefs={people:[{genres:['Comedy'],mood:'Fun',favorite:''},{genres:['Mystery'],mood:'Surprising',favorite:''}],services:['netflix'],extras:false,runtime:150};
function fixture({runtime=100,country='US',favoriteResults=[],failProviders=false,detailGenres=[{id:35,name:'Comedy'},{id:9648,name:'Mystery'}],discoveryGenres=[35,9648]}={}){
 const urls=[];
 const fetcher=async url=>{
  const u=new URL(url);urls.push(u);const p=u.pathname;
  let body;
  if(p.endsWith('/watch/providers/movie'))body={results:[{provider_id:8,provider_name:'Netflix'},{provider_id:9,provider_name:'Amazon Prime Video'}]};
  else if(p.endsWith('/search/movie'))body={results:favoriteResults};
  else if(p.endsWith('/discover/movie'))body={results:[{id:901,title:'Source Film',genre_ids:discoveryGenres,popularity:10}]};
  else if(p.endsWith('/watch/providers')){
   if(failProviders)throw Error('source down');
   body={results:{[country]:{link:'https://www.themoviedb.org/movie/901/watch',flatrate:[{provider_id:8,provider_name:'Netflix'}]}}};
  }else if(p.endsWith('/movie/901'))body={id:901,title:'Source Film',overview:'Real source metadata',runtime,genres:detailGenres};
  else throw Error('Unexpected request '+p);
  return {ok:true,json:async()=>body};
 };
 return {catalog:createCatalog({env:{TMDB_API_KEY:'server-secret'},fetcher}),urls};
}
test('validates bounded preferences and never accepts invented genres or services',()=>{
 assert.deepEqual(validatePickPreferences(prefs),prefs);
 for(const value of [{...prefs,runtime:1},{...prefs,services:['fake']},{...prefs,people:[prefs.people[0]]},{...prefs,people:[{...prefs.people[0],favorite:'x'.repeat(121)},prefs.people[1]]}])assert.throws(()=>validatePickPreferences(value));
});
test('real catalog metadata and regional offers, bounded discovery, no key exposure',async()=>{
 const {catalog,urls}=fixture();const data=await catalog.pickTogether(prefs,'US');
 assert.equal(data.results.length,1);assert.equal(data.results[0].name,'Source Film');assert.equal(data.results[0].runtime,100);
 assert.equal(data.results[0].matchedProviders[0].name,'Netflix');assert.ok(!JSON.stringify(data).includes('server-secret'));
 assert.ok(urls.length<=5);
 for(const url of urls.filter(u=>u.pathname.endsWith('/discover/movie'))){assert.equal(url.searchParams.get('with_watch_providers'),'8');assert.equal(url.searchParams.get('with_watch_monetization_types'),'flatrate|free|ads');assert.equal(url.searchParams.get('watch_region'),'US');}assert.equal(data.availability,'ok');
});
test('another region never inherits a US provider offer',async()=>{
 const {catalog}=fixture();assert.deepEqual((await catalog.pickTogether(prefs,'DE')).results,[]);
});
test('missing availability produces no fictional fallback',async()=>{
 const {catalog}=fixture({failProviders:true});await assert.rejects(()=>catalog.pickTogether(prefs,'US'),/unavailable/);
 await assert.rejects(()=>createCatalog({env:{}}).pickTogether(prefs,'US'));
});
test('unknown and excessive runtimes excluded, any-length permits unknown runtime',async()=>{
 for(const runtime of [null,0,160]){const {catalog}=fixture({runtime});assert.equal((await catalog.pickTogether(prefs,'US')).results.length,0);}
 const {catalog}=fixture({runtime:null});assert.equal((await catalog.pickTogether({...prefs,runtime:999},'US')).results.length,1);
});
test('favorite misses and ambiguities explicitly reported and not silently selected',async()=>{
 for(const favoriteResults of [[],[{id:1,title:'Favorite',genre_ids:[28]},{id:2,title:'Favorite',genre_ids:[18]}]]){
  const {catalog}=fixture({favoriteResults});const data=await catalog.pickTogether({...prefs,people:[{...prefs.people[0],favorite:'Favorite'},prefs.people[1]]},'US');
  assert.equal(data.favoriteMatches[0].status,favoriteResults.length?'ambiguous':'unmatched');assert.ok(data.notices.some(s=>s.includes('not used')));
 }
});
test('strict base subscriptions, rental opt-in and exact add-on selection',()=>{
 const offers=[{name:'Amazon Prime Video',type:'Subscription'},{name:'Amazon Video',type:'Rent'},{name:'STARZ Amazon Channel',type:'Subscription'},{name:'Hulu',type:'Subscription'}];
 const base={...prefs,services:['prime']};
 assert.deepEqual(matchedPickProviders(offers,base).map(x=>x.name),['Amazon Prime Video']);
 const extras=matchedPickProviders(offers,{...base,extras:true});assert.equal(extras.length,3);assert.equal(extras.filter(x=>x.extraCost).length,2);
 const addon=matchedPickProviders(offers,{...prefs,services:['addon:amazon:starz']});assert.equal(addon.length,1);assert.equal(addon[0].extraCost,false);
});
test('balances both people instead of total one-sided fit',()=>{
 assert.ok(pickScore([35,9648],prefs)>pickScore([35],prefs));
});
test('membership authentication, free region, provider restriction and idempotency token',async()=>{
 const {catalog}=fixture();let consumed=0;let token,query;
 const membership={enabled:true,authenticate:async()=>({id:'user'}),status:async()=>({plan:'free'}),consumeSearch:async(a,t,q)=>{consumed++;token=t;query=q;return {plan:'free',remaining:9};}};
 const data=await runPickTogether({catalog,membership,stores:{refreshActor:async()=>{}},req:{headers:{'x-search-id':'request-one'}},preferences:prefs,country:'DE',language:'en-US'});
 assert.equal(data.country,'US');assert.equal(consumed,1);assert.equal(token,'request-one');assert.ok(query.startsWith('US:pick-together:'));assert.ok(query.length<=130);assert.equal(data.membership.remaining,9);
 const primePrefs={...prefs,services:['prime']};
 const primeCatalog={pickTogether:async(p,c,{restrict})=>({sources:{tmdb:'ok'},results:restrict([{providers:[{name:'Amazon Prime Video',type:'Subscription'}]}])})};
 const restricted=await runPickTogether({catalog:primeCatalog,membership,stores:{refreshActor:async()=>{}},req:{headers:{}},preferences:primePrefs,country:'US'});assert.equal(restricted.results.length,0);
});
test('auth and source failures never consume search allowance',async()=>{
 let consumed=0;const membership={enabled:true,authenticate:async()=>{throw Error('sign in');},consumeSearch:async()=>consumed++};
 await assert.rejects(()=>runPickTogether({catalog:fixture().catalog,membership,req:{headers:{}},preferences:prefs,country:'US'}));assert.equal(consumed,0);
 membership.authenticate=async()=>({});membership.status=async()=>({plan:'free'});
 await assert.rejects(()=>runPickTogether({catalog:createCatalog({env:{}}),membership,stores:{refreshActor:async()=>{}},req:{headers:{}},preferences:prefs,country:'US'}));assert.equal(consumed,0);
});

test('total availability failure does not consume membership allowance',async()=>{
 let consumed=0;const membership={enabled:true,authenticate:async()=>({}),status:async()=>({plan:'free'}),consumeSearch:async()=>consumed++};
 await assert.rejects(()=>runPickTogether({catalog:fixture({failProviders:true}).catalog,membership,stores:{refreshActor:async()=>{}},req:{headers:{}},preferences:prefs,country:'US'}),/unavailable/);
 assert.equal(consumed,0);
});
test('Watchmode rate limit preserves verified TMDB offers and reports partial coverage',async()=>{
 const fetcher=async url=>{
  const u=new URL(url);
  if(u.hostname==='api.watchmode.com')return {ok:false,status:429,headers:{get:()=> '60'}};
  const path=u.pathname;
  let data;
  if(path.endsWith('/watch/providers/movie'))data={results:[{provider_id:8,provider_name:'Netflix'}]};
  else if(path.endsWith('/discover/movie'))data={results:[{id:77,title:'Real result',genre_ids:[35]}]};
  else if(path.endsWith('/watch/providers'))data={results:{US:{flatrate:[{provider_name:'Netflix',provider_id:8}]}}};
  else if(path.endsWith('/movie/77'))data={id:77,title:'Real result',overview:'Metadata',runtime:90,genres:[{id:35,name:'Comedy'},{id:9648,name:'Mystery'}]};
  else throw Error('unexpected path');
  return {ok:true,json:async()=>data};
 };
 const catalog=createCatalog({env:{TMDB_API_KEY:'secret',WATCHMODE_API_KEY:'secret'},fetcher});
 const data=await catalog.pickTogether(prefs,'US');
 assert.equal(data.results.length,1);assert.equal(data.availability,'partial');assert.equal(data.sources.tmdb,'ok');assert.equal(data.sources.watchmode,'unavailable');assert.ok(data.notices.some(n=>n.includes('could not be checked')));
});
test('all detail metadata failures are unavailable rather than a false no-match',async()=>{
 const catalog=createCatalog({env:{TMDB_API_KEY:'secret'},fetcher:async url=>{
  if(new URL(url).pathname.endsWith('/discover/movie'))return {ok:true,json:async()=>({results:[{id:77,title:'Candidate',genre_ids:[35]}]})};
  throw Error('metadata unavailable');
 }});
 await assert.rejects(()=>catalog.pickTogether(prefs,'US'),/unavailable/);
});

test('extras expand discovery monetization only on explicit opt-in',async()=>{
 const {catalog,urls}=fixture();await catalog.pickTogether({...prefs,extras:true},'US');
 assert.ok(urls.filter(u=>u.pathname.endsWith('/discover/movie')).every(u=>u.searchParams.get('with_watch_monetization_types')==='flatrate|free|ads|rent|buy'));
});
test('provider directory failure falls back honestly and still requires regional title offers',async()=>{
 const urls=[];
 const catalog=createCatalog({env:{TMDB_API_KEY:'secret'},fetcher:async url=>{
  const u=new URL(url);urls.push(u);const p=u.pathname;let data;
  if(p.endsWith('/watch/providers/movie'))throw Error('directory unavailable');
  if(p.endsWith('/discover/movie'))data={results:[{id:99,title:'Verified title',genre_ids:[35]}]};
  else if(p.endsWith('/movie/99'))data={id:99,title:'Verified title',overview:'Metadata',runtime:90,genres:[{id:35,name:'Comedy'},{id:9648,name:'Mystery'}]};
  else if(p.endsWith('/watch/providers'))data={results:{US:{flatrate:[{provider_name:'Netflix',provider_id:8}]}}};
  else throw Error('Unexpected request');
  return {ok:true,json:async()=>data};
 }});
 const data=await catalog.pickTogether(prefs,'US');assert.equal(data.results.length,1);assert.equal(data.availability,'partial');assert.equal(data.sources.tmdbProviderDirectory,'unavailable');assert.ok(data.notices.some(n=>n.includes('directory could not be loaded')));
 assert.ok(urls.filter(u=>u.pathname.endsWith('/discover/movie')).every(u=>!u.searchParams.has('with_watch_providers')));
});
test('regional directory never grants a base service its add-on IDs without extras opt-in',async()=>{
 for(const [services,extras,expected] of [[['prime'],false,'9'],[['prime'],true,'9|43'],[['addon:amazon:starz'],false,'43']]){
  const discovers=[];
  const catalog=createCatalog({env:{TMDB_API_KEY:'secret'},fetcher:async url=>{
   const u=new URL(url);
   if(u.pathname.endsWith('/watch/providers/movie'))return {ok:true,json:async()=>({results:[{provider_id:9,provider_name:'Amazon Prime Video'},{provider_id:43,provider_name:'STARZ Amazon Channel'},{provider_id:8,provider_name:'Netflix'}]})};
   if(u.pathname.endsWith('/discover/movie')){discovers.push(u);return {ok:true,json:async()=>({results:[]})};}
   throw Error('Unexpected request');
  }});
  await catalog.pickTogether({...prefs,services,extras},'US');assert.ok(discovers.every(u=>u.searchParams.get('with_watch_providers')===expected));
 }
});

test('each person must have a detail-confirmed selected genre match',async()=>{
 const people=[{genres:['Comedy','Mystery'],mood:'Fun',favorite:''},{genres:['Adventure'],mood:'Fun',favorite:''}];
 const {catalog}=fixture({discoveryGenres:[12],detailGenres:[{id:12,name:'Adventure'}]});
 const data=await catalog.pickTogether({...prefs,people},'US');
 assert.deepEqual(data.results,[]);assert.equal(data.matchStatus,'no_shared_matches');assert.ok(data.notices.some(n=>n.includes('Other matches may exist')));
});
test('disjoint selected genres discover exact AND pairs, then return mutual detail hits',async()=>{
 const people=[{genres:['Comedy','Mystery'],mood:'Fun',favorite:''},{genres:['Adventure'],mood:'Cozy',favorite:''}];
 const {catalog,urls}=fixture({discoveryGenres:[35,12],detailGenres:[{id:35,name:'Comedy'},{id:12,name:'Adventure'}]});
 const data=await catalog.pickTogether({...prefs,people},'US');
 assert.equal(data.results.length,1);assert.equal(data.matchStatus,'matched');assert.deepEqual(data.results[0].genreIds,[35,12]);
 assert.deepEqual(urls.filter(u=>u.pathname.endsWith('/discover/movie')).map(u=>u.searchParams.get('with_genres')).sort(),['12,35','12,9648']);
 assert.match(data.results[0].matchExplanation,/Person 1: Comedy; Person 2: Adventure/);
});
test('conflicting or unknown detail genres never inherit mutual discovery genres',async()=>{
 for(const detailGenres of [[{id:35,name:'Comedy'}],[],[{name:'Mystery'}]]){
  const {catalog}=fixture({detailGenres,discoveryGenres:[35,9648]});const data=await catalog.pickTogether(prefs,'US');assert.equal(data.results.length,0);
 }
});
test('favorites and moods cannot rescue a one-sided selected-genre mismatch',async()=>{
 const {catalog,urls}=fixture({discoveryGenres:[35,9648],detailGenres:[{id:35,name:'Comedy'}],favoriteResults:[{id:7,title:'Favorite',genre_ids:[35]}]});
 const people=[prefs.people[0],{...prefs.people[1],mood:'Fun',favorite:'Favorite'}];
 const data=await catalog.pickTogether({...prefs,people},'US');assert.equal(data.results.length,0);
 assert.equal(data.favoriteMatches[0].status,'matched');assert.ok(urls.filter(u=>u.pathname.endsWith('/discover/movie')).every(u=>u.searchParams.get('with_genres')==='35,9648'));
});
test('genre intersection discovery is deduplicated, bounded and scope is explicit',async()=>{
 const all=['Comedy','Mystery','Adventure','Romance','Sci-fi','Drama','Action','Animation'];
 const {catalog,urls}=fixture();const data=await catalog.pickTogether({...prefs,people:prefs.people.map(p=>({...p,genres:all}))},'US');
 const queries=urls.filter(u=>u.pathname.endsWith('/discover/movie')).map(u=>u.searchParams.get('with_genres'));
 assert.equal(queries.length,8);assert.equal(new Set(queries).size,8);assert.ok(data.notices.some(n=>n.includes('8 of 36')&&n.includes('entire catalog')));
});
test('unavailable mutual title never falls back to an available one-sided suggestion',async()=>{
 const catalog=createCatalog({env:{TMDB_API_KEY:'secret'},fetcher:async url=>{
  const p=new URL(url).pathname;let data;
  if(p.endsWith('/watch/providers/movie'))data={results:[{provider_id:8,provider_name:'Netflix'}]};
  else if(p.endsWith('/discover/movie'))data={results:[{id:1,title:'One-sided',genre_ids:[35]},{id:2,title:'Mutual',genre_ids:[35,9648]}]};
  else if(p.endsWith('/movie/1'))data={id:1,title:'One-sided',overview:'Source',runtime:90,genres:[{id:35,name:'Comedy'}]};
  else if(p.endsWith('/movie/2'))data={id:2,title:'Mutual',overview:'Source',runtime:90,genres:[{id:35,name:'Comedy'},{id:9648,name:'Mystery'}]};
  else if(p.endsWith('/movie/1/watch/providers'))data={results:{US:{flatrate:[{provider_name:'Netflix',provider_id:8}]}}};
  else if(p.endsWith('/movie/2/watch/providers'))data={results:{DE:{flatrate:[{provider_name:'Netflix',provider_id:8}]}}};
  else throw Error('Unexpected request');
  return {ok:true,json:async()=>data};
 }});
 const data=await catalog.pickTogether(prefs,'US');assert.deepEqual(data.results,[]);assert.equal(data.matchStatus,'no_shared_matches');assert.equal(data.availability,'ok');
});
