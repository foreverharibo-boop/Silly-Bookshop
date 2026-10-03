'use strict';
// One offline reader for web and Android. Chat HTML stays in script-disabled frames.
(async()=>{
 const $=id=>document.getElementById(id),root=document.documentElement,host=$('offline-transcript');
 const bridge=parent!==window?parent.BookshopVaultReader:null;
 const data=bridge?await bridge.load():await(await fetch('/snapshot',{cache:'no-store'})).json();
 if(!Array.isArray(data.messages)||data.messages.length>5000)throw Error('Invalid snapshot');
 const clone=v=>JSON.parse(JSON.stringify(v)),count=data.messages.length;
 const validPos=p=>p&&Number.isInteger(p.index)&&p.index>=0&&p.index<Math.max(1,count)&&Number.isFinite(p.fraction)&&p.fraction>=0&&p.fraction<=1;
 const originalState=data.readerState||{};
 let marks=(originalState.bookmarks||data.bookmarks||[]).filter(m=>Number.isInteger(m.index)&&m.index>=0&&m.index<count).slice(0,100).map(m=>({index:m.index,note:String(m.note||'').slice(0,500)}));
 let alias=typeof originalState.alias==='string'?originalState.alias:String(data.meta.alias||''),begin=0,end=0,restoring=false,anchor={index:0,fraction:0},restoreGeneration=0,timer,searchGeneration=0,markIndex=0,dirty=false,lastSaved='';
 const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
 const status=text=>$('off-status').textContent=text;
 const normalStatus=()=>status('오프라인 보관본 · '+count+'개 메시지');
 const families={system:'system-ui,sans-serif',gothic:'"Bookshop Gothic",sans-serif',myeongjo:'"Bookshop Myeongjo",serif',batang:'"Bookshop Batang",serif',ridi:'"Bookshop RIDI",serif',pretendard:'"Bookshop Pretendard",sans-serif',plex:'"Bookshop Plex",sans-serif',dodum:'"Bookshop Dodum",sans-serif',hahmlet:'"Bookshop Hahmlet",serif'};
 let nativeRevision=0,nativePending=null,nativeWaiters=[];
 window.BookshopOfflineState={get:()=>nativePending,flush:()=>({position:pos(),alias,bookmarks:clone(marks)}),ack(revision,ok){if(nativePending?.revision===revision)nativePending=null;const done=nativeWaiters.filter(w=>w.revision<=revision);nativeWaiters=nativeWaiters.filter(w=>w.revision>revision);for(const w of done){clearTimeout(w.timer);ok?w.resolve():w.reject(Error('저장하지 못했어요. 폰 잠금을 확인하고 다시 시도해 주세요.'));}},action:''};
 function persist(state){
  if(bridge)return bridge.update(data.vaultId,state);
  const revision=++nativeRevision;nativePending={revision,state};
  return new Promise((resolve,reject)=>{const w={revision,resolve,reject};w.timer=setTimeout(()=>{nativeWaiters=nativeWaiters.filter(x=>x!==w);reject(Error('저장 확인이 늦어지고 있어요. 다시 시도해 주세요.'));},10000);nativeWaiters.push(w);});
 }
 function pos(){if(restoring)return {...anchor};const top=host.getBoundingClientRect().top;for(const e of host.querySelectorAll('.message')){const r=e.getBoundingClientRect();if(r.bottom>top+1)return {index:Number(e.dataset.index),fraction:Math.max(0,Math.min(1,(top-r.top)/Math.max(1,r.height)))};}return {index:begin,fraction:0};}
 async function save(force=false){clearTimeout(timer);if(!count)return;const state={position:pos(),alias,bookmarks:clone(marks)},signature=JSON.stringify(state);if(!force&&!dirty&&signature===lastSaved)return;dirty=true;try{await persist(state);lastSaved=signature;dirty=false;normalStatus();}catch(e){status(e.message);throw e;}}
 function scheduleSave(){clearTimeout(timer);timer=setTimeout(()=>save().catch(()=>{}),600);}
 function restore(p){anchor={...p};restoring=true;const generation=++restoreGeneration;const e=host.querySelector('[data-index="'+p.index+'"]');if(e)host.scrollTop+=e.getBoundingClientRect().top-host.getBoundingClientRect().top+p.fraction*Math.max(1,e.getBoundingClientRect().height);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(generation===restoreGeneration)restoring=false;}));}
 function mount(target,text){window.BookshopRich.mount(target,text,{onResize:change=>{const before=pos();change();restore(before);}});}
 function article(i){const m=data.messages[i],isCharacter=m.characterSpeech??(!m.user&&!m.system),item=node('article','message'+(m.user?' user':'')+(m.system&&!isCharacter?' system':''));item.dataset.index=i;
  const by=node('div','byline');if(isCharacter){const box=node('span','avatar message-avatar');if(typeof data.meta.photo==='string'&&data.meta.photo.length<6000000&&/^data:image\/png;base64,[a-z0-9+/]+=*$/i.test(data.meta.photo)){const img=node('img');img.src=data.meta.photo;img.alt=m.name+' 프로필';box.append(img);}else box.textContent=String(m.name||'?').slice(0,1);by.append(box);}
  by.append(node('span','',m.name||''),node('small','',(m.system&&!isCharacter?'시스템 · ':'')+(m.date||'')));
  const mark=node('button','bookmark-button',marks.some(b=>b.index===i)?'★':'☆');mark.dataset.bookmarkIndex=i;mark.setAttribute('aria-label',(i+1)+'번째 메시지 책갈피');mark.onclick=()=>editMark(i);by.append(mark);
  const bubble=node('div','bubble');item.append(by,bubble);
  if(typeof m.content==='string'){const content=node('div','message-content');bubble.append(content);if(m.content.trim())mount(content,m.content);else content.append(node('p','notice','표시할 내용이 없는 메시지예요.'));
   for(const t of m.translations||[]){const details=node('details','stored-translation'),body=node('div','message-content');details.append(node('summary','',t.label||'저장된 번역'),body);bubble.append(details);mount(body,String(t.content||''));}
  }else{bubble.classList.add('awaiting');bubble.append(node('p','','이 메시지의 표시 설정을 확인해 주세요.'));}
  return item;
 }
 const before=node('div','off-sentinel'),after=node('div','off-sentinel');
 function render(p){window.BookshopRich.clear(host);host.replaceChildren(before,after);begin=Math.max(0,p.index-10);end=Math.min(count,begin+30);for(let i=begin;i<end;i++)host.insertBefore(article(i),after);if(!count)host.insertBefore(node('p','notice','보관한 메시지가 없어요.'),after);restore(p);}
 function removeItem(e){window.BookshopRich.clear(e);e.remove();}
 function extend(){if(restoring||!count||root.dataset.searching==='true')return;const p=pos();let changed=false;
  if(host.scrollHeight-host.clientHeight-host.scrollTop<650&&end<count){const next=Math.min(count,end+30);for(let i=end;i<next;i++)host.insertBefore(article(i),after);end=next;changed=true;
   while(end-begin>120&&begin<p.index-30){removeItem(host.querySelector('[data-index="'+begin+'"]'));begin++;}}
  else if(host.scrollTop<450&&begin>0){const next=Math.max(0,begin-30);for(let i=begin-1;i>=next;i--)host.insertBefore(article(i),before.nextSibling);begin=next;changed=true;
   while(end-begin>120&&end>p.index+40){end--;removeItem(host.querySelector('[data-index="'+end+'"]'));}}
  if(changed)restore(p);
 }
 function goto(index){const p={index:Math.max(0,Math.min(count-1,index)),fraction:0};render(p);scheduleSave();}
 host.addEventListener('scroll',()=>{if(restoring)return;extend();scheduleSave();},{passive:true});
 window.addEventListener('resize',()=>restore(pos()));
 $('off-first').onclick=()=>goto(0);$('off-last').onclick=()=>goto(Math.max(0,count-1));
 function title(){$('offline-title').textContent=alias||data.meta.title||'보관한 이야기';$('offline-person').textContent=(data.meta.character||'캐릭터')+'와 나눈 대화';}
 title();$('offline-date').textContent=new Date(data.created).toLocaleString('ko-KR')+'에 보관한 대화예요.';
 const prefs=data.preferences||{};let local={};try{local=JSON.parse(localStorage.getItem('offline-style')||'{}');}catch{}
 for(const [id,k,def]of [['off-theme','theme','light'],['off-font','font','system'],['off-line','line','1.85'],['off-padding','padding','24'],['off-size','size','16']]){const value=String(local[k]??prefs[k]??def);$(id).value=[...$(id).options].some(o=>o.value===value)?value:def;$(id).onchange=()=>apply(true);}
 $('off-photos').checked=local.messagePhotos??prefs.messagePhotos??true;$('off-photos').onchange=()=>apply(true);$('off-bold').checked=local.bold??prefs.bold??false;$('off-bold').onchange=()=>apply(true);
 function apply(remember){const p=pos();root.dataset.messagePhotos=String($('off-photos').checked);root.dataset.theme=$('off-theme').value;root.dataset.readingFont=$('off-font').value;root.dataset.readingBold=String($('off-bold').checked);
  for(const [k,v]of Object.entries({'--reading-family':families[$('off-font').value],'--reading-size':$('off-size').value+'px','--reading-weight':$('off-bold').checked?'700':'400','--reading-line':$('off-line').value,'--bubble-padding':$('off-padding').value+'px'}))root.style.setProperty(k,v);
  $('off-font-size').textContent='가 '+$('off-size').value;window.BookshopRich.refresh(host);restore(p);bridge?.theme?.(root.dataset.theme);
  if(remember)try{localStorage.setItem('offline-style',JSON.stringify({theme:$('off-theme').value,font:$('off-font').value,size:$('off-size').value,bold:$('off-bold').checked,line:$('off-line').value,padding:$('off-padding').value,messagePhotos:$('off-photos').checked}));}catch{}
 }
 function show(id){$(id).showModal();}for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
 $('off-tools').onclick=()=>show('off-settings');$('off-font-size').onclick=()=>show('off-settings');
 function focus(value){const p=pos();root.dataset.focus=String(value);$('off-exit').hidden=!value;restore(p);}$('off-focus').onclick=()=>focus(true);$('off-exit').onclick=()=>focus(false);window.addEventListener('bookshop-content-tap',()=>focus(false));
 async function leave(action){try{await save();if(bridge){if(action==='home')await bridge.home();else bridge.lock();}else window.BookshopOfflineState.action=action;}catch{}}
 $('off-home').onclick=()=>leave('home');$('off-lock').onclick=()=>leave('lock');
 $('off-alias').onclick=()=>{$('off-alias-input').value=alias;show('off-alias-dialog');};
 async function formTask(form,fn){const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);const message=form.querySelector('[role=status]');message.textContent='저장 중이에요…';try{await fn();message.textContent='';form.closest('dialog').close();}catch(e){message.textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}}
 $('off-alias-form').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,async()=>{const prior=alias;alias=$('off-alias-input').value.trim().slice(0,120);dirty=true;try{await save(true);title();}catch(e){alias=prior;throw e;}});};
 function paintMarks(){for(const b of host.querySelectorAll('[data-bookmark-index]'))b.textContent=marks.some(m=>m.index===Number(b.dataset.bookmarkIndex))?'★':'☆';}
 function editMark(index){markIndex=index;const mark=marks.find(b=>b.index===index);$('off-note').value=mark?.note||'';$('off-remove-mark').hidden=!mark;$('off-mark-form').querySelector('[role=status]').textContent='';show('off-mark-dialog');}
 function markList(){const list=$('off-bookmark-list');list.replaceChildren();for(const m of [...marks].sort((a,b)=>a.index-b.index)){const row=node('div','off-mark-row'),open=node('button','',(m.index+1)+'번째 · '+(m.note||'책갈피')),edit=node('button','','편집');open.onclick=()=>{$('off-bookmarks').close();goto(m.index);};edit.onclick=()=>{$('off-bookmarks').close();editMark(m.index);};row.append(open,edit);list.append(row);}if(!marks.length)list.append(node('p','help','아직 책갈피가 없어요. 메시지 옆 ☆을 눌러 보세요.'));}
 $('off-marks').onclick=()=>{markList();show('off-bookmarks');};
 async function changeMark(remove){const prior=clone(marks);if(!remove&&!marks.some(m=>m.index===markIndex)&&marks.length>=100)throw Error('책갈피는 대화마다 100개까지 저장할 수 있어요.');marks=marks.filter(m=>m.index!==markIndex);if(!remove)marks.push({index:markIndex,note:$('off-note').value.slice(0,500)});dirty=true;try{await save(true);paintMarks();}catch(e){marks=prior;throw e;}}
 $('off-mark-form').onsubmit=e=>{e.preventDefault();formTask(e.currentTarget,()=>changeMark(false));};$('off-remove-mark').onclick=()=>formTask($('off-mark-form'),()=>changeMark(true));
 const searchable=new Map();function plain(i){if(!searchable.has(i)){const m=data.messages[i],raw=[m.content,...(m.translations||[]).map(t=>t.content)].filter(v=>typeof v==='string').join('\n');const clean=window.DOMPurify.sanitize(raw,{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}),decoder=document.createElement('textarea');decoder.innerHTML=clean;searchable.set(i,decoder.value);}return searchable.get(i);}
 $('off-search').onclick=()=>show('off-search-dialog');$('off-search-dialog').addEventListener('close',()=>{searchGeneration++;root.dataset.searching='false';});
 $('off-search-form').onsubmit=async e=>{e.preventDefault();const query=$('off-query').value.trim().toLocaleLowerCase(),generation=++searchGeneration,list=$('off-search-results');list.replaceChildren();if(!query){$('off-search-status').textContent='검색어를 입력해 주세요.';return;}root.dataset.searching='true';$('off-search-status').textContent='저장한 대화에서 찾고 있어요…';let found=0;
  for(let i=0;i<count;i++){if(generation!==searchGeneration)return;const text=plain(i),at=text.toLocaleLowerCase().indexOf(query);if(at>=0){found++;if(found<=100){const b=node('button','search-result');b.append(node('strong','',(i+1)+'번째 · '+(data.messages[i].name||'')),node('span','',text.slice(Math.max(0,at-45),at+query.length+90)));b.onclick=()=>{$('off-search-dialog').close();goto(i);host.querySelector('[data-index="'+i+'"]').classList.add('search-hit');};list.append(b);}}if(i%30===29)await new Promise(r=>setTimeout(r,0));}
  if(generation===searchGeneration)$('off-search-status').textContent=found?found+'개 메시지에서 찾았어요.'+(found>100?' 처음 100개를 표시해요.':''):'일치하는 내용이 없어요.';
 };
 document.addEventListener('visibilitychange',()=>{if(document.hidden)save().catch(()=>{});});window.addEventListener('pagehide',()=>save().catch(()=>{}));
 let saved=originalState.position||data.webPosition||data.saved;
 if(!bridge&&!originalState.position)try{const legacy=JSON.parse(localStorage.getItem('offline-position:'+data.vaultId));if(validPos(legacy))saved=legacy;}catch{}
 if(!validPos(saved))saved={index:0,fraction:0};apply(false);render(saved);normalStatus();
})().catch(()=>{document.getElementById('offline-title').textContent='보관본을 열 수 없어요. 목록으로 돌아가 다시 시도해 주세요.';});
