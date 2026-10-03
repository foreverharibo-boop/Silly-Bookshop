'use strict';
// No remote assets and no code supplied by chat messages executes in this reader.
window.BookshopRich=(()=>{
    // Script-disabled message frames cannot reliably use the service worker on a cold
    // offline start. Supply only bundled, allowlisted font bytes from the parent.
    const fontResources={gothic:['Gothic','NanumGothic'],myeongjo:['Myeongjo','NanumMyeongjo'],batang:['Batang','GowunBatang'],ridi:['RIDI','RIDIBatang'],pretendard:['Pretendard','Pretendard'],plex:['Plex','IBMPlexSansKR'],dodum:['Dodum','GowunDodum'],hahmlet:['Hahmlet','Hahmlet']};
    const fontBytes=new Map();
    function bundledFont(file){
        if(!fontBytes.has(file))fontBytes.set(file,(async()=>{
            const url=new URL('/api/plugins/silly-bookshop/fonts/'+file+'.woff2',location.origin).href;
            let response;try{if('caches'in window)response=await caches.match(url);}catch{}
            if(!response)response=await fetch(url,{credentials:'same-origin'});
            if(!response.ok)throw Error('Bundled font unavailable');return response.arrayBuffer();
        })().catch(error=>{fontBytes.delete(file);throw error;}));
        return fontBytes.get(file);
    }
    async function syncFonts(frame){
        const doc=frame.contentDocument,key=document.documentElement.dataset.readingFont,entry=fontResources[key];
        if(!doc||!entry)return;
        const [family,file]=entry,weights=key==='hahmlet'?[['Variable','100 900']]:['ridi','dodum'].includes(key)?[['Regular','400']]:[['Regular','400'],['Bold','700']];
        const installed=frame._bookshopFontLoads??=new Map();
        if(!installed.has(key))installed.set(key,Promise.all(weights.map(async([suffix,weight])=>{
            const bytes=await bundledFont(file+'-'+suffix);if(!frame.isConnected||frame.contentDocument!==doc)return;
            const face=new FontFace('Bookshop '+family,bytes,{weight,style:'normal',display:'swap'});await face.load();doc.fonts.add(face);
        })).catch(error=>{installed.delete(key);throw error;}));
        return installed.get(key);
    }
    const forbidden=['script','iframe','frame','frameset','object','embed','base','meta','link','form','input','textarea','select','button','audio','video','source','track','animate','animatetransform','set','foreignobject'];
    const config={FORBID_TAGS:forbidden,FORBID_ATTR:['srcset','href','xlink:href','action','formaction','poster','background','ping','autofocus','tabindex','contenteditable','is'],ADD_TAGS:['style'],ADD_ATTR:['style','open'],FORCE_BODY:true};
    const networkValue=/url\s*\(|image-set\s*\(|https?:|\/\/|\\/i;
    function cleanDeclarations(style){for(const name of Array.from(style))if(networkValue.test(style.getPropertyValue(name)))style.removeProperty(name);return style.cssText;}
    function cleanSheet(css){
        try{const sheet=new CSSStyleSheet();sheet.replaceSync(css);
            function rules(list){return Array.from(list).map(rule=>{if([3,10].includes(rule.type))return '';if(rule.style)cleanDeclarations(rule.style);if(rule.cssRules?.length){const head=rule.cssText.slice(0,rule.cssText.indexOf('{'));return head+'{'+(rule.style?.cssText||'')+rules(rule.cssRules)+'}';}return networkValue.test(rule.cssText)?'':rule.cssText;}).join('\n');}
            return rules(sheet.cssRules);
        }catch{return '';}
    }
    DOMPurify.addHook('uponSanitizeElement',el=>{if(el.tagName?.toLowerCase()==='style')el.textContent=cleanSheet(el.textContent);});
    DOMPurify.addHook('uponSanitizeAttribute',(el,data)=>{
        if(data.attrName==='src'&&!/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(data.attrValue))data.keepAttr=false;
        if(data.attrName==='style'){const style=document.createElement('span').style;style.cssText=data.attrValue;data.attrValue=cleanDeclarations(style);}
    });
    const converter=new showdown.Converter({tables:true,strikethrough:true,simpleLineBreaks:true,ghCodeBlocks:true,backslashEscapesHTMLTags:true});
    function mount(host,text,{onResize=change=>change(),rendered=false}={}){
        // HTML output fenced by chat models is intended as a card, not executable code.
        const source=rendered?text:String(text).replace(/^```(?:html|HTML)\s*\n([\s\S]*?)^```\s*$/gm,'$1');
        const safe=DOMPurify.sanitize(rendered?source:converter.makeHtml(source),config);
        const frame=document.createElement('iframe');frame.className='rich-output';frame.title='메시지 HTML · 읽기 전용';
        // Same-origin lets only the parent measure height. No allow-scripts, navigation,
        // downloads, popups, forms, or external network access are granted.
        frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('referrerpolicy','no-referrer');
        frame.srcdoc='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'self\'; connect-src \'none\'; frame-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><style>html,body{margin:0;padding:0;background:transparent;color:var(--ink,#282e39);font-family:var(--reading-family,system-ui,sans-serif);font-weight:var(--reading-weight,400);font-size:var(--reading-size,16px);line-height:var(--reading-line,1.85);overflow-wrap:anywhere}body{display:flow-root;min-width:0}*{box-sizing:border-box}img,svg{max-width:100%;height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{max-width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #8886}p:first-child{margin-top:0}p:last-child{margin-bottom:0}a{pointer-events:none}summary{cursor:pointer}</style></head><body>'+safe+'</body></html>';
        let observer;
        const resize=()=>{
            if(!frame.isConnected){observer?.disconnect();return;}
            try{const doc=frame.contentDocument;if(!doc?.body)return;const height=Math.min(200000,Math.max(24,Math.ceil(doc.body.getBoundingClientRect().height),doc.body.scrollHeight));if(Math.abs(frame.offsetHeight-height)>1)onResize(()=>frame.style.height=height+'px');}catch{}
        };
        frame.addEventListener('load',()=>{
            if(!frame.isConnected)return;
            try{const doc=frame.contentDocument;syncFrame(frame);doc.addEventListener('click',e=>{if(e.target.closest('a,form'))e.preventDefault();if(!e.target.closest('a,summary,details,button,input')&&!doc.getSelection()?.toString())window.dispatchEvent(new Event('bookshop-content-tap'));});observer=new ResizeObserver(resize);observer.observe(doc.body);resize();}catch{}
        });
        frame._bookshopDispose=()=>observer?.disconnect();host.append(frame);
    }
    function syncFrame(frame){
        const root=frame.contentDocument?.documentElement;if(!root)return;
        const styles=getComputedStyle(document.documentElement);
        for(const name of ['--ink','--muted','--paper','--side','--blue','--line','--reading-size','--reading-family','--reading-weight','--reading-line'])root.style.setProperty(name,styles.getPropertyValue(name));
        root.style.colorScheme=styles.colorScheme;
        frame._bookshopFontsReady=syncFonts(frame).catch(()=>{});
        let override=frame.contentDocument.getElementById('bookshop-reading-style');
        if(!override){override=frame.contentDocument.createElement('style');override.id='bookshop-reading-style';frame.contentDocument.head.append(override);}
        override.textContent=(document.documentElement.dataset.readingFont!=='system'?'body,body *:not(code):not(pre){font-family:var(--reading-family)!important}':'')+(document.documentElement.dataset.readingBold==='true'?'body,body *{font-weight:700!important}':'');
    }
    function refresh(root){root.querySelectorAll('iframe.rich-output').forEach(frame=>{try{syncFrame(frame);}catch{}});}
    function clear(root){root.querySelectorAll('iframe.rich-output').forEach(frame=>frame._bookshopDispose?.());}
    return {mount,refresh,clear,version:'1.0.0'};
})();
