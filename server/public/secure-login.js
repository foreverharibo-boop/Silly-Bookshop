'use strict';
(()=>{const $=id=>document.getElementById(id);let token='';
async function csrf(){const r=await fetch('/csrf-token',{cache:'no-store'});if(!r.ok)throw Error('실리 서버에 연결할 수 없어요.');token=(await r.json()).token;}
async function post(url,body){return fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify(body)});}
(async()=>{try{await csrf();const r=await post('/api/users/list',{});if(r.ok&&r.status!==204){const users=await r.json();if(Array.isArray(users)&&users.length){for(const u of users){const o=document.createElement('option');o.value=u.handle;o.textContent=u.name||u.handle;$('account-list').append(o);}$('account-list').hidden=false;$('handle').hidden=true;$('handle').required=false;}}}catch(e){$('message').textContent=e.message;}})();
$('secure-login').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;try{await csrf();const r=await post('/api/users/login',{handle:$('account-list').hidden?$('handle').value.trim():$('account-list').value,password:$('pass').value});$('pass').value='';if(!r.ok)throw Error('실리 계정과 비밀번호를 확인해 주세요.');location.assign('/api/plugins/silly-bookshop/');}catch(e){$('message').textContent=e.message;}finally{button.disabled=false;}};
})();
