import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalog,initialSettings,rankPicks,explainMatch} from '../pick-together-model.mjs';
import {pickTogetherHtml} from '../scripts/pick-together-package.mjs';
test('default ranking balances both people and does not mutate settings or catalog',()=>{
 const s=initialSettings(),before=JSON.stringify({s,catalog});
 assert.deepEqual(rankPicks(s).map(t=>t.title),['Game Night','Knives Out','Chef']);
 assert.deepEqual(rankPicks(s).map(t=>t.score),[23,23,21]);
 assert.equal(JSON.stringify({s,catalog}),before);
 assert.match(explainMatch(rankPicks(s)[0],s),/shared taste for Comedy/);
});
test('service, runtime, extras, empty state and ranking tie boundaries',()=>{
 const s=initialSettings();s.services=[];assert.deepEqual(rankPicks(s),[]);
 s.services=['Hulu'];s.runtime=105;assert.deepEqual(rankPicks(s).map(t=>t.title),['Palm Springs']);
 s.runtime=120;assert.equal(rankPicks(s).length,1);s.extras=true;assert.deepEqual(new Set(rankPicks(s).map(t=>t.title)),new Set(['Palm Springs','Arrival']));
 s.services=['Prime Video'];s.runtime=99;assert.deepEqual(rankPicks(s),[]);
 s.runtime=100;assert.equal(rankPicks(s)[0].title,'Game Night');
});
test('unknown favorites do not change ranking; recognized favorites contribute and sessions are isolated',()=>{
 const s=initialSettings(),other=initialSettings(),before=rankPicks(s);
 s.people[0].favorite='<script>bad</script>';assert.deepEqual(rankPicks(s),before);
 s.people[0].favorite='  game night  ';assert.ok(rankPicks(s)[0].score>before[0].score);
 s.services.length=0;s.people[0].genres.length=0;assert.equal(other.services.length,3);assert.equal(other.people[0].genres.length,2);
});
test('packaging preserves homepage source and existing navigation and only adds separate screen',()=>{
 const root=readFileSync(new URL('../index.html',import.meta.url),'utf8'),mobile=pickTogetherHtml(root);
 assert.doesNotMatch(root,/suPickTogether|pick-together-ui/);
 assert.equal(mobile.match(/id="suWebPickTogether"/g).length,1);
 assert.ok(mobile.indexOf('id="suWebPickTogether"')>mobile.indexOf('id="search"'));assert.ok(mobile.indexOf('id="suWebPickTogether"')<mobile.indexOf('id="recentSearches"'));assert.ok(mobile.includes('Pick a Movie. Together'));assert.ok(!mobile.slice(mobile.indexOf('<header'),mobile.indexOf('</header>')).includes('id="suWebPickTogether"'));
 for(const id of ['suSurprise','suFree','suMine','suWatchlist','suMenuOpen'])assert.ok(mobile.includes('id="'+id+'"'));
 assert.throws(()=>pickTogetherHtml('missing'),/anchor/);
 assert.ok(mobile.indexOf('id="suWebTogether"')>mobile.indexOf('</main>'));
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.match(pkg.scripts['sync:ios'],/prepare-platforms.mjs --ios/);
 assert.doesNotMatch(pkg.scripts['sync:android'],/--ios/);
});
