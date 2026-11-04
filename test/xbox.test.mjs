import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {xboxMembership} from '../scripts/xbox-package.mjs';
import {nextTarget} from '../xbox/web/navigation.mjs';
const rect=(left,top,width=100,height=60)=>({left,top,width,height});
test('controller focus chooses aligned targets and never wraps behind the user',()=>{
 const candidates=[{element:'right',rect:rect(130,0)},{element:'below',rect:rect(0,100)},{element:'diagonal',rect:rect(120,100)}];
 assert.equal(nextTarget(rect(0,0),candidates,'right'),'right');
 assert.equal(nextTarget(rect(0,0),candidates,'down'),'below');
 assert.equal(nextTarget(rect(0,0),candidates,'left'),null);
 assert.equal(nextTarget(rect(0,0),candidates,'up'),null);
});
test('Xbox packaging rejects credential-bearing and insecure service origins',()=>{
 for(const value of ['http://example.com','https://user:secret@example.com','https://example.com/path','https://example.com/?token=secret','https://example.com/#fragment']){
   const result=spawnSync(process.execPath,['scripts/prepare-xbox.mjs'],{env:{...process.env,STREAMUNIFY_XBOX_API_BASE:value},encoding:'utf8'});
   assert.notEqual(result.status,0);
   assert.match(result.stderr,/HTTPS origin/);
 }
});
test('Xbox package contains its own interface and restricts host capabilities',async()=>{
 const prepared=spawnSync(process.execPath,['scripts/prepare-xbox.mjs'],{encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
 const shell=await read('xbox/StreamUnify.Xbox/MainPage.xaml.cs');
 assert.match(await read('xbox/StreamUnify.Xbox/App.xaml.cs'),/ApplicationRequiresPointerMode.WhenRequested/);
 assert.match(await read('xbox/StreamUnify.Xbox/MainPage.xaml'),/RequiresPointer="Never"/);
 assert.match(shell,/NavigationStarting/);assert.match(shell,/NewWindowRequested/);assert.match(shell,/CoreWebView2PermissionState.Deny/);
 const manifest=await read('xbox/StreamUnify.Xbox/Package.appxmanifest');
 assert.match(manifest,/internetClient/);assert.doesNotMatch(manifest,/broadFileSystemAccess|runFullTrust/);
 const html=await read('xbox/StreamUnify.Xbox/Web/index.html');
 assert.match(html,/membership-client.js/);assert.match(html,/suWebPickTogether/);assert.match(html,/recentSearches/);assert.match(html,/genreFilter/);assert.match(html,/ratingFilter/);assert.match(html,/xbox-controls.js/);assert.doesNotMatch(html,/website-analytics/);
 const membership=xboxMembership(await read('membership-client-src.js'));
 assert.doesNotMatch(membership,/api\/billing\/checkout|api\/billing\/portal|from '.\/native-client.mjs'/);
 assert.match(membership,/billingEnabled:false,stores:\{\}/);
 assert.match(membership,/storageKey:'streamunify-xbox-auth'/);
 assert.match(membership,/flowType:'implicit'/);
});
