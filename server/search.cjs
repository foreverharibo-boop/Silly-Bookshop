'use strict';
const c=require('./core.cjs'),display=require('./display.cjs');
function plain(value){return String(value||'').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,v)=>{if(v[0]==='#'){const n=v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[v.toLowerCase()];}).replace(/\s+/g,' ').trim().normalize('NFKC');}
async function search(dirs,id,query,cursor=0,cancelled=()=>false){
 if(typeof query!=='string'||!query.trim()||query.length>100||!Number.isSafeInteger(cursor)||cursor<0)throw c.fail(400,'검색어는 1~100자로 입력해 주세요.');
 const file=await c.chatFile(dirs,id),context=await display.load(dirs,id),parsed=c.parseChat(await c.readText(file,32*1024*1024)),needle=query.trim().normalize('NFKC').toLocaleLowerCase('ko'),results=[],began=Date.now();let next=cursor,skipped=0;
 for(let i=cursor;i<Math.min(cursor+300,parsed.messages.length);i+=30){
  if(cancelled())throw c.fail(408,'검색을 중단했어요.');
  for(const m of await display.render(parsed.messages.slice(i,i+30),context,parsed.metadata)){
   next=m.index+1;if(m.error){skipped++;continue;}
   for(const item of [{label:'본문',content:m.content},...(m.translations||[])]){const text=plain(item.content),at=text.toLocaleLowerCase('ko').indexOf(needle);if(at>=0){results.push({index:m.index,name:m.name,label:item.label||'번역',snippet:(at>45?'…':'')+text.slice(Math.max(0,at-45),at+needle.length+85)});break;}}
   if(results.length>=80)break;
  }
  if(results.length>=80||Date.now()-began>10000)break;
 }
 return {results,next:next<parsed.messages.length?next:null,total:parsed.messages.length,scanned:Math.min(next,parsed.messages.length),skipped};
}
module.exports={search,plain};
