import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createCatalog} from '../catalog.mjs';
import {restrictCatalog} from '../membership-policy.mjs';

test('website creator search requests channels and returns direct channel links',async()=>{
 const calls=[];
 const catalog=createCatalog({env:{YOUTUBE_API_KEY:'test'},fetcher:async url=>{
  const u=new URL(url);calls.push(u);
  return new Response(JSON.stringify({items:[{id:{channelId:'UCcreator'},snippet:{title:'Creator',channelTitle:'Creator',description:'Channel description',thumbnails:{default:{url:'https://example.com/avatar.png'}}}},{id:{videoId:'not-channel'},snippet:{title:'Ignore'}}]}));
 }});
 const result=await catalog.search('@Creator','US',{moviesTvOnly:true,youtubeCreators:true});
 assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('type'),'channel');assert.equal(calls[0].searchParams.get('q'),'creator');
 assert.equal(result.results.length,1);assert.equal(result.results[0].type,'channel');assert.equal(result.results[0].watchUrl,'https://www.youtube.com/channel/UCcreator');assert.equal(result.sources.youtube,'ok');
 assert.equal(restrictCatalog(result.results,{plan:'free'}).length,0);assert.equal(restrictCatalog(result.results,{plan:'premium'}).length,1);
});
test('creator lookup preserves rating, genre, actor and unconfigured-source restrictions',async()=>{
 let calls=0;const catalog=createCatalog({env:{YOUTUBE_API_KEY:'test'},fetcher:async()=>{calls++;return new Response('{"items":[]}');}});
 for(const options of [{rating:'PG'},{genre:'comedy'},{personId:31}])await catalog.search('Creator','US',{moviesTvOnly:true,youtubeCreators:true,...options});
 assert.equal(calls,0);
 const result=await createCatalog({env:{},fetcher:()=>{throw Error('unexpected');}}).search('Creator','US',{moviesTvOnly:true,youtubeCreators:true});
 assert.equal(result.sources.youtube,'not_configured');
});
test('creator channels survive display filtering while movie filters and ratings still apply',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function qualifying('),end=html.indexOf('function tmdbTitleUrl(',start);
 const context={filter:'all',activeRating:'',mappedProviders:()=>[],isAvailable:()=>true,channel:{source:'youtube',type:'channel'},movie:{source:'tmdb',type:'movie'}};
 const run=code=>runInNewContext(html.slice(start,end)+'\n'+code,context);
 assert.equal(run('qualifying(channel)'),true);
 context.filter='movie';assert.equal(run('qualifying(channel)'),false);assert.equal(run('qualifying(movie)'),true);
 context.filter='all';context.activeRating='PG';assert.equal(run('qualifying(channel)'),false);
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 for(const script of scripts.filter(s=>s.includes('function qualifying(')))new (await import('node:vm')).Script(script);
});

test('creator matching a TMDB actor retains channel results unless actor is explicitly selected',async()=>{
 const catalog=createCatalog({env:{YOUTUBE_API_KEY:'fixture',TMDB_API_KEY:'fixture'},fetcher:async url=>{
  const u=new URL(url);
  const body=u.hostname==='www.googleapis.com'?{items:[{id:{channelId:'UCnilered'},snippet:{title:'NileRed'}}]}:
   u.pathname.endsWith('/search/multi')?{results:[{id:123,media_type:'person',name:'NileRed',known_for_department:'Acting'}]}:
   u.pathname.endsWith('/combined_credits')?{cast:[{id:234,media_type:'tv',name:'Scare the Coyote'}]}:{results:{}};
  return new Response(JSON.stringify(body));
 }});
 const mixed=await catalog.search('nilered','US',{moviesTvOnly:true,youtubeCreators:true});
 assert.equal(mixed.actor.name,'NileRed');assert.deepEqual(mixed.results.map(x=>x.source),['tmdb','youtube']);
 const actor=await catalog.search('nilered','US',{moviesTvOnly:true,youtubeCreators:true,personId:123});
 assert.deepEqual(actor.results.map(x=>x.source),['tmdb']);
});
