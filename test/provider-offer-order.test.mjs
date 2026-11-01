import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const helpers=html.slice(html.indexOf('function providerOfferTier('),html.indexOf('function qualifying('));
function sort(providers,selectedIds=[]){
 const context={selected:new Set(selectedIds),isAvailable:s=>s.eligible!==false,mappedProviders:t=>t.providers};
 vm.createContext(context);vm.runInContext(helpers,context);
 return Array.from(context.orderedProviders({providers}));
}
const p=(name,type,eligible=true)=>({name,type,service:{id:name,eligible}});
test('selected eligible subscriptions rank before free, ads, other subscriptions, rent and buy',()=>{
 const ordered=sort([p('buy','BUY'),p('rent','RENT'),p('other','Subscription'),p('ads','Ad-supported'),p('free','free'),p('mine','SUBSCRIPTION')],['mine']);
 assert.deepEqual(ordered.map(x=>x.name),['mine','free','ads','other','rent','buy']);
});
test('selected rental and purchase never outrank free or another subscription',()=>{
 const ordered=sort([p('rent','Rent'),p('buy','Buy'),p('free','FREE'),p('ads','FREE WITH ADS'),p('other','SUBSCRIPTION')],['rent','buy']);
 assert.deepEqual(ordered.map(x=>x.name),['free','ads','other','rent','buy']);
});
test('ineligible country or plan provider is excluded even if selected',()=>{
 const ordered=sort([p('ineligible','SUBSCRIPTION',false),p('free','FREE')],['ineligible']);
 assert.deepEqual(ordered.map(x=>x.name),['free']);
});
test('unknown types go last, mapped and unmapped free providers remain visible',()=>{
 const ordered=sort([{name:'unknown',type:'other'},{name:'unmapped-free',type:'FREE'},p('rent','RENT')]);
 assert.deepEqual(ordered.map(x=>x.name),['unmapped-free','rent','unknown']);
});
test('equal priority remains in source order without mutating source array',()=>{
 const input=[p('b','SUBSCRIPTION'),p('a','SUBSCRIPTION'),p('free','FREE')];
 assert.deepEqual(sort(input,['b','a']).map(x=>x.name),['b','a','free']);
 assert.deepEqual(input.map(x=>x.name),['b','a','free']);
});
test('card badges, modal links and Watch in Order use shared ordering',()=>{
 assert.match(html,/renderProviderGroups\(t\)/);assert.doesNotMatch(html,/orderedProviders\(t\)\.slice\(0,5\)/);
 assert.match(html,/renderProviderGroups\(t,true\)/);assert.match(html,/for\(const p of orderedProviders\(t\)\)/);
 assert.match(html,/const providers=orderedProviders\(item\),upcoming=/);
 assert.doesNotMatch(html,/tierOrder\.indexOf/);
});
