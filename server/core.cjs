'use strict';
const fs = require('node:fs/promises');
const {constants}=require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const STATE = '.sili-library';
const fail = (status, message) => Object.assign(new Error(message), {status});
function segment(s) {
    if (typeof s !== 'string' || !s || s === '.' || s === '..' || /[\\/\x00-\x1f]/.test(s)) throw fail(400, '잘못된 채팅 주소입니다.');
    return s;
}
function encode(parts) { return Buffer.from(JSON.stringify(parts)).toString('base64url'); }
function decode(id) {
    try {
        if (typeof id !== 'string' || id.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(id)) throw 0;
        const a = JSON.parse(Buffer.from(id, 'base64url').toString());
        if (!Array.isArray(a) || !((a[0] === 'chat' && a.length === 3) || (a[0] === 'group' && a.length === 2))) throw 0;
        a.slice(1).forEach(segment);
        if (!a.at(-1).endsWith('.jsonl')) throw 0;
        if(encode(a)!==id)throw 0;
        return a;
    } catch { throw fail(400, '잘못된 채팅 주소입니다.'); }
}
async function safeFile(base, parts) {
    parts.forEach(segment);
    const root = await fs.realpath(base);
    let file = root;
    for (const part of parts) {
        file = path.join(file, part);
        const stat=await fs.lstat(file);
        if (stat.isSymbolicLink() || (!stat.isDirectory()&&!stat.isFile()) || (stat.isFile()&&stat.nlink!==1)) throw fail(403, '일반 파일만 읽을 수 있습니다.');
    }
    const real = await fs.realpath(file);
    if (!real.startsWith(root + path.sep)) throw fail(403, '접근할 수 없는 파일입니다.');
    return real;
}
async function chatFile(dirs, id) {
    const a = decode(id);
    return safeFile(a[0] === 'chat' ? dirs.chats : dirs.groupChats, a.slice(1));
}
async function readText(file,maxBytes=8*1024*1024,binary=false) {
    let handle;
    try {
        const before=await fs.lstat(file);
        if(!before.isFile()||before.nlink!==1)throw fail(403,'일반 파일만 읽을 수 있습니다.');
        handle=await fs.open(file,constants.O_RDONLY|(constants.O_NOFOLLOW||0)|(constants.O_NONBLOCK||0));
        const stat=await handle.stat();
        if(!stat.isFile()||stat.nlink!==1||stat.ino!==before.ino||stat.dev!==before.dev)throw fail(403,'파일이 변경되었습니다. 다시 시도해 주세요.');
        if(stat.size>maxBytes)throw fail(413,'파일이 지원 크기를 넘습니다.');
        const chunks=[];let size=0;
        while(true){
            const buffer=Buffer.alloc(Math.min(65536,maxBytes-size+1));
            const {bytesRead}=await handle.read(buffer,0,buffer.length,null);
            if(!bytesRead)break;
            size+=bytesRead;if(size>maxBytes)throw fail(413,'파일이 지원 크기를 넘습니다.');
            chunks.push(buffer.subarray(0,bytesRead));
        }
        const after=await handle.stat();
        if(stat.size!==after.size||stat.mtimeMs!==after.mtimeMs||stat.ctimeMs!==after.ctimeMs)throw fail(409,'실리가 대화를 저장 중입니다. 잠시 후 다시 시도해 주세요.');
        const buffer=Buffer.concat(chunks);
        return binary?buffer:buffer.toString('utf8');
    } finally {if(handle)await handle.close();}
}
async function readJson(file, fallback,maxBytes=8*1024*1024) {
    try { return JSON.parse(await readText(file,maxBytes)); }
    catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
async function stateDir(root) {
    const dir = path.join(root, STATE);
    await fs.mkdir(dir, {recursive:true, mode:0o700});
    if ((await fs.lstat(dir)).isSymbolicLink()) throw fail(403, '책방 저장 폴더를 확인해 주세요.');
    await fs.chmod(dir,0o700);
    return dir;
}
async function atomicJson(file, value) {
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try { await fs.writeFile(temp, JSON.stringify(value), {mode:0o600, flag:'wx'}); await fs.rename(temp, file); }
    finally { await fs.unlink(temp).catch(() => {}); }
}
async function authConfig(root) {
    const conf=await readJson(path.join(await stateDir(root), 'auth.json'), null,4096);
    if(conf && (typeof conf.salt!=='string'||conf.salt.length>128||typeof conf.hash!=='string'||!/^[a-f0-9]{128}$/.test(conf.hash)))throw fail(503,'책방 비밀번호 설정 파일을 확인해 주세요.');
    return conf;
}
async function passwordHash(password, salt) { return (await scrypt(password, salt, 64)).toString('hex'); }
async function verifyPassword(password, conf) {
    if (!conf || typeof password !== 'string' || password.length > 256) return false;
    const actual = Buffer.from(await passwordHash(password, conf.salt), 'hex');
    const expected = Buffer.from(conf.hash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function entries(dir) {
    try { const list=await fs.readdir(dir, {withFileTypes:true});if(list.length>20000)throw fail(413,'한 폴더의 파일 수가 너무 많습니다.');return list; }
    catch(e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function catalog(dirs,{withCharacters=false}={}) {
    const result=[],characters=[],avatars=new Map();
    const cardRoot=dirs.characters||path.join(dirs.root,'characters');
    for(const f of await entries(cardRoot)){
        if(!f.isFile()||!/\.png$/i.test(f.name))continue;
        try{await safeFile(cardRoot,[f.name]);}catch(e){if(e.code==='ENOENT'||e.status===403)continue;throw e;}
        const person={key:'character:'+f.name,character:f.name.replace('.png',''),avatar:f.name};
        characters.push(person);
        avatars.set(person.character.normalize('NFC'),person);
        avatars.set(f.name.slice(0,-4).normalize('NFC'),person);
    }
    for(const folder of await entries(dirs.chats)){
        const person=avatars.get(folder.name.normalize('NFC'));
        // Deleted cards can leave history folders. These are not current characters.
        if(!folder.isDirectory()||!person)continue;
        for(const file of await entries(path.join(dirs.chats,folder.name))){
            if(!file.isFile()||!file.name.endsWith('.jsonl'))continue;
            try{
                const id=encode(['chat',folder.name,file.name]);
                const stat=await fs.stat(await chatFile(dirs,id));
                result.push({id,character:person.character,characterKey:person.key,avatar:person.avatar,title:file.name.slice(0,-6),modified:stat.mtimeMs});
                if(result.length>20000)throw fail(413,'채팅 수가 현재 지원 범위를 넘습니다.');
            }catch(e){if(e.code!=='ENOENT'&&e.status!==403)throw e;}
        }
    }
    const groups=new Map();
    if(dirs.groups)for(const f of await entries(dirs.groups)){
        if(!f.isFile()||!f.name.endsWith('.json'))continue;
        try{
            const g=await readJson(await safeFile(dirs.groups,[f.name]),{},256*1024);
            const person={key:'group:'+f.name,character:'그룹 · '+String(g.name||'그룹 대화'),avatar:null};
            characters.push(person);
            for(const id of [g.chat_id,...(Array.isArray(g.chats)?g.chats:[])])if(typeof id==='string')groups.set(id,person);
        }catch{/* Invalid group metadata must not hide regular characters. */}
    }
    for(const f of await entries(dirs.groupChats)){
        const person=groups.get(f.name.slice(0,-6));
        if(!f.isFile()||!f.name.endsWith('.jsonl')||!person)continue;
        const id=encode(['group',f.name]);
        try{
            const stat=await fs.stat(await chatFile(dirs,id));
            result.push({id,character:person.character,characterKey:person.key,avatar:null,title:f.name.slice(0,-6),modified:stat.mtimeMs});
            if(result.length>20000)throw fail(413,'채팅 수가 현재 지원 범위를 넘습니다.');
        }catch(e){if(e.code!=='ENOENT'&&e.status!==403)throw e;}
    }
    result.sort((a,b)=>b.modified-a.modified);
    const recent=new Map();for(const chat of result)if(!recent.has(chat.characterKey))recent.set(chat.characterKey,chat.modified);
    characters.sort((a,b)=>(recent.get(b.key)||0)-(recent.get(a.key)||0)||a.character.localeCompare(b.character,'ko'));
    return withCharacters?{characters,chats:result}:result;
}
function translations(m){
    const values=[],seen=new Set([m.mes]);
    function add(text,label){if(typeof text!=='string'||!text.trim()||seen.has(text))return;seen.add(text);values.push({label,text});}
    add(m.extra?.display_text,'실리 표시문 · 번역');
    // Read only known translation fields. Never serialize arbitrary extension metadata.
    function collect(value,label,depth=0){
        if(depth>3||values.length>=32)return;
        if(typeof value==='string'){add(value,label);return;}
        if(Array.isArray(value)){value.slice(0,32).forEach((v,i)=>collect(v,label+' '+(i+1),depth+1));return;}
        if(!value||typeof value!=='object')return;
        for(const key of ['text','translation','translated_text','translatedText','translated','output','result'])if(typeof value[key]==='string')add(value[key],label);
        for(const [key,v]of Object.entries(value))if(/^[a-z]{2,3}(?:[-_][a-z]{2,4})?$/i.test(key))collect(v,label+' · '+key,depth+1);
    }
    for(const owner of [m,m.extra,m.swipe_info?.[m.swipe_id]?.extra]){
        if(!owner||typeof owner!=='object')continue;
        for(const key of ['translation','translations','translated','translated_text','translatedText','translation_text'])collect(owner[key],'저장된 번역');
    }
    return values;
}
function messageHash(m){return crypto.createHash('sha256').update(JSON.stringify([m.name||'',!!m.is_user,!!m.is_system,m.mes,m.extra?.display_text??null,m.swipe_id??null,m.send_date??null,translations(m)])).digest('hex');}
async function avatar(dirs,name){
    segment(name);
    if(!/\.png$/i.test(name))throw fail(404,'캐릭터 사진이 없습니다.');
    const raw=await readText(await safeFile(dirs.characters||path.join(dirs.root,'characters'),[name]),20*1024*1024,true);
    if(!raw.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw fail(415,'PNG 캐릭터 사진만 지원합니다.');
    // Strip character-card text/private metadata, retain only PNG image chunks.
    const chunks=[raw.subarray(0,8)];let offset=8,ended=false;
    const allowed=new Set(['IHDR','PLTE','IDAT','IEND','tRNS','sRGB','gAMA','cHRM','pHYs']);
    while(offset+12<=raw.length){
        const size=raw.readUInt32BE(offset),type=raw.toString('ascii',offset+4,offset+8),end=offset+12+size;
        if(end>raw.length)throw fail(415,'사진 파일을 읽을 수 없습니다.');
        if(type==='IHDR'&&(size!==13||raw.readUInt32BE(offset+8)>8192||raw.readUInt32BE(offset+12)>8192))throw fail(413,'사진 크기가 너무 큽니다.');
        if(allowed.has(type))chunks.push(raw.subarray(offset,end));
        offset=end;if(type==='IEND'){ended=true;break;}
    }
    if(!ended)throw fail(415,'사진 파일을 읽을 수 없습니다.');
    return Buffer.concat(chunks);
}
function parseChat(raw) {
    const messages = [];
    let skipped = 0;
    const lines = raw.split('\n');
    for (let i=0;i<lines.length;i++) {
        if (!lines[i].trim()) continue;
        if(lines[i].length>1024*1024)throw fail(413,'한 메시지가 지원 크기를 넘습니다.');
        let m;
        try { m = JSON.parse(lines[i]); }
        catch { if (i === lines.length-1) continue; skipped++; continue; }
        if (!m || typeof m.mes !== 'string') continue;
        if(messages.length>=100000)throw fail(413,'메시지 수가 현재 지원 범위를 넘습니다.');
        // mes is the persisted current swipe, including subsequent manual edits.
        const extras=translations(m);
        messages.push({index:messages.length,name:String(m.name || (m.is_user ? '나':'캐릭터')),user:!!m.is_user,system:!!m.is_system,text:m.mes,displayText:typeof m.extra?.display_text === 'string' ? m.extra.display_text : null,translations:extras,sourceHash:messageHash(m),date:String(m.send_date || '')});
    }
    return {messages,skipped};
}
const queues = new Map();
function serialized(key, fn) {
    const prev = queues.get(key) || Promise.resolve();
    const job = prev.catch(()=>{}).then(fn);
    queues.set(key,job);
    job.finally(()=>{if(queues.get(key)===job)queues.delete(key);}).catch(()=>{});
    return job;
}
async function position(root,id,value) {
    decode(id);
    const file = path.join(await stateDir(root),'reading.json');
    if (!value) return (await readJson(file,{}))[id] || null;
    if (!Number.isSafeInteger(value.index) || value.index<0 || value.index>10000000 || !Number.isFinite(value.fraction) || value.fraction<0 || value.fraction>1) throw fail(400,'읽던 위치가 올바르지 않습니다.');
    return serialized(file,async()=>{
        const all = await readJson(file,{});
        all[id] = {index:value.index,fraction:value.fraction,updated:Date.now()};
        const keys=Object.keys(all);
        if(keys.length>10000) keys.sort((a,b)=>all[a].updated-all[b].updated).slice(0,keys.length-10000).forEach(k=>delete all[k]);
        await atomicJson(file,all);
        return all[id];
    });
}
module.exports={STATE,fail,encode,decode,safeFile,chatFile,readText,readJson,stateDir,atomicJson,authConfig,passwordHash,verifyPassword,catalog,parseChat,position,translations,messageHash,avatar,serialized};
