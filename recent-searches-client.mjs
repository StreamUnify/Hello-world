// History lives on the account, never in shared device storage.
export function createRecentSearches({api,identity,runSearch,document:doc=document}){
  const panel=doc.getElementById('recentSearches');
  const list=doc.getElementById('recentSearchList');
  const note=doc.getElementById('recentSearchNote');
  const clear=doc.getElementById('clearRecentSearches');
  let generation=0,owner=null;
  function reset(){list.replaceChildren();clear.hidden=true;}
  async function reload(){
    const id=identity(),version=++generation;
    if(id!==owner){reset();owner=id;}
    panel.hidden=!id;
    if(!id)return;
    note.textContent='Loading recent searches…';
    try{
      const {queries}=await api('/api/account/recent-searches');
      if(version!==generation||id!==identity())return;
      reset();
      for(const query of queries){
        const item=doc.createElement('li'),button=doc.createElement('button');
        button.type='button';button.textContent=query;
        button.onclick=()=>runSearch(query);
        item.append(button);list.append(item);
      }
      clear.hidden=!queries.length;
      note.textContent=queries.length?'Your latest 10 searches. Selecting one uses your normal search allowance.':'Your searches will appear here. Only you can see them.';
    }catch{
      if(version!==generation||id!==identity())return;
      reset();note.textContent='Recent searches couldn’t load. Open this section to try again.';
    }
  }
  clear.onclick=async()=>{
    const id=identity(),version=++generation;
    clear.disabled=true;
    try{
      await api('/api/account/recent-searches',{method:'DELETE'});
      if(version!==generation||id!==identity())return;
      reset();note.textContent='Search history cleared.';
    }catch{if(version===generation&&id===identity())note.textContent='Couldn’t clear history. Please try again.';}
    finally{clear.disabled=false;}
  };
  panel.addEventListener('toggle',()=>{if(panel.open)reload();});
  return {reload};
}
