'use strict';
(() => {
const $=id=>document.getElementById(id), base='/api/plugins/silly-bookshop';
const prefs={get(k,f){try{let value=localStorage.getItem('silly-bookshop:'+k);if(value===null){value=localStorage.getItem('sili-library:'+k);if(value!==null){localStorage.setItem('silly-bookshop:'+k,value);localStorage.removeItem('sili-library:'+k);}}return value||f;}catch{return f;}},set(k,v){try{localStorage.setItem('silly-bookshop:'+k,v);}catch{}}};
const pendingPositions=new Map();
let bookmarks=[],bookmarkIndex=0,bookmarkChat='',focusMode=false,recentChats=[];
let people=[],catalogRequest=0,chats=[],active='',character='',revision='',start=0,total=0,epoch=0,loading=false,unlocked=false,restoring=false;
let saveTimer,pollTimer,csrf='',lastPosition=null,scrollDirty=false;
const avatarCache=new Map(),avatarFailures=new Map(),avatarQueue=[];let avatarBusy=0,authEpoch=0;
const scroller=$('transcript');
let font=Number(prefs.get('font','16'));
const UI_VERSION='0.7.1-test.1';
let rendererLoading=null;
function rendererReady(){return window.BookshopRich?.version===UI_VERSION;}
function ensureRenderer(){
    if(rendererReady())return Promise.resolve();
    if(rendererLoading)return rendererLoading;
    rendererLoading=new Promise((resolve,reject)=>{
        const script=document.createElement('script');let finished=false;
        const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);script.remove();error?reject(error):resolve();};
        const problem=()=>new Error('본문 표시 파일을 받지 못했어요. 서버 업데이트·재시작을 확인한 뒤 아래 다시 불러오기를 눌러 주세요.');
        const timer=setTimeout(()=>finish(problem()),12000);
        script.src=base+'/rich.js?v='+UI_VERSION+'&retry='+Date.now();
        script.onload=()=>finish(rendererReady()?null:problem());script.onerror=()=>finish(problem());document.head.append(script);
    }).finally(()=>{rendererLoading=null;});
    return rendererLoading;
}
if(![15,16,18,20].includes(font))font=16;
document.documentElement.style.setProperty('--reading-size',font+'px');
const themeNames={light:'화이트',cream:'크림',rose:'로즈',sage:'세이지',cocoa:'밤서재',dark:'잉크'};
const selectedTheme=prefs.get('theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
document.documentElement.dataset.theme=Object.hasOwn(themeNames,selectedTheme)?selectedTheme:'light';
$('theme').value=document.documentElement.dataset.theme;
const fontFamilies={system:'system-ui,sans-serif',gothic:'"Bookshop Gothic",sans-serif',myeongjo:'"Bookshop Myeongjo",serif',batang:'"Bookshop Batang",serif',ridi:'"Bookshop RIDI",serif'};
let fontFamily=prefs.get('font-family','system');if(!Object.hasOwn(fontFamilies,fontFamily))fontFamily='system';
$('font-family').value=fontFamily;$('reading-bold').checked=prefs.get('bold','false')==='true';$('reading-size').value=String(font);
function applyReading(){
    document.documentElement.style.setProperty('--reading-family',fontFamilies[fontFamily]);
    document.documentElement.style.setProperty('--reading-weight',$('reading-bold').checked?'700':'400');
    document.documentElement.dataset.readingFont=fontFamily;document.documentElement.dataset.readingBold=String($('reading-bold').checked);
    document.documentElement.style.setProperty('--reading-size',font+'px');$('reading-size').value=String(font);$('font-size').textContent='가 '+font;
    window.BookshopRich?.refresh(scroller);
}
applyReading();
document.documentElement.dataset.native=String(navigator.userAgent.includes('SillyBookshop/'));
for(const [id,key,allowed,fallback] of [['line-spacing','line-spacing',['1.5','1.85','2.2'],'1.85'],['bubble-padding','bubble-padding',['12','24','36'],'24']]){
 const stored=prefs.get(key,fallback);$(id).value=allowed.includes(stored)?stored:fallback;
 const apply=()=>{document.documentElement.style.setProperty(id==='line-spacing'?'--reading-line':'--bubble-padding',$(id).value+(id==='bubble-padding'?'px':''));window.BookshopRich?.refresh(scroller);};
 apply();$(id).onchange=()=>readingChange(()=>{prefs.set(key,$(id).value);apply();});
}
function setFocus(value){if(value&&!active)return;const p=position();focusMode=value;document.documentElement.dataset.focus=String(value);$('focus-exit').hidden=!value;closeDialogs();if(p)restore(p);}
$('focus-open').onclick=$('focus-setting').onclick=()=>setFocus(true);$('focus-exit').onclick=()=>setFocus(false);
window.addEventListener('bookshop-content-tap',()=>{if(focusMode)setFocus(false);});
scroller.addEventListener('click',e=>{if(focusMode&&!e.target.closest('button,a,summary,details')&&!getSelection()?.toString())setFocus(false);});
function renderRecent(){
 const visible=recentChats.slice(0,Number($('recent-limit').value)),collapsed=prefs.get('recent-collapsed','false')==='true';
 $('recent').replaceChildren();$('recent-section').hidden=!visible.length;$('recent').hidden=collapsed;
 $('recent-toggle').setAttribute('aria-expanded',String(!collapsed));$('recent-count').textContent=String(visible.length);$('recent-chevron').textContent=collapsed?'⌄':'⌃';
 for(const c of visible){const b=node('button','recent-card');b.append(node('strong','',c.character+' · '+c.title),node('small','',(c.position.index+1)+'번째 메시지부터 이어 읽기'));b.onclick=()=>openChat(c.id);$('recent').append(b);}
}
for(const [id,allowed,fallback] of [['library-view',['list','cards','covers'],'list'],['recent-limit',['0','3','6','10'],'6']]){
 const stored=prefs.get(id,fallback);$(id).value=allowed.includes(stored)?stored:fallback;
 $(id).onchange=()=>{prefs.set(id,$(id).value);id==='library-view'?renderLists():renderRecent();};
}
$('recent-toggle').onclick=()=>{prefs.set('recent-collapsed',String($('recent-toggle').getAttribute('aria-expanded')==='true'));renderRecent();};
function renderBookmarks(){
 $('bookmark-list').replaceChildren();
 for(const b of bookmarks){const row=node('div','bookmark-row'),go=node('button','',b.note||'메모 없는 책갈피');go.append(node('small','',(b.index+1)+'번째 메시지'));go.onclick=()=>{closeDialogs();page(b.index);};row.append(go);$('bookmark-list').append(row);}
 if(!bookmarks.length)$('bookmark-list').append(node('p','help','아직 남긴 책갈피가 없어요.'));
 scroller.querySelectorAll('.bookmark-button').forEach(b=>{const marked=bookmarks.some(x=>x.index===Number(b.dataset.bookmarkIndex));b.textContent=marked?'★':'☆';b.setAttribute('aria-label',(Number(b.dataset.bookmarkIndex)+1)+'번째 메시지 책갈피 '+(marked?'편집':'추가'));});
}
function editBookmark(index){bookmarkIndex=index;bookmarkChat=active;const saved=bookmarks.find(b=>b.index===index);$('bookmark-note').value=saved?.note||'';$('bookmark-remove').hidden=!saved;$('bookmark-title').textContent=(index+1)+'번째 메시지 책갈피';$('bookmark-status').textContent='';$('bookmark-edit').showModal();}
async function writeBookmark(remove){
 const buttons=$('bookmark-form').querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{const data=await api('/bookmarks',{id:bookmarkChat,index:bookmarkIndex,note:$('bookmark-note').value,remove});if(active===bookmarkChat){bookmarks=data;renderBookmarks();}$('bookmark-edit').close();}catch(e){$('bookmark-status').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
$('bookmark-form').onsubmit=e=>{e.preventDefault();writeBookmark(false);};$('bookmark-remove').onclick=()=>writeBookmark(true);
$('bookmarks-open').onclick=()=>{if(!active){status('먼저 대화를 골라 주세요.');return;}renderBookmarks();$('bookmarks-dialog').showModal();};
// Android pulls bounded data from this object; no page-to-native JavaScript bridge.
let exportValue='',exportState={state:'idle'},exportEpoch=0;
window.BookshopOfflineExport={
 begin(){const token=++exportEpoch;exportValue='';if(!unlocked||!active){exportState={state:'error',message:'먼저 보관할 대화를 열어 주세요.'};return;}exportState={state:'loading'};api('/offline?id='+encodeURIComponent(active)).then(data=>{if(token!==exportEpoch||!unlocked)return;data.preferences={theme:document.documentElement.dataset.theme,font:fontFamily,size:font,bold:$('reading-bold').checked,line:$('line-spacing').value,padding:$('bubble-padding').value};exportValue=JSON.stringify(data);if(exportValue.length>18*1024*1024)throw new Error('오프라인 보관 크기를 넘었어요.');exportState={state:'ready',length:exportValue.length};}).catch(e=>{if(token===exportEpoch){exportValue='';exportState={state:'error',message:e.message};}});},
 status(){return exportState;},chunk(offset){return Number.isSafeInteger(offset)&&offset>=0?exportValue.slice(offset,offset+32768):'';},clear(){exportEpoch++;exportValue='';exportState={state:'idle'};}
};
function closeDialogs(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());}
function showRecovery(code){$('issued-code').value=code;$('copy-status').textContent='';$('recovery-result').showModal();}
async function openTools(){
    if(document.querySelector('dialog[open]'))return;
    $('account-settings').hidden=!unlocked;$('account-locked').hidden=unlocked;
    $('account-message').textContent='';$('tools-dialog').showModal();
    if(unlocked)try{const info=await api('/account');$('account-status').textContent=info.recoveryConfigured?'복구 코드가 설정되어 있어요. 잃어버렸다면 재발급해 주세요.':'아직 복구 코드가 없어요. 현재 비밀번호로 미리 발급해 두세요.';}catch(e){$('account-message').textContent=e.message;}
}
$('tools').onclick=openTools;
window.addEventListener('bookshop-open-tools',openTools);
function routeIntent(){const intent=location.hash;if(intent==='#home')goHome();else if(intent==='#tools')openTools();else return;history.replaceState(null,'',location.pathname+location.search);}
window.addEventListener('hashchange',routeIntent);
window.addEventListener('bookshop-home',goHome);
window.addEventListener('bookshop-reload',async()=>{await Promise.race([save(),new Promise(resolve=>setTimeout(resolve,1500))]);if($('tools-dialog').open)history.replaceState(null,'',location.pathname+location.search+'#tools');location.reload();});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('tools-dialog').addEventListener('close',()=>{$('account-form').reset();$('account-message').textContent='';});
$('reset-dialog').addEventListener('close',()=>{$('reset-form').reset();$('reset-message').textContent='';});
$('recovery-result').addEventListener('close',()=>{$('issued-code').value='';});
$('forgot-password').onclick=()=>{$('reset-dialog').showModal();};
$('copy-code').onclick=async()=>{
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText($('issued-code').value);else{$('issued-code').focus();$('issued-code').select();if(!document.execCommand('copy'))throw new Error();}$('copy-status').textContent='복사했어요. 안전한 곳에 붙여넣어 보관해 주세요.';}
    catch{$('issued-code').focus();$('issued-code').select();$('copy-status').textContent='코드를 길게 눌러 복사해 주세요.';}
};
async function accountAction(mode){
    const form=$('account-form');if(form.dataset.busy)return;
    if(!$('current-password').reportValidity())return;
    if(mode==='password'&&($('new-password').value.length<12||$('new-password').value!==$('confirm-password').value)){$('account-message').textContent='새 비밀번호를 12자 이상으로, 두 칸에 같게 입력해 주세요.';return;}
    form.dataset.busy='true';form.querySelectorAll('button').forEach(b=>b.disabled=true);$('account-message').textContent='변경 중이에요…';
    try{
        if(mode==='password')await save();
        const result=await api('/account/'+mode,{password:$('current-password').value,newPassword:$('new-password').value});
        closeDialogs();if(mode==='password')gate('비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.');showRecovery(result.recoveryCode);
    }catch(e){$('account-message').textContent=e.message;}
    finally{delete form.dataset.busy;form.querySelectorAll('button').forEach(b=>b.disabled=false);}
}
$('account-form').onsubmit=e=>{e.preventDefault();accountAction('password');};
$('make-recovery').onclick=()=>accountAction('recovery-code');
$('reset-form').onsubmit=async e=>{
    e.preventDefault();const b=e.submitter;if(b.disabled)return;
    if($('reset-password').value!==$('reset-confirm').value){$('reset-message').textContent='두 비밀번호가 달라요.';return;}
    b.disabled=true;$('reset-message').textContent='재설정 중이에요…';
    try{const result=await api('/account/reset',{code:$('recovery-code').value,newPassword:$('reset-password').value});closeDialogs();gate('새 비밀번호를 설정했어요. 다시 로그인해 주세요.');showRecovery(result.recoveryCode);}
    catch(err){$('reset-message').textContent=err.message;}finally{b.disabled=false;}
};
function status(text){$('status').textContent=text;}
function gate(message){window.BookshopOfflineExport.clear();setFocus(false);bookmarks=[];recentChats=[];$('recent').replaceChildren();$('bookmark-list').replaceChildren();$('bookmark-note').value='';closeDialogs();pendingPositions.clear();unlocked=false;epoch++;catalogRequest++;authEpoch++;avatarObserver?.disconnect();avatarQueue.splice(0).forEach(job=>job.resolve(null));avatarFailures.clear();$('library').hidden=true;$('gate').hidden=false;$('gate-status').textContent=message;clearTimeout(saveTimer);clearInterval(pollTimer);scrollDirty=false;window.BookshopRich?.clear(scroller);scroller.replaceChildren();$('characters').replaceChildren();avatarCache.clear();$('title').textContent='어떤 이야기를 펼쳐볼까요?';$('person').textContent='나만의 작은 책방';$('search').value='';people=[];chats=[];active='';character='';lastPosition=null;revision='';csrf='';}
async function request(url,options={},timeout=20000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const r=await fetch(url,{...options,signal:controller.signal});const bytes=await r.arrayBuffer();return {ok:r.ok,status:r.status,headers:r.headers,bytes};}
    catch(e){if(e.name==='AbortError')throw new Error('서버 응답 시간이 초과됐어요. 서버 연결을 확인하고 다시 시도해 주세요.');throw e;}
    finally{clearTimeout(timer);}
}
async function api(route,body,keepalive=false){
    const requestAuthEpoch=authEpoch;
    const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
    if(body!==undefined){
        if(!csrf){const response=await request('/csrf-token',{credentials:'same-origin',cache:'no-store'});try{csrf=JSON.parse(new TextDecoder().decode(response.bytes)).token;}catch{throw new Error('실리 로그인이 필요해요. 실리 로그인 화면을 먼저 열어 주세요.');}}
        Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Silly-Request':'1'},body:JSON.stringify(body),keepalive});
    }
    const response=await request(base+route,options,route.startsWith('/offline?')?90000:20000);
    let data;try{data=JSON.parse(new TextDecoder().decode(response.bytes));}catch{throw new Error('실리 로그인 화면으로 이동했거나 서버가 잘못된 응답을 보냈어요.');}
    if(!response.ok){if(response.status===401&&route!=='/login'&&requestAuthEpoch===authEpoch)gate('다시 책방 잠금을 풀어 주세요.');if(response.status===403)csrf='';throw new Error(data.error||'요청에 실패했습니다.');}
    return data;
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function pumpAvatars(){
    while(avatarBusy<2&&avatarQueue.length){const job=avatarQueue.shift();avatarBusy++;
        (async()=>{let url=null;
            try{for(let attempt=0;attempt<3;attempt++){
                if(!unlocked||job.session!==authEpoch)break;
                const response=await request(base+'/avatar?name='+encodeURIComponent(job.file),{credentials:'same-origin',cache:'no-store'},12000);
                if(response.status===429&&attempt<2){await new Promise(r=>setTimeout(r,500*(attempt+1)));continue;}
                if(!response.ok)throw new Error('사진 요청 실패 ('+response.status+')');
                const blob=new Blob([response.bytes],{type:'image/png'});
                url=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});break;
            }}catch{}finally{
                if(!url&&job.session===authEpoch){avatarCache.delete(job.file);avatarFailures.set(job.file,Date.now()+10000);}
                job.resolve(job.session===authEpoch?url:null);avatarBusy--;pumpAvatars();
            }
        })();
    }
}
const avatarObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){avatarObserver.unobserve(entry.target);entry.target._loadPhoto?.();}},{rootMargin:'100px'}):null;
function avatar(name,file,className='avatar'){
    const box=node('span',className,Array.from(name)[0]||'·');
    if(file){const session=authEpoch;
        box._loadPhoto=()=>{
            if(!unlocked||session!==authEpoch)return;
            if((avatarFailures.get(file)||0)>Date.now()){box.title='사진을 다시 불러오려면 위의 새로고침을 눌러 주세요.';return;}
            if(!avatarCache.has(file))avatarCache.set(file,new Promise(resolve=>{avatarQueue.push({file,resolve,session});pumpAvatars();}));
            avatarCache.get(file).then(url=>{if(url&&unlocked&&session===authEpoch){const img=node('img');img.alt=name+' 프로필';img.src=url;img.onerror=()=>{img.remove();avatarCache.delete(file);box.title='캐릭터 사진을 읽지 못했어요.';};box.append(img);}else box.title='사진을 다시 불러오려면 위의 새로고침을 눌러 주세요.';});
        };
        if(avatarObserver)avatarObserver.observe(box);else box._loadPhoto();
    }
    return box;
}
function layoutChange(change){const p=restoring?lastPosition:position();change();if(p)restore(p);}
function output(host,text,rendered=false){if(!rendererReady())throw new Error('본문 표시 파일을 다시 불러와 주세요.');window.BookshopRich.mount(host,text,{rendered,onResize:layoutChange});}
function position(){
    if(!scroller.clientHeight)return lastPosition;
    const top=scroller.getBoundingClientRect().top;
    for(const el of scroller.querySelectorAll('.message')){
        const r=el.getBoundingClientRect();
        if(r.bottom>top+1)return {index:Number(el.dataset.index),fraction:Math.max(0,Math.min(1,(top-r.top)/Math.max(1,r.height)))};
    }
    return lastPosition;
}
function restore(pos){
    restoring=true;
    const el=pos&&scroller.querySelector('[data-index="'+pos.index+'"]');
    if(pos?.index===0&&pos.fraction===0&&start===0)scroller.scrollTop=0;
    else if(el){const r=el.getBoundingClientRect();scroller.scrollTop+=r.top-scroller.getBoundingClientRect().top+pos.fraction*r.height;}
    else scroller.scrollTop=0;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{restoring=false;}));
}
async function save(keepalive=false){
    clearTimeout(saveTimer);
    if(!unlocked||!active||!scrollDirty)return;
    const pos=position(),id=active;if(!pos)return;
    scrollDirty=false;lastPosition=pos;pendingPositions.set(id,pos);
    try{await api('/position',{id,position:pos},keepalive);if(pendingPositions.get(id)===pos)pendingPositions.delete(id);if(id===active)status('읽던 위치 저장됨 · 자동 연동 중');}
    catch(e){if(id===active){scrollDirty=true;status('위치 저장 실패 · '+e.message);}}
}
function fold(value){const p=position(),mobile=matchMedia('(max-width:640px)').matches;if(mobile&&active&&!value)save();$('library').classList.toggle('collapsed',value);$('fold').setAttribute('aria-expanded',String(!value));$('fold').setAttribute('aria-label',value?'목록 펼치기':'목록 접기');prefs.set('collapsed',String(value));if(mobile&&active)prefs.set('view',value?'chat':'home');if(active&&p&&(!mobile||value))restore(p);}
$('fold').onclick=()=>fold(!$('library').classList.contains('collapsed'));
function renderLists(){
    $('characters').querySelectorAll('.avatar').forEach(el=>avatarObserver?.unobserve(el));
    const query=$('search').value.trim().toLowerCase(),groups=new Map();
    for(const person of people){
        const own=chats.filter(c=>(c.characterKey||c.character)===person.key);
        const list=person.character.toLowerCase().includes(query)?own:own.filter(c=>c.title.toLowerCase().includes(query));
        if(!query||person.character.toLowerCase().includes(query)||list.length)groups.set(person.key,{person,list});
    }
    const view=$('library-view').value,columns=view==='covers'?3:2,entries=[...groups];
    $('characters').dataset.view=view;
    $('count').textContent=String(groups.size);$('characters').replaceChildren();let n=0,row,openThreads;
    for(const [key,{person,list}]of groups){
        const name=person.character,section=node('section','character-group'),b=node('button','character');
        const index=n++,expanded=key===character,id='threads-'+index;b.id='character-'+index;
        b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-controls',id);b.setAttribute('aria-pressed',String(expanded));
        b.append(avatar(name,person.avatar));
        const caption=view==='list'?b:node('span','character-caption');
        caption.append(node('span','character-name',name),node('small','',String(list.length)+(view==='list'?'':'개 대화')),node('span','chevron',expanded?'⌃':'⌄'));
        if(view!=='list'){b.append(caption);b.title=name;}
        b.onclick=()=>{character=character===key?'':key;prefs.set('character',character);renderLists();$(b.id)?.focus({preventScroll:true});};section.append(b);
        let threads;
        if(expanded){threads=node('nav','threads');threads.id=id;threads.setAttribute('aria-label',name+' 대화 목록');
            for(const c of list){const t=node('button','thread');t.setAttribute('aria-pressed',String(active===c.id));t.append(node('strong','',c.title),node('small','',new Date(c.modified).toLocaleDateString('ko-KR')));t.onclick=()=>openChat(c.id);threads.append(t);}
            if(!list.length)threads.append(node('p','notice','아직 저장된 대화가 없어요.'));
        }
        if(view==='list'){if(threads)section.append(threads);$('characters').append(section);}
        else{
            if(index%columns===0){row=node('div','shelf-row');$('characters').append(row);openThreads=null;}
            row.append(b);if(threads)openThreads=threads;
            if((index%columns===columns-1||index===entries.length-1)&&openThreads)$('characters').append(openThreads);
        }
    }
    if(!groups.size)$('characters').append(node('p','notice',query?'검색 결과가 없어요.':'현재 실리에 등록된 캐릭터가 없어요.'));
}
function clearSelection(message){
    epoch++;loading=false;clearTimeout(saveTimer);scrollDirty=false;
    scroller.querySelectorAll('.avatar').forEach(el=>avatarObserver?.unobserve(el));
    window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice',message));
    active='';revision='';lastPosition=null;start=0;total=0;prefs.set('last','');
    $('title').textContent='대화를 골라 주세요';$('person').textContent='현재 실리의 책장';$('latest').hidden=true;$('first').hidden=true;
    status(message);if(matchMedia('(max-width:640px)').matches)fold(false);
}
function goHome(){
    setFocus(false);save();closeDialogs();prefs.set('view','home');prefs.set('character','');
    clearSelection('캐릭터를 골라 이야기를 펼쳐보세요.');character='';$('search').value='';fold(false);renderLists();
    if(unlocked)catalog().catch(e=>status(e.message));
}
$('home').onclick=goHome;
async function catalog(){
    const ticket=++catalogRequest,data=await api('/catalog');
    if(!unlocked||ticket!==catalogRequest)return false;
    if(!Array.isArray(data.characters))throw new Error('목록 갱신을 위해 서버 플러그인을 업데이트하고 재시작해 주세요.');
    chats=data.chats;people=data.characters;recentChats=data.recent||[];renderRecent();
    if(active&&!chats.some(c=>c.id===active))clearSelection('이 대화나 캐릭터는 현재 실리 목록에서 없어졌어요. 다른 대화를 골라 주세요.');
    if(character&&!people.some(p=>p.key===character))character='';
    renderLists();return true;
}
function renderChat(data,pos){
    if(data.displayPolicy!=='saved-display-v1')throw new Error('서버 플러그인과 화면 버전이 달라요. 서버를 업데이트한 뒤 재시작해 주세요.');
    scroller.querySelectorAll('.avatar').forEach(el=>avatarObserver?.unobserve(el));
    revision=data.revision;start=data.start;total=data.total;window.BookshopRich?.clear(scroller);scroller.replaceChildren();
    if(start>0){const b=node('button','page-button','이전 대화 읽기 ↑');b.onclick=()=>page(Math.max(0,start-30));scroller.append(b);}
    for(const m of data.messages){
        const item=node('article','message'+(m.user?' user':'')+(m.system?' system':''));item.dataset.index=String(m.index);
        const by=node('div','byline');
        const meta=chats.find(c=>c.id===active);
        if(!m.user&&!m.system)by.append(avatar(m.name,meta?.avatar,'avatar message-avatar'));
        by.append(node('span','',m.name),node('small','',m.system?'시스템 · '+m.date:m.date));const mark=node('button','bookmark-button','☆');mark.dataset.bookmarkIndex=m.index;mark.onclick=()=>editBookmark(m.index);by.append(mark);
        const bubble=node('div','bubble');item.append(by,bubble);scroller.append(item);
        if(typeof m.content==='string'){
            const content=node('div','message-content');bubble.append(content);
            if(m.content.trim())output(content,m.content);
            else content.append(node('p','notice','표시할 내용이 없는 메시지예요.'));
            for(const entry of m.translations||[]){
                const details=node('details','stored-translation'),summary=node('summary','',entry.label||'저장된 번역'),body=node('div','message-content');
                details.append(summary,body);bubble.append(details);output(body,entry.content);
            }
        }else{
            bubble.classList.add('awaiting');bubble.append(node('p','','이 메시지의 표시 설정을 확인해 주세요.'));
            bubble.append(node('small','',m.error||'메시지를 안전하게 처리하지 못했어요. 새로고침해 주세요.'));
        }

    }
    if(data.nextStart<total){const b=node('button','page-button','다음 대화 읽기 ↓');b.onclick=()=>page(data.nextStart);scroller.append(b);}
    if(!total)scroller.append(node('p','notice','아직 메시지가 없는 대화예요.'));
    if(data.skipped)scroller.append(node('p','notice','읽을 수 없는 줄 '+data.skipped+'개를 건너뛰었어요.'));
    $('latest').hidden=!total;$('first').hidden=!total;
    lastPosition=pos||data.saved||{index:start,fraction:0};
    restore(lastPosition);
    renderBookmarks();
    const blocked=data.messages.filter(m=>m.error).length;
    status(blocked?'현재 페이지 '+blocked+'개 표시 설정 확인 필요':'자동 업데이트 중 · '+total.toLocaleString()+'개 메시지');
}
async function openChat(id,requestedStart){
    const saving=save(),ticket=++epoch;loading=true;
    active=id;revision='';lastPosition=null;scrollDirty=false;
    const meta=chats.find(c=>c.id===id);if(meta){character=meta.characterKey||meta.character;$('person').textContent=meta.character+'와 나눈 대화';$('title').textContent=meta.title;}
    prefs.set('last',id);prefs.set('view','chat');prefs.set('character',character);renderLists();
    if(matchMedia('(max-width:640px)').matches)fold(true);
    window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice','대화를 불러오고 있어요…'));status('대화 불러오는 중');
    try{
        await Promise.race([saving,new Promise(resolve=>setTimeout(resolve,1000))]);
        if(!unlocked||ticket!==epoch)return;
        await ensureRenderer();
        if(!unlocked||ticket!==epoch)return;
        const pending=requestedStart===undefined?pendingPositions.get(id):null;
        const pageStart=requestedStart??pending?.index;
        const [data,marks]=await Promise.all([api('/chat?id='+encodeURIComponent(id)+(pageStart===undefined?'':'&start='+pageStart)),api('/bookmarks?id='+encodeURIComponent(id)),api('/visit',{id})]);
        if(!unlocked||ticket!==epoch)return;
        bookmarks=marks;
        renderChat(data,requestedStart===undefined?(pending||data.saved||{index:0,fraction:0}):{index:requestedStart,fraction:0});
    }catch(e){if(ticket===epoch){window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice',e.message));const retry=node('button','page-button','다시 불러오기');retry.onclick=()=>openChat(id,requestedStart);scroller.append(retry);status('불러오기 실패 · 다시 시도할 수 있어요.');}}
    finally{if(ticket===epoch)loading=false;}
}
async function page(n){await openChat(active,n);scrollDirty=true;await save();}
async function poll(){
    if(!unlocked||!active||loading||document.hidden||prefs.get('view','home')==='home'||!rendererReady())return;
    const ticket=epoch,id=active;
    try{
        const data=await api('/chat?id='+encodeURIComponent(id)+'&start='+start+'&revision='+encodeURIComponent(revision));
        if(ticket!==epoch||document.hidden||data.unchanged)return;
        const p=position();renderChat(data,p);
    }catch(e){if(ticket===epoch)status('연결을 기다리는 중 · '+e.message);}
}
async function enter(){
    unlocked=true;$('gate').hidden=true;$('library').hidden=false;$('password').value='';
    fold(prefs.get('collapsed','false')==='true');
    try{await catalog();const last=prefs.get('last','');if(location.hash!=='#home'&&prefs.get('view','home')==='chat'&&chats.some(c=>c.id===last))await openChat(last);else{prefs.set('view','home');character=prefs.get('character','');renderLists();fold(false);}}
    catch(e){status(e.message);}
    clearInterval(pollTimer);pollTimer=setInterval(poll,5000);
}
$('login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/login',{password:$('password').value});await enter();}catch(err){$('gate-status').textContent=err.message;}finally{b.disabled=false;}};
$('search').oninput=renderLists;
function readingChange(change){const p=position();change();applyReading();if(p)restore(p);}
$('font-size').onclick=()=>readingChange(()=>{font=({15:16,16:18,18:20,20:15})[font];prefs.set('font',String(font));});
$('reading-size').onchange=()=>readingChange(()=>{font=Number($('reading-size').value);prefs.set('font',String(font));});
$('font-family').onchange=()=>readingChange(()=>{fontFamily=$('font-family').value;prefs.set('font-family',fontFamily);});
$('reading-bold').onchange=()=>readingChange(()=>prefs.set('bold',String($('reading-bold').checked)));
$('refresh').onclick=async()=>{
    const button=$('refresh');button.disabled=true;
    try{
        // Invalidate queued/in-flight photo results as well as cached successes.
        authEpoch++;avatarObserver?.disconnect();avatarQueue.splice(0).forEach(job=>job.resolve(null));avatarCache.clear();avatarFailures.clear();
        await save();if(!unlocked)return;
        const changed=await catalog();if(!changed)return;
        if(active&&prefs.get('view','home')==='chat')await openChat(active);else status('현재 실리 목록으로 새로고침했어요.');
    }catch(e){status('새로고침 실패 · '+e.message);}finally{button.disabled=false;}
};
$('theme').onchange=()=>{const p=position(),value=$('theme').value;if(!Object.hasOwn(themeNames,value))return;document.documentElement.dataset.theme=value;prefs.set('theme',value);window.BookshopRich?.refresh(scroller);if(p)restore(p);};
$('first').onclick=()=>page(0);
$('latest').onclick=()=>page(Math.max(0,total-1));
$('lock').onclick=async()=>{const saving=save();gate('책방을 잠그고 있어요.');try{await Promise.race([saving,new Promise(resolve=>setTimeout(resolve,1500))]);await api('/logout',{});$('gate-status').textContent='책방을 잠갔어요.';}catch(e){$('gate-status').textContent='화면은 가렸지만 서버 로그아웃을 확인하지 못했어요. 연결 후 다시 확인해 주세요.';}};
scroller.addEventListener('scroll',()=>{if(restoring||loading||!active)return;scrollDirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),650);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);else if(unlocked){if(active&&!scrollDirty&&prefs.get('view','home')==='chat')openChat(active);else poll();}});
window.addEventListener('pagehide',()=>save(true));
setInterval(()=>{if(unlocked&&!document.hidden)catalog().catch(e=>status(e.message));},30000);
window.BookshopReady=true;
(async()=>{try{const state=await api('/status');$('app-version').textContent='서버 '+state.version+' · 화면 0.7.1';if(state.authenticated)await enter();else $('gate-status').textContent=state.configured?'비밀번호를 입력하면 이야기가 열려요.':'먼저 터먹스에서 setup.cjs로 책방 비밀번호를 설정해 주세요.';}catch(e){$('gate-status').textContent=e.message+'\n실리 로그인 후 이 주소로 돌아와 주세요.';}routeIntent();})();
})();
