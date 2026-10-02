/* 0.4: the reader formats saved chats itself. No DOM observer or uploads. */
(() => {
    'use strict';
    function panel(){
        const parent=document.getElementById('extensions_settings');
        if(!parent)return false;
        if(document.getElementById('silly-bookshop-bridge'))return true;
        const box=document.createElement('div');box.id='silly-bookshop-bridge';
        const title=document.createElement('b');title.textContent='실리 책방';
        const text=document.createElement('p');text.textContent='이제 채팅방을 열거나 연동 버튼을 누르지 않아도 책방에서 저장된 대화를 읽을 수 있어요. 책방을 열고 새로고침해 주세요.';
        box.append(title,text);parent.append(box);return true;
    }
    if(!panel()){let attempts=0;const timer=setInterval(()=>{if(panel()||++attempts>=30)clearInterval(timer);},1000);}
})();
