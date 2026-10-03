'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const c=require('../core.cjs'),reading=require('../reading.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-reading-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const d={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};for(const dir of Object.values(d))await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(d.chats,'A'));await fs.writeFile(path.join(d.characters,'A.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P6sAAAAASUVORK5CYII=','base64'));await fs.writeFile(path.join(d.chats,'A','one.jsonl'),Array.from({length:35},(_,i)=>JSON.stringify({name:'A',mes:'<think>SECRET</think>hello '+i,extra:{display_text:'<think>SECRET</think>번역 '+i,translations:{en:'other '+i},apiKey:'API_SECRET'}})).join('\n'));return d;}
const id=c.encode(['chat','A','one.jsonl']);

const shelf=require('../shelf.cjs'),search=require('../search.cjs');
function png(red=40){
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(16);hdr.writeUInt32BE(16,4);hdr[8]=8;hdr[9]=2;
 const scan=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=y*49+1+x*3;scan[i]=red;scan[i+1]=110;scan[i+2]=210;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',require('node:zlib').deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}


test('shelf settings and cover are account-isolated; original files unchanged; bounded PNG validation',async t=>{
 const a=await fixture(t),b=await fixture(t),original=await fs.readFile(path.join(a.characters,'A.png')),raw=await fs.readFile(path.join(a.chats,'A','one.jsonl'));
 await shelf.change(a,{kind:'favorite',key:'character:A.png',value:true});await shelf.change(a,{kind:'alias',id,value:'비 오는 날'});
 await shelf.cover(a,'character:A.png','data:image/png;base64,'+png().toString('base64'));
 const ac=await shelf.decorate(a,await c.catalog(a,{withCharacters:true})),bc=await shelf.decorate(b,await c.catalog(b,{withCharacters:true}));
 assert.equal(ac.characters[0].favorite,true);assert.equal(ac.chats[0].alias,'비 오는 날');assert.equal(bc.characters[0].favorite,false);assert.equal(bc.chats[0].alias,'');assert.notEqual(ac.scope,bc.scope);assert.equal(ac.scope,(await shelf.state(a)).scope);
 assert.deepEqual(await shelf.cover(a,'character:A.png'),png());const snapshot=await reading.snapshot(a,id);assert.equal(snapshot.meta.photo,'data:image/png;base64,'+png().toString('base64'));await assert.rejects(()=>shelf.cover(b,'character:A.png'),{status:404});
 const corrupt=png();corrupt[20]^=1;assert.throws(()=>shelf.cleanPng(corrupt),{status:415});assert.throws(()=>shelf.cleanPng(Buffer.from('<svg onload="alert(1)">')),{status:415});await assert.rejects(()=>shelf.cover(a,'../../auth',null),{status:404});await assert.rejects(()=>shelf.change(a,{kind:'alias',id,value:'x'.repeat(101)}),{status:400});
 await shelf.change(a,{kind:'alias',id,value:''});await shelf.cover(a,'character:A.png',null);assert.equal((await shelf.decorate(a,await c.catalog(a,{withCharacters:true}))).characters[0].cover,'');
 assert.deepEqual(await fs.readFile(path.join(a.characters,'A.png')),original);assert.deepEqual(await fs.readFile(path.join(a.chats,'A','one.jsonl')),raw);
});
test('search uses filtered saved translations, pages past 300 messages, rejects invalid input; snapshot scope and revision',async t=>{
 const a=await fixture(t);const f=path.join(a.chats,'A','one.jsonl');
 await fs.writeFile(f,Array.from({length:340},(_,i)=>JSON.stringify({name:'A',mes:'<think>HIDDENREASON</think>raw '+i,extra:{display_text:'<think>HIDDENREASON</think>번역 '+i,translations:{en:i===335?'the needle final':'other'}}})).join('\n'));
 assert.equal((await search.search(a,id,'HIDDENREASON')).results.length,0);assert.equal((await search.search(a,id,'raw')).results.length,0);
 let r=await search.search(a,id,'needle');assert.equal(r.next,300);assert.equal(r.results.length,0);r=await search.search(a,id,'needle',r.next);assert.equal(r.results[0].index,335);assert.equal(r.next,null);
 assert.equal((await search.search(a,id,'번역 33')).results[0].index,33);await assert.rejects(()=>search.search(a,id,'x',-1),{status:400});
 const first=await reading.snapshot(a,id);assert.equal(first.scope,(await shelf.state(a)).scope);assert.ok(first.revision);await fs.appendFile(f,'\n'+JSON.stringify({name:'A',mes:'new'}));assert.notEqual((await reading.snapshot(a,id)).revision,first.revision);
});
