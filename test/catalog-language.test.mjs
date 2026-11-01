import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCatalog,catalogLanguage} from '../catalog.mjs';
import {storyForMovie} from '../movie-order.mjs';
const response=x=>new Response(JSON.stringify(x));
const movie=(id,language)=>({id,media_type:'movie',title:language==='de-DE'?'Der Test':'The Test',overview:language==='de-DE'?'Eine Geschichte.':'A story.',genre_ids:[18],release_date:'2020-01-01'});
function setup(){const calls=[];const catalog=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>{
 const u=new URL(url);calls.push(u);const lang=u.searchParams.get('language');
 if(u.pathname.endsWith('/watch/providers'))return response({results:{US:{flatrate:[{provider_id:8,provider_name:'Netflix'}]},DE:{free:[{provider_id:35,provider_name:'Rakuten TV'}]}}});
 if(u.pathname.endsWith('/release_dates'))return response({results:[{iso_3166_1:'US',release_dates:[{certification:'PG'}]}]});
 if(u.pathname.endsWith('/search/person'))return response({results:[{id:31,name:u.searchParams.get('query'),known_for_department:'Acting'}]});
 if(u.pathname.endsWith('/combined_credits'))return response({cast:[movie(8,lang)]});
 if(u.pathname.endsWith('/search/multi')&&u.searchParams.get('query')==='tom hanks')return response({results:[{id:31,name:'Tom Hanks',media_type:'person',known_for_department:'Acting'}]});
 if(/\/(search\/multi|trending\/all\/week|discover\/(movie|tv))$/.test(u.pathname))return response({results:[movie(8,lang)]});
 if(u.pathname.endsWith('/collection/4'))return response({name:lang==='de-DE'?'Die Reihe':'The Collection',parts:[movie(8,lang),movie(9,lang)]});
 if(u.pathname.endsWith('/movie/8'))return response({...movie(8,lang),belongs_to_collection:{id:4},credits:{cast:[],crew:[]}});
 if(u.pathname.endsWith('/movie/9'))return response({...movie(9,lang),overview:lang==='de-DE'?'':'English fallback.',credits:{cast:[],crew:[]}});
 return response(movie(Number(u.pathname.split('/').at(-1)),lang));
 }});return {calls,catalog};}

test('catalog language allowlist falls back to English without changing country',async()=>{
 for(const invalid of [undefined,null,'de','fr-FR','DE-de','<script>'])assert.equal(catalogLanguage(invalid),'en-US');
 assert.equal(catalogLanguage('de-DE'),'de-DE');
 const {catalog}=setup();const de=await catalog.search('', 'US',{language:'de-DE',moviesTvOnly:true});
 assert.equal(de.language,'de-DE');assert.equal(de.country,'US');assert.equal(de.results[0].name,'Der Test');assert.equal(de.results[0].providers[0].name,'Netflix');
 const en=await catalog.search('', 'DE',{language:'invalid',moviesTvOnly:true});assert.equal(en.language,'en-US');assert.equal(en.results[0].name,'The Test');assert.equal(en.results[0].providers[0].name,'Rakuten TV');
});
test('localized metadata caches are isolated, while availability cache is shared safely by region',async()=>{
 const {catalog,calls}=setup();await catalog.search('', 'US',{language:'de-DE'});await catalog.search('', 'US',{language:'en-US'});await catalog.search('', 'DE',{language:'de-DE'});
 const metadata=calls.filter(u=>u.pathname.endsWith('/trending/all/week'));assert.equal(metadata.length,2);assert.deepEqual(metadata.map(u=>u.searchParams.get('language')),['de-DE','en-US']);
 assert.equal(calls.filter(u=>u.pathname.endsWith('/watch/providers')).length,1);
});
test('search, genre browse, actor and shared-actor credits use selected language',async()=>{
 const {catalog,calls}=setup();await catalog.search('Der Test','DE',{language:'de-DE',moviesTvOnly:true});await catalog.search('','DE',{language:'de-DE',genre:'drama',moviesTvOnly:true});await catalog.search('Tom Hanks','DE',{language:'de-DE',moviesTvOnly:true});await catalog.search('Tom Hanks and Meg Ryan','DE',{language:'de-DE',moviesTvOnly:true});
 for(const u of calls.filter(u=>/\/search\/|\/discover\/|\/combined_credits$/.test(u.pathname)))assert.equal(u.searchParams.get('language'),'de-DE',u.href);
});
test('German details and movie collection retain IDs, regional availability and missing-field fallback',async()=>{
 const {catalog,calls}=setup();const d=await catalog.details('movie',8,'US','de-DE');assert.equal(d.title.id,80);assert.equal(d.title.name,'Der Test');assert.equal(d.title.providers[0].name,'Netflix');assert.equal(d.language,'de-DE');
 const missing=await catalog.details('movie',9,'DE','de-DE');assert.equal(missing.title.name,'Der Test');assert.equal(missing.title.desc,'English fallback.');assert.equal(missing.title.metadataFallback,'en-US');
 const order=await catalog.movieOrder(8,'DE','de-DE');assert.equal(order.name,'Die Reihe');assert.equal(order.language,'de-DE');assert.equal(order.release[0].name,'Der Test');assert.equal(order.release[0].providers[0].name,'Rakuten TV');
 assert.match(order.note,/Veröffentlichungsreihenfolge/);
 assert.ok(calls.some(u=>u.pathname.endsWith('/collection/4')&&u.searchParams.get('language')==='de-DE'));
});
test('curated chronology translations preserve source references and exact IDs',()=>{
 const en=storyForMovie(11),de=storyForMovie(11,'de-DE');assert.deepEqual(de.ids,en.ids);assert.deepEqual(de.sources,en.sources);assert.notEqual(de.note,en.note);assert.match(de.name,/Skywalker/);
});
test('server forwards language for all metadata endpoints and serves shared i18n client',()=>{
 const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');assert.match(server,/catalogLanguage\(u.searchParams.get\('language'\)\)/);assert.match(server,/catalog.details\(type,Number\(rawId\),country,language\)/);assert.match(server,/catalog.movieOrder\(Number\(rawId\),country,language\)/);assert.match(server,/catalog.search\(searching\?q:'',country,\{language,/);assert.match(server,/u.pathname==='\/i18n-client.js'/);
});
