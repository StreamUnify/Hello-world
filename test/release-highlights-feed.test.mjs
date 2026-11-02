import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
import {validateReleaseSnapshot,createReleaseHighlights,nextDailyRefresh,SNAPSHOT_URL}from'../release-highlights-feed.mjs';
const now=Date.parse('2026-11-02T01:00:00Z');
const release={id:'prime:test:2026-11-03',title:'Test title',provider:'prime',providerName:'Prime Video',streamingDate:'2026-11-03',countries:['US'],image:'https://assets.aboutamazon.com/test.jpg',description:'Example.',sourceUrl:'https://www.aboutamazon.com/news/entertainment/test',verifiedAt:new Date(now).toISOString()};
const sample=()=>({checkedAt:new Date(now).toISOString(),expiresAt:new Date(now+172800000).toISOString(),releases:[{...release}]});
test('only country-matching verified streaming records survive',()=>{assert.equal(validateReleaseSnapshot(sample(),'US',now).releases.length,1);assert.equal(validateReleaseSnapshot(sample(),'GB',now).releases.length,0);});
test('stale, future, malformed, untrusted and expired release data fails closed',()=>{
 for(const patch of [{checkedAt:'bad'},{checkedAt:new Date(now+86400000).toISOString()},{expiresAt:new Date(now-1).toISOString()},{expiresAt:new Date(now+3*86400000).toISOString()}])assert.equal(validateReleaseSnapshot({...sample(),...patch},'US',now).releases.length,0);
 for(const patch of [{streamingDate:'2026-02-30'},{streamingDate:'2025-01-01'},{sourceUrl:'https://attacker.example/'},{image:'https://127.0.0.1/a.jpg'},{verifiedAt:new Date(now-3*86400000).toISOString()},{countries:['US','bad']},{provider:'invented'}])assert.equal(validateReleaseSnapshot({...sample(),releases:[{...release,...patch}]},'US',now).releases.length,0);
});
test('daily UTC schedule advances without extending record verification',()=>{assert.equal(nextDailyRefresh(now),'2026-11-02T06:00:00.000Z');assert.equal(nextDailyRefresh(Date.parse('2026-11-02T06:00:00Z')),'2026-11-03T06:00:00.000Z');assert.equal(validateReleaseSnapshot(sample(),'US',now+3600000).releases[0].verifiedAt,release.verifiedAt);});
test('snapshot reads are coalesced and failure never renews stale data',async()=>{
 let clock=now,calls=0,fail=false;const feed=createReleaseHighlights({clock:()=>clock,fetcher:async url=>{calls++;assert.equal(url,SNAPSHOT_URL);if(fail)throw Error('offline');return new Response(JSON.stringify(sample()));}});
 const result=await Promise.all([feed.get('US'),feed.get('US')]);assert.equal(calls,1);assert.equal(result[0].releases.length,1);
 clock+=3*86400000;fail=true;assert.equal((await feed.get('US')).releases.length,0);assert.equal(calls,2);await feed.get('US');assert.equal(calls,2);
});
test('daily snapshot branch cannot trigger existing main native release workflow',()=>{const yaml=readFileSync(new URL('../.github/workflows/daily-release-highlights.yml',import.meta.url),'utf8');assert.match(yaml,/cron: '0 6 \* \* \*'/);assert.match(yaml,/branch=data\/release-highlights/);assert.doesNotMatch(yaml,/git push origin main|codemagic|secrets\./);});
test('all carousel assets have MIME routes and validated country API',()=>{const source=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');for(const name of ['/release-highlights.js','/release-highlights-policy.mjs','/release-highlights.css','/api/release-highlights'])assert.ok(source.includes(name));assert.match(source,/text\/css; charset=utf-8/);});
