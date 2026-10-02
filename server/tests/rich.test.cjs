'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const c=require('../core.cjs'),capture=require('../capture.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-rich-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const d={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};for(const dir of Object.values(d))await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(d.chats,'A'));return d;}
test('translations keep current display and stored variants without metadata or duplicate text',()=>{
    const m={mes:'original',extra:{display_text:'번역',translations:{ko:'번역',en:'second'},translation:{text:'third',apiKey:'never expose'},secret:'private'},swipe_id:1,swipe_info:[{extra:{translation:'old swipe'}},{extra:{translation:'current swipe'}}]};
    const all=c.parseChat(JSON.stringify(m)).messages[0];assert.deepEqual(all.translations.map(v=>v.text),['번역','third','second','current swipe']);assert.ok(!JSON.stringify(all).includes('private'));assert.ok(!JSON.stringify(all).includes('never expose'));assert.ok(!JSON.stringify(all).includes('old swipe'));
});
test('PNG avatars match character folder and never expose card metadata or follow links',async t=>{
    const d=await fixture(t),png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P6sAAAAASUVORK5CYII=','base64');
    const text=Buffer.from('chara\0PRIVATE_CARD'),chunk=Buffer.alloc(text.length+12);chunk.writeUInt32BE(text.length,0);chunk.write('tEXt',4);text.copy(chunk,8);
    await fs.writeFile(path.join(d.characters,'A.png'),Buffer.concat([png.subarray(0,33),chunk,png.subarray(33)]));
    await fs.writeFile(path.join(d.chats,'A','one.jsonl'),JSON.stringify({mes:'hello'}));
    assert.equal((await c.catalog(d))[0].avatar,'A.png');assert.deepEqual(await c.avatar(d,'A.png'),png);
    await assert.rejects(()=>c.avatar(d,'../A.png'),{status:400});await fs.symlink(path.join(d.characters,'A.png'),path.join(d.characters,'link.png'));await assert.rejects(()=>c.avatar(d,'link.png'),{status:403});
});
test('capture matches persisted current message and is invalidated by edits, translation, swipe or index changes',async t=>{
    const d=await fixture(t),id=c.encode(['chat','A','one.jsonl']),file=path.join(d.chats,'A','one.jsonl');
    let m={mes:'hello',name:'A',send_date:'date',extra:{display_text:'안녕'}};const raw=JSON.stringify(m);await fs.writeFile(file,raw);
    const item={index:0,sourceText:m.mes,displayText:m.extra.display_text,name:'A',user:false,date:'date',html:'<div>visible</div>'};
    assert.deepEqual((await capture.write(d,id,[item])).accepted,[0]);const saved=(await capture.read(d.root,id))[0];assert.equal(saved.sourceHash,c.parseChat(raw).messages[0].sourceHash);assert.ok(await capture.revision(d.root,id));assert.equal(await fs.readFile(file,'utf8'),raw);
    m.extra.display_text='새 번역';await fs.writeFile(file,JSON.stringify(m));assert.deepEqual((await capture.write(d,id,[item])).accepted,[]);assert.notEqual(saved.sourceHash,c.parseChat(JSON.stringify(m)).messages[0].sourceHash);
    await assert.rejects(()=>capture.write(d,id,[{...item,html:'a'.repeat(512*1024+1)}]),{status:400});
    const other=await fixture(t);assert.deepEqual(await capture.read(other.root,id),{});
});
