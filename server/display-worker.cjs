'use strict';
// Runs only text transformations in a bounded worker, never evals regex replacements.
const {parentPort,workerData}=require('node:worker_threads');
function macros(text,env,escape=false){
    return String(text).replace(/{{([^{}]+)}}/g,(all,key)=>{
        key=key.trim();let value;
        if(Object.hasOwn(env,key.toLowerCase()))value=env[key.toLowerCase()];
        else if(/^(getvar|getglobalvar)::/.test(key))value='';
        else throw new Error('지원하지 않는 매크로가 포함되어 있어요.');
        value=String(value??'');return escape?value.replace(/[\n\r\t\v\f\0.^$*+?{}[\]\\/|()]/g,c=>({'\n':'\\n','\r':'\\r','\t':'\\t','\v':'\\v','\f':'\\f','\0':'\\0'}[c]||'\\'+c)):value;
    });
}
function regexFromString(input){
    // Mirrors SillyTavern regexFromString, including bare-pattern behavior.
    const m=input.match(/(\/?)(.+)\1([a-z]*)/i);if(!m)throw new Error('빈 정규식이에요.');
    return m[3]&&!/^(?!.*?(.).*?\1)[gmixXsuUAJ]+$/.test(m[3])?new RegExp(input):new RegExp(m[2],m[3]);
}
function hideReasoning(text,reasoning){
    text=text.replace(/<(think|thinking|reasoning|analysis)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'');
    const {prefix,suffix}=reasoning||{};
    if(typeof prefix==='string'&&prefix&&typeof suffix==='string'&&suffix){
        let start;while((start=text.indexOf(prefix))>=0){const end=text.indexOf(suffix,start+prefix.length);text=text.slice(0,start)+(end<0?'':text.slice(end+suffix.length));}
    }
    return text;
}
function transform(text,m,config){
    const env={char:m.user?config.character:m.name,user:config.user,chatid:config.chatid,newline:'\n',trim:'',...config.variables};
    let value=hideReasoning(text,config.reasoning);
    // Initial greetings may contain these simple, pure placeholders.
    value=value.replace(/{{\s*(char|user)\s*}}/gi,(_,key)=>env[key.toLowerCase()]||'');
    for(const rule of config.scripts){
        if(rule.disabled||!rule.findRegex||!rule.markdownOnly||!rule.placement?.includes(m.placement))continue;
        if(rule.minDepth!=null&&!isNaN(rule.minDepth)&&rule.minDepth>=-1&&m.depth<rule.minDepth)continue;
        if(rule.maxDepth!=null&&!isNaN(rule.maxDepth)&&rule.maxDepth>=0&&m.depth>rule.maxDepth)continue;
        try{
            const mode=Number(rule.substituteRegex),pattern=[1,2].includes(mode)?macros(rule.findRegex,env,mode===2):rule.findRegex;
            if(/{{[^{}]+}}/.test(pattern)&&mode!==0)throw new Error('정규식 매크로를 해석할 수 없어요.');
            const regex=regexFromString(pattern);
            value=value.replace(regex,(...args)=>{
                const replacement=String(rule.replaceString??'').replace(/{{match}}/gi,'$0').replace(/\$(\d+)|\$<([^>]+)>/g,(_,number,name)=>{
                    let part=number?args[Number(number)]:args.at(-1)?.[name];if(typeof part!=='string')return '';
                    for(const trim of rule.trimStrings||[])part=part.split(macros(trim,env)).join('');return part;
                });
                return macros(replacement,env);
            });
            if(value.length>1024*1024)throw new Error('정규식 처리 결과가 너무 커요.');
        }catch(e){throw new Error('정규식 「'+String(rule.scriptName||'이름 없음').slice(0,80)+'」: '+e.message);}
    }
    return hideReasoning(value,config.reasoning);
}
function project(m,config){
    const result={index:m.index,name:m.name,user:m.user,system:m.system,date:m.date};
    try{
        const main=m.displayText!==null?m.displayText:(m.translations[0]?.text??m.text);
        result.content=transform(main,m,config);result.format='markdown';result.translated=m.displayText!==null||!!m.translations.length;
        const seen=new Set([main]);result.translations=[];
        for(const entry of m.translations){if(seen.has(entry.text))continue;seen.add(entry.text);result.translations.push({label:entry.label,content:transform(entry.text,m,config)});}
    }catch(e){delete result.content;delete result.translations;result.error=e.message;}
    return result;
}
if(parentPort){try{parentPort.postMessage(workerData.messages.map((m,i)=>project(m,workerData.configs[i])));}catch{parentPort.postMessage({error:true});}}
module.exports={transform,project,regexFromString,hideReasoning};
