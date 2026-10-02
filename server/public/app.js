'use strict';
(() => {
const $=id=>document.getElementById(id), base='/api/plugins/sili-library';
const prefs={get(k,f){try{return localStorage.getItem('sili-library:'+k)||f;}catch{return f;}},set(k,v){try{localStorage.setItem('sili-library:'+k,v);}catch{}}};
let people=[],catalogRequest=0,chats=[],active='',character='',revision='',start=0,total=0,epoch=0,loading=false,unlocked=false,restoring=false;
let saveTimer,pollTimer,csrf='',lastPosition=null,scrollDirty=false;
const avatarCache=new Map(),avatarFailures=new Map(),avatarQueue=[];let avatarBusy=0,authEpoch=0;
const scroller=$('transcript');
let font=Number(prefs.get('font','16'));
const UI_VERSION='0.4.1-test.1';
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
document.documentElement.dataset.theme=prefs.get('theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
function status(text){$('status').textContent=text;}
function gate(message){unlocked=false;epoch++;catalogRequest++;authEpoch++;avatarObserver?.disconnect();avatarQueue.splice(0).forEach(job=>job.resolve(null));avatarFailures.clear();$('library').hidden=true;$('gate').hidden=false;$('gate-status').textContent=message;clearTimeout(saveTimer);clearInterval(pollTimer);scrollDirty=false;window.BookshopRich?.clear(scroller);scroller.replaceChildren();$('characters').replaceChildren();avatarCache.clear();$('title').textContent='어떤 이야기를 펼쳐볼까요?';$('person').textContent='나만의 작은 책방';$('search').value='';people=[];chats=[];active='';character='';lastPosition=null;revision='';csrf='';}
async function request(url,options={},timeout=20000){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
    try{const r=await fetch(url,{...options,signal:controller.signal});const bytes=await r.arrayBuffer();return {ok:r.ok,status:r.status,headers:r.headers,bytes};}
    catch(e){if(e.name==='AbortError')throw new Error('서버 응답 시간이 초과됐어요. 서버 연결을 확인하고 다시 시도해 주세요.');throw e;}
    finally{clearTimeout(timer);}
}
async function api(route,body,keepalive=false){
    const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
    if(body!==undefined){
        if(!csrf){const response=await request('/csrf-token',{credentials:'same-origin',cache:'no-store'});try{csrf=JSON.parse(new TextDecoder().decode(response.bytes)).token;}catch{throw new Error('실리 로그인이 필요해요. 실리 로그인 화면을 먼저 열어 주세요.');}}
        Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Sili-Request':'1'},body:JSON.stringify(body),keepalive});
    }
    const response=await request(base+route,options);
    let data;try{data=JSON.parse(new TextDecoder().decode(response.bytes));}catch{throw new Error('실리 로그인 화면으로 이동했거나 서버가 잘못된 응답을 보냈어요.');}
    if(!response.ok){if(response.status===401&&route!=='/login')gate('다시 책방 잠금을 풀어 주세요.');if(response.status===403)csrf='';throw new Error(data.error||'요청에 실패했습니다.');}
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
    if(el){const r=el.getBoundingClientRect();scroller.scrollTop+=r.top-scroller.getBoundingClientRect().top+pos.fraction*r.height;}
    else scroller.scrollTop=0;
    requestAnimationFrame(()=>requestAnimationFrame(()=>{restoring=false;}));
}
async function save(keepalive=false){
    clearTimeout(saveTimer);
    if(!unlocked||!active||!scrollDirty)return;
    const pos=position(),id=active;if(!pos)return;
    scrollDirty=false;lastPosition=pos;
    try{await api('/position',{id,position:pos},keepalive);if(id===active)status('읽던 위치 저장됨 · 자동 연동 중');}
    catch(e){if(id===active){scrollDirty=true;status('위치 저장 실패 · '+e.message);}}
}
function fold(value){const p=position();$('library').classList.toggle('collapsed',value);$('fold').setAttribute('aria-expanded',String(!value));$('fold').setAttribute('aria-label',value?'목록 펼치기':'목록 접기');prefs.set('collapsed',String(value));if(active&&p)restore(p);}
$('fold').onclick=()=>fold(!$('library').classList.contains('collapsed'));
function renderLists(){
    $('characters').querySelectorAll('.avatar').forEach(el=>avatarObserver?.unobserve(el));
    const query=$('search').value.trim().toLowerCase(),groups=new Map();
    for(const person of people){
        const own=chats.filter(c=>(c.characterKey||c.character)===person.key);
        const list=person.character.toLowerCase().includes(query)?own:own.filter(c=>c.title.toLowerCase().includes(query));
        if(!query||person.character.toLowerCase().includes(query)||list.length)groups.set(person.key,{person,list});
    }
    $('count').textContent=String(groups.size);$('characters').replaceChildren();let n=0;
    for(const [key,{person,list}]of groups){
        const name=person.character,section=node('section','character-group'),b=node('button','character');
        const expanded=key===character,id='threads-'+n++;
        b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-controls',id);b.setAttribute('aria-pressed',String(expanded));
        b.append(avatar(name,person.avatar),node('span','character-name',name),node('small','',String(list.length)),node('span','chevron',expanded?'⌃':'⌄'));
        b.onclick=()=>{character=character===key?'':key;renderLists();};section.append(b);
        if(expanded){const threads=node('nav','threads');threads.id=id;threads.setAttribute('aria-label',name+' 대화 목록');
            for(const c of list){const t=node('button','thread');t.setAttribute('aria-pressed',String(active===c.id));t.append(node('strong','',c.title),node('small','',new Date(c.modified).toLocaleDateString('ko-KR')));t.onclick=()=>openChat(c.id);threads.append(t);}
            if(!list.length)threads.append(node('p','notice','아직 저장된 대화가 없어요.'));
            section.append(threads);
        }
        $('characters').append(section);
    }
    if(!groups.size)$('characters').append(node('p','notice',query?'검색 결과가 없어요.':'현재 실리에 등록된 캐릭터가 없어요.'));
}
function clearSelection(message){
    epoch++;loading=false;clearTimeout(saveTimer);scrollDirty=false;
    scroller.querySelectorAll('.avatar').forEach(el=>avatarObserver?.unobserve(el));
    window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice',message));
    active='';revision='';lastPosition=null;start=0;total=0;prefs.set('last','');
    $('title').textContent='대화를 골라 주세요';$('person').textContent='현재 실리의 책장';$('latest').hidden=true;
    status(message);if(matchMedia('(max-width:640px)').matches)fold(false);
}
async function catalog(){
    const ticket=++catalogRequest,data=await api('/catalog');
    if(!unlocked||ticket!==catalogRequest)return false;
    if(!Array.isArray(data.characters))throw new Error('목록 갱신을 위해 서버 플러그인을 업데이트하고 재시작해 주세요.');
    chats=data.chats;people=data.characters;
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
        by.append(node('span','',m.name),node('small','',m.system?'시스템 · '+m.date:m.date));
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
    $('latest').hidden=!total;
    lastPosition=pos||data.saved;
    restore(lastPosition);
    const blocked=data.messages.filter(m=>m.error).length;
    status(blocked?'현재 페이지 '+blocked+'개 표시 설정 확인 필요':'자동 업데이트 중 · '+total.toLocaleString()+'개 메시지');
}
async function openChat(id,requestedStart){
    const saving=save(),ticket=++epoch;loading=true;
    active=id;revision='';lastPosition=null;scrollDirty=false;
    const meta=chats.find(c=>c.id===id);if(meta){character=meta.characterKey||meta.character;$('person').textContent=meta.character+'와 나눈 대화';$('title').textContent=meta.title;}
    prefs.set('last',id);renderLists();
    if(matchMedia('(max-width:640px)').matches)fold(true);
    window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice','대화를 불러오고 있어요…'));status('대화 불러오는 중');
    try{
        await Promise.race([saving,new Promise(resolve=>setTimeout(resolve,1000))]);
        if(!unlocked||ticket!==epoch)return;
        await ensureRenderer();
        if(!unlocked||ticket!==epoch)return;
        const data=await api('/chat?id='+encodeURIComponent(id)+(requestedStart===undefined?'':'&start='+requestedStart));
        if(!unlocked||ticket!==epoch)return;
        renderChat(data,requestedStart===undefined?data.saved:{index:requestedStart,fraction:0});
    }catch(e){if(ticket===epoch){window.BookshopRich?.clear(scroller);scroller.replaceChildren(node('p','notice',e.message));const retry=node('button','page-button','다시 불러오기');retry.onclick=()=>openChat(id,requestedStart);scroller.append(retry);status('불러오기 실패 · 다시 시도할 수 있어요.');}}
    finally{if(ticket===epoch)loading=false;}
}
async function page(n){await openChat(active,n);scrollDirty=true;await save();}
async function poll(){
    if(!unlocked||!active||loading||document.hidden||!rendererReady())return;
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
    try{await catalog();const last=prefs.get('last','');if(chats.some(c=>c.id===last))await openChat(last);else if(matchMedia('(max-width:640px)').matches)fold(false);}
    catch(e){status(e.message);}
    clearInterval(pollTimer);pollTimer=setInterval(poll,5000);
}
$('login-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('/login',{password:$('password').value});await enter();}catch(err){$('gate-status').textContent=err.message;}finally{b.disabled=false;}};
$('search').oninput=renderLists;
$('font-size').onclick=()=>{const p=position();font=({15:16,16:18,18:20,20:15})[font];prefs.set('font',String(font));document.documentElement.style.setProperty('--reading-size',font+'px');$('font-size').textContent='가 '+font;window.BookshopRich?.refresh(scroller);restore(p);};
$('refresh').onclick=async()=>{
    const button=$('refresh');button.disabled=true;
    try{
        // Invalidate queued/in-flight photo results as well as cached successes.
        authEpoch++;avatarObserver?.disconnect();avatarQueue.splice(0).forEach(job=>job.resolve(null));avatarCache.clear();avatarFailures.clear();
        await save();if(!unlocked)return;
        const changed=await catalog();if(!changed)return;
        if(active)await openChat(active);else status('현재 실리 목록으로 새로고침했어요.');
    }catch(e){status('새로고침 실패 · '+e.message);}finally{button.disabled=false;}
};
$('theme').onclick=()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=value;prefs.set('theme',value);window.BookshopRich?.refresh(scroller);};
$('latest').onclick=()=>page(Math.max(0,total-1));
$('lock').onclick=async()=>{const saving=save();gate('책방을 잠그고 있어요.');try{await Promise.race([saving,new Promise(resolve=>setTimeout(resolve,1500))]);await api('/logout',{});$('gate-status').textContent='책방을 잠갔어요.';}catch(e){$('gate-status').textContent='화면은 가렸지만 서버 로그아웃을 확인하지 못했어요. 연결 후 다시 확인해 주세요.';}};
scroller.addEventListener('scroll',()=>{if(restoring||loading||!active)return;scrollDirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),650);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);else if(unlocked){if(active&&!scrollDirty)openChat(active);else poll();}});
window.addEventListener('pagehide',()=>save(true));
setInterval(()=>{if(unlocked&&!document.hidden)catalog().catch(e=>status(e.message));},30000);
(async()=>{try{const state=await api('/status');$('app-version').textContent='서버 '+state.version+' · 화면 0.4.1';if(state.authenticated)await enter();else $('gate-status').textContent=state.configured?'비밀번호를 입력하면 이야기가 열려요.':'먼저 터먹스에서 setup.cjs로 책방 비밀번호를 설정해 주세요.';}catch(e){$('gate-status').textContent=e.message+'\n실리 로그인 후 이 주소로 돌아와 주세요.';}})();
})();
