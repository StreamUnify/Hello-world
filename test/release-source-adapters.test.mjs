import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrimeAnnouncements,parseNetflixAnnouncements,collectOfficialReleases} from '../release-source-adapters.mjs';
const now=Date.parse('2026-11-02T12:00:00Z');
const articleUrl='https://www.aboutamazon.com/news/entertainment/prime-video-november-shows-2026';
const image='https://assets.aboutamazon.com/example-promo.jpg';
const spotlight=(title,date,art=image)=>`<h3>‘${title}’</h3>${art?`<img src="${art}">`:''}<div class="contentItem-role-text"><b>${date}.</b> Official editorial prose not copied.</div>`;
const prime=(parts=spotlight('Example','November 4'),scope='Coming to Prime Video in the United States in November.',heading='New on Prime Video in November 2026')=>`<h1>${heading}</h1><div class="ArticlePage-articleBody"><p>${scope}</p><h2>More Prime Originals</h2>${parts}<h2>Live sports</h2>${spotlight('Do not include sports','November 5')}<h2>Full list of what’s new</h2><ul><li>Unillustrated title</li></ul></div>`;
const netflix=(scope='Coming to Netflix in the United States in November.')=>`<h1>New on Netflix in November 2026</h1><main><p>${scope}</p><div data-sel="f-item"><img src="https://dnm.nflximg.net/example.jpg"><time dateTime="2026-11-06T08:00:00Z">November 6</time><h3>Example Netflix film</h3></div></main>`;

test('Prime spotlights require explicit US scope, exact streaming month and contextual artwork',()=>{
 const items=parsePrimeAnnouncements(prime(spotlight('The Test &amp; Co.','November 4')+spotlight('Missing artwork','November 6',null)+spotlight('Wrong image host','November 7','https://example.com/img.jpg')),{url:articleUrl,now});
 assert.equal(items.length,1);assert.equal(items[0].title,'The Test & Co.');assert.equal(items[0].streamingDate,'2026-11-04');assert.deepEqual(items[0].countries,['US']);assert.equal(items[0].provider,'prime');assert.equal(items[0].sourceUrl,articleUrl);assert.equal(items[0].image,image);assert.equal(items[0].verifiedAt,new Date(now).toISOString());assert.doesNotMatch(items[0].description,/editorial prose/);
 assert.deepEqual(parsePrimeAnnouncements(prime(undefined,'Coming to Prime Video this November.'),{url:articleUrl,now}),[]);
 assert.deepEqual(parsePrimeAnnouncements(prime(spotlight('Past month','October 4'),undefined,'New on Prime Video in October 2026'),{url:articleUrl,now}),[]);
 assert.deepEqual(parsePrimeAnnouncements(prime(spotlight('Invalid date','November 31')),{url:articleUrl,now}),[]);
 assert.throws(()=>parsePrimeAnnouncements(prime(),{url:'https://evil.example/article',now}),/untrusted/);
});
test('Netflix remains disabled: generic card and publication dates never become streaming dates',()=>{
 assert.deepEqual(parseNetflixAnnouncements(netflix(),{now}),[]);
 assert.deepEqual(parseNetflixAnnouncements(netflix()+'<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-11-06"}</script>',{now}),[]);
 assert.deepEqual(parseNetflixAnnouncements(netflix('US pricing is $10.99; worldwide availability varies.')+'<script>requestCountry={id:"US"}</script>',{now}),[]);
 assert.deepEqual(parseNetflixAnnouncements(netflix().replace('2026-11-06T','2026-10-06T'),{now}),[]);
 assert.deepEqual(parseNetflixAnnouncements(netflix().replace('https://dnm.nflximg.net/example.jpg','javascript:alert(1)'),{now}),[]);
});
test('collector discovers monthly articles from official index without hardcoded title lists',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});
  if(url.includes('netflix.com'))return new Response(netflix());
  if(url.endsWith('/rss/feed.rss'))return new Response('<rss><channel></channel></rss>');
  if(url.endsWith('/news/entertainment'))return new Response(`<a href="${articleUrl}">New on Prime Video in November</a><a href="https://evil.example/prime-video-november">Ignore</a>`);
  if(url===articleUrl)return new Response(prime());return new Response('',{status:404});
 };
 const result=await collectOfficialReleases({fetcher,now});assert.equal(result.releases.length,1);assert.deepEqual(result.sources,{netflix:'unavailable',prime:'ok'});
 for(const c of calls){assert.equal(c.options.credentials,'omit');assert.equal(c.options.redirect,'manual');assert.ok(c.options.signal);assert.doesNotMatch(c.url,/evil/);}
});
test('RSS can recover discovery when index fails; duplicates are collapsed',async()=>{
 const fetcher=async url=>{
  if(url.includes('netflix.com'))return new Response('',{status:503});
  if(url.endsWith('/rss/feed.rss'))return new Response(`<rss><channel><item><title>New on Prime Video in November</title><link>${articleUrl}</link></item><item><link>${articleUrl}</link></item></channel></rss>`);
  if(url===articleUrl)return new Response(prime());return new Response('',{status:503});
 };
 const result=await collectOfficialReleases({fetcher,now});assert.equal(result.releases.length,1);assert.deepEqual(result.sources,{netflix:'unavailable',prime:'ok'});
});
test('untrusted redirects and oversized responses fail closed without following them',async()=>{
 const calls=[];const result=await collectOfficialReleases({now,fetcher:async url=>{calls.push(url);if(url.includes('netflix.com'))return new Response('',{status:302,headers:{location:'https://evil.example/stolen'}});return new Response('x',{headers:{'content-length':String(3*1024*1024+1)}});}});
 assert.deepEqual(result.releases,[]);assert.deepEqual(result.sources,{netflix:'unavailable',prime:'unavailable'});assert.equal(calls.length,3);assert.equal(calls.some(u=>u.includes('evil.example')),false);
});
test('stream size is enforced even when content-length is absent',async()=>{
 const bytes=new Uint8Array(3*1024*1024+1);const result=await collectOfficialReleases({now,fetcher:async()=>new Response(bytes)});assert.deepEqual(result.releases,[]);
});
test('eight-second deadline resolves even when a fetcher ignores abort',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const pending=collectOfficialReleases({now,fetcher:()=>new Promise(()=>{})});
 t.mock.timers.tick(8001);const result=await pending;
 assert.deepEqual(result.releases,[]);assert.deepEqual(result.sources,{netflix:'unavailable',prime:'unavailable'});
});

test('arrival window crosses month/year boundaries and excludes day14-old and day31-future',()=>{
 const october=prime(spotlight('Recent October','October 20')+spotlight('Too old','October 19'),undefined,'New on Prime Video in October 2026');
 assert.deepEqual(parsePrimeAnnouncements(october,{url:articleUrl,now}).map(x=>x.title),['Recent October']);
 const december=prime(spotlight('In window','December 2')+spotlight('Too far','December 3'),undefined,'New on Prime Video in December 2026');
 assert.deepEqual(parsePrimeAnnouncements(december,{url:articleUrl,now}).map(x=>x.title),['In window']);
 const january=Date.parse('2027-01-02T12:00:00Z');
 assert.equal(parsePrimeAnnouncements(prime(spotlight('Year boundary','December 25'),undefined,'New on Prime Video in December 2026'),{url:articleUrl,now:january}).length,1);
});
test('dynamic discovery includes previous-month announcements still in arrival window',async()=>{
 const past='https://www.aboutamazon.com/news/entertainment/prime-video-october-shows-2026';
 const fetcher=async url=>url.endsWith('/news/entertainment')?new Response(`<a href="${past}">New on Prime Video in October</a>`):url===past?new Response(prime(spotlight('Recent October','October 25'),undefined,'New on Prime Video in October 2026')):new Response('',{status:404});
 assert.equal((await collectOfficialReleases({fetcher,now})).releases[0].title,'Recent October');
});
