import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker} from 'node:worker_threads';

export const titleWords=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const compactTitle=value=>titleWords(value).replace(/ /g,'');
export function titleScore(query,title) {
 const a=compactTitle(query),b=compactTitle(title);
 if(!a||!b)return 0;if(a===b)return 1;
 if(a.length>=4&&b.startsWith(a))return .94;
 // Match incomplete words within longer titles as well as complete names.
 const words=titleWords(title).split(' ');
 const candidates=[b];
 for(let start=0;start<words.length;start++)for(let end=start+1;end<=words.length;end++) {
  const part=words.slice(start,end).join('');
  if(Math.abs(part.length-a.length)<=Math.max(2,Math.floor(a.length*.25)))candidates.push(part);
 }
 let best=0;
 for(const target of candidates) {
  if(Math.abs(a.length-target.length)>Math.max(2,a.length*.3))continue;
  let previous, row=Array.from({length:target.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++) {
   const next=[i];
   for(let j=1;j<=target.length;j++) {
    next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+(a[i-1]===target[j-1]?0:1));
    if(i>1&&j>1&&a[i-1]===target[j-2]&&a[i-2]===target[j-1])next[j]=Math.min(next[j],previous[j-2]+1);
   }
   previous=row;row=next;
  }
  best=Math.max(best,1-row[target.length]/Math.max(a.length,target.length));
 }
 return best;
}
export const titleThreshold=q=>compactTitle(q).length<=5?.75:.8;
export function rankTitles(query,titles,limit=3) {
 const key=compactTitle(query);if(key.length<4||key.length>120)return [];
 // Cheap character overlap keeps edit-distance comparisons bounded.
 const grams=new Set(Array.from({length:key.length-1},(_,i)=>key.slice(i,i+2)));
 const shortlist=[];
 for(const entry of titles) {
  const name=typeof entry==='string'?entry:entry.name, compact=compactTitle(name);
  let overlap=0;for(const gram of grams)if(compact.includes(gram))overlap++;
  if(overlap/grams.size>=.35)shortlist.push({name,overlap:overlap/grams.size,popularity:entry.popularity||0});
 }
 return shortlist.sort((a,b)=>b.overlap-a.overlap||b.popularity-a.popularity).slice(0,250)
  .map(x=>({...x,score:titleScore(query,x.name)})).filter(x=>x.score>=titleThreshold(query))
  .sort((a,b)=>b.score-a.score||b.popularity-a.popularity).slice(0,limit).map(x=>x.name);
}
const snapshot=JSON.parse(readFileSync(new URL('./search-title-index.json',import.meta.url),'utf8')).titles;
export function createTitleIndex({directory=join(tmpdir(),'streamunify-title-index')}={}) {
 let database,worker,lastAttempt=0;
 function warm() {
  if(worker||Date.now()-lastAttempt<3600000)return;
  lastAttempt=Date.now();
  worker=new Worker(new URL('./title-index-worker.mjs',import.meta.url),{workerData:{directory}});
  worker.unref();
  worker.on('message',async message=>{
   if(!message.path)return;
   try {const {DatabaseSync}=await import('node:sqlite');const next=new DatabaseSync(message.path,{readOnly:true});next.exec('PRAGMA cache_size=-8000;');database?.close();database=next;}
   catch { /* Popular-title snapshot remains available if refresh fails. */ }
  });
  worker.on('error',()=>{});worker.on('exit',()=>{worker=undefined;});
 }
 return {warm,find(query){
  warm();const key=compactTitle(query);if(key.length<4||key.length>120)return [];
  let extra=[];
  if(database)try {
   const grams=[...new Set(Array.from({length:key.length-2},(_,i)=>key.slice(i,i+3)))];
   const match=grams.filter(x=>/^[a-z0-9]{3}$/.test(x)).map(x=>'"'+x+'"').join(' OR ');
   if(match)extra=database.prepare('SELECT name,popularity FROM titles WHERE titles MATCH ? ORDER BY rank LIMIT 250').all(match);
  }catch {}
  return rankTitles(query,[...extra,...snapshot]);
 }};
}
