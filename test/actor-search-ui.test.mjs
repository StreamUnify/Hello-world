import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('actor selection and pagination keep one search allowance and append movies',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const script=html.slice(html.indexOf('let searchBusy=false;'),html.indexOf('let searchDebounce;'));
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='genreFilter'?'':'Tom Hanks',querySelectorAll:()=>[]});return nodes.get(id);};
 const requests=[],answers=[];
 const sandbox=vm.createContext({URLSearchParams,document:{querySelectorAll:()=>[]},window:{membershipReady:Promise.resolve()},crypto:{randomUUID:()=>String(requests.length+1)},$:node,esc:s=>String(s).replaceAll('<','&lt;'),store(){},member:()=>({enabled:true,async search(url,id){requests.push({url,id});const next=answers.shift();if(next instanceof Error)throw next;return next;}})});
 vm.runInContext("let actorSearch=null,actorChoices=[],searchContext=null,TITLES=[],saved=new Set(),savedTitles={},country='US',filter='all',liveStatus='',loadSerial=0;function render(){renderActorSearch();}"+script,sandbox);
 const response=(page,results)=>({actor:{id:31,name:'Tom Hanks',total:3,page,pages:2},actors:[{id:31,name:'Tom Hanks'}],results,sources:{tmdb:'ok'}});
 answers.push(response(1,[{id:1},{id:2}]));await vm.runInContext('loadTitles(true)',sandbox);
 assert.match(nodes.get('actorSummary').textContent,/3 movie and TV acting credits.*2 loaded/);
 answers.push(response(2,[{id:3}]));await nodes.get('loadActorMovies').onclick();
 assert.equal(vm.runInContext('TITLES.length',sandbox),3);assert.equal(nodes.get('loadActorMovies').hidden,true);
 assert.equal(requests[0].id,requests[1].id);assert.match(requests[1].url,/personId=31/);assert.match(requests[1].url,/page=2/);
 node('genreFilter').value='comedy';answers.push(response(1,[{id:1}]));await vm.runInContext('loadTitles(true,{refine:true,personId:31})',sandbox);assert.match(requests.at(-1).url,/genre=comedy/);assert.equal(requests[0].id,requests.at(-1).id);
 // Re-selecting an actor for the same name is part of the original search.
 answers.push(response(1,[{id:1},{id:2}]));await vm.runInContext('loadTitles(true,{personId:31})',sandbox);
 assert.equal(requests[0].id,requests[3].id);
 answers.push(Error('Offline'));await nodes.get('loadActorMovies').onclick();
 assert.equal(vm.runInContext('TITLES.length',sandbox),2);assert.equal(nodes.get('loadActorMovies').disabled,false);assert.equal(nodes.get('loadActorMovies').hidden,false);
 node('search').value='Rambo';answers.push({results:[{id:9}],sources:{tmdb:'ok'}});await vm.runInContext('loadTitles(true)',sandbox);
 assert.equal(vm.runInContext('actorSearch',sandbox),null);assert.equal(nodes.get('actorSummary').hidden,true);assert.notEqual(requests[0].id,requests.at(-1).id);
});
