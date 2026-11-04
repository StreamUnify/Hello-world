import test from 'node:test';
import assert from 'node:assert/strict';
import {accountFetch} from '../account-network.mjs';
test('stalled account requests abort and provide recovery instructions',async(t)=>{
 t.mock.timers.enable({apis:['setTimeout']});
 t.mock.method(globalThis,'fetch',async(input,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
 const result=accountFetch('https://fixture.invalid');
 const rejection=assert.rejects(result,/took too long.*inbox and spam/);
 t.mock.timers.tick(20000);await rejection;
});
test('caller cancellation is preserved',async(t)=>{
 const controller=new AbortController();controller.abort();
 t.mock.method(globalThis,'fetch',async(input,{signal})=>{signal.throwIfAborted();});
 await assert.rejects(accountFetch('https://fixture.invalid',{signal:controller.signal}),{name:'AbortError'});
});
