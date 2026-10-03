'use strict';
// Update static reader files only. Never reset a vault, unregister a worker, or clear site data.
(()=>{
 if(navigator.userAgent.includes('SillyBookshop/'))return;
 const BASE='/api/plugins/silly-bookshop/',VERSION='1.0.3',MARKER='silly-bookshop:screen-update';
 const hooks=[];let busy=false,dialog,message,close;
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function timeout(promise,ms,text){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(text)),ms);})]).finally(()=>clearTimeout(timer));}
 function show(text){
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='screen-update-dialog';dialog.setAttribute('aria-labelledby','screen-update-title');
   const title=document.createElement('h2');title.id='screen-update-title';title.textContent='화면 새로고침';
   message=document.createElement('p');message.id='screen-update-message';message.className='help';message.setAttribute('role','status');
   const help=document.createElement('p');help.className='help';help.textContent='웹앱을 삭제하지 마세요. 이 버튼은 화면 파일을 갱신하며 보관함을 초기화하지 않아요.';
   const actions=document.createElement('div');actions.className='screen-update-actions';close=document.createElement('button');close.type='button';close.textContent='닫기';close.onclick=()=>dialog.close();actions.append(close);dialog.append(title,message,help,actions);document.body.append(dialog);
   dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  }
  message.textContent=text;close.disabled=busy;if(!dialog.open)dialog.showModal();
 }
 async function serverStatus(){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(BASE+'status',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
   if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error();
   const info=await response.json();
   if(info.protocol!==2||!/^\d+\.\d+\.\d+$/.test(info.version))throw Error();
   if(info.screenUpdate!==1||typeof info.shellVersion!=='string')throw Error('서버 플러그인을 먼저 업데이트하고 실리를 다시 켜 주세요.');
   return info;
  }catch(error){if(error.message.includes('먼저 업데이트'))throw error;throw Error('서버에 연결하지 못했어요. 실리와 테일스케일을 켠 뒤 다시 눌러 주세요. 화면은 바꾸지 않았어요.');}
  finally{clearTimeout(timer);}
 }
 function workerStatus(worker){
  return new Promise(resolve=>{
   if(!worker){resolve(null);return;}
   const channel=new MessageChannel();let done=false;
   const finish=value=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();resolve(value);};
   const timer=setTimeout(()=>finish(null),1500);channel.port1.onmessage=event=>finish(event.data);
   try{worker.postMessage({type:'BOOKSHOP_SHELL_CHECK'},[channel.port2]);}catch{finish(null);}
  });
 }
 async function waitForShell(reg,version,failed){
  const end=Date.now()+65000;
  while(Date.now()<end){
   const worker=navigator.serviceWorker.controller;
   if(worker&&worker===reg.active&&worker.state==='activated'){
    const result=await workerStatus(worker);if(result?.ready&&result.version===version)return;
   }
   if(failed())break;
   await pause(200);
  }
  throw Error('새 화면 파일을 모두 준비하지 못했어요. 연결 상태를 확인하고 다시 눌러 주세요. 보관함은 초기화하지 않았어요.');
 }
 async function saveBeforeReload(){
  for(const hook of hooks)await timeout(Promise.resolve().then(hook),15000,'읽던 위치 저장을 확인하지 못했어요. 잠시 후 다시 눌러 주세요.');
 }
 async function start(){
  if(busy)return;busy=true;show('서버의 새 버전을 확인하고 있어요…');
  try{
   const target=await serverStatus();await saveBeforeReload();
   const useWorker=window.isSecureContext&&'serviceWorker'in navigator;
   if(useWorker){
    show('화면 '+target.version+' 파일을 준비하고 있어요. 잠시만 기다려 주세요…');
    let reg=await navigator.serviceWorker.getRegistration(BASE);
    if(!reg)reg=await timeout(navigator.serviceWorker.register(BASE+'sw.js',{scope:BASE,updateViaCache:'none'}),20000,'화면 준비가 늦어지고 있어요. 잠시 후 다시 눌러 주세요.');
    let installing=reg.installing;const found=()=>{installing=reg.installing;};reg.addEventListener('updatefound',found);
    try{
     await timeout(reg.update(),20000,'화면 준비가 늦어지고 있어요. 잠시 후 다시 눌러 주세요.');
     await waitForShell(reg,target.shellVersion,()=>installing?.state==='redundant');
    }finally{reg.removeEventListener('updatefound',found);}
   }
   const latest=await serverStatus();if(latest.version!==target.version||latest.shellVersion!==target.shellVersion)throw Error('서버 버전이 바뀌었어요. 한 번 더 눌러 주세요.');
   await saveBeforeReload();
   // Contains versions only, never chat content or credentials.
   sessionStorage.setItem(MARKER,JSON.stringify({version:target.version,shell:useWorker?target.shellVersion:null}));
   show('준비됐어요. 화면을 다시 열고 적용된 버전을 확인할게요…');location.reload();
  }catch(error){busy=false;show(error.message||'업데이트를 확인하지 못했어요. 잠시 후 다시 눌러 주세요.');}
 }
 window.BookshopScreenUpdate={start,beforeReload(fn){hooks.push(fn);},get busy(){return busy;}};
 document.addEventListener('click',event=>{if(event.target.closest('.web-screen-update')){event.preventDefault();start();}});
 async function loaded(){
  let pending;
  try{pending=JSON.parse(sessionStorage.getItem(MARKER)||'null');sessionStorage.removeItem(MARKER);}catch{}
  if(pending){
   const htmlVersion=document.querySelector('meta[name="bookshop-version"]')?.content;
   const worker=pending.shell?await workerStatus(navigator.serviceWorker?.controller):null;
   if(pending.version===VERSION&&htmlVersion===VERSION&&(!pending.shell||(worker?.ready&&worker.version===pending.shell))){
    show('화면 '+VERSION+' 적용을 확인했어요.\n보관함을 초기화하지 않고 새로고침했어요.');
   }else show('새 버전 적용을 확인하지 못했어요. 서버 연결 후 다시 눌러 주세요. 웹앱을 삭제하지 마세요.');
  }
  // Keep an installed shell current; never interrupt reading or force a reload mid-save.
  if(window.isSecureContext&&'serviceWorker'in navigator)navigator.serviceWorker.getRegistration(BASE).then(reg=>reg?.update()).catch(()=>{});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',loaded,{once:true});else loaded();
})();
