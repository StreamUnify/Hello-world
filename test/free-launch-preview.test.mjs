import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPreviewFetch} from '../scripts/free-launch-preview-api.mjs';
import {websiteHtml} from '../website-branding.mjs';
const snapshot=JSON.parse(await readFile(new URL('../scripts/free-launch-catalog-snapshot.json',import.meta.url),'utf8'));
test('preview restores the same Pick Together entry and module as the website',async()=>{
 const html=websiteHtml(await readFile(new URL('../index.html',import.meta.url),'utf8'));
 assert.match(html,/id="suWebPickTogether"/);assert.match(html,/id="suWebTogether"/);assert.match(html,/src="website-pick-together-ui\.mjs"/);
 const builder=await readFile(new URL('../scripts/build-free-launch-preview.mjs',import.meta.url),'utf8');
 assert.match(builder,/websiteHtml\(await readFile/);assert.match(builder,/Refusing to build an empty catalog/);
});
test('preview discovery includes real movie and television records with posters',async()=>{
 const api=createPreviewFetch(snapshot);
 const data=await (await api('/api/trending?country=US')).json();
 assert.ok(data.results.length>=12);assert.ok(data.results.some(t=>t.type==='movie'));assert.ok(data.results.some(t=>t.type==='series'));
 assert.ok(data.results.every(t=>t.name&&/^https:\/\//.test(t.poster)));
 const name=data.results[0].name;
 const results=await (await api('/api/search?q='+encodeURIComponent(name.toUpperCase()))).json();
 assert.ok(results.results.some(t=>t.name===name));
});
test('preview Pick Together matches actual genres and selected reported providers',async()=>{
 const supported=['Comedy','Mystery','Adventure','Romance','Sci-fi','Drama','Action','Animation','Horror'];
 const title=snapshot.results.find(t=>t.type==='movie'&&t.genres?.some(g=>supported.includes(g))&&t.providers?.length);
 assert.ok(title);const genre=title.genres.find(g=>supported.includes(g));
 const preferences={people:[{genres:[genre],mood:'',favorite:''},{genres:[genre],mood:'',favorite:''}],services:['netflix','disney','hulu','peacock','paramount','discovery','sling','cue','tubi','max','prime','apple'],extras:false,runtime:999};
 const data=await (await createPreviewFetch(snapshot)('/api/pick-together?preferences='+encodeURIComponent(JSON.stringify(preferences)))).json();
 assert.ok(data.results.length>0);assert.ok(data.results.every(t=>t.type==='movie'&&t.genres.includes(genre)&&t.matchedProviders.length));
});
test('preview watchlist changes stay in the simulated signed-in account',async()=>{
 let user=null;const api=createPreviewFetch(snapshot,()=>user),title=snapshot.results[0];
 assert.equal((await api('/api/watchlist')).status,401);
 user={id:'preview-only'};await api('/api/watchlist',{method:'POST',body:JSON.stringify(title)});
 assert.equal((await (await api('/api/watchlist')).json()).items[0].snapshot.name,title.name);
 await api('/api/watchlist?id='+title.id,{method:'DELETE'});
 assert.deepEqual((await (await api('/api/watchlist')).json()).items,[]);
});
test('preview billing is blocked and does not contact a payment endpoint',async()=>{
 let network=false;const api=createPreviewFetch(snapshot,()=>null,async()=>{network=true;throw Error('network');});
 assert.equal((await api('/api/billing/checkout',{method:'POST'})).status,409);assert.equal(network,false);
});
