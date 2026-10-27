/* Account-based in-app availability alerts. No email or push is implied. */
(()=>{
 const dialog=document.createElement('dialog');dialog.className='su-alert-dialog';dialog.setAttribute('aria-labelledby','suAlertsTitle');
 dialog.innerHTML='<button type="button" class="close" aria-label="Close alerts">×</button><h2 id="suAlertsTitle">Availability alerts</h2><p class="muted">Alerts appear here when a tracked title gains subscription or free availability on your selected services. We check periodically; catalog coverage and availability may change.</p><div id="suAlertsContent" aria-live="polite"></div>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
 const header=document.createElement('button');header.type='button';header.className='su-action';header.id='suAlertsButton';header.textContent='🔔 Alerts';document.querySelector('.su-header nav').append(header);
 let tracking=new Map(),notifications=[],prefsKey='',timer,loading=false,serial=0;
 const currentPrefs=()=>({country,services:[...selected].filter(id=>SERVICES.some(s=>s.id===id&&isAvailable(s))).sort()});
 const names=ids=>(ids||[]).map(id=>SERVICES.find(s=>s.id===id)?.name||id).join(', ');
 function paint(){
  const unread=notifications.filter(n=>!n.read_at).length;header.textContent='🔔 Alerts'+(unread?' ('+unread+')':'');
  document.querySelectorAll('[data-notify]').forEach(b=>{const active=tracking.has(String(b.dataset.notify));b.textContent=active?'✓ Notifying':'🔔 Notify me';b.setAttribute('aria-pressed',String(active));b.title=active?'Turn off availability alerts for this title':'Get an in-app alert for your selected services';});
  const content=dialog.querySelector('#suAlertsContent');
  content.innerHTML='<h3>New availability</h3>'+(notifications.length?notifications.map(n=>'<article class="su-alert-item"><strong>'+esc(n.snapshot.name)+'</strong><p>Now available on '+esc(names(n.service_ids))+' · '+esc(n.country)+'</p><p class="muted">'+esc(new Date(n.created_at).toLocaleDateString())+'</p><button type="button" data-alert-watch="'+esc(n.title_id)+'">Watch options</button>'+(n.read_at?'':'<button type="button" data-alert-read="'+esc(n.id)+'">Mark read</button>')+'</article>').join(''):'<p class="muted">No new availability yet.</p>')+'<h3>Tracking '+tracking.size+' titles</h3>'+(tracking.size?[...tracking].map(([id,a])=>'<article class="su-alert-item"><strong>'+esc(a.snapshot.name)+'</strong><button type="button" data-alert-remove="'+esc(id)+'">Stop notifying</button></article>').join(''):'<p class="muted">Choose Notify me beside a title’s heart to start.</p>');
  content.querySelectorAll('[data-alert-read]').forEach(b=>b.onclick=async()=>{try{await member().api('/api/availability-alerts/read',{method:'POST',body:JSON.stringify({id:b.dataset.alertRead})});await refresh();}catch(e){showWatchlistMessage(e.message);}});
  content.querySelectorAll('[data-alert-remove]').forEach(b=>b.onclick=()=>toggle(b.dataset.alertRemove));
  content.querySelectorAll('[data-alert-watch]').forEach(b=>b.onclick=()=>{const a=tracking.get(String(b.dataset.alertWatch));if(!a)return;if(activeRating&&findTitle(b.dataset.alertWatch)?.contentRating!==activeRating){showWatchlistMessage('Clear your content-rating filter to explore this alert.');return;}orderTitles.set(String(b.dataset.alertWatch),{...a.snapshot,sourceId:(Number(b.dataset.alertWatch)-(a.snapshot.type==='series'?1:0))/10});dialog.close();openOptions(b.dataset.alertWatch);});
 }
 async function refresh(){
  if(!member()?.enabled||!member().status||loading)return;loading=true;const run=serial;
  try{const data=await member().api('/api/availability-alerts');if(run!==serial)return;tracking=new Map(data.alerts.map(a=>[String(a.title_id),a]));notifications=data.notifications;if(data.preferences)prefsKey=JSON.stringify({country:data.preferences.country,services:[...data.preferences.service_ids].sort()});paint();}
  catch(e){if(dialog.open)dialog.querySelector('#suAlertsContent').textContent=e.message;}
  finally{loading=false;if(run!==serial)refresh();}
 }
 async function preferencesChanged(){
  clearTimeout(timer);if(!member()?.enabled||!member().status||!tracking.size)return;
  const prefs=currentPrefs(),key=JSON.stringify(prefs);if(key===prefsKey)return;
  timer=setTimeout(async()=>{try{await member().api('/api/availability-alerts/preferences',{method:'POST',body:JSON.stringify(prefs)});prefsKey=key;await refresh();}catch(e){showWatchlistMessage(e.message);}},600);
 }
 const pending=new Set();
 async function toggle(id){
  id=String(id);if(pending.has(id))return;
  if(!member()?.enabled||!member().status){member()?.show();showWatchlistMessage('Sign in to save availability alerts.');return;}
  pending.add(id);
  try{
   if(tracking.has(id)){await member().api('/api/availability-alerts?id='+encodeURIComponent(id),{method:'DELETE'});tracking.delete(id);showWatchlistMessage('Availability alert removed');}
   else{const title=findTitle(id);if(!title)return;const prefs=currentPrefs();if(!prefs.services.length){showWatchlistMessage('Select at least one streaming service first.');return;}const data=await member().api('/api/availability-alerts',{method:'POST',body:JSON.stringify({...prefs,title})});tracking.set(id,{title_id:id,snapshot:title});prefsKey=JSON.stringify(prefs);showWatchlistMessage(data.availableNow.length?'Already on '+names(data.availableNow)+'. We’ll alert you about new selected services.':'Notify me saved. Watch for updates in Alerts.');}
   paint();await refresh();
  }catch(e){showWatchlistMessage(e.message||'Could not save alert. Please try again.');}
  finally{pending.delete(id);}
 }
 header.onclick=async()=>{if(!member()?.status){member()?.show();return;}paint();dialog.showModal();await refresh();};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-notify]');if(b)toggle(b.dataset.notify);});
 window.StreamUnifyAlerts={preferencesChanged,refresh,paint};
 window.addEventListener('membershipchange',async()=>{serial++;clearTimeout(timer);tracking.clear();notifications=[];prefsKey='';paint();await refresh();preferencesChanged();});
 window.membershipReady.then(async()=>{await refresh();preferencesChanged();});
 setInterval(()=>{if(document.visibilityState==='visible')refresh();},120000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh();});
})();
