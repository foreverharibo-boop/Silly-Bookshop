'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const c=require('./core.cjs');
const LIMIT=32*1024*1024,QUOTA=128*1024*1024;
const SCHEMA=2;
function screenMessage(m,snapshot){
    const result={index:m.index,name:m.name,user:m.user,system:m.system,date:m.date};
    if(snapshot?.schema===SCHEMA&&snapshot.sourceHash===m.sourceHash&&typeof snapshot.html==='string'){
        result.renderedHtml=snapshot.html;result.capturedAt=snapshot.capturedAt;result.synced=true;
    }else result.synced=false;
    return result;
}
async function location(root,id){
    c.decode(id);
    const dir=path.join(await c.stateDir(root),'rendered');
    await fs.mkdir(dir,{recursive:true,mode:0o700});
    if((await fs.lstat(dir)).isSymbolicLink())throw c.fail(403,'화면 저장 폴더를 확인해 주세요.');
    return {dir,file:path.join(dir,crypto.createHash('sha256').update(id).digest('hex')+'.json')};
}
async function revision(root,id){const {file}=await location(root,id);try{const s=await fs.lstat(file);if(!s.isFile()||s.nlink!==1)throw c.fail(403,'잘못된 화면 저장 파일입니다.');return [s.mtimeMs,s.ctimeMs,s.size].join(':');}catch(e){if(e.code==='ENOENT')return '';throw e;}}
async function read(root,id){return c.readJson((await location(root,id)).file,{},LIMIT);}
async function write(dirs,id,items,schema){
    if(schema!==SCHEMA)throw c.fail(409,'화면 연동 확장을 업데이트하고 실리 브라우저를 새로고침해 주세요.');
    if(!Array.isArray(items)||!items.length||items.length>8)throw c.fail(400,'화면 연동 요청을 확인해 주세요.');
    return c.serialized('capture:'+dirs.root,async()=>{
        const source=c.parseChat(await c.readText(await c.chatFile(dirs,id),32*1024*1024)).messages;
        const {dir,file}=await location(dirs.root,id),all=await c.readJson(file,{},LIMIT);
        // Old captures never survive edits, swipes, translation changes or index shifts.
        for(const [key,v]of Object.entries(all))if(v.schema!==SCHEMA||source[Number(key)]?.sourceHash!==v.sourceHash)delete all[key];
        const accepted=[];
        for(const item of items){
            if(!item||!Number.isSafeInteger(item.index)||item.index<0||typeof item.html!=='string'||Buffer.byteLength(item.html)>512*1024)throw c.fail(400,'화면 한 개의 크기는 512KB 이하여야 합니다.');
            const m=source[item.index];
            if(!m||m.text!==item.sourceText||m.displayText!==(item.displayText??null)||m.name!==item.name||m.date!==item.date||m.user!==item.user)continue;
            if(all[item.index]?.schema!==SCHEMA||all[item.index]?.html!==item.html||all[item.index]?.sourceHash!==m.sourceHash)all[item.index]={schema:SCHEMA,html:item.html,sourceHash:m.sourceHash,capturedAt:Date.now()};
            accepted.push(item.index);
        }
        const bytes=Buffer.byteLength(JSON.stringify(all));
        if(bytes>LIMIT)throw c.fail(413,'이 대화의 화면 저장 한도 32MB를 넘었습니다.');
        const entries=await fs.readdir(dir,{withFileTypes:true});
        if(entries.length>10000)throw c.fail(413,'화면 저장 파일 수가 너무 많습니다.');
        let used=bytes;
        for(const e of entries)if(e.isFile()&&e.name!==path.basename(file))used+=(await fs.stat(path.join(dir,e.name))).size;
        if(used>QUOTA)throw c.fail(413,'화면 연동 저장 한도 128MB를 넘었습니다.');
        if(accepted.length)await c.atomicJson(file,all);
        return {accepted};
    });
}
module.exports={revision,read,write,screenMessage,SCHEMA};
