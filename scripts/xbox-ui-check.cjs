const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert');
const root=process.cwd()+'/xbox/StreamUnify.Xbox/Web';
fs.mkdirSync('xbox-ui-output',{recursive:true});
const mime={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg'};
const server=http.createServer((req,res)=>{const file=path.join(root,new URL(req.url,'http://local').pathname);fs.readFile(file,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':mime[path.extname(file)]||'text/plain'});res.end(err?'Not found':data)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});const errors=[],requests=[];page.setDefaultTimeout(10000);page.setDefaultNavigationTimeout(10000);
await page.addInitScript(()=>{window.xboxKeyboardMessages=[];window.chrome??={};window.chrome.webview={postMessage:message=>window.xboxKeyboardMessages.push(JSON.parse(message))};});
page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR',e.message)});
let watchlist=[],alerts=[],searchFailure=false;
const movie={id:1801,source:'tmdb',sourceId:180,type:'movie',name:'Rambo',year:'2008',desc:'A test movie for Xbox navigation.',contentRating:'R',genres:['Action','Horror'],providers:[{name:'Netflix',type:'Subscription',url:'https://netflix.com/title/test'}],poster:''};
await page.route('https://hello-world-1-qz8g.onrender.com/**',route=>{const url=new URL(route.request().url());requests.push(url.pathname+url.search);let data={};
if(url.pathname==='/api/account/config')data={enabled:true,supabaseUrl:'https://xbox-preview.supabase.co',publishableKey:'preview-test-key',billingEnabled:true,stores:{google:true,apple:true}};
else if(url.pathname==='/api/account')data={plan:'premium',remaining:null};
else if(url.pathname==='/api/watchlist'){const method=route.request().method();if(method==='POST')watchlist=[{snapshot:JSON.parse(route.request().postData())}];if(method==='DELETE')watchlist=[];data={items:watchlist};}
else if(url.pathname==='/api/account/recent-searches')data={queries:['Rambo']};
else if(url.pathname==='/api/availability-alerts'){const method=route.request().method();if(method==='POST')alerts=[{title_id:String(movie.id),snapshot:movie}];if(method==='DELETE')alerts=[];data={alerts,notifications:[],availableNow:[]};}
else if(url.pathname==='/api/genres')data={genres:[{id:28,name:'Action'},{id:27,name:'Horror'}]};
else if(['/api/trending','/api/search'].includes(url.pathname))data={results:[movie,...Array.from({length:23},(_,i)=>({...movie,id:1811+i,sourceId:181+i,name:'Title '+(i+2),desc:'A long description. '.repeat((i%5+1)*15)}))],sources:{tmdb:'ok'},searchMatch:url.searchParams.get('q')==='rambi'?{title:'Rambo'}:undefined};
else if(url.pathname==='/api/pick-together')data={results:[{...movie,matchedProviders:movie.providers,matchExplanation:'Matches both selected genres.'}],sources:{tmdb:'ok'},country:'US'};
else if(url.pathname==='/api/details')data={...movie,title:movie};
else if(url.pathname==='/api/movie-order')data={name:'Rambo collection',country:'US',note:'Preview order',release:[movie,{...movie,id:1821,name:'Sequel'}],chronological:[movie,{...movie,id:1821,name:'Sequel'}]};
else if(url.pathname==='/api/provider-addons')data={country:url.searchParams.get('country'),services:[],sources:{tmdb:'ok'}};
if(url.pathname==='/api/search'&&searchFailure)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Preview catalog unavailable'})});
if(url.pathname==='/api/search'&&url.searchParams.get('q')==='Tom Hanks'){data.actor={id:31,name:'Tom Hanks',total:48,page:Number(url.searchParams.get('page')||1),pages:2};data.actors=[{id:31,name:'Tom Hanks'}];}
if(url.pathname==='/api/search'&&url.searchParams.get('q')==='No matching title')data.results=[];
return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
});
await page.route('https://xbox-preview.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:'11111111-1111-4111-8111-111111111111',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000),role:'authenticated'})).toString('base64url')+'.test',refresh_token:'preview-refresh-token',token_type:'bearer',expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'xbox-preview@example.com',email_confirmed_at:new Date().toISOString(),app_metadata:{provider:'email'},user_metadata:{}}})}));
await page.goto('http://127.0.0.1:'+server.address().port+'/index.html',{waitUntil:'domcontentloaded'});console.log('Page loaded');
await page.waitForFunction(()=>typeof window.streamUnifyCommand==='function');await page.getByText('Xbox preview 0.2.2.0').waitFor();console.log('Controls loaded');
await page.getByRole('button',{name:'Details for Rambo',exact:true}).waitFor();console.log('Catalog loaded');
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
await page.screenshot({path:'xbox-ui-output/streamunify-xbox-home.png',fullPage:false});
// Exercise controller traversal across a catalog taller than ten TV screens.
for(const viewport of [{width:1920,height:1080},{width:1280,height:720}]){
 await page.setViewportSize(viewport);
 await page.locator('#results .card .art').first().focus();
 const seen=new Set();
 for(let i=0;i<100;i++){
  await page.evaluate(()=>window.streamUnifyCommand('down'));
  const state=await page.evaluate(()=>({index:[...document.querySelectorAll('#results .card')].indexOf(document.activeElement.closest('.card')),hidden:!!document.activeElement.closest('[aria-hidden="true"]')}));
  assert(!state.hidden,'Never enter the closed navigation drawer');seen.add(state.index);
 }
 assert([...seen].some(i=>i>=21),'Down reaches the final catalog row');
 for(let i=0;i<100;i++)await page.evaluate(()=>window.streamUnifyCommand('up'));
 assert((await page.evaluate(()=>scrollY))<400,'Up returns to the header');
 await page.locator('#results .card .art').first().focus();
 const before=await page.evaluate(()=>scrollY);
 await page.evaluate(()=>window.streamUnifyCommand('scrolldown'));
 assert((await page.evaluate(()=>scrollY))>before,'Right-stick scrolling moves beyond the selected movie');
}
await page.setViewportSize({width:1920,height:1080});
// Exercise the actual on-screen key buttons and controller commands, not a
// fabricated successful Windows keyboard callback.
const keyboard=page.getByRole('dialog',{name:'Search titles or actors',exact:true});
const command=key=>page.evaluate(key=>window.streamUnifyCommand(key),key);
const pressKey=async name=>{await keyboard.getByRole('button',{name,exact:true}).focus();await command('select');};
const draft=()=>keyboard.getByRole('textbox',{name:'Title or actor'}).getAttribute('aria-valuetext');
const openKeyboard=async()=>{await page.locator('#search').focus();await command('select');await keyboard.waitFor();};
const searchText=async query=>{await openKeyboard();await pressKey('Clear');if(query){await page.keyboard.type(query);await page.keyboard.press('Enter');}else await pressKey('Search');await keyboard.waitFor({state:'hidden'});};
const initialSearches=requests.filter(u=>u.startsWith('/api/search?')).length;
for(const viewport of [{width:1920,height:1080},{width:1280,height:720}]){
 await page.setViewportSize(viewport);await openKeyboard();await pressKey('Clear');
 await keyboard.getByRole('button',{name:'q',exact:true}).focus();await command('up');
 let expected='';
 for(let row=0;row<4;row++){
  for(let col=0;col<10;col++){
   const character=await page.evaluate(()=>document.activeElement.dataset.character);
   assert(character,'D-pad stays on a character key');expected+=character;
   await command('select');assert.equal(await draft(),expected,'Every letter/digit button inserts exactly once');
   if(col<9)await command(row%2?'left':'right');
  }
  if(row<3)await command('down');
 }
 await pressKey('Space');assert.equal(await draft(),expected+' ');
 await pressKey('Backspace');assert.equal(await draft(),expected);
 await pressKey('Clear');await pressKey('Uppercase');await pressKey('R');await pressKey('Uppercase');
 for(const letter of ['a','m','b','o'])await pressKey(letter);
 await pressKey('Space');await pressKey('2');await pressKey('Cursor left');await pressKey('x');
 assert.equal(await draft(),'Rambo x2');await pressKey('Backspace');await pressKey('Cursor right');await pressKey('Backspace');await pressKey('Backspace');assert.equal(await draft(),'Rambo');
 await pressKey('Symbols');await pressKey('&');await pressKey('Letters');await pressKey('Backspace');
 assert.equal(await draft(),'Rambo');
 const bounds=await keyboard.boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width&&bounds.y+bounds.height<=viewport.height,'Keyboard fits TV viewport');
 await page.screenshot({path:'xbox-ui-output/streamunify-xbox-keyboard-'+viewport.height+'.png'});
 await command('back');await keyboard.waitFor({state:'hidden'});assert.equal(await page.locator('#search').inputValue(),'','B cancels without changing the title');
 assert(await page.locator('#search').evaluate(el=>el===document.activeElement),'Cancel restores title field focus');
}
assert.equal(requests.filter(u=>u.startsWith('/api/search?')).length,initialSearches,'Selecting and cancelling keys never consumes a search');
assert.equal((await page.evaluate(()=>window.xboxKeyboardMessages)).length,0,'Title entry never asks Windows to display its keyboard');
await page.setViewportSize({width:1920,height:1080});
// Enter a complete title and reach Search using only the same commands sent
// by the native gamepad poller, with no fill(), injected text, or focus jumps.
await openKeyboard();
for(const [direction,count] of [['right',3],['select',1],['down',1],['left',3],['select',1],['down',1],['right',6],['select',1],['left',2],['select',1],['up',2],['right',4],['select',1]])for(let i=0;i<count;i++)await command(direction);
assert.equal(await draft(),'rambo');
for(let i=0;i<4;i++)await command('down');
assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Search','D-pad reaches the submit button');
await command('select');await keyboard.waitFor({state:'hidden'});await page.waitForFunction(()=>!document.getElementById('genreFilter').disabled);
assert.equal(await page.locator('#search').inputValue(),'rambo');
assert.equal(requests.filter(u=>u.startsWith('/api/search?')&&new URL(u,'http://test').searchParams.get('q')==='rambo').length,1,'Keyboard Search submits exactly once');
await openKeyboard();await pressKey('Clear');await pressKey('Cancel');assert.equal(await page.locator('#search').inputValue(),'rambo','Cancel preserves an existing query');
await searchText('');
await page.getByRole('button',{name:'Sign in',exact:true}).click();
await page.locator('#accountEmail').focus();await page.evaluate(()=>window.streamUnifyCommand('select'));
assert((await page.evaluate(()=>window.xboxKeyboardMessages)).some(m=>m.type==='keyboard'),'A requests native keyboard');
await page.evaluate(()=>window.streamUnifyTextResult({accepted:false,text:''}));
await page.locator('#accountEmail').fill('xbox-preview@example.com');await page.locator('#accountPassword').fill('PreviewPassword123');
await page.locator('#accountSubmit').click();await page.locator('.membership-dialog').waitFor({state:'hidden'});
await page.locator('#recentSearches:not([hidden])').waitFor();
await page.getByRole('button',{name:'Premium',exact:true}).click();
assert.equal(await page.locator('[data-plan]:visible,#accountPortal:visible,#accountRestore:visible').count(),0,'No external/mobile purchases on Xbox');
await page.evaluate(()=>window.streamUnifyCommand('back'));
// Test service selection, collapsed sections, and focus after DOM replacement.
await page.locator('#suManageServices').click();
await page.locator('[data-service="netflix"]').focus();await page.evaluate(()=>window.streamUnifyCommand('select'));
await page.waitForFunction(()=>document.activeElement?.dataset.service==='netflix');
assert.equal(await page.locator('[data-service="netflix"]').isChecked(),false);
await page.evaluate(()=>window.streamUnifyCommand('select'));
await page.locator('#serviceSearch').fill('Netflix');assert.equal(await page.locator('#services .service').count(),1);
await page.locator('#serviceSearch').fill('');
await page.locator('#countryFilter').selectOption('CA');await page.waitForFunction(()=>document.getElementById('serviceCount').textContent.includes('Canada'));
await page.locator('#countryFilter').selectOption('US');await page.waitForFunction(()=>document.getElementById('serviceCount').textContent.includes('United States'));
await page.locator('#kindFilter').selectOption('Free');assert((await page.locator('#services').innerText()).includes('Free'));
await page.locator('#kindFilter').selectOption('all');
await page.locator('#suServicePanel > summary').click();
for(const filter of ['movie','series','free','mine','all']){
 const tab=page.locator('[data-filter="'+filter+'"]');if(await tab.count()){await tab.click();assert((await tab.getAttribute('class')).includes('active'));}
}
await page.locator('#results [data-save]').first().click();await page.waitForFunction(()=>document.querySelector('#results [data-save]')?.getAttribute('aria-label')==='Remove from watchlist');
assert.equal(watchlist.length,1);await page.locator('#results [data-save]').first().click();await page.waitForFunction(()=>document.querySelector('#results [data-save]')?.getAttribute('aria-label')==='Add to watchlist');
await page.locator('#results [data-notify]').first().click();await page.waitForFunction(()=>document.querySelector('#results [data-notify]')?.getAttribute('aria-pressed')==='true');
await page.locator('#suAlertsButton').click();await page.locator('[data-alert-remove]').click();await page.waitForFunction(()=>document.querySelector('.su-alert-dialog').textContent.includes('Tracking 0 titles'));
await page.evaluate(()=>window.streamUnifyCommand('back'));
await page.locator('#results [data-order]').first().click();await page.locator('[data-mode="release"]').waitFor();await page.locator('[data-mode="release"]').click();await page.locator('[data-mode="chronological"]').click();
await page.evaluate(()=>window.streamUnifyCommand('back'));
await page.locator('#suMenuOpen').click();await page.evaluate(()=>window.streamUnifyCommand('down'));assert(await page.evaluate(()=>document.getElementById('suDrawer').contains(document.activeElement)));await page.evaluate(()=>window.streamUnifyCommand('back'));
await page.getByRole('button',{name:'Premium',exact:true}).click();await page.locator('#accountDelete').click();await page.getByRole('dialog',{name:'Confirm account deletion'}).waitFor();await page.evaluate(()=>window.streamUnifyCommand('back'));assert(!requests.includes('/api/account/delete'),'Cancel never deletes an account');await page.evaluate(()=>window.streamUnifyCommand('back'));
for(const query of ['Rambo','RAMBO','Tom Hanks','Tom Hanks, Meg Ryan','No matching title']){
 await searchText(query);
 await page.waitForFunction(()=>!document.getElementById('genreFilter').disabled);
 assert(requests.some(u=>u.includes('/api/search?')&&new URL(u,'http://test').searchParams.get('q')===query),'Explicit search submits '+query);
 if(query==='Tom Hanks'){await page.locator('#loadActorMovies').click();await page.waitForFunction(()=>document.getElementById('loadActorMovies').hidden);assert(requests.some(u=>u.includes('page=2')));}
 if(query==='No matching title')await page.locator('#results .empty').waitFor();
}
searchFailure=true;await searchText('Failure test');await page.locator('#count').filter({hasText:'Search unavailable'}).waitFor();searchFailure=false;
await searchText('rambi');
await page.locator('#searchSuggestion').filter({hasText:'Rambo'}).waitFor();
await page.locator('#genreFilter').focus();await page.evaluate(()=>window.streamUnifyCommand('select'));
await page.locator('.xbox-select[open]').waitFor();
await page.locator('.xbox-select').getByRole('button',{name:'Horror (movies)',exact:true}).click();
await page.waitForFunction(()=>document.getElementById('genreFilter').value==='horror');
await page.waitForTimeout(200);
assert(requests.some(u=>u.includes('/api/search?')&&u.includes('genre=')));
await page.locator('#ratingFilter').selectOption('R');
await page.locator('#suWebPickTogether').click();
const picker=page.locator('su-web-pick-together');await picker.getByRole('heading',{name:'Pick a Movie. Together.',exact:true}).waitFor();
await page.evaluate(()=>window.streamUnifyCommand('down'));
assert(await page.evaluate(()=>document.getElementById('suWebTogether').shadowRoot.activeElement?.tagName==='BUTTON'),'Controller enters shadow UI');
await page.screenshot({path:'xbox-ui-output/streamunify-xbox-pick-together.png',fullPage:false});
await picker.locator('#favorite0').focus();await page.evaluate(()=>window.streamUnifyCommand('select'));await page.evaluate(()=>window.streamUnifyTextResult({accepted:true,text:'Rambo'}));assert.equal(await picker.locator('#favorite0').inputValue(),'Rambo');
await picker.locator('[data-person="0"][data-genre="Action"]').click();await picker.locator('#extras').check();
await picker.getByRole('button',{name:'Find our movie',exact:true}).focus();await page.evaluate(()=>window.streamUnifyCommand('select'));
await picker.getByRole('button',{name:'Choose this movie',exact:true}).waitFor();
await picker.getByRole('button',{name:'Choose this movie',exact:true}).focus();await page.evaluate(()=>window.streamUnifyCommand('select'));
await picker.locator('dialog[open]').waitFor();await page.evaluate(()=>window.streamUnifyCommand('back'));await picker.locator('dialog').waitFor({state:'hidden'});
await page.evaluate(()=>window.streamUnifyCommand('back'));await page.locator('main:not([hidden])').waitFor();
await page.getByRole('button',{name:'Details for Rambo',exact:true}).click();
await page.locator('#modal:not(.hidden)').waitFor();
await page.evaluate(()=>window.streamUnifyCommand('down'));
await page.waitForFunction(()=>document.getElementById('modal').contains(document.activeElement));
await page.evaluate(()=>window.streamUnifyCommand('back'));await page.locator('#modal').waitFor({state:'hidden'});
await page.setViewportSize({width:1280,height:720});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'720p no horizontal overflow');
await page.screenshot({path:'xbox-ui-output/streamunify-xbox-720p.png',fullPage:false});
console.log(JSON.stringify({errors,requestCount:requests.length,pass:'Home, fuzzy search, genre/rating, controller-select, Pick Together shadow focus, details trap/back, 720p layout'}));
assert.deepEqual(errors,[]);await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1)});
