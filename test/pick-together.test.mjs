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
test('shared source exposes one labeled preview and preserves existing discovery navigation',()=>{
 const root=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.equal(root.match(/id="suPickTogether"/g).length,1);
 assert.match(root,/>Pick Together · Preview<\/button>/);
 assert.equal(root.match(/id="suTogether"/g).length,1);
 assert.match(root,/<script type="module" src="pick-together-ui.mjs"><\/script>/);
 for(const id of ['suSurprise','suFree','suMine','suWatchlist','suMenuOpen'])assert.ok(root.includes('id="'+id+'"'));
 assert.throws(()=>pickTogetherHtml('missing'),/anchor/);
 assert.throws(()=>pickTogetherHtml(root),/already packaged/);
 assert.ok(root.indexOf('id="suTogether"')>root.indexOf('</main>'));
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 for(const platform of ['ios','android'])assert.match(pkg.scripts['sync:'+platform],/npm run prepare:platforms && cap sync/);
});
test('preview notices precede inputs and results, and selecting never claims live availability',()=>{
 const ui=readFileSync(new URL('../pick-together-ui.mjs',import.meta.url),'utf8');
 assert.ok(ui.indexOf('Preview · Sample data only.')<ui.indexOf('id="pickerForm"'));
 assert.match(ui,/not live availability, pricing or playback/);
 assert.match(ui,/ILLUSTRATIVE RESULTS/);
 assert.match(ui,/Service labels, inclusion and extra-cost options below are examples, not current availability or prices/);
 assert.match(ui,/Nothing has been rented, purchased or played/);
 assert.doesNotMatch(ui,/fetch\(|localStorage|sessionStorage/);
});
