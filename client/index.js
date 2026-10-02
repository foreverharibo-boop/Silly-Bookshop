/* Read-only observer: never changes chat, settings, presets, or generation APIs. */
(() => {
    'use strict';
    const BASE='/api/plugins/sili-library',PREF='silly-bookshop:capture-enabled';
    let enabled=true;try{enabled=localStorage.getItem(PREF)!=='false';}catch{}
    let busy=false,lastChat='',dirty=true,observed=null,statusNode=null,mutation=0;
    const sent=new Map(),observer=new MutationObserver(()=>{dirty=true;mutation++;});
    const props=['color','background-color','background-image','border-top','border-right','border-bottom','border-left','border-radius','box-shadow','padding','margin','display','flex-direction','flex-wrap','align-items','justify-content','gap','grid-template-columns','grid-template-rows','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration','white-space','opacity','max-width','min-width','overflow-wrap'];
    function say(text){if(statusNode)statusNode.textContent=text;}
    function identity(ctx){
        const name=ctx.getCurrentChatId?.()??ctx.chatId;
        if(typeof name!=='string'||!name)return '';
        const file=name.endsWith('.jsonl')?name:name+'.jsonl';
        const avatar=ctx.characters?.[ctx.characterId]?.avatar;
        const parts=ctx.groupId!=null&&ctx.groupId!==''?['group',file]:typeof avatar==='string'?['chat',avatar.replace('.png',''),file]:null;
        if(!parts)return '';
        const bytes=new TextEncoder().encode(JSON.stringify(parts));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
        return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    }
    function snapshot(element,depth=0){
        if(depth>3)throw new Error('중첩 프레임이 너무 깊어 화면을 연동하지 못했어요.');
        for(let parent=element.parentElement;parent&&parent.id!=='chat';parent=parent.parentElement){
            const style=getComputedStyle(parent);
            if(parent.hidden||style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0)return '';
        }
        const clone=element.cloneNode(true),originals=[element,...element.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
        if(originals.length>4000)throw new Error('요소가 너무 많아 화면 연동을 기다리고 있어요.');
        for(let i=0;i<originals.length;i++){
            const original=originals[i],copy=copies[i],style=getComputedStyle(original);
            // Remove invisible source nodes before serialization; never ship hidden reasoning.
            if(original.hidden||original.getAttribute('aria-hidden')==='true'||style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0){if(i===0)return '';copy.remove();continue;}
            // Only message content is cloned. Freeze its visual styles, never handlers.
            for(const attr of [...copy.attributes])if(/^(?:on|data-)/i.test(attr.name)||['contenteditable','autofocus'].includes(attr.name))copy.removeAttribute(attr.name);
            if(['SCRIPT','LINK','META','BASE','OBJECT','EMBED','FORM','INPUT','TEXTAREA','SELECT','BUTTON'].includes(copy.tagName)){copy.remove();continue;}
            if(copy.tagName==='IFRAME'){
                const replacement=document.createElement('div');
                try{const body=original.contentDocument?.body;if(body)replacement.innerHTML=snapshot(body,depth+1);else replacement.textContent='이 외부 프레임은 별도 실행이 필요해요.';}catch{replacement.textContent='이 외부 프레임은 별도 실행이 필요해요.';}
                copy.replaceWith(replacement);continue;
            }
            for(const prop of props){const value=style.getPropertyValue(prop);if(value)copy.style.setProperty(prop,value);}
            // Remove viewport-dependent placement; preserve layout inside the bubble.
            copy.style.removeProperty('position');copy.style.removeProperty('height');
            copy.style.removeProperty('width');copy.style.removeProperty('transform');
            if(copy.tagName==='IMG'){
                try{const url=new URL(original.currentSrc||original.src,location.href);if(url.origin!==location.origin&&!url.protocol.startsWith('data'))throw 0;
                    if(!original.complete||!original.naturalWidth||original.naturalWidth*original.naturalHeight>4000000)throw 0;
                    const canvas=document.createElement('canvas');canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;canvas.getContext('2d').drawImage(original,0,0);copy.src=canvas.toDataURL('image/png');copy.removeAttribute('srcset');
                }catch{copy.removeAttribute('src');copy.removeAttribute('srcset');copy.alt=original.alt||'외부 이미지';}
            }
        }
        const walker=document.createTreeWalker(clone,NodeFilter.SHOW_COMMENT),comments=[];
        while(walker.nextNode())comments.push(walker.currentNode);
        comments.forEach(comment=>comment.remove());
        return clone.outerHTML;
    }
    function panel(){
        if(document.getElementById('silly-bookshop-bridge'))return;
        const parent=document.getElementById('extensions_settings');if(!parent)return;
        const box=document.createElement('div');box.id='silly-bookshop-bridge';box.className='inline-drawer';
        const heading=document.createElement('b');heading.textContent='실리 책방 · 화면 연동 (0.3.1)';
        const label=document.createElement('label');label.className='checkbox_label';const check=document.createElement('input');check.type='checkbox';check.checked=enabled;
        check.onchange=()=>{enabled=check.checked;try{localStorage.setItem(PREF,String(enabled));}catch{}dirty=true;say(enabled?'열린 대화를 자동 연동해요.':'자동 연동을 껐어요.');};
        label.append(check,document.createTextNode('열린 메시지의 번역·HTML 화면 자동 연동'));
        statusNode=document.createElement('small');statusNode.setAttribute('role','status');
        const button=document.createElement('button');button.type='button';button.className='menu_button';button.textContent='지금 다시 연동';button.onclick=()=>{sent.clear();dirty=true;tick();};
        box.append(heading,label,statusNode,button);parent.append(box);say('열어 본 메시지부터 책방에 연동해요.');
    }
    async function tick(){
        panel();if(!enabled||busy||document.hidden)return;
        const ctx=window.SillyTavern?.getContext?.();if(!ctx?.chat||ctx.streamingProcessor&&!ctx.streamingProcessor.isFinished&&!ctx.streamingProcessor.isStopped)return;
        const container=document.getElementById('chat');
        if(container!==observed){observer.disconnect();observed=container;if(container)observer.observe(container,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style','src','open']});dirty=true;}
        const id=identity(ctx);if(!id||!container)return;
        if(id!==lastChat){sent.clear();lastChat=id;dirty=true;}
        if(!dirty)return;
        busy=true;const observedMutation=mutation;
        try{
            const items=[],signatures=new Map();let bytes=0,remaining=false;
            for(const element of container.querySelectorAll('.mes[mesid]')){
                const index=Number(element.getAttribute('mesid')),m=ctx.chat[index],body=element.querySelector('.mes_text');
                if(!m||typeof m.mes!=='string'||!body||element.querySelector('.mes_edit_textarea'))continue;
                const signature=JSON.stringify([body.innerHTML,m.mes,m.extra?.display_text??null,m.swipe_id??null,m.send_date??null]);
                if(sent.get(index)===signature)continue;
                const item={index,sourceText:m.mes,displayText:typeof m.extra?.display_text==='string'?m.extra.display_text:null,name:String(m.name||(m.is_user?'나':'캐릭터')),user:!!m.is_user,date:String(m.send_date||''),html:snapshot(body)};
                const size=new TextEncoder().encode(JSON.stringify(item)).length;
                if(new TextEncoder().encode(item.html).length>512*1024||size>950000){say('화면이 512KB를 넘어 연동하지 못했어요. 원문은 노출하지 않아요.');continue;}
                if(items.length>=8||bytes+size>950000){remaining=true;break;}
                bytes+=size;items.push(item);signatures.set(index,signature);
            }
            if(!items.length){dirty=false;return;}
            const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let response;
            try{response=await fetch(BASE+'/capture',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{...ctx.getRequestHeaders(),'Content-Type':'application/json','X-Sili-Request':'1'},body:JSON.stringify({id,items,schema:2}),signal:controller.signal});}finally{clearTimeout(timer);}
            const result=await response.json();if(!response.ok)throw new Error(result.error||'책방 서버 연결을 확인해 주세요.');
            if(lastChat!==id)return;
            for(const index of result.accepted)sent.set(index,signatures.get(index));
            dirty=remaining||mutation!==observedMutation||result.accepted.length!==items.length;
            say(result.accepted.length?'화면 연동됨 · '+sent.size+'개 메시지':'실리의 채팅 저장을 기다리고 있어요. 저장 후 다시 연동해요.');
        }catch(e){dirty=true;say(e.name==='AbortError'?'화면 전송 시간이 초과됐어요. 자동으로 다시 시도해요.':e.message||'책방 서버 연결을 확인해 주세요.');}
        finally{busy=false;}
    }
    setInterval(tick,5000);setTimeout(tick,1200);
})();
