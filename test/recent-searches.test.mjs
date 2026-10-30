import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMembership} from '../membership.mjs';
import {createAccountRoutes} from '../account-routes.mjs';
import {createRecentSearches} from '../recent-searches-client.mjs';
const env={MEMBERSHIP_ENABLED:'true',SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture'};
test('history uses authenticated user token and explicit owner; free accounts need no premium check',async()=>{
 const calls=[];const member=createMembership({env,fetcher:async(url,options)=>{calls.push({url,options});return Response.json(url.includes('select=')?[{queries:['Dune']}]:null);}});
 const actor={id:'account-a',token:'user-token'};
 assert.deepEqual(await member.listRecentSearches(actor),['Dune']);
 await member.rememberSearch(actor,'Dune');await member.clearRecentSearches(actor);
 for(const call of calls)assert.equal(call.options.headers.Authorization,'Bearer user-token');
 assert.match(calls[0].url,/user_id=eq.account-a/);assert.match(calls[2].url,/user_id=eq.account-a/);
 assert.deepEqual(JSON.parse(calls[1].options.body),{p_query:'Dune'});
});
test('history routes require authentication and ignore caller-supplied user IDs',async()=>{
 const actor={id:'account-a'};let authenticated=0,cleared=0;
 const routes=createAccountRoutes({enabled:true,authenticate:async()=>{authenticated++;return actor;},listRecentSearches:async who=>{assert.equal(who,actor);return ['Dune'];},clearRecentSearches:async who=>{assert.equal(who,actor);cleared++;}},{});
 const res={setHeader(){}};let body;
 for(const method of ['GET','DELETE'])await routes({method},res,new URL('https://example.com/api/account/recent-searches?user_id=account-b'),(_r,_s,data)=>body=data);
 assert.equal(authenticated,2);assert.equal(cleared,1);assert.deepEqual(body,{ok:true});
 const denied=createAccountRoutes({enabled:true,authenticate:async()=>{throw Error('sign in');}},{});
 await assert.rejects(denied({method:'GET'},res,new URL('https://example.com/api/account/recent-searches'),()=>{}),/sign in/);
});
class Element {hidden=false;disabled=false;textContent='';children=[];handlers={};replaceChildren(){this.children=[];}append(e){this.children.push(e);}addEventListener(name,fn){this.handlers[name]=fn;}}
function setup(api){const elements=Object.fromEntries(['recentSearches','recentSearchList','recentSearchNote','clearRecentSearches'].map(id=>[id,new Element()]));let id='a';const searches=[];const history=createRecentSearches({api,identity:()=>id,runSearch:q=>searches.push(q),document:{getElementById:id=>elements[id],createElement:()=>new Element()}});return {elements,history,searches,identity:value=>id=value};}
test('late account response cannot expose history after logout or account switch',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const ui=setup(()=>pending);
 const first=ui.history.reload();ui.identity(null);await ui.history.reload();resolve({queries:['Private title']});await first;
 assert.equal(ui.elements.recentSearches.hidden,true);assert.equal(ui.elements.recentSearchList.children.length,0);
});
test('history safely renders titles, reruns a selection, and clears',async()=>{
 let queries=['<img src=x onerror=alert(1)>','Dune'];
 const ui=setup(async(_path,options)=>{if(options?.method==='DELETE')queries=[];return {queries};});
 await ui.history.reload();const buttons=ui.elements.recentSearchList.children.map(x=>x.children[0]);assert.equal(buttons[0].textContent,queries[0]);buttons[1].onclick();assert.deepEqual(ui.searches,['Dune']);
 await ui.elements.clearRecentSearches.onclick();assert.equal(ui.elements.recentSearchList.children.length,0);assert.equal(ui.elements.recentSearchNote.textContent,'Search history cleared.');
});
