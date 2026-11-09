// Preview-only adapter. Uses recorded public catalog data, never a live account.
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={amazonprimevideo:'prime',amazonvideo:'prime',disneyplus:'disney',hbomax:'max',paramountplus:'paramount',peacockpremium:'peacock',tubitv:'tubi',appletvplus:'apple'};
const genreMatches=(title,genre)=>(title.genres||[]).some(g=>{
 const name=normalize(typeof g==='string'?g:g.name),wanted=normalize(genre);
 return name===wanted||(wanted==='scifi'&&(name.includes('sciencefiction')||name.includes('scifi')))||(wanted==='action'&&name.includes('action'))||(wanted==='adventure'&&name.includes('adventure'));
});
export function createPreviewFetch(snapshot,getUser=()=>null,fallbackFetch=fetch){
 const titles=snapshot.results||[],saved=new Map(),recent=[];
 const membership={plan:'premium',free_launch:true,access_source:'free_launch',watchlist:true,remaining:null,premium_until:null};
 const reply=(value,status=200)=>Response.json(value,{status});
 return async(input,options={})=>{
  const url=new URL(String(input),'https://preview.invalid'),path=url.pathname;
  if(!path.startsWith('/api/'))return fallbackFetch(input,options);
  if(path==='/api/account/config')return reply({enabled:true,freeLaunch:true,supabaseUrl:'https://preview.invalid',publishableKey:'preview-only',billingEnabled:false,billingManagementEnabled:false,stores:{apple:false,google:false}});
  if(path==='/api/account')return reply(membership);
  if(path==='/api/provider-addons')return reply({services:[],country:'US'});
  if(path==='/api/watchlist'){
   if(!getUser())return reply({error:'Use Preview signed-in account to try the watchlist.'},401);
   if(options.method==='POST'){const title=JSON.parse(options.body||'{}');saved.set(String(title.id),{title_id:String(title.id),snapshot:title,saved_at:new Date().toISOString()});}
   if(options.method==='DELETE')saved.delete(url.searchParams.get('id'));
   return reply({items:[...saved.values()]});
  }
  if(path==='/api/account/recent-searches'){
   if(options.method==='DELETE')recent.splice(0);
   return reply({queries:getUser()?recent:[]});
  }
  if(path==='/api/details'){
   const title=titles.find(t=>String(t.sourceId)===url.searchParams.get('id')&&t.type===url.searchParams.get('type'));
   return title?reply({title,country:'US',availability:'snapshot'}):reply({error:'This title is outside the saved preview catalog.'},404);
  }
  if(path==='/api/pick-together'){
   let preferences;try{preferences=JSON.parse(url.searchParams.get('preferences'));}catch{return reply({error:'Choose your preferences again.'},400);}
   if(!Array.isArray(preferences?.people)||preferences.people.length!==2)return reply({error:'Choose both people’s genres.'},400);
   const selected=new Set(preferences.services||[]);
   const results=titles.filter(t=>t.type==='movie'&&preferences.people.every(p=>p.genres?.some(g=>genreMatches(t,g))))
    .map(t=>({...t,matchedProviders:(t.providers||[]).filter(p=>selected.has(p.serviceId||aliases[normalize(p.name)]||normalize(p.name)))}))
    .filter(t=>t.matchedProviders.length).slice(0,12);
   return reply({results,country:'US',availability:'snapshot',sources:{tmdb:'ok'},membership,notices:[],preview:true});
  }
  if(path==='/api/search'||path==='/api/trending'){
   const query=url.searchParams.get('q')?.trim()||'',q=normalize(query),genre=url.searchParams.get('genre');
   const results=titles.filter(t=>(!q||normalize([t.name,t.year,t.desc,...(t.cast||[]).map(c=>c.name)].join(' ')).includes(q))&&(!genre||genreMatches(t,genre)));
   if(query&&getUser()){const prior=recent.findIndex(x=>normalize(x)===q);if(prior>=0)recent.splice(prior,1);recent.unshift(query);recent.splice(10);}
   return reply({results,country:'US',availability:'snapshot',sources:{tmdb:'ok'},membership});
  }
  if(path.startsWith('/api/billing')||path.startsWith('/api/stores'))return reply({error:'No purchases or billing actions occur in this preview.'},409);
  return reply({results:[],alerts:[],notifications:[],preview:true});
 };
}
