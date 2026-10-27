import test from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../catalog.mjs';
const response=data=>new Response(JSON.stringify(data));
test('movie and TV details keep correct metadata, IDs, regional ratings and providers',async()=>{
 const calls=[];
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  if(u.pathname.endsWith('/watch/providers'))return response({results:{CA:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}});
  return response({id:10,title:'Film',name:'Series',runtime:100,episode_run_time:[42],overview:'Full synopsis',vote_count:20,vote_average:7.2,genres:[{name:'Drama'}],credits:{cast:[{id:31,name:'Actor',character:'Role'},{name:'Excluded',adult:true}],crew:[{id:44,name:'Director',job:'Director'}]},release_dates:{results:[{iso_3166_1:'US',release_dates:[{certification:'R'}]},{iso_3166_1:'CA',release_dates:[{certification:'14A'}]}]},content_ratings:{results:[{iso_3166_1:'CA',rating:'TV-14'}]},created_by:[{id:55,name:'Creator'}],number_of_seasons:2,number_of_episodes:16,seasons:[{season_number:0,name:'Specials'},{season_number:1,name:'Season 1',episode_count:8,air_date:'2020-01-01'}]});
 }});
 const movie=(await c.details('movie',10,'CA')).title;
 assert.equal(movie.id,100);assert.equal(movie.runtime,100);assert.equal(movie.certification,'14A');assert.deepEqual(movie.creators,['Director']);assert.equal(movie.cast.length,1);assert.equal(movie.cast[0].id,31);assert.equal(movie.creatorProfiles[0].id,44);assert.equal(movie.providers[0].name,'Netflix');
 const tv=(await c.details('series',10,'CA')).title;
 assert.equal(tv.id,101);assert.equal(tv.runtime,42);assert.equal(tv.certification,'TV-14');assert.equal(tv.seasonCount,2);assert.equal(tv.episodeCount,16);assert.equal(tv.seasons.length,1);assert.deepEqual(tv.creators,['Creator']);assert.equal(tv.creatorProfiles[0].id,55);
 assert.ok(calls.find(u=>u.pathname==='/3/movie/10').searchParams.get('append_to_response').includes('credits'));
 await c.details('movie',10,'CA');assert.equal(calls.filter(u=>u.pathname==='/3/movie/10').length,1);
});
test('details reject invalid and adult titles and preserve absent metadata',async()=>{
 const c=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async url=>response(String(url).includes('watch/providers')?{results:{}}:{id:1,title:'Minimal'})});
 for(const [type,id] of [['person',1],['movie',0],['series',1.5]])await assert.rejects(c.details(type,id,'US'));
 const t=(await c.details('movie',1,'US')).title;assert.equal(t.runtime,null);assert.equal(t.communityRating,null);assert.equal(t.certification,'');assert.deepEqual(t.cast,[]);
 const adult=createCatalog({env:{TMDB_API_KEY:'test'},fetcher:async()=>response({id:1,adult:true})});await assert.rejects(adult.details('movie',1,'US'));
});

test('TMDB links use the correct media namespace and verified numeric IDs',async()=>{
 const {readFile}=await import('node:fs/promises'),{runInNewContext}=await import('node:vm');
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const script=html.slice(html.indexOf('function tmdbTitleUrl('),html.indexOf('function render(){'));
 const context={esc:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;')};
 const run=code=>runInNewContext(script+'\n'+code,context);
 assert.equal(run("tmdbTitleUrl({type:'movie',source:'tmdb',sourceId:858})"),'https://www.themoviedb.org/movie/858');
 assert.equal(run("tmdbTitleUrl({type:'series',id:'966771'})"),'https://www.themoviedb.org/tv/96677');
 for(const media of [{type:'video',source:'youtube',sourceId:1},{type:'movie',source:'other',sourceId:1},{type:'movie',sourceId:'javascript:alert(1)'},{type:'series',sourceId:-1}]){context.media=media;assert.equal(run('tmdbTitleUrl(media)'),'');}
 assert.match(run("tmdbPersonName({id:31,name:'Tom Hanks'})"),/href="https:\/\/www.themoviedb.org\/person\/31".*target="_blank".*noopener noreferrer/);
 assert.doesNotMatch(run("tmdbPersonName({id:null,name:'Unknown'})"),/<a/);
});
