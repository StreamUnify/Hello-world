import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../catalog.mjs';
import {STORY_ORDERS,releaseOrder,chronologicalOrder} from '../movie-order.mjs';
const response=data=>new Response(JSON.stringify(data));

test('release order puts undated titles last, deduplicates, and does not mutate input',()=>{
 const items=[{sourceId:2,releaseDate:''},{sourceId:3,releaseDate:'2002-01-01'},{sourceId:1,releaseDate:'2000-01-01'},{sourceId:1,releaseDate:'2000-01-01'}];
 assert.deepEqual(releaseOrder(items).map(x=>x.sourceId),[1,3,2]);assert.equal(items.length,4);
 assert.equal(chronologicalOrder(items,null),null);
});
test('curated chronology includes prequels first without inventing order for other films',()=>{
 for(const story of STORY_ORDERS)assert.equal(new Set(story.ids).size,story.ids.length);
 const story=STORY_ORDERS[0];
 const items=[{sourceId:11},{sourceId:1893},{sourceId:330459},{sourceId:999}];
 assert.deepEqual(chronologicalOrder(items,story).map(x=>x.sourceId),[1893,330459,11]);
});
test('collection sequels keep distinct regional services even when one is unavailable',async()=>{
 let calls=0;
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async input=>{
  calls++;const u=new URL(input),p=u.pathname;
  if(p.endsWith('/watch/providers'))return response({results:{US:{flatrate:[{provider_id:p.includes('/1/')?8:337,provider_name:p.includes('/1/')?'Netflix':'Disney+'}],link:'https://www.themoviedb.org/watch'},CA:{free:[{provider_id:73,provider_name:'Tubi'}]}}});
  if(p.endsWith('/collection/10'))return response({name:'Example Collection',parts:[{id:2,title:'Sequel',release_date:'2002-01-01'},{id:1,title:'Original',release_date:'2000-01-01'},{id:3,title:'Future',release_date:''}]});
  return response({id:1,title:'Original',belongs_to_collection:{id:10}});
 }});
 const us=await c.movieOrder(1,'US');assert.equal(us.chronological,null);assert.deepEqual(us.release.map(x=>x.name),['Original','Sequel','Future']);
 assert.equal(us.release[0].providers[0].name,'Netflix');assert.equal(us.release[1].providers[0].name,'Disney+');
 const before=calls;await c.movieOrder(1,'US');assert.equal(calls,before);
 const ca=await c.movieOrder(1,'CA');assert.equal(ca.release[0].providers[0].name,'Tubi');
});
test('curated prequels work across TMDB collections and preserve release order separately',async()=>{
 const story=STORY_ORDERS[1];
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async input=>{
 const p=new URL(input).pathname;if(p.endsWith('/watch/providers'))return response({results:{}});
 const id=Number(p.split('/').at(-1));return response({id,title:'Film '+id,release_date:id===671?'2001-01-01':'2016-01-01'});
 }});
 const data=await c.movieOrder(671,'US');assert.equal(data.release[0].sourceId,671);assert.deepEqual(data.chronological.map(x=>x.sourceId),story.ids);
 assert.equal(data.release[0].id,6710);assert.equal(data.release[0].type,'movie');
});
test('standalone movies return an empty collection; failed availability retains the movie',async()=>{
 const standalone=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async()=>response({id:1})});
 assert.deepEqual((await standalone.movieOrder(1,'US')).release,[]);
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async input=>{
 const p=new URL(input).pathname;if(p.endsWith('/watch/providers'))return new Response('',{status:503});
 if(p.includes('/collection/'))return response({name:'Collection',parts:[{id:1,title:'One'},{id:2,title:'Two'}]});
 return response({id:1,belongs_to_collection:{id:2}});
 }});
 const r=await c.movieOrder(1,'US');assert.equal(r.release.length,2);assert.equal(r.availability,'partial');assert.deepEqual(r.release[0].providers,[]);
 await assert.rejects(c.movieOrder(-1,'US'),/invalid_movie/);
 await assert.rejects(c.movieOrder(1.5,'US'),/invalid_movie/);
});
