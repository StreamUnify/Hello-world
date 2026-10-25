import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {rankTitles,titleScore,createTitleIndex} from '../title-index.mjs';
import {createCatalog} from '../catalog.mjs';
const snapshot=JSON.parse(await readFile(new URL('../search-title-index.json',import.meta.url),'utf8')).titles;
test('real title corpus corrects rambi to Rambo without a title-specific rule',()=>{
 const matches=rankTitles('rambi',snapshot);
 assert.ok(matches.some(x=>/^rambo\b/i.test(x)),JSON.stringify(matches));
});
test('fuzzy matching handles substitutions, transpositions, missing spaces and partial names',()=>{
 for(const [q,name] of [['rambi','Rambo'],['ramob','Rambo'],['jurrasicpark','Jurassic Park'],['strangr things','Stranger Things'],['harrypotter','Harry Potter and the Philosopher’s Stone'],['dark knigt','The Dark Knight'],['severence','Severance']])assert.ok(rankTitles(q,[name]).includes(name),q);
 assert.equal(titleScore('rambo','Rambo'),1);
 assert.deepEqual(rankTitles('zzzzzz',['Rambo','The Dark Knight']),[]);
});
test('rambi recovers Rambo even with no original or prefix results',async()=>{
 const queries=[];
 const c=createCatalog({env:{TMDB_API_KEY:'test'},titleIndex:{find:q=>rankTitles(q,snapshot)},fetcher:async value=>{
  const u=new URL(value);
  if(u.pathname.endsWith('/watch/providers'))return Response.json({results:{US:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}});
  const q=u.searchParams.get('query');queries.push(q);
  return Response.json({results:q==='Rambo'?[{id:7555,media_type:'movie',title:'Rambo'}]:[]});
 }});
 const r=await c.search('rambi','US');
 assert.equal(r.results[0].name,'Rambo');assert.equal(r.searchMatch.title,'Rambo');
 assert.ok(queries.length<=5);assert.equal(r.results[0].providers[0].name,'Netflix');
});
test('weak upstream results do not suppress a stronger corrected title',async()=>{
 const c=createCatalog({env:{TMDB_API_KEY:'test'},titleIndex:{find:()=>['Rambo']},fetcher:async value=>{
  const u=new URL(value);
  if(u.pathname.endsWith('/watch/providers'))return Response.json({results:{}});
  return Response.json({results:u.searchParams.get('query')==='Rambo'?[{id:1,media_type:'movie',title:'Rambo'}]:[{id:2,media_type:'movie',title:'Unrelated'}]});
 }});
 assert.equal((await c.search('rambi','US')).results[0].name,'Rambo');
});
