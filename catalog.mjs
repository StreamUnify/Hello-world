import {titleWords,compactTitle,titleScore,titleThreshold,createTitleIndex} from './title-index.mjs';
import {storyForMovie,releaseOrder,chronologicalOrder} from './movie-order.mjs';
import {createHash} from 'node:crypto';

export const safeUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};

const seedWords='the a an and of in on to for with from at by is it its part chapter episode harry potter star wars lord rings game thrones breaking bad stranger things spider man bat super iron mission impossible fast furious jurassic park world toy story finding nemo dory hunger games fantastic beasts back future walking dead dark knight avengers captain america winter soldier black panther doctor strange guardians galaxy pirates caribbean john wick home alone inside out frozen lion king dragon house how train your'.split(' ');
function splitTitle(query,words) {
  const text=compactTitle(query);
  if(text.length<5||text.length>80)return '';
  const best=Array(text.length+1).fill(null);best[0]=[];
  for(let end=1;end<=text.length;end++)for(let start=0;start<end;start++) {
    const word=text.slice(start,end);
    if(best[start]&&(words.has(word)||/^\d+$/.test(word))) {
      const parts=[...best[start],word];
      if(!best[end]||parts.length<best[end].length)best[end]=parts;
    }
  }
  return best[text.length]?.length>1?best[text.length].join(' '):'';
}

// Bounded caches, in-flight deduplication, and provider-wide cooldowns keep
// repeated searches from multiplying API calls or retrying exhausted quotas.
export function createCatalog({env = process.env, fetcher = fetch, now = Date.now, titleIndex = fetcher===fetch?createTitleIndex():{find:()=>[]}} = {}) {
  const cache = new Map(), pending = new Map(), cooldown = new Map();
  const configured = {
    tmdb: !!(env.TMDB_READ_ACCESS_TOKEN || env.TMDB_API_KEY),
    watchmode: !!env.WATCHMODE_API_KEY,
    twitch: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
    podcasts: !!(env.PODCAST_INDEX_KEY && env.PODCAST_INDEX_SECRET),
    youtube: !!env.YOUTUBE_API_KEY,
  };
  const words=new Set(seedWords), knownTitles=new Map();
  if(configured.tmdb)titleIndex.warm?.();
  let active = 0;
  const queue = [];
  async function limited(run) {
    if (queue.length >= 60) throw Error('unavailable');
    if (active >= 6) await new Promise(resolve => queue.push(resolve));
    active++;
    try { return await run(); } finally { active--; queue.shift()?.(); }
  }
  async function request(source, key, url, options = {}, ttl = 300_000) {
    const id = source + ':' + key, hit = cache.get(id);
    if (hit?.until > now()) return hit.value;
    if (pending.has(id)) return pending.get(id);
    if ((cooldown.get(source) || 0) > now()) throw Error('rate_limited');
    const job = limited(async () => {
      if ((cooldown.get(source) || 0) > now()) throw Error('rate_limited');
      const r = await fetcher(url, {...options, signal: AbortSignal.timeout(8000)});
      if (!r.ok) {
        if (r.status === 429 || (source === 'youtube' && r.status === 403)) {
          const retry = r.headers.get('retry-after');
          const delay = Number(retry) * 1000 || Date.parse(retry) - now() || 60_000;
          cooldown.set(source, now() + Math.min(86_400_000, Math.max(60_000, delay)));
          throw Error('rate_limited');
        }
        throw Error('unavailable');
      }
      const value = await r.json();
      cache.delete(id);
      cache.set(id, {value, until: now() + (typeof ttl === 'function' ? ttl(value) : ttl)});
      while (cache.size > 500) cache.delete(cache.keys().next().value);
      return value;
    });
    pending.set(id, job);
    try { return await job; } finally { pending.delete(id); }
  }
  function endpoint(base, params) {
    const u = new URL(base);
    for (const [k,v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  }
  function tmdb(path, params = {}) {
    const u = endpoint('https://api.themoviedb.org/3/' + path, params);
    if (!env.TMDB_READ_ACCESS_TOKEN) u.searchParams.set('api_key', env.TMDB_API_KEY);
    return request('tmdb', path + JSON.stringify(params), u, {headers: env.TMDB_READ_ACCESS_TOKEN ? {Authorization: 'Bearer ' + env.TMDB_READ_ACCESS_TOKEN} : {}});
  }
  async function films(q, country, status, {personId, page=1}={}) {
    const valid = items => (items || []).filter(x=>x.id&&!x.adult&&['movie','tv'].includes(x.media_type));
    const search = async query => valid((await tmdb('search/multi',{query,include_adult:'false',language:'en-US'})).results);
    const initial=q?(await tmdb('search/multi',{query:q,include_adult:'false',language:'en-US'})).results:[];
    const people=(initial||[]).filter(x=>Number.isSafeInteger(x.id)&&x.id>0&&!x.adult&&x.media_type==='person'&&(x.known_for_department==='Acting'||!x.known_for_department));
    status.actors=people.slice(0,8).map(x=>({id:x.id,name:x.name,knownFor:(x.known_for||[]).map(t=>t.title||t.name).filter(Boolean).slice(0,3).join(', ')}));
    const exact=people.filter(x=>titleWords(x.name)===titleWords(q));
    const person=personId?people.find(x=>x.id===personId):exact.length===1?exact[0]:null;
    if(personId&&!person)throw Error('unavailable');
    if(person){
      const data=await tmdb(`person/${person.id}/combined_credits`,{language:'en-US'});
      if(!Array.isArray(data.cast))throw Error('unavailable');
      // Use acting credits, never the short "known for" list or crew credits.
      const credits=[...new Map(data.cast.filter(x=>Number.isSafeInteger(x.id)&&x.id>0&&!x.adult&&((x.media_type==='movie'&&x.title)||(x.media_type==='tv'&&x.name))).map(x=>[x.media_type+':'+x.id,x])).values()]
        .sort((a,b)=>(b.popularity||0)-(a.popularity||0)||String(b.release_date||b.first_air_date||'').localeCompare(String(a.release_date||a.first_air_date||''))||a.media_type.localeCompare(b.media_type)||a.id-b.id);
      const pages=Math.max(1,Math.ceil(credits.length/18));
      if(!Number.isSafeInteger(page)||page<1||page>pages)throw Error('unavailable');
      status.actor={id:person.id,name:person.name,total:credits.length,page,pages};
      return Promise.all(credits.slice((page-1)*18,page*18).map(async x=>({...await film(x,country,status),character:x.character||''})));
    }
    let items=q?valid(initial):valid((await tmdb('trending/all/week',{language:'en-US'})).results);
    if(q&&compactTitle(q).length>=4&&(!items.length||!items.some(x=>titleScore(q,x.title||x.name)>=.94))) {
      const normalized=titleWords(q), tokens=normalized.split(' ');
      const learned=[...knownTitles.values()].map(name=>({name,score:titleScore(q,name)})).filter(x=>x.score>=titleThreshold(q)).sort((a,b)=>b.score-a.score)[0]?.name;
      const split=splitTitle(q,words);
      const probes=[...titleIndex.find(q),learned,split, tokens.length>1?tokens[0]:normalized.slice(0,4),tokens.length>1?tokens.slice(1).join(' '):''];
      const queries=[...new Set(probes.filter(x=>x&&x.length>=3&&x!==q))].slice(0,4);
      const outcomes=await Promise.allSettled(queries.map(search));
      const original=items;
      const candidates=[...items,...outcomes.flatMap(x=>x.status==='fulfilled'?x.value:[])];
      items=[...new Map(candidates.map(x=>[x.media_type+':'+x.id,x])).values()]
        .map(item=>({item,score:Math.max(titleScore(q,item.title||item.name),titleScore(q,item.original_title||item.original_name))}))
        .filter(x=>x.score>=titleThreshold(q)).sort((a,b)=>b.score-a.score||(b.item.popularity||0)-(a.item.popularity||0)).map(x=>x.item);
      if(items.length&&(!original.length||items[0].id!==original[0].id))status.searchMatch={query:q,title:items[0].title||items[0].name};
      else if(outcomes.some(x=>x.status==='rejected'))status.tmdbFallback='unavailable';
      if(!items.length)items=original;
    }
    for(const item of items) {
      const name=item.title||item.name;
      if(!name)continue;
      knownTitles.set(item.media_type+':'+item.id,name);
      while(knownTitles.size>500)knownTitles.delete(knownTitles.keys().next().value);
      for(const word of titleWords(name).split(' '))if(words.size<3000)words.add(word);
    }
    return Promise.all(items.slice(0,18).map(x=>film(x,country,status)));
  }
  async function film(x,country,status) {
      const series = x.media_type === 'tv';
      let providers = [], watchUrl = '';
      try {
        const w = (await tmdb(`${x.media_type}/${x.id}/watch/providers`)).results?.[country];
        watchUrl = safeUrl(w?.link);
        for (const [field,type] of [['flatrate','Subscription'],['free','free'],['ads','Ad-supported'],['rent','Rent'],['buy','Buy']]) {
          for (const p of w?.[field] || []) providers.push({id:p.provider_id, name:p.provider_name, type, source:'tmdb'});
        }
      } catch { status.tmdbAvailability = 'unavailable'; }
      return {id:x.id * 10 + (series ? 1 : 0), source:'tmdb', sourceId:x.id, name:x.title || x.name, type:series?'series':'movie', year:(x.release_date || x.first_air_date || '').slice(0,4), releaseDate:x.release_date || x.first_air_date || '', desc:x.overview || '', poster:x.poster_path?'https://image.tmdb.org/t/p/w500'+x.poster_path:null, providers, watchUrl};
  }
  async function youtube(q, country) {
    const data = await request('youtube', q+country, endpoint('https://www.googleapis.com/youtube/v3/search', {key:env.YOUTUBE_API_KEY, part:'snippet', type:'video', q, regionCode:country, safeSearch:'moderate', maxResults:8}), {}, 900_000);
    return (data.items || []).filter(x=>x.id?.videoId).map(x=>({id:'youtube:'+x.id.videoId, source:'youtube', sourceId:x.id.videoId, type:'video', name:x.snippet.title, desc:x.snippet.description, year:x.snippet.publishedAt?.slice(0,4), poster:safeUrl(x.snippet.thumbnails?.medium?.url), watchUrl:'https://www.youtube.com/watch?v='+encodeURIComponent(x.id.videoId), providers:[{name:'YouTube',type:'Ad-supported'}]}));
  }
  async function twitch(q) {
    const auth = await request('twitch', 'token', 'https://id.twitch.tv/oauth2/token', {method:'POST', body:new URLSearchParams({client_id:env.TWITCH_CLIENT_ID,client_secret:env.TWITCH_CLIENT_SECRET,grant_type:'client_credentials'})}, token => Math.max(0,Number(token.expires_in)-60)*1000);
    const data = await request('twitch', q, endpoint('https://api.twitch.tv/helix/search/channels',{query:q,first:8}), {headers:{'Client-Id':env.TWITCH_CLIENT_ID,Authorization:'Bearer '+auth.access_token}}, 60_000);
    return (data.data || []).map(x=>({id:'twitch:'+x.id, source:'twitch', sourceId:x.id, type:'channel', name:x.display_name, desc:x.title || '', year:'', live:!!x.is_live, poster:safeUrl(x.thumbnail_url), watchUrl:'https://www.twitch.tv/'+encodeURIComponent(x.broadcaster_login), providers:[{name:'Twitch',type:'Ad-supported'}]}));
  }
  async function podcasts(q) {
    const date = String(Math.floor(now()/1000));
    const auth = createHash('sha1').update(env.PODCAST_INDEX_KEY + env.PODCAST_INDEX_SECRET + date).digest('hex');
    const data = await request('podcasts', q, endpoint('https://api.podcastindex.org/api/1.0/search/byterm',{q,max:8,clean:true}), {headers:{'User-Agent':'StreamUnify/0.8','X-Auth-Date':date,'X-Auth-Key':env.PODCAST_INDEX_KEY,Authorization:auth}}, 900_000);
    return (data.feeds || []).map(x=>({id:'podcast:'+x.id, source:'podcasts', sourceId:x.id, type:'podcast', name:x.title, desc:String(x.description || '').replace(/<[^>]*>/g,''), year:'', poster:safeUrl(x.artwork || x.image), watchUrl:safeUrl(x.link || x.url), providers:[{name:'Podcast Index',type:'free'}]}));
  }
  async function enrich(items, country) {
    // At most three title lookups per request; cached by TMDB ID and region.
    const outcomes = await Promise.allSettled(items.slice(0,3).map(async item => {
      const id = (item.type === 'movie' ? 'movie-' : 'tv-') + item.sourceId;
      const data = await request('watchmode', id+country, endpoint(`https://api.watchmode.com/v1/title/${id}/sources/`, {apiKey:env.WATCHMODE_API_KEY,regions:country}), {}, 3_600_000);
      for (const p of data || []) {
        // TV Everywhere requires authentication; never label it free.
        if (p.region !== country || p.type !== 'free') continue;
        const url = safeUrl(p.web_url);
        if (item.providers.some(x=>x.name===p.name && x.type==='free')) continue;
        item.providers.push({id:p.source_id,name:p.name,type:'free',url,source:'watchmode'});
      }
    }));
    const failure = outcomes.find(x=>x.status==='rejected');
    if (failure) throw failure.reason;
  }
  return {
    configured,
    async movieOrder(id,country) {
      if(!Number.isSafeInteger(id)||id<1||id>2147483647)throw Error('invalid_movie');
      if(!configured.tmdb)throw Error('unavailable');
      const status={};
      const movie=await tmdb(`movie/${id}`,{language:'en-US'});
      if(movie.adult)return {name:'',release:[],chronological:null,note:'No supported movie collection found.',sources:[],availability:'ok'};
      const story=storyForMovie(id);
      let name=story?.name,parts=[];
      if(story) {
        // Bounded curated sets; all-or-error avoids silently incomplete timelines.
        parts=await Promise.all(story.ids.map(movieId=>tmdb(`movie/${movieId}`,{language:'en-US'})));
      } else if(movie.belongs_to_collection?.id) {
        const collection=await tmdb(`collection/${movie.belongs_to_collection.id}`,{language:'en-US'});
        name=collection.name;parts=collection.parts||[];
      }
      const unique=[...new Map(parts.filter(x=>x.id&&!x.adult).map(x=>[x.id,x])).values()];
      if(unique.length>60)throw Error('unavailable');
      const items=await Promise.all(unique.map(x=>film({...x,media_type:'movie'},country,status)));
      if(configured.watchmode&&items.length) {
        try {await enrich(items,country);}catch {status.watchmode='unavailable';}
      }
      const release=releaseOrder(items);
      return {name:name||'',release,chronological:chronologicalOrder(items,story),
        note:story?.note||'Story chronology has not been curated for this collection. Release order is shown; it does not imply story order.',
        sources:story?.sources||[],availability:Object.keys(status).length?'partial':'ok'};
    },
    async search(q, country, options={}) {
      const status = Object.fromEntries(Object.entries(configured).map(([k,v])=>[k,v?'idle':'not_configured']));
      const tasks = {tmdb:()=>films(q,country,status,options)};
      if (q&&!options.personId) Object.assign(tasks, {youtube:()=>youtube(q,country), twitch:()=>twitch(q), podcasts:()=>podcasts(q)});
      let results = (await Promise.all(Object.entries(tasks).map(async ([name,run])=>{
        if (!configured[name]) return [];
        try { const items = await run(); status[name]='ok'; return items; }
        catch (e) { status[name]=e.message === 'rate_limited'?'rate_limited':'unavailable'; return []; }
      }))).flat();
      const {actor,actors,searchMatch}=status;delete status.actor;delete status.actors;delete status.searchMatch;
      if(actor)results=results.filter(x=>x.source==='tmdb');
      if (configured.watchmode && results.some(x=>x.source==='tmdb')) {
        try { await enrich(results.filter(x=>x.source==='tmdb'),country); status.watchmode='ok'; }
        catch (e) { status.watchmode=e.message === 'rate_limited'?'rate_limited':'unavailable'; }
      }
      return {results,country,sources:status,...searchMatch?{searchMatch}:{},...actors?.length?{actors}:{},...actor?{actor}:{}};
    },
  };
}
