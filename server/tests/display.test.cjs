'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const c=require('../core.cjs'),display=require('../display.cjs'),worker=require('../display-worker.cjs');
const rule=(find,replace='',more={})=>({scriptName:'숨김',findRegex:find,replaceString:replace,trimStrings:[],placement:[1,2,3],markdownOnly:true,substituteRegex:0,...more});
function pngCard(data){const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P6sAAAAASUVORK5CYII=','base64'),text=Buffer.from('chara\0'+Buffer.from(JSON.stringify(data)).toString('base64')),chunk=Buffer.alloc(text.length+12);chunk.writeUInt32BE(text.length);chunk.write('tEXt',4);text.copy(chunk,8);return Buffer.concat([png.subarray(0,33),chunk,png.subarray(33)]);}
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-display-')),dirs={root,chats:path.join(root,'chats'),characters:path.join(root,'characters'),groupChats:path.join(root,'group chats')};t.after(()=>fs.rm(root,{recursive:true,force:true}));for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(dirs.chats,'A'));await fs.writeFile(path.join(dirs.characters,'A.png'),pngCard({data:{name:'Alice',extensions:{regex_scripts:[rule('/SCOPED/g',''),rule('/PRESET/g','FINAL')]}}}));return dirs;}
test('saved translation loads without capture; allowed global/preset/card rules apply in order; settings change invalidates revision',async t=>{
 const d=await fixture(t),id=c.encode(['chat','A','one.jsonl']),settings={name1:'User',main_api:'openai',extension_settings:{regex:[rule('/GLOBAL/g',''),rule('/ORDER/g','PRE')],character_allowed_regex:['A.png'],preset_allowed_regex:{openai:['Chosen']}},oai_settings:{preset_settings_openai:'Chosen',extensions:{regex_scripts:[rule('/PRE/g','PRESET')]}}};
 const file=path.join(d.root,'settings.json');await fs.writeFile(file,JSON.stringify(settings));
 const source=JSON.stringify({mes:'RAW_ONLY_SECRET',name:'Alice',extra:{reasoning:'PRIVATE_REASONING',display_text:'<think>THINK_SECRET</think>번역 GLOBAL SCOPED ORDER',translations:{ko:'추가 GLOBAL SCOPED'}}});
 const context=await display.load(d,id),parsed=c.parseChat(source),views=await display.render(parsed.messages,context);
 assert.equal(views[0].content,'번역   FINAL');assert.equal(views[0].translations[0].content,'추가  ');assert.ok(!JSON.stringify(views).includes('SECRET'));assert.ok(!JSON.stringify(views).includes('PRIVATE'));assert.equal(views[0].text,undefined);
 settings.extension_settings.regex.push(rule('/번역/g','수정'));await fs.writeFile(file,JSON.stringify(settings));const changed=await display.load(d,id);assert.notEqual(changed.revision,context.revision);assert.match((await display.render(parsed.messages,changed))[0].content,/수정/);
 settings.extension_settings.character_allowed_regex=[];settings.extension_settings.preset_allowed_regex={};await fs.writeFile(file,JSON.stringify(settings));assert.match((await display.render(parsed.messages,await display.load(d,id)))[0].content,/SCOPED PRE/);
 assert.equal(await fs.readFile(file,'utf8'),JSON.stringify(settings));
});
test('depth, placement, prompt-only exclusion, groups, trim strings and escaped name macros follow display semantics',()=>{
 const config={user:'U',character:'A+B',scripts:[rule('/secret/g','',{maxDepth:0}),rule('/USER/g','',{placement:[1]}),rule('/PROMPT/g','',{markdownOnly:false,promptOnly:true}),rule('/{{char}}:(?<value>.+)/g','$<value>',{substituteRegex:2,trimStrings:['TRIM']})]};
 const m={name:'A+B',placement:2,depth:1};assert.equal(worker.transform('secret USER PROMPT A+B:yesTRIM',m,config),'secret USER PROMPT yes');m.depth=0;assert.equal(worker.transform('secret',m,config),'');
});
test('reasoning excluded even without rules; empty translation stays empty; unsupported macros fail closed per message',()=>{
 const messages=c.parseChat(JSON.stringify({mes:'<think>SECRET</think>hello <analysis>TAIL',name:'A'})+'\n'+JSON.stringify({mes:'RAW',extra:{display_text:''}})).messages,conf={scripts:[],reasoning:{prefix:'[think]',suffix:'[/think]'}};
 assert.equal(worker.project(messages[0],conf).content,'hello ');assert.equal(worker.project(messages[1],conf).content,'');
 const view=worker.project(messages[0],{...conf,scripts:[rule('/hello/g','{{unsupported}}')]});assert.ok(view.error);assert.equal(view.content,undefined);assert.ok(!JSON.stringify(view).includes('SECRET'));
});
test('malformed settings and linked cards are rejected instead of exposing unfiltered text',async t=>{
 const d=await fixture(t),id=c.encode(['chat','A','one.jsonl']);await fs.writeFile(path.join(d.root,'settings.json'),'{');await assert.rejects(()=>display.load(d,id),{status:422});await fs.unlink(path.join(d.root,'settings.json'));await fs.rename(path.join(d.characters,'A.png'),path.join(d.root,'private.png'));await fs.symlink(path.join(d.root,'private.png'),path.join(d.characters,'A.png'));await assert.rejects(()=>display.load(d,id),{status:403});
});
test('pathological regex is terminated off the server event loop without returning source',async()=>{
 const messages=c.parseChat(JSON.stringify({name:'A',mes:'a'.repeat(10000)+'!'})).messages,context={common:[rule('/^(a+)+$/','')],cards:{},names:{}};const before=Date.now(),result=await display.render(messages,context);assert.ok(Date.now()-before<5000);assert.match(result[0].error,/시간/);assert.equal(result[0].content,undefined);
});
