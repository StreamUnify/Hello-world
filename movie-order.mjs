// Curated, movie-level timelines. Keep alternate continuities separate and
// do not infer story chronology from release dates or sequel numbers.
export const STORY_ORDERS = [
  {name:'Star Wars: Skywalker saga and standalone prequels',
    ids:[1893,1894,1895,348350,330459,11,1891,1892,140607,181808,181812],
    note:'The nine Skywalker saga films, plus Solo and Rogue One. Excludes animated films, TV series and other spin-offs. Ordered by the main events of each film.',
    sources:['https://www.starwars.com/news/star-wars-movies-and-series-guide']},
  {name:'Wizarding World: Harry Potter and Fantastic Beasts',
    ids:[259316,338952,338953,671,672,673,674,675,767,12444,12445],
    note:'The three Fantastic Beasts films precede the eight Harry Potter films. Ordered by the main events of each film.',
    sources:['https://www.harrypotter.com/discover/films','https://www.harrypotter.com/features/handy-guide-to-reading-harry-potter-for-first-time']},
];
const GERMAN_STORY_TEXT={
  1893:{name:'Star Wars: Skywalker-Saga und eigenständige Vorgeschichten',note:'Die neun Filme der Skywalker-Saga sowie Solo und Rogue One. Animationsfilme, Serien und weitere Ableger sind nicht enthalten. Sortiert nach den Hauptereignissen der Filme.'},
  259316:{name:'Die magische Welt: Harry Potter und Phantastische Tierwesen',note:'Die drei Filme Phantastische Tierwesen spielen vor den acht Harry-Potter-Filmen. Sortiert nach den Hauptereignissen der Filme.'}
};
export const storyForMovie = (id,language='en-US') => {
  const story=STORY_ORDERS.find(x=>x.ids.includes(Number(id)));
  return story&&language==='de-DE'?{...story,...GERMAN_STORY_TEXT[story.ids[0]]}:story;
};
export function releaseOrder(items) {
  return [...new Map(items.filter(x=>Number.isSafeInteger(x.sourceId)&&x.sourceId>0).map(x=>[x.sourceId,x])).values()]
    .sort((a,b)=>(a.releaseDate||'9999-99-99').localeCompare(b.releaseDate||'9999-99-99')||a.sourceId-b.sourceId);
}
export function chronologicalOrder(items, story) {
  if(!story)return null;
  const byId=new Map(items.map(x=>[x.sourceId,x]));
  return story.ids.filter(id=>byId.has(id)).map(id=>byId.get(id));
}
