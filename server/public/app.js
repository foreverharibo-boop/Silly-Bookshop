'use strict';
(() => {
const $=id=>document.getElementById(id), base='/api/plugins/sili-library';
const prefs={get(k,f){try{return localStorage.getItem('sili-library:'+k)||f;}catch{return f;}},set(k,v){try{localStorage.setItem('sili-library:'+k,v);}catch{}}};
let chats=[],active='',character='',revision='',start=0,total=0,epoch=0,loading=false,unlocked=false,restoring=false;
let saveTimer,pollTimer,csrf='',lastPosition=null,scrollDirty=false;
const avatarCache=new Map();
const scroller=$('transcript');
let font=Number(prefs.get('font','16')),display=prefs.get('display-v3','all');
if(![15,16,18,20].includes(font))font=16;
document.documentElement.style.setProperty('--reading-size',font+'px');
document.documentElement.dataset.theme=prefs.get('theme',matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
const modes={all:'모두 보기',display:'실리 화면',original:'원문'};
if(!modes[display])display='all';
$('display-mode').textContent=modes[display];
function status(text){$('status').textContent=text;}
function gate(message){unlocked=false;epoch++;$('library').hidden=true;$('gate').hidden=false;$('gate-status').textContent=message;clearTimeout(saveTimer);clearInterval(pollTimer);scrollDirty=false;BookshopRich.clear(scroller);scroller.replaceChildren();$('characters').replaceChildren();for(const pending of avatarCache.values())pending.then(url=>{if(url)URL.revokeObjectURL(url);});avatarCache.clear();$('title').textContent='어떤 이야기를 펼쳐볼까요?';$('person').textContent='나만의 작은 책방';$('search').value='';chats=[];active='';character='';lastPosition=null;revision='';csrf='';}
async function api(route,body,keepalive=false){
    const options={credentials:'same-origin',cache:'no-store',redirect:'error'};
    if(body!==undefined){
        if(!csrf){const tokenResponse=await fetch('/csrf-token',{credentials:'same-origin',cache:'no-store'});csrf=(await tokenResponse.json()).token;}
        Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,'X-Sili-Request':'1'},body:JSON.stringify(body),keepalive});
    }
    const response=await fetch(base+route,options);
    let data;try{data=await response.json();}catch{throw new Error('실리 로그인이 필요하거나 서버 응답을 읽을 수 없습니다.');}
    if(!response.ok){if(response.status===401&&route!=='/login')gate('다시 책방 잠금을 풀어 주세요.');if(response.status===403)csrf='';throw new Error(data.error||'요청에 실패했습니다.');}
    return data;
}
function node(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function avatar(name,file,className='avatar'){
    const box=node('span',className,Array.from(name)[0]||'·');
    if(file){const img=node('img');img.alt=name+' 프로필';img.loading='lazy';img.onerror=()=>img.remove();
        if(!avatarCache.has(file))avatarCache.set(file,fetch(base+'/avatar?name='+encodeURIComponent(file),{credentials:'same-origin',cache:'no-store'}).then(async r=>r.ok?URL.createObjectURL(await r.blob()):null).catch(()=>null));
        avatarCache.get(file).then(url=>{if(url&&unlocked){img.src=url;box.append(img);}});
    }
    return box;
}
function layoutChange(change){const p=restoring?lastPosition:position();change();if(p)restore(p);}
function output(host,text,rendered=false){BookshopRich.mount(host,text,{rendered,onResize:layoutChange});}
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
    const query=$('search').value.trim().toLowerCase();
    const visible=chats.filter(c=>(c.character+' '+c.title).toLowerCase().includes(query));
    const groups=new Map();for(const c of visible){if(!groups.has(c.character))groups.set(c.character,[]);groups.get(c.character).push(c);}
    $('count').textContent=String(groups.size);$('characters').replaceChildren();
    let n=0;
    for(const [name,list]of groups){
        const section=node('section','character-group'),b=node('button','character');
        const expanded=name===character,id='threads-'+n++;
        b.setAttribute('aria-expanded',String(expanded));b.setAttribute('aria-controls',id);b.setAttribute('aria-pressed',String(expanded));
        b.append(avatar(name,list[0].avatar),node('span','character-name',name),node('small','',String(list.length)),node('span','chevron',expanded?'⌃':'⌄'));
        b.onclick=()=>{character=character===name?'':name;renderLists();};section.append(b);
        if(expanded){const threads=node('nav','threads');threads.id=id;threads.setAttribute('aria-label',name+' 대화 목록');
            for(const c of list){const t=node('button','thread');t.setAttribute('aria-pressed',String(active===c.id));t.append(node('strong','',c.title),node('small','',new Date(c.modified).toLocaleDateString('ko-KR')));t.onclick=()=>openChat(c.id);threads.append(t);}
            section.append(threads);
        }
        $('characters').append(section);
    }
    if(!visible.length)$('characters').append(node('p','notice',query?'검색 결과가 없어요.':'저장된 채팅이 아직 없어요.'));
}
async function catalog(){const ticket=epoch,data=await api('/catalog');if(!unlocked||ticket!==epoch)return;chats=data.chats;renderLists();}
function renderChat(data,pos){
    revision=data.revision;start=data.start;total=data.total;BookshopRich.clear(scroller);scroller.replaceChildren();
    if(start>0){const b=node('button','page-button','이전 대화 읽기 ↑');b.onclick=()=>page(Math.max(0,start-120));scroller.append(b);}
    for(const m of data.messages){
        const item=node('article','message'+(m.user?' user':'')+(m.system?' system':''));item.dataset.index=String(m.index);
        const by=node('div','byline');
        const meta=chats.find(c=>c.id===active);
        if(!m.user&&!m.system)by.append(avatar(m.name,meta?.avatar,'avatar message-avatar'));
        by.append(node('span','',m.name),node('small','',m.system?'시스템 · '+m.date:m.date));
        const bubble=node('div','bubble');item.append(by,bubble);scroller.append(item);
        const variants=m.translations||[],preferred=m.displayText??variants[0]?.text??m.text;
        const mainText=display==='original'?m.text:preferred;
        const captured=display!=='original'&&typeof m.renderedHtml==='string';
        if(captured)bubble.append(node('p','variant-label','실리 화면'));
        else if(mainText!==m.text)bubble.append(node('p','variant-label','번역 · 표시문'));
        const content=node('div','message-content');bubble.append(content);output(content,captured?m.renderedHtml:mainText,captured);
        if(display==='all'){
            for(const variant of variants){
                if(!captured&&variant.text===mainText)continue;
                const block=node('section','translation-block');block.append(node('p','variant-label',variant.label));const body=node('div','message-content');block.append(body);bubble.append(block);output(body,variant.text);
            }
            if(captured||mainText!==m.text){const original=node('details','original-output');original.append(node('summary','','원문 펼치기'));const body=node('div','message-content');original.append(body);let drawn=false;original.addEventListener('toggle',()=>{if(original.open&&!drawn){drawn=true;output(body,m.text);}});bubble.append(original);}
        }
        if(/<[^>]+>/.test(m.text)||captured){const source=node('details','source-output');source.append(node('summary','','저장된 원문 코드'));source.append(node('pre','',m.text));bubble.append(source);}

    }
    if(data.nextStart<total){const b=node('button','page-button','다음 대화 읽기 ↓');b.onclick=()=>page(data.nextStart);scroller.append(b);}
    if(!total)scroller.append(node('p','notice','아직 메시지가 없는 대화예요.'));
    if(data.skipped)scroller.append(node('p','notice','읽을 수 없는 줄 '+data.skipped+'개를 건너뛰었어요.'));
    $('latest').hidden=!total;
    lastPosition=pos||data.saved;
    restore(lastPosition);
    status(data.skipped?'일부 줄을 읽지 못했어요. 원본 파일은 변경하지 않았어요.':'자동 연동 중 · '+total.toLocaleString()+'개 메시지');
}
async function openChat(id,requestedStart){
    await save();const ticket=++epoch;loading=true;
    active=id;revision='';lastPosition=null;scrollDirty=false;
    const meta=chats.find(c=>c.id===id);if(meta){character=meta.character;$('person').textContent=meta.character+'와 나눈 대화';$('title').textContent=meta.title;}
    prefs.set('last',id);renderLists();
    if(matchMedia('(max-width:640px)').matches)fold(true);
    BookshopRich.clear(scroller);scroller.replaceChildren(node('p','notice','이야기를 펼치고 있어요…'));status('대화 불러오는 중');
    try{
        const data=await api('/chat?id='+encodeURIComponent(id)+(requestedStart===undefined?'':'&start='+requestedStart));
        if(ticket!==epoch)return;
        renderChat(data,requestedStart===undefined?data.saved:{index:requestedStart,fraction:0});
    }catch(e){if(ticket===epoch){scroller.replaceChildren(node('p','notice',e.message));status('대화를 불러오지 못했어요.');}}
    finally{if(ticket===epoch)loading=false;}
}
async function page(n){await openChat(active,n);scrollDirty=true;await save();}
async function poll(){
    if(!unlocked||!active||loading||document.hidden)return;
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
$('font-size').onclick=()=>{const p=position();font=({15:16,16:18,18:20,20:15})[font];prefs.set('font',String(font));document.documentElement.style.setProperty('--reading-size',font+'px');$('font-size').textContent='가 '+font;BookshopRich.refresh(scroller);restore(p);};
$('display-mode').onclick=async()=>{display=({all:'display',display:'original',original:'all'})[display];prefs.set('display-v3',display);$('display-mode').textContent=modes[display];revision='';await poll();};
$('theme').onclick=()=>{const value=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=value;prefs.set('theme',value);BookshopRich.refresh(scroller);};
$('latest').onclick=()=>page(Math.max(0,total-1));
$('lock').onclick=async()=>{const saving=save();gate('책방을 잠그고 있어요.');try{await Promise.race([saving,new Promise(resolve=>setTimeout(resolve,1500))]);await api('/logout',{});$('gate-status').textContent='책방을 잠갔어요.';}catch(e){$('gate-status').textContent='화면은 가렸지만 서버 로그아웃을 확인하지 못했어요. 연결 후 다시 확인해 주세요.';}};
scroller.addEventListener('scroll',()=>{if(restoring||loading||!active)return;scrollDirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),650);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)save(true);else if(unlocked){if(active&&!scrollDirty)openChat(active);else poll();}});
window.addEventListener('pagehide',()=>save(true));
setInterval(()=>{if(unlocked&&!document.hidden)catalog().catch(e=>status(e.message));},30000);
(async()=>{try{const state=await api('/status');if(state.authenticated)await enter();else $('gate-status').textContent=state.configured?'비밀번호를 입력하면 이야기가 열려요.':'먼저 터먹스에서 setup.cjs로 책방 비밀번호를 설정해 주세요.';}catch(e){$('gate-status').textContent=e.message+'\n실리 로그인 후 이 주소로 돌아와 주세요.';}})();
})();
