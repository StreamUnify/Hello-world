import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const helper=html.slice(html.indexOf('let titleSearchIntent=0;'),html.indexOf('let searchBusy=false;'));
function setup({platform='web',reduce=false}={}){
 const timers=new Map(),calls=[],listeners=new Map();let serial=0;
 const nodes={search:{value:'Alien',blur(){calls.push('blur');document.activeElement=document.body;}},suSearchButton:{},heading:{setAttribute(...args){calls.push(args);},focus(opts){calls.push(['focus',opts]);},getBoundingClientRect:()=>({top:700})}};
 const document={body:{},activeElement:nodes.search,querySelector:selector=>selector==='header'?{getBoundingClientRect:()=>({bottom:212})}:null};
 const window={Capacitor:{isNativePlatform:()=>platform!=='web',getPlatform:()=>platform},visualViewport:{addEventListener:(type,cb)=>listeners.set(type,cb),removeEventListener:type=>listeners.delete(type)},scrollY:100,matchMedia:()=>({matches:reduce}),scrollTo:opts=>calls.push(['scroll',opts])};
 const ctx=vm.createContext({window,document,$:id=>nodes[id],setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),loadTitles:(...args)=>calls.push(['load',...args])});
 vm.runInContext('let searchDebounce,loadSerial=1;'+helper,ctx);
 const run=code=>vm.runInContext(code,ctx);
 const finish=()=>{const next=timers.values().next().value;if(next)next();};
 return {ctx,run,finish,calls,nodes,document,listeners,timers};
}
for(const platform of ['web','ios','android'])test(`${platform}: explicit submission blurs keyboard and reveals settled results below safe-area header`,()=>{
 const h=setup({platform});h.run('submitTitleSearch()');assert.equal(h.calls[0],'blur');assert.equal(h.calls[1][2].revealResults,true);
 h.run("revealTitleResults(1,1,'Alien')");assert.equal(h.calls.some(x=>x[0]==='scroll'),false);
 h.listeners.get('resize')();h.finish();
 assert.equal(h.calls.filter(x=>x[0]==='scroll').length,1);
 assert.equal(h.calls.find(x=>x[0]==='scroll')[1].top,572);
 assert.equal(h.calls.find(x=>x[0]==='scroll')[1].behavior,'smooth');
 assert.equal(h.nodes.heading.tabIndex,-1);assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
});
test('reduced motion uses instant scrolling',()=>{const h=setup({reduce:true});h.run("submitTitleSearch();revealTitleResults(1,1,'Alien')");h.finish();assert.equal(h.calls.find(x=>x[0]==='scroll')[1].behavior,'auto');});
for(const change of ['++titleSearchIntent','++loadSerial',"$('search').value='Aliens'","document.activeElement={}","document.querySelector=()=>({open:true})"]){test(`cancels delayed reveal when intent or focus changes: ${change}`,()=>{const h=setup();h.run("submitTitleSearch();revealTitleResults(1,1,'Alien');"+change);h.finish();assert.equal(h.calls.some(x=>x[0]==='scroll'),false);});}
test('empty submission does not reveal trending results',()=>{const h=setup();h.nodes.search.value=' ';h.run('submitTitleSearch()');assert.equal(h.calls[0][2].revealResults,false);});
test('only button and Enter opt into reveal; live search, pagination and filters do not',()=>{
 assert.match(html,/suSearchButton'\).onclick=submitTitleSearch/);
 assert.match(html,/e.key==='Enter'.*submitTitleSearch\(\)/);
 assert.match(html,/function searchLive\(\).*setTimeout\(\(\)=>loadTitles\(true\),350\)/);
 assert.match(html,/oninput=e=>\{\+\+titleSearchIntent/);
 assert.match(html,/finally\{if\(current===busySerial\).*if\(current===loadSerial&&options.revealResults\)revealTitleResults/);
});
test('completed explicit searches reveal success, empty, and error states once; background and stale responses never reveal',async()=>{
 const script=html.slice(html.indexOf('let searchBusy=false;'),html.indexOf('let searchDebounce;'));
 const nodes=new Map(),reveals=[],answers=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{value:id==='genreFilter'?'':'Alien',querySelectorAll:()=>[]});return nodes.get(id);};
 const ctx=vm.createContext({URLSearchParams,document:{querySelectorAll:()=>[]},window:{membershipReady:Promise.resolve()},crypto:{randomUUID:()=> 'request'},$:node,esc:String,store(){},providerAddon:()=>null,mergeAddonServices(){},renderServices(){},revealTitleResults:(...args)=>reveals.push(args),member:()=>({enabled:true,async search(){const next=answers.shift();if(next instanceof Error)throw next;return await next;}})});
 vm.runInContext("let actorSearch=null,actorChoices=[],searchContext=null,TITLES=[],saved=new Set(),savedTitles={},country='US',filter='all',liveStatus='',loadSerial=0;function render(){renderActorSearch();}"+script,ctx);
 const run=code=>vm.runInContext(code,ctx);
 for(const response of [{results:[{id:1}],sources:{tmdb:'ok'}},{results:[]},Error('Offline')]){
  answers.push(response);await run('loadTitles(true,{revealResults:true,intent:1})');
 }
 assert.equal(reveals.length,3);assert.match(run('liveStatus'),/Search unavailable: Offline/);
 answers.push({results:[]});await run('loadTitles()');assert.equal(reveals.length,3);
 answers.push({results:[]});await run('loadTitles(true)');assert.equal(reveals.length,3);
 let resolve;answers.push(new Promise(r=>resolve=r));const pending=run('loadTitles(true,{revealResults:true,intent:2})');
 await new Promise(setImmediate);await run('loadTitles(true,{revealResults:true,intent:3})');assert.equal(answers.length,0);run('++loadSerial');resolve({results:[]});await pending;assert.equal(reveals.length,3);assert.equal(run('searchBusy'),false);
});

