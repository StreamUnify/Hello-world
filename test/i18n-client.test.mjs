import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../i18n-client.js',import.meta.url),'utf8');
function setup({languages=['en-US'],saved={},texts=[],options=[],attributes=[]}={}){
 const data=new Map(Object.entries(saved)),writes=[],events=[];
 const nodes=texts.map(x=>({nodeValue:x.text,parentElement:{closest:()=>x.protected||false,matches:()=>x.provider||false}}));
 const document={readyState:'loading',body:{},documentElement:{lang:'en'},getElementById:()=>null,addEventListener(){},querySelectorAll:selector=>selector==='option'?options:attributes,createTreeWalker(){let i=0;return {nextNode:()=>nodes[i++]||null};}};
 const context={document,window:{dispatchEvent:event=>events.push(event)},navigator:{languages},Intl,localStorage:{getItem:key=>data.get(key)||null,setItem(key,value){data.set(key,value);writes.push([key,value]);}},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},queueMicrotask};
 vm.runInNewContext(source,context);
 return {api:context.window.StreamUnifyI18n,nodes,document,data,writes,events};
}
test('preferred language chooses supported device language, with explicit English fallback',()=>{
 assert.equal(setup({languages:['de-AT','en-GB']}).api.locale,'de-DE');
 assert.equal(setup({languages:['fr-FR','de-DE']}).api.language,'de');
 assert.equal(setup({languages:['ja-JP']}).api.locale,'en-US');
 assert.equal(setup({languages:['de-DE'],saved:{su_ui_locale:'en'}}).api.language,'en');
 assert.equal(setup({languages:['en-US'],saved:{su_ui_locale:'"de-DE"'}}).api.language,'de');
});
test('country suggestion respects explicit region and saved country independently of language',()=>{
 assert.equal(setup({languages:['de-AT']}).api.suggestedCountry,'AT');
 assert.equal(setup({languages:['de']}).api.suggestedCountry,'US');
 assert.equal(setup({languages:['de-CH']}).api.suggestedCountry,'US');
 const env=setup({languages:['de-DE'],saved:{su_country:'"CA"'}});
 assert.equal(env.api.suggestedCountry,'CA');env.api.setLanguage('en');
 assert.equal(env.api.suggestedCountry,'CA');assert.equal(env.data.get('su_country'),'"CA"');
 assert.deepEqual(env.writes,[['su_ui_locale','en']]);
});
test('manual switch translates then restores controls without changing catalog titles or providers',()=>{
 const env=setup({texts:[{text:'Where to watch'},{text:'Free',protected:true},{text:'Free',provider:true},{text:'Unknown server error'}]});
 env.api.setLanguage('de');assert.equal(env.nodes[0].nodeValue,'Wo anschauen');assert.equal(env.nodes[1].nodeValue,'Free');assert.equal(env.nodes[2].nodeValue,'Free');assert.equal(env.nodes[3].nodeValue,'Unknown server error');
 assert.equal(env.document.documentElement.lang,'de');assert.equal(env.events[0].type,'su-languagechange');assert.equal(env.events[0].detail.locale,'de-DE');
 env.api.setLanguage('en');assert.equal(env.nodes[0].nodeValue,'Where to watch');
});
test('new dynamic account/control text is translated and option values remain stable',()=>{
 const option={value:'Subscription',hasAttribute:()=>false,setAttribute(name,value){this[name]=value;}};
 const attrs={placeholder:'Search movies, TV shows, or actors…'};
 const el={closest:()=>false,getAttribute:key=>attrs[key]??null,setAttribute:(key,value)=>{attrs[key]=value;}};
 const env=setup({languages:['de-DE'],texts:[{text:'Sign in'}],options:[option],attributes:[el]});env.api.translateDOM();
 assert.equal(env.nodes[0].nodeValue,'Anmelden');assert.equal(option.value,'Subscription');assert.equal(attrs.placeholder,'Filme, Serien oder Schauspieler suchen…');
 env.nodes[0].nodeValue='Create account';env.api.translateDOM();assert.equal(env.nodes[0].nodeValue,'Konto erstellen');
 env.api.setLanguage('en');assert.equal(env.nodes[0].nodeValue,'Create account');assert.equal(attrs.placeholder,'Search movies, TV shows, or actors…');
});
test('plain-text API supports safe dynamic labels and retains unsupported text and USD numbers',()=>{
 const {api}=setup({languages:['de-DE']});
 assert.equal(api.t('🔔 Alerts (4)'),'🔔 Hinweise (4)');assert.equal(api.t('Details for Free'),'Details zu Free');
 assert.equal(api.t('Sign in to Netflix (opens new tab)'),'Bei Netflix anmelden (öffnet neuen Tab)');
 assert.equal(api.t('$2.99'),'$2.99');assert.equal(api.t('<img src=x>'),'<img src=x>');assert.equal(api.t('Unknown content'),'Unknown content');
});
test('language picker is mounted only in footer with a simple visible label',()=>{
 const children=[],listeners={};
 function el(tag){return {tag,style:{},children:[],append(x){this.children.push(x);},setAttribute(k,v){this[k]=v;}};}
 const footer={append:node=>children.push(node)};
 const document={readyState:'loading',body:{},documentElement:{},addEventListener:(name,fn)=>listeners[name]=fn,getElementById:()=>null,querySelector:selector=>selector==='footer'?footer:null,createElement:el,createTextNode:nodeValue=>({nodeValue}),querySelectorAll:()=>[],createTreeWalker:()=>({nextNode:()=>null})};
 const events=[],writes=[];
 const context={document,window:{dispatchEvent:e=>events.push(e)},navigator:{languages:['en-US']},Intl,localStorage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},queueMicrotask};
 vm.runInNewContext(source,context);listeners.DOMContentLoaded();
 assert.equal(children.length,1);const wrap=children[0],select=wrap.children[1];
 assert.equal(wrap.tag,'label');assert.equal(wrap.children[0].nodeValue,'Language');assert.equal(select.id,'suLanguage');assert.match(select['aria-label'],/Interface language/);assert.match(select.style.cssText,/min-height:44px/);
 select.value='de';select.onchange();assert.equal(context.window.StreamUnifyI18n.locale,'de-DE');assert.equal(events[0].type,'su-languagechange');assert.deepEqual(writes,[['su_ui_locale','de']]);
});
