import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const addon={id:'addon:amazon:hbo-max',name:'HBO Max via Prime Video Channels',hostId:'prime',host:'amazon',addon:true};
function context(){
 const ctx=vm.createContext({window:{StreamUnifyEntitlements:{addonIdentity:n=>n==='HBO Max Amazon Channel'?addon:null}},SERVICES:[{id:'prime',name:'Prime Video',region:'Global'},{...addon,countries:['US'],region:'US'}],country:'US',selected:new Set(['prime']),member:()=>({enabled:true,premium:true}),COUNTRY_GROUPS:{},WORLDWIDE:['US','CA']});
 const a=html.slice(html.indexOf('function allowedCountries('),html.indexOf('\nconst member='));
 const b=html.slice(html.indexOf('const norm='),html.indexOf('function qualifying('));
 vm.runInContext(a+'\nconst isAvailable=s=>allowedCountries(s).includes(country);\n'+b,ctx);return ctx;
}
test('add-on mapping never inherits base-host subscription and free outranks unselected add-on',()=>{
 const c=context();c.title={providers:[{name:'HBO Max Amazon Channel',type:'SUBSCRIPTION'},{name:'Tubi',type:'FREE WITH ADS'},{name:'Amazon Prime Video',type:'RENT'}]};
 assert.deepEqual(Array.from(vm.runInContext('orderedProviders(title).map(p=>p.name)',c)),['Tubi','HBO Max Amazon Channel','Amazon Prime Video']);
 c.selected.add(addon.id);assert.equal(vm.runInContext('orderedProviders(title)[0].name',c),'HBO Max Amazon Channel');
 c.country='CA';assert.equal(vm.runInContext('orderedProviders(title).some(p=>p.name==="HBO Max Amazon Channel")',c),false);
});
test('manual add-on group is clearly separate, escapes labels, and has no add-on signup links',()=>{
 for(const id of ['addonHeading','addonStatus','addonServices','addonRetry'])assert.ok(html.includes(`id="${id}"`));
 assert.match(html,/does not include these add-ons/);assert.match(html,/!s\.addon&&!selected\.has\(s\.id\)/);
 assert.match(html,/data-service="\$\{esc\(s.id\)\}"/);assert.match(html,/serial!==addonRequestSerial\|\|region!==country/);
 assert.match(html,/data.country!==region/);assert.match(html,/AbortSignal.timeout\(12000\)/);
 assert.match(html,/Channel add-on selection is available with Premium/);
});
test('country-scoped add-on merging keeps explicit choices and rejects unsafe IDs',()=>{
 const c=vm.createContext({SERVICES:[],safeLink:()=>''});
 vm.runInContext(html.slice(html.indexOf('function mergeAddonServices('),html.indexOf('async function loadAddonServices(')),c);
 c.items=[addon,{addon:true,id:'<script>',name:'bad'}];vm.runInContext("mergeAddonServices(items,'US');mergeAddonServices(items,'CA');",c);
 assert.equal(c.SERVICES.length,1);assert.deepEqual(Array.from(c.SERVICES[0].countries),['US','CA']);assert.equal(c.SERVICES[0].signup,'');
});
test('explicit source-directory add-on metadata maps without guessing the provider name',()=>{
 const c=context();c.title={providers:[{name:'A separately billed network',type:'SUBSCRIPTION',addon:{id:'addon:source:912',name:'Network via host',addon:true,host:'source'}},{name:'Tubi',type:'FREE'}]};
 c.selected.add('addon:source:912');assert.equal(vm.runInContext('orderedProviders(title)[0].service.id',c),'addon:source:912');
 c.title.providers[0].addon.id='\"><script>';assert.equal(vm.runInContext('mappedProviders(title)[0].service',c),undefined);
});
test('late directory response cannot apply a previous country or replace selected choices',async()=>{
 let resolve;const nodes=new Map();const ctx=vm.createContext({country:'US',window:{},URLSearchParams,AbortSignal,fetch:()=>new Promise(r=>resolve=r),renderServices:()=>{},render:()=>{},mergeAddonServices:()=>{throw Error('stale merge')},selected:new Set(['addon:amazon:hbo-max'])});
 const source=html.slice(html.indexOf('async function loadAddonServices('),html.indexOf('function renderServices(){'));
 vm.runInContext("let addonRequestSerial=0,addonLoadingCountry='',addonLoadedCountry='',addonError=false;"+source,ctx);
 const pending=vm.runInContext('loadAddonServices()',ctx);ctx.country='CA';resolve({ok:true,json:async()=>({country:'US',services:[addon]})});await pending;
 assert.equal(ctx.selected.has(addon.id),true);assert.equal(vm.runInContext('addonLoadedCountry',ctx),'');
});
