import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('redesign preserves functional selector contracts and safe provider links',()=>{
 for(const id of ['search','suSearchButton','recentSearches','recentSearchList','clearRecentSearches','serviceSearch','countryFilter','kindFilter','clearServices','serviceCount','services','genreFilter','ratingFilter','ratingNotice','heading','count','searchSuggestion','actorChoices','actorSummary','results','loadActorMovies','modal','close','modalTitle','mediaDetails','modalLinks','watchlistToast','suDrawer','suMenuOpen','suWatchlist'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/class="su-discover"/);assert.match(html,/class="su-header"/);
 const strip=html.match(/<nav class="su-provider-strip"[\s\S]*?<\/nav>/)[0];
 assert.equal((strip.match(/target="_blank" rel="noopener noreferrer"/g)||[]).length,7);
 assert.match(strip,/https:\/\/www.hbomax.com\/login/);assert.match(html,/su-trademark[^>]*[^]*?™/);
 assert.doesNotMatch(html,/let TITLES=\[\{id:1,name:'The Silent Expanse'/);
 assert.match(html,/\.art:after\{content:none\}/);
});
test('catalog carousel uses current qualifying films and opens existing provider panel',()=>{
 const script=html.slice(html.indexOf('// Catalog-backed discovery carousel.'),html.indexOf('// Header shortcuts and navigation'));
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,innerHTML:'',replaceChildren(){this.innerHTML='';},contains(){return false;},matches(){return false;},focus(){this.focused=true;},classList:{contains(){return true;}}});return nodes.get(id);};
 const opened=[];let tick;
 const context=vm.createContext({TITLES:[{id:1,name:'Film <one>',type:'movie',poster:'https://image.tmdb.org/a',year:2024},{id:2,name:'Series',type:'series',poster:'x'},{id:3,name:'Film two',type:'movie',poster:'x'}],filter:'all',activeRating:'',qualifying:()=>true,$:node,esc:s=>String(s).replaceAll('<','&lt;'),matchMedia:()=>({matches:false}),setInterval:fn=>{tick=fn;},openOptions:id=>opened.push(id),document:{hidden:false,activeElement:null,querySelector:()=>null}});
 vm.runInContext(script+'\nrenderSpotlight()',context);
 assert.match(node('suSpotlight').innerHTML,/Film &lt;one>/);assert.match(node('suSpotlight').innerHTML,/1 \/ 2/);
 node('suSpotlightWatch').onclick();assert.deepEqual(opened,[1]);node('suSpotlightNext').onclick();assert.match(node('suSpotlight').innerHTML,/Film two/);
 context.document.activeElement={id:'suSpotlightPause'};node('suSpotlight').contains=()=>true;
 node('suSpotlightPause').onclick();assert.equal(node('suSpotlightPause').focused,true);const before=node('suSpotlight').innerHTML;tick();assert.equal(node('suSpotlight').innerHTML,before);
 node('search').value='query';vm.runInContext('renderSpotlight()',context);assert.equal(node('suSpotlight').hidden,true);
 node('search').value='';context.TITLES=[];vm.runInContext('renderSpotlight()',context);assert.equal(node('suSpotlight').hidden,true);
});
