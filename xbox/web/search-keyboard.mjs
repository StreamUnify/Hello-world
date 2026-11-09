// Title entry stays in the same controller focus/command path as the catalog.
// No editable WebView/XAML field is focused while selecting on-screen keys.
export function installSearchKeyboard(input, submit) {
 if(!input||!submit)return ()=>false;
 input.readOnly=true;
 input.inputMode='none';
 input.setAttribute('aria-haspopup','dialog');
 input.setAttribute('aria-description','Press A to enter a title or actor with the on-screen keyboard.');
 let opened=null;
 const open=target=>{
  if(target!==input)return false;
  if(opened)return true;
  const limit=input.maxLength>0?Math.min(input.maxLength,120):120;
  let value=Array.from(input.value).slice(0,limit),cursor=value.length,upper=false,symbols=false;
  const dialog=document.createElement('dialog');opened=dialog;
  dialog.className='xbox-keyboard';dialog.setAttribute('aria-labelledby','xboxKeyboardTitle');
  const heading=document.createElement('h2');heading.id='xboxKeyboardTitle';heading.textContent='Search titles or actors';dialog.append(heading);
  const preview=document.createElement('div');preview.className='xbox-keyboard-value';preview.setAttribute('role','textbox');preview.setAttribute('aria-label','Title or actor');preview.setAttribute('aria-readonly','true');dialog.append(preview);
  const before=document.createElement('span'),caret=document.createElement('span'),after=document.createElement('span');
  caret.className='xbox-keyboard-caret';caret.textContent='▏';caret.setAttribute('aria-hidden','true');preview.append(before,caret,after);
  const hint=document.createElement('p');hint.className='xbox-keyboard-hint';hint.textContent='D-pad / left stick: Choose key   •   A: Type / Select   •   B: Cancel';dialog.append(hint);
  const rows=document.createElement('div');rows.className='xbox-keyboard-keys';dialog.append(rows);
  const actions=document.createElement('div');actions.className='xbox-keyboard-actions';dialog.append(actions);
  const footer=document.createElement('div');footer.className='xbox-keyboard-footer';dialog.append(footer);
  const draw=()=>{before.textContent=value.slice(0,cursor).join('');after.textContent=value.slice(cursor).join('');preview.setAttribute('aria-valuetext',value.join(''));};
  const insert=text=>{const chars=Array.from(text).slice(0,limit-value.length);value.splice(cursor,0,...chars);cursor+=chars.length;draw();};
  const erase=()=>{if(cursor>0){value.splice(--cursor,1);draw();}};
  const button=(parent,label,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=action;parent.append(b);return b;};
  const characters=[];
  for(let row=0;row<4;row++)for(let col=0;col<10;col++){
   const b=button(rows,'',()=>insert(b.dataset.character));characters.push(b);
  }
  const layout=()=>{
   const lines=symbols?['!@#$%^&*()','[]{}<>/\\|=','+_~`:;?"€£','áéíóúüñçøß']:['1234567890','qwertyuiop',"asdfghjkl'",'zxcvbnm,.-'];
   [...lines.join('')].forEach((character,i)=>{const text=upper?character.toUpperCase():character;characters[i].textContent=text;characters[i].dataset.character=text;characters[i].setAttribute('aria-label',text);});
  };
  const shift=button(actions,'Uppercase',()=>{upper=!upper;shift.setAttribute('aria-pressed',String(upper));layout();});shift.setAttribute('aria-pressed','false');
  const mode=button(actions,'Symbols',()=>{symbols=!symbols;mode.setAttribute('aria-pressed',String(symbols));mode.textContent=symbols?'Letters':'Symbols';layout();});mode.setAttribute('aria-pressed','false');
  button(actions,'Space',()=>insert(' '));
  button(actions,'Backspace',erase);
  button(actions,'Clear',()=>{value=[];cursor=0;draw();});
  button(footer,'Cursor left',()=>{cursor=Math.max(0,cursor-1);draw();});
  button(footer,'Cursor right',()=>{cursor=Math.min(value.length,cursor+1);draw();});
  const finish=accepted=>{
   if(opened!==dialog)return;
   opened=null;dialog.close();dialog.remove();input.focus({preventScroll:true});
   if(!accepted)return;
   input.value=value.join('');
   input.dispatchEvent(new Event('input',{bubbles:true}));
   input.dispatchEvent(new Event('change',{bubbles:true}));
   // Use the shared explicit-submit handler: it cancels live-search debounce,
   // applies account limits, records history, and reveals the results.
   submit.focus({preventScroll:true});submit.click();
  };
  button(footer,'Cancel',()=>finish(false));
  const search=button(footer,'Search',()=>finish(true));search.className='primary';
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false);});
  dialog.addEventListener('close',()=>{if(opened===dialog){opened=null;dialog.remove();input.focus({preventScroll:true});}});
  dialog.addEventListener('keydown',e=>{
   if(e.ctrlKey||e.metaKey||e.altKey)return;
   if(e.key==='Backspace'){e.preventDefault();erase();}
   else if(e.key==='Delete'){e.preventDefault();value.splice(cursor,1);draw();}
   else if(e.key==='Home'||e.key==='End'){e.preventDefault();cursor=e.key==='Home'?0:value.length;draw();}
   else if(e.key.length===1){e.preventDefault();insert(e.key);search.focus({preventScroll:true});}
  });
  dialog.addEventListener('paste',e=>{const text=e.clipboardData?.getData('text/plain');if(text){e.preventDefault();insert(text.replace(/[\r\n\t]/g,' '));search.focus({preventScroll:true});}});
  document.body.append(dialog);layout();draw();dialog.showModal();characters[10].focus({preventScroll:true});
  return true;
 };
 input.addEventListener('click',()=>open(input));
 input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopImmediatePropagation();open(input);}},true);
 return open;
}
