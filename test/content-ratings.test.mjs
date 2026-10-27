import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeContentRating,usContentRating} from '../content-ratings.mjs';
import {createCatalog} from '../catalog.mjs';

test('US content ratings distinguish movies, TV, and unknown classifications',()=>{
 assert.equal(normalizeContentRating('pg13'),'PG-13');assert.equal(normalizeContentRating('TV MA'),'TV-MA');assert.equal(normalizeContentRating('garbage'),'');
 assert.equal(usContentRating('movie',{results:[{iso_3166_1:'GB',release_dates:[{certification:'15'}]},{iso_3166_1:'US',release_dates:[{type:4,certification:'R'},{type:3,certification:'PG-13'}]}]}),'PG-13');
 assert.equal(usContentRating('series',{results:[{iso_3166_1:'US',rating:'TV-14'}]}),'TV-14');
 assert.equal(usContentRating('movie',{results:[]}),'NR');
});
test('rating filter excludes wrong, foreign-only and missing ratings, failing closed on catalog errors',async()=>{
 const calls=[];let fail=false;
 const catalog=createCatalog({env:{TMDB_API_KEY:'test'},titleIndex:{find:()=>[]},fetcher:async url=>{
  const path=new URL(url).pathname;calls.push(path);
  if(fail)return new Response('{}',{status:503});
  const id=Number(path.split('/')[3]);
  return Response.json({results:id===1?[{iso_3166_1:'US',release_dates:[{type:3,certification:'PG'}]}]:id===2?[{iso_3166_1:'US',release_dates:[{type:3,certification:'R'}]}]:[{iso_3166_1:'GB',release_dates:[{type:3,certification:'PG'}]}]});
 }});
 const items=[1,2,3].map(id=>({id:id*10,sourceId:id,type:'movie',name:'Title '+id}));
 assert.deepEqual((await catalog.filterByRating(items,'PG')).map(x=>x.sourceId),[1]);
 assert.equal(calls.length,3);
 fail=true;await assert.rejects(catalog.filterByRating([{id:40,sourceId:4,type:'movie'}],'PG'));
});
