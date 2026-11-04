// Fictional provider associations for an isolated beta concept. Never availability data.
export const genres=['Comedy','Mystery','Adventure','Romance','Sci-fi','Drama','Action','Animation'];
export const moods=['Fun','Cozy','Surprising','Intense'];
export const services=['Netflix','Prime Video','Disney+','Hulu','HBO Max','Apple TV'];
export const catalog=[
 ['Game Night',2018,100,'Comedy/Mystery/Action','Fun/Surprising','Prime Video','included'],
 ['Knives Out',2019,130,'Mystery/Comedy/Drama','Surprising/Fun','Netflix','included'],
 ['Palm Springs',2020,90,'Comedy/Romance/Sci-fi','Fun/Surprising','Hulu','included'],
 ['Paddington 2',2017,103,'Comedy/Adventure/Animation','Cozy/Fun','Disney+','included'],
 ['The Grand Budapest Hotel',2014,99,'Comedy/Adventure/Drama','Surprising/Cozy','HBO Max','included'],
 ['The Martian',2015,144,'Sci-fi/Adventure/Drama','Intense/Surprising','Apple TV','included'],
 ['The Princess Bride',1987,98,'Adventure/Romance/Comedy','Cozy/Fun','Disney+','included'],
 ['Spider-Man: Into the Spider-Verse',2018,117,'Animation/Action/Adventure/Sci-fi','Fun/Intense','Netflix','included'],
 ['About Time',2013,123,'Romance/Drama/Sci-fi/Comedy','Cozy/Surprising','Prime Video','rental'],
 ['Dungeons & Dragons: Honor Among Thieves',2023,134,'Adventure/Comedy/Action','Fun/Surprising','Prime Video','addon'],
 ['Arrival',2016,116,'Sci-fi/Drama/Mystery','Surprising/Intense','Hulu','rental'],
 ['Chef',2014,114,'Comedy/Drama/Adventure','Cozy/Fun','Netflix','included']
].map(([title,year,runtime,g,m,service,cost])=>({title,year,runtime,genres:g.split('/'),moods:m.split('/'),service,cost}));
export const initialSettings=()=>({people:[{genres:['Comedy','Mystery'],mood:'Fun',favorite:''},{genres:['Comedy','Adventure'],mood:'Surprising',favorite:''}],services:['Netflix','Prime Video','Hulu'],extras:false,runtime:150});
export const favoriteMatch=value=>catalog.find(t=>t.title.toLowerCase()===value.trim().toLowerCase());
export function rankPicks(settings){
 const score=(t,p)=>3*t.genres.filter(g=>p.genres.includes(g)).length+(t.moods.includes(p.mood)?2:0)+t.genres.filter(g=>favoriteMatch(p.favorite)?.genres.includes(g)).length;
 return catalog.filter(t=>t.runtime<=settings.runtime&&settings.services.includes(t.service)&&(t.cost==='included'||settings.extras)).map(t=>{const scores=settings.people.map(p=>score(t,p));return {...t,score:2*Math.min(...scores)+scores[0]+scores[1]};}).sort((a,b)=>b.score-a.score||a.runtime-b.runtime).slice(0,3);
}
export function explainMatch(t,settings){
 const matches=settings.people.map(p=>t.genres.filter(g=>p.genres.includes(g)));
 const shared=matches[0].filter(g=>matches[1].includes(g));
 if(shared.length)return 'A shared taste for '+shared.join(' and ')+', with '+t.moods.join(' / ').toLowerCase()+' energy.';
 if(matches.every(m=>m.length))return 'Bridges your '+matches[0].join(' / ')+' picks and their '+matches[1].join(' / ')+' picks.';
 return 'An exploratory example within your service and runtime settings; genre overlap is limited.';
}
