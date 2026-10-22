import {createHash} from 'node:crypto';

export const safeUrl = value => {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
};

// Bounded caches, in-flight deduplication, and provider-wide cooldowns keep
// repeated searches from multiplying API calls or retrying exhausted quotas.
export function createCatalog({env = process.env, fetcher = fetch, now = Date.now} = {}) {
  const cache = new Map(), pending = new Map(), cooldown = new Map();
  const configured = {
    tmdb: !!(env.TMDB_READ_ACCESS_TOKEN || env.TMDB_API_KEY),
    watchmode: !!env.WATCHMODE_API_KEY,
    twitch: !!(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
    podcasts: !!(env.PODCAST_INDEX_KEY && env.PODCAST_INDEX_SECRET),
    youtube: !!env.YOUTUBE_API_KEY,
  };
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
  async function films(q, country, status) {
    const data = await tmdb(q ? 'search/multi' : 'trending/all/week', q ? {query:q, include_adult:'false', language:'en-US'} : {language:'en-US'});
    return Promise.all((data.results || []).filter(x => x.id && ['movie','tv'].includes(x.media_type)).slice(0,18).map(async x => {
      const series = x.media_type === 'tv';
      let providers = [], watchUrl = '';
      try {
        const w = (await tmdb(`${x.media_type}/${x.id}/watch/providers`)).results?.[country];
        watchUrl = safeUrl(w?.link);
        for (const [field,type] of [['flatrate','Subscription'],['free','free'],['ads','Ad-supported'],['rent','Rent'],['buy','Buy']]) {
          for (const p of w?.[field] || []) providers.push({id:p.provider_id, name:p.provider_name, type, source:'tmdb'});
        }
      } catch { status.tmdbAvailability = 'unavailable'; }
      return {id:x.id * 10 + (series ? 1 : 0), source:'tmdb', sourceId:x.id, name:x.title || x.name, type:series?'series':'movie', year:(x.release_date || x.first_air_date || '').slice(0,4), desc:x.overview || '', poster:x.poster_path?'https://image.tmdb.org/t/p/w500'+x.poster_path:null, providers, watchUrl};
    }));
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
    async search(q, country) {
      const status = Object.fromEntries(Object.entries(configured).map(([k,v])=>[k,v?'idle':'not_configured']));
      const tasks = {tmdb:()=>films(q,country,status)};
      if (q) Object.assign(tasks, {youtube:()=>youtube(q,country), twitch:()=>twitch(q), podcasts:()=>podcasts(q)});
      const results = (await Promise.all(Object.entries(tasks).map(async ([name,run])=>{
        if (!configured[name]) return [];
        try { const items = await run(); status[name]='ok'; return items; }
        catch (e) { status[name]=e.message === 'rate_limited'?'rate_limited':'unavailable'; return []; }
      }))).flat();
      if (configured.watchmode && results.some(x=>x.source==='tmdb')) {
        try { await enrich(results.filter(x=>x.source==='tmdb'),country); status.watchmode='ok'; }
        catch (e) { status.watchmode=e.message === 'rate_limited'?'rate_limited':'unavailable'; }
      }
      return {results,country,sources:status};
    },
  };
}
