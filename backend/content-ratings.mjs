// US classifications are deliberately separate from streaming country.
// A selected value is an exact filter, not a parental-control lock.
export const CONTENT_RATINGS=Object.freeze(['G','PG','PG-13','R','NC-17','TV-Y','TV-Y7','TV-G','TV-PG','TV-14','TV-MA','NR']);
export function normalizeContentRating(value){
 const text=String(value||'').trim().toUpperCase().replace(/\s+/g,'');
 const alias={'PG13':'PG-13','NC17':'NC-17','TVY':'TV-Y','TVY7':'TV-Y7','TVG':'TV-G','TVPG':'TV-PG','TV14':'TV-14','TVMA':'TV-MA','UNRATED':'NR','NOTRATED':'NR'};
 const rating=alias[text]||text;return CONTENT_RATINGS.includes(rating)?rating:'';
}
export function usContentRating(type,data){
 if(type==='series')return normalizeContentRating((data.results||[]).find(x=>x.iso_3166_1==='US')?.rating)||'NR';
 const releases=(data.results||[]).find(x=>x.iso_3166_1==='US')?.release_dates||[];
 const priority=[3,4,2,1,5,6];
 const rated=releases.filter(x=>normalizeContentRating(x.certification)).sort((a,b)=>priority.indexOf(a.type)-priority.indexOf(b.type));
 return normalizeContentRating(rated[0]?.certification)||'NR';
}
