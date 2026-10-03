'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
const c=require('./core.cjs');
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function list(value){return Array.isArray(value)?value:[];}
function scripts(value){
    if(list(value).length>1000)throw c.fail(413,'표시 정규식이 1,000개를 넘어요.');
    return list(value).map(r=>{if(!r||typeof r!=='object')throw c.fail(422,'정규식 설정 형식을 확인해 주세요.');return Object.fromEntries(['scriptName','findRegex','replaceString','trimStrings','placement','disabled','markdownOnly','promptOnly','substituteRegex','minDepth','maxDepth'].map(k=>[k,r[k]]));});
}
async function card(dirs,avatar){
    if(!avatar)return {};
    const data=await c.readText(await c.safeFile(dirs.characters||path.join(dirs.root,'characters'),[avatar]),20*1024*1024,true);
    if(!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw c.fail(422,'캐릭터 카드 정보를 읽지 못했어요.');
    let found=null;
    for(let offset=8;offset+12<=data.length;){
        const size=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+size;
        if(end>data.length)throw c.fail(422,'캐릭터 카드가 손상됐어요.');
        if(type==='tEXt'){
            const text=data.subarray(offset+8,offset+8+size),split=text.indexOf(0),key=text.subarray(0,split).toString();
            if(split>0&&['chara','ccv3'].includes(key)){
                if(size>4*1024*1024)throw c.fail(413,'캐릭터 카드 설정이 너무 커요.');
                const parsed=JSON.parse(Buffer.from(text.subarray(split+1).toString(),'base64').toString('utf8'));
                if(key==='ccv3'||!found)found=parsed;
            }
        }
        offset=end;if(type==='IEND')break;
    }
    const value=found?.data||found||{};
    return {name:value.name,scripts:scripts(value.extensions?.regex_scripts)};
}
async function load(dirs,id){
    let settings;
    try{settings=JSON.parse(await c.readText(await c.safeFile(dirs.root,['settings.json']),64*1024*1024));}
    catch(e){if(e.code==='ENOENT')settings={};else throw c.fail(422,'실리 설정을 안전하게 읽지 못했어요. 저장이 끝난 뒤 새로고침해 주세요.');}
    const ext=settings.extension_settings||{},api=settings.main_api==='koboldhorde'?'kobold':settings.main_api;
    const fields={openai:['oai_settings','preset_settings_openai'],novel:['nai_settings','preset_settings_novel'],kobold:['kai_settings','preset_settings'],textgenerationwebui:['textgenerationwebui_settings','preset']};
    const [field,nameKey]=fields[api]||[],current=settings[field]||settings,presetName=current[nameKey];
    const disabled=list(ext.disabledExtensions).includes('regex');
    const common=disabled?[]:scripts(ext.regex);
    if(!disabled&&list(ext.preset_allowed_regex?.[api]).includes(presetName))common.push(...scripts(current.extensions?.regex_scripts));
    const parts=c.decode(id),cards=new Map(),names=new Map();let baseAvatar='';
    if(parts[0]==='chat'){
        const files=await fs.readdir(dirs.characters||path.join(dirs.root,'characters'));
        baseAvatar=files.find(name=>/\.png$/i.test(name)&&name.replace('.png','').normalize('NFC')===parts[1].normalize('NFC'))||'';
        if(!baseAvatar)throw c.fail(404,'현재 실리에 없는 캐릭터나 대화예요. 목록을 새로고침해 주세요.');
    }
    const avatars=baseAvatar?[baseAvatar]:list(ext.character_allowed_regex);
    for(const avatar of avatars){
        // Group rules are selected per message author; never load disallowed card scripts.
        if(typeof avatar!=='string')continue;
        let data;try{data=await card(dirs,avatar);}catch(e){if(e.code==='ENOENT'&&parts[0]==='group')continue;throw e;}
        names.set(avatar,data.name||avatar.replace(/\.png$/i,''));
        cards.set(avatar,!disabled&&list(ext.character_allowed_regex).includes(avatar)?data.scripts:[]);
    }
    const variables={};
    for(const [key,value]of Object.entries(ext.variables?.global||{}))if(['string','number','boolean'].includes(typeof value))variables['getglobalvar::'+key]=String(value);
    const context={common,cards:Object.fromEntries(cards),names:Object.fromEntries(names),baseAvatar,user:String(settings.name1||'나'),reasoning:{prefix:settings.power_user?.reasoning?.prefix,suffix:settings.power_user?.reasoning?.suffix},variables,chatid:parts.at(-1).slice(0,-6)};
    return {...context,revision:digest(context)};
}
async function render(messages,context,metadata={}){
    const local={};for(const [key,value]of Object.entries(metadata.variables||{}))if(['string','number','boolean'].includes(typeof value))local['getvar::'+key]=String(value);
    const configs=messages.map(m=>{const avatar=context.baseAvatar||m.originalAvatar;return {scripts:[...context.common,...(context.cards[avatar]||[])],avatar,character:context.names[avatar]||m.name,user:context.user,reasoning:context.reasoning,variables:{...context.variables,...local},chatid:context.chatid};});
    if(!messages.length)return [];
    return new Promise((resolve,reject)=>{
        const worker=new Worker(path.join(__dirname,'display-worker.cjs'),{workerData:{messages,configs},resourceLimits:{maxOldGenerationSizeMb:96,maxYoungGenerationSizeMb:16}});let finished=false;
        const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
        const timer=setTimeout(()=>finish(null,messages.map(m=>({index:m.index,name:m.name,user:m.user,system:m.system,date:m.date,error:'정규식 처리 시간이 초과됐어요. 복잡한 표시 정규식을 확인해 주세요.'}))),2000);
        worker.once('message',result=>Array.isArray(result)?finish(null,result):finish(c.fail(422,'표시 정규식을 처리하지 못했어요.')));
        worker.once('error',()=>finish(c.fail(422,'표시 정규식 처리에 실패했어요. 원문은 대신 표시하지 않아요.')));
        worker.once('exit',code=>{if(!finished)finish(c.fail(422,'표시 정규식 처리가 중단됐어요.'));});
    });
}
module.exports={load,render,card};
