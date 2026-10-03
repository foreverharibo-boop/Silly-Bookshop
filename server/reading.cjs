'use strict';
const fs=require('node:fs/promises'),shelf=require('./shelf.cjs'),path=require('node:path'),c=require('./core.cjs'),display=require('./display.cjs');
async function bookmarks(dirs,id,change){
 await c.chatFile(dirs,id);
 const file=path.join(await c.stateDir(dirs.root),'bookmarks.json');
 if(!change)return (await c.readJson(file,{},1024*1024))[id]||[];
 if(!Number.isSafeInteger(change.index)||change.index<0||change.index>10000000||typeof change.remove!=='boolean'||typeof change.note!=='string'||change.note.length>300)throw c.fail(400,'책갈피 내용을 확인해 주세요.');
 const parsed=c.parseChat(await c.readText(await c.chatFile(dirs,id),32*1024*1024));
 if(!change.remove&&change.index>=parsed.messages.length)throw c.fail(400,'메시지가 없어졌어요. 대화를 갱신해 주세요.');
 return c.serialized(file,async()=>{
  const all=await c.readJson(file,{},1024*1024),list=(all[id]||[]).filter(x=>x.index!==change.index);
  if(!change.remove)list.push({index:change.index,note:change.note,updated:Date.now()});
  all[id]=list.sort((a,b)=>a.index-b.index);if(!list.length)delete all[id];
  if(Object.values(all).reduce((n,a)=>n+a.length,0)>1000||Buffer.byteLength(JSON.stringify(all))>1024*1024)throw c.fail(413,'책갈피는 최대 1,000개까지 보관할 수 있어요.');
  await c.atomicJson(file,all);return list;
 });
}
async function visit(dirs,id){
 await c.chatFile(dirs,id);const file=path.join(await c.stateDir(dirs.root),'visits.json');
 return c.serialized(file,async()=>{const all=await c.readJson(file,{});all[id]=Date.now();const ids=Object.keys(all).sort((a,b)=>all[b]-all[a]);for(const old of ids.slice(1000))delete all[old];await c.atomicJson(file,all);return {ok:true};});
}
async function recent(dirs,chats){
 const saved=await c.readJson(path.join(await c.stateDir(dirs.root),'reading.json'),{});
 const visits=await c.readJson(path.join(await c.stateDir(dirs.root),'visits.json'),{}),time=id=>Math.max(visits[id]||0,saved[id]?.updated||0);
 return chats.filter(x=>time(x.id)).sort((a,b)=>time(b.id)-time(a.id)).slice(0,10).map(x=>({...x,position:saved[x.id]||{index:0,fraction:0}}));
}
function revision(stat,context){return ['saved-display-1',stat.ino,stat.mtimeMs,stat.ctimeMs,stat.size,context.revision].join(':');}
async function snapshot(dirs,id,cancelled=()=>false){
 const began=Date.now();
 const entries=await shelf.decorate(dirs,await c.catalog(dirs,{withCharacters:true})),meta=entries.chats.find(x=>x.id===id);
 if(!meta)throw c.fail(404,'현재 실리에 있는 대화만 보관할 수 있어요.');
 const file=await c.chatFile(dirs,id),context=await display.load(dirs,id),before=revision(await fs.stat(file),context),parsed=c.parseChat(await c.readText(file,32*1024*1024));
 if(parsed.messages.length>5000)throw c.fail(413,'오프라인 보관은 한 대화에 최대 5,000개 메시지까지 지원해요.');
 const messages=[];let bytes=0;
 for(let i=0;i<parsed.messages.length;i+=30){
  if(cancelled()||Date.now()-began>30000)throw c.fail(408,'보관 작업이 중단되었어요. 다시 시도해 주세요.');
  const views=await display.render(parsed.messages.slice(i,i+30),context,parsed.metadata);
  if(views.some(m=>m.error))throw c.fail(409,'표시하지 못한 메시지가 있어요. 정규식을 확인한 뒤 다시 보관해 주세요.');
  bytes+=Buffer.byteLength(JSON.stringify(views));if(bytes>16*1024*1024)throw c.fail(413,'오프라인 대화는 16MB까지 보관할 수 있어요.');messages.push(...views);
 }
 if(before!==revision(await fs.stat(file),await display.load(dirs,id)))throw c.fail(409,'보관 중 대화가 바뀌었어요. 다시 보관해 주세요.');
 return {scope:entries.scope,revision:before,schema:1,displayPolicy:'saved-display-v1',created:Date.now(),meta,messages,saved:await c.position(dirs.root,id),bookmarks:await bookmarks(dirs,id)};
}
module.exports={bookmarks,recent,snapshot,visit,revision};
