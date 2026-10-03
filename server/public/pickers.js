'use strict';
// Keep native select values/events as the source of truth; show a themed dialog.
(()=>{
 const controls=new Map(),families={pretendard:'Bookshop Pretendard',plex:'Bookshop Plex',gothic:'Bookshop Gothic',dodum:'Bookshop Dodum',ridi:'Bookshop RIDI',myeongjo:'Bookshop Myeongjo',batang:'Bookshop Batang',hahmlet:'Bookshop Hahmlet'};
 const colors={light:['#ffffff','#536ea2'],cream:['#f4eee2','#8b6740'],rose:['#f7edf1','#a66985'],sage:['#ecf2e9','#63835b'],cocoa:['#302a26','#d1ad86'],dark:['#20242c','#91acd9']};
 const make=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const dialog=make('dialog','choice-dialog');dialog.id='bookshop-choice';dialog.setAttribute('aria-labelledby','bookshop-choice-title');
 const head=make('div','choice-head'),titles=make('div',''),eyebrow=make('p','eyebrow','취향에 맞게 고르기'),title=make('h2','','');title.id='bookshop-choice-title';titles.append(eyebrow,title);
 const close=make('button','choice-close','×');close.type='button';close.setAttribute('aria-label','선택창 닫기');head.append(titles,close);
 const list=make('div','choice-list');dialog.append(head,list);document.body.append(dialog);let source,opener;
 close.onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close',()=>{opener?.setAttribute('aria-expanded','false');if(opener?.isConnected&&!opener.closest('[hidden]'))opener.focus({preventScroll:true});list.replaceChildren();source=null;});
 function label(select){const l=select.labels?.[0];return select.getAttribute('aria-label')||select.getAttribute('title')||(l?[...l.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim():'선택');}
 function sync(){for(const [select,button]of controls){if(!select.isConnected){button.remove();controls.delete(select);continue;}const text=select.selectedOptions[0]?.textContent||'선택';if(button.firstChild.textContent!==text)button.firstChild.textContent=text;button.disabled=select.disabled;button.setAttribute('aria-label',label(select)+': '+text);}}
 function open(select,button){source=select;opener=button;title.textContent=label(select);list.replaceChildren();const font=select.id==='font-family'||select.id==='off-font',theme=select.id==='theme'||select.id==='off-theme';list.classList.toggle('theme-choices',theme);
  for(const child of select.children){if(child.tagName==='OPTGROUP'){list.append(make('p','choice-group',child.label));for(const opt of child.children)add(opt,child.disabled);}else add(child,false);}
  function add(opt,groupDisabled){if(opt.tagName!=='OPTION'||opt.hidden)return;const b=make('button','choice-option');b.type='button';b.dataset.value=opt.value;b.disabled=opt.disabled||groupDisabled;b.setAttribute('aria-pressed',String(opt.selected));
   if(theme&&colors[opt.value]){const swatch=make('span','choice-swatch');swatch.style.background=colors[opt.value][0];swatch.style.color=colors[opt.value][1];swatch.textContent='Aa';b.append(swatch);}
   const text=make('span','choice-text',opt.textContent);if(font&&families[opt.value])text.style.fontFamily='"'+families[opt.value]+'"';const tick=make('span','choice-tick',opt.selected?'✓':'');tick.setAttribute('aria-hidden','true');b.append(text,tick);
   b.onclick=()=>{select.value=opt.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();dialog.close();};list.append(b);
  }
  button.setAttribute('aria-expanded','true');dialog.showModal();const selected=list.querySelector('[aria-pressed=true]');(selected||list.querySelector('button')||close).focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'});
 }
 dialog.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;e.preventDefault();const options=[...list.querySelectorAll('button:not(:disabled)')],i=options.indexOf(document.activeElement);if(!options.length)return;options[e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();});
 for(const select of document.querySelectorAll('select')){if(select.multiple||select.size>1)continue;const b=make('button','choice-field');b.type='button';b.id=select.id+'-choice';b.append(make('span','choice-value',''),make('span','choice-chevron','⌄'));b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls',dialog.id);b.setAttribute('aria-expanded','false');select.classList.add('choice-source');select.tabIndex=-1;select.setAttribute('aria-hidden','true');select.after(b);b.onclick=()=>open(select,b);select.addEventListener('change',sync);controls.set(select,b);}
 sync();window.addEventListener('load',sync);document.addEventListener('focusin',sync);setInterval(()=>{if(!document.hidden)sync();},400);
 window.BookshopPickers={sync,close:()=>{if(dialog.open)dialog.close();}};
})();
