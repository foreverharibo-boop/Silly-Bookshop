'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const c=require('../core.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'silly-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),groups:path.join(root,'groups'),characters:path.join(root,'characters')};for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(dirs.chats,'캐릭터'));await fs.writeFile(path.join(dirs.characters,'캐릭터.png'),'card');return dirs;}
test('path traversal, encoded traversal and symlinks cannot read outside chats',async t=>{
    const d=await fixture(t);await fs.writeFile(path.join(d.root,'secret.jsonl'),'secret');
    for(const parts of [['chat','..','secret.jsonl'],['chat','캐릭터','../../secret.jsonl'],['group','/secret.jsonl'],['group','secret.json'],['x','secret.jsonl']])assert.throws(()=>c.decode(c.encode(parts)));
    await fs.symlink(path.join(d.root,'secret.jsonl'),path.join(d.chats,'캐릭터','link.jsonl'));
    await assert.rejects(()=>c.chatFile(d,c.encode(['chat','캐릭터','link.jsonl'])),{status:403});
});
test('header skipped; selected swipe uses mes (manual edits retained); malformed lines noted',()=>{
    const parsed=c.parseChat('{"chat_metadata":{}}\n'+JSON.stringify({name:'홍진',mes:'edited current',swipe_id:1,swipes:['old','before edit'],extra:{display_text:'번역'}})+'\nBROKEN\n'+JSON.stringify({name:'나',mes:'reply',is_user:true})+'\n{"partial":');
    assert.equal(parsed.messages.length,2);assert.equal(parsed.messages[0].text,'edited current');assert.equal(parsed.messages[0].displayText,'번역');assert.equal(parsed.messages[1].user,true);assert.equal(parsed.skipped,1);
});
test('large metadata and unused swipes do not block the selected messages or change reading indexes',async t=>{
    const d=await fixture(t),file=path.join(d.chats,'캐릭터','큰 저장 정보.jsonl');
    const padding='x'.repeat(1024*1024+1),selected={name:'캐릭터',mes:'edited current',swipe_id:1,extra:{display_text:'현재 번역'},send_date:'today'};
    const original=[JSON.stringify({chat_metadata:{variables:{place:'책방'},extension_data:padding}}),JSON.stringify({...selected,swipes:[padding,'before edit'],extra:{...selected.extra,extension_data:padding}}),JSON.stringify({name:'나',mes:'reply',is_user:true})].join('\n');
    await fs.writeFile(file,original);
    const id=c.encode(['chat','캐릭터','큰 저장 정보.jsonl']);await c.position(d.root,id,{index:1,fraction:.4});
    const parsed=c.parseChat(await c.readText(file,32*1024*1024));
    assert.equal(parsed.metadata.variables.place,'책방');assert.equal(parsed.messages.length,2);assert.equal(parsed.skipped,0);
    assert.deepEqual(parsed.messages.map(m=>m.index),[0,1]);assert.equal(parsed.messages[0].text,'edited current');assert.equal(parsed.messages[0].displayText,'현재 번역');
    assert.equal(parsed.messages[0].sourceHash,c.messageHash(selected));assert.ok(!JSON.stringify(parsed.messages).includes(padding));
    assert.equal((await c.position(d.root,id)).index,1);assert.equal((await c.position(d.root,id)).fraction,.4);assert.equal(await fs.readFile(file,'utf8'),original);
});
test('large current text is retained, while the complete chat remains bounded to 32 MiB',()=>{
    const text='가'.repeat(1024*1024+1),parsed=c.parseChat(JSON.stringify({mes:text}));
    assert.equal(parsed.messages[0].text,text);
    assert.throws(()=>c.parseChat(JSON.stringify({chat_metadata:{data:'가'.repeat(Math.ceil(32*1024*1024/3))}})),{status:413,message:'32MB를 넘는 대화는 현재 버전에서 열 수 없습니다.'});
});
test('catalog includes characters/groups, excludes symlinks; source remains byte identical',async t=>{
    const d=await fixture(t),file=path.join(d.chats,'캐릭터','첫 대화.jsonl');const original='{"mes":"hello","name":"캐릭터"}\n';await fs.writeFile(file,original);
    await fs.writeFile(path.join(d.groupChats,'g1.jsonl'),original);await fs.writeFile(path.join(d.groups,'g.json'),JSON.stringify({name:'친구들',chat_id:'g1',chats:['g1']}));
    const list=await c.catalog(d);assert.equal(list.length,2);assert.ok(list.some(x=>x.character==='그룹 · 친구들'));
    const id=c.encode(['chat','캐릭터','첫 대화.jsonl']);await c.position(d.root,id,{index:12,fraction:.3});assert.equal((await c.position(d.root,id)).index,12);assert.equal(await fs.readFile(file,'utf8'),original);
});
test('concurrent position writes preserve separate chats and user separation',async t=>{
    const d=await fixture(t),other=await fixture(t),a=c.encode(['group','a.jsonl']),b=c.encode(['group','b.jsonl']);
    await Promise.all([c.position(d.root,a,{index:1,fraction:.2}),c.position(d.root,b,{index:2,fraction:.5})]);
    assert.equal((await c.position(d.root,a)).index,1);assert.equal((await c.position(d.root,b)).index,2);assert.equal(await c.position(other.root,a),null);
    await assert.rejects(()=>c.position(d.root,a,{index:-1,fraction:0}),{status:400});
});
test('password checks use salted hash',async()=>{
    const salt='test-salt',hash=await c.passwordHash('correct-pass',salt);assert.equal(await c.verifyPassword('correct-pass',{salt,hash}),true);assert.equal(await c.verifyPassword('wrong-pass',{salt,hash}),false);
});

test('catalog follows current cards and group metadata, including empty characters, without deleting orphan history',async t=>{
    const d=await fixture(t),file=path.join(d.chats,'캐릭터','대화.jsonl'),original='{"mes":"saved history"}';
    await fs.writeFile(file,original);await fs.writeFile(path.join(d.characters,'새 친구.png'),'card');
    await fs.writeFile(path.join(d.groupChats,'current.jsonl'),original);await fs.writeFile(path.join(d.groupChats,'orphan.jsonl'),original);
    await fs.writeFile(path.join(d.groups,'g.json'),JSON.stringify({name:'현재 그룹',chat_id:'current'}));
    let data=await c.catalog(d,{withCharacters:true});assert.equal(data.characters.length,3);assert.equal(data.chats.length,2);
    assert.ok(data.characters.some(p=>p.character==='새 친구'));assert.ok(!data.chats.some(c=>c.title==='orphan'));
    await fs.unlink(path.join(d.characters,'캐릭터.png'));await fs.unlink(path.join(d.groups,'g.json'));
    data=await c.catalog(d,{withCharacters:true});assert.deepEqual(data.characters.map(p=>p.character),['새 친구']);assert.equal(data.chats.length,0);
    assert.equal(await fs.readFile(file,'utf8'),original);assert.equal(await fs.readFile(path.join(d.groupChats,'current.jsonl'),'utf8'),original);
    await fs.writeFile(path.join(d.characters,'캐릭터.png'),'card');await fs.unlink(file);
    data=await c.catalog(d,{withCharacters:true});assert.equal(data.characters.length,2);assert.equal(data.chats.length,0);
});
