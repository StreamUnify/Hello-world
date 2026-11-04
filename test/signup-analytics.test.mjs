import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

test('signup analytics requires consent and never sends supplied personal fields',()=>{
 const listeners={},scripts=[];
 let preference='denied';
 const window={STREAMUNIFY_ANALYTICS:{measurementId:'G-9FW1KRWQT7'},addEventListener:(name,fn)=>listeners[name]=fn};
 const document={readyState:'loading',addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>({addEventListener(){}}),head:{append:el=>scripts.push(el)},querySelector:()=>({append(){}})};
 const context={window,document,localStorage:{getItem:()=>preference},navigator:{},location:{origin:'https://www.streamunify.com',pathname:'/',hash:'#access_token=secret',search:'?email=private@example.com'}};
 vm.runInNewContext(readFileSync(new URL('../website-analytics.js',import.meta.url),'utf8'),context);
 const emit=stage=>listeners['su-signup-stage']({detail:{stage,email:'private@example.com',error:'secret'}});
 emit('completed');assert.equal(window.dataLayer,undefined);
 preference='granted';listeners.DOMContentLoaded();
 emit('email_request_accepted');emit('completed');emit('unknown');
 const events=window.dataLayer.filter(args=>args[0]==='event');
 assert.deepEqual(Array.from(events,args=>args[1]),['signup_email_request_accepted','sign_up']);
 assert.equal(JSON.stringify(events).includes('private@example.com'),false);
 assert.equal(JSON.stringify(events).includes('secret'),false);
 preference='denied';emit('completed');assert.equal(window.dataLayer.filter(args=>args[0]==='event').length,2);
});
