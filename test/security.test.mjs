import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createHash} from 'node:crypto';import {createSecurity} from '../security.mjs';
test('HTML headers enforce a script hash policy and frame protection; hostile origins and bursts are rejected',async()=>{
 const html='<script>window.example=true;</script>';
 let now=0;const secure=createSecurity({now:()=>now,trustProxy:false,trustedHtml:html});
 const server=http.createServer((req,res)=>{if(!secure(req,res))return;res.writeHead(200,{'Content-Type':'text/html'});res.end(html);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const url='http://127.0.0.1:'+server.address().port;
 const response=await fetch(url);assert.equal(response.status,200);assert.equal(await response.text(),html);assert.equal(response.headers.get('x-frame-options'),'DENY');assert.match(response.headers.get('strict-transport-security'),/31536000/);assert.ok(response.headers.get('content-security-policy').includes(createHash('sha256').update('window.example=true;').digest('base64')));assert.ok(!response.headers.get('content-security-policy').split('style-src')[0].includes('unsafe-inline'));
 assert.equal((await fetch(url+'/api/search',{headers:{Origin:'https://evil.example'}})).status,403);
 const native=await fetch(url+'/api/search',{headers:{Origin:'capacitor://localhost'}});assert.equal(native.headers.get('access-control-allow-origin'),'capacitor://localhost');
 for(let i=0;i<59;i++)assert.equal((await fetch(url+'/api/search')).status,200);
 const blocked=await fetch(url+'/api/search');assert.equal(blocked.status,429);assert.equal(blocked.headers.get('retry-after'),'60');now=60001;assert.equal((await fetch(url+'/api/search')).status,200);
 }finally{await new Promise(r=>server.close(r));}
});
