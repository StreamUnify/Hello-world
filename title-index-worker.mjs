// Build the complete TMDB movie/TV spelling index off the HTTP server thread.
import {workerData,parentPort} from 'node:worker_threads';
import {mkdir,stat,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {createInterface} from 'node:readline';
import {DatabaseSync} from 'node:sqlite';
const {directory}=workerData;
await mkdir(directory,{recursive:true});
const date=new Date(Date.now()-8*3600000); // Exports are published by 08:00 UTC.
const day=date.toISOString().slice(0,10),stamp=`${String(date.getUTCMonth()+1).padStart(2,'0')}_${String(date.getUTCDate()).padStart(2,'0')}_${date.getUTCFullYear()}`;
const file=join(directory,`titles-${day}.sqlite`),temp=file+'.building';
try {if((await stat(file)).size>0){parentPort.postMessage({path:file});process.exit(0);}}catch {}
await rm(temp,{force:true});
let db;
try {
 db=new DatabaseSync(temp);
 db.exec("PRAGMA journal_mode=OFF;PRAGMA synchronous=OFF;PRAGMA cache_size=-8000;CREATE VIRTUAL TABLE titles USING fts5(compact,name UNINDEXED,popularity UNINDEXED,tokenize='trigram',detail=none);");
 const insert=db.prepare('INSERT INTO titles(compact,name,popularity) VALUES(?,?,?)');
 for(const [kind,field] of [['movie','original_title'],['tv_series','original_name']]) {
  const response=await fetch(`https://files.tmdb.org/p/exports/${kind}_ids_${stamp}.json.gz`,{signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error('Title index download unavailable');
  const unzip=createGunzip(),pumping=pipeline(Readable.fromWeb(response.body),unzip);pumping.catch(()=>{});
  const lines=createInterface({input:unzip,crlfDelay:Infinity});
  db.exec('BEGIN');
  let count=0;
  for await(const line of lines) {
   const item=JSON.parse(line),name=item[field];
   if(!name||item.adult||item.video||name.length>200)continue;
   const compact=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
   if(compact.length<3)continue;
   insert.run(compact,name,Number(item.popularity)||0);
   if(++count%10000===0){db.exec('COMMIT;BEGIN');}
  }
  await pumping;db.exec('COMMIT');
 }
 db.close();db=undefined;await rename(temp,file);parentPort.postMessage({path:file});
} catch(error) {try{db?.close();}catch{}await rm(temp,{force:true});throw error;}
