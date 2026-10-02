'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const c=require('../core.cjs'),s=require('../security.cjs');
test('plaintext transport accepts loopback/tailnet and rejects LAN/public/spoofed forwarding',()=>{
    for(const ip of ['127.0.0.1','::1','::ffff:100.64.0.1','100.127.255.254','fd7a:115c:a1e0::1'])assert.equal(s.privateTransport(ip),true,ip);
    for(const ip of ['192.168.1.2','10.0.0.1','8.8.8.8','100.128.0.1','100.63.255.255','evil.local','127.0.0.999'])assert.equal(s.privateTransport(ip),false,ip);
    assert.equal(s.transportAllowed({socket:{remoteAddress:'8.8.8.8'},headers:{'x-forwarded-for':'127.0.0.1','x-forwarded-proto':'https'}}),false);
    assert.equal(s.transportAllowed({socket:{remoteAddress:'8.8.8.8',encrypted:true},headers:{}}),true);
    assert.equal(s.transportAllowed({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-proto':'http'}}),false);
});
test('Origin includes protocol and port, not only hostname',()=>{
    const req={protocol:'http',headers:{host:'127.0.0.1:8000',origin:'http://127.0.0.1:8000'}};
    assert.equal(s.sameOrigin(req),true);
    for(const origin of ['https://127.0.0.1:8000','http://127.0.0.1:8001','http://127.0.0.1:8000.evil.invalid','null',undefined])assert.equal(s.sameOrigin({...req,headers:{...req.headers,origin}}),false);
});
test('rate buckets and expensive-work concurrency have hard caps',async()=>{
    const rate=s.bucket(2,60000,1);rate('one');rate('one');assert.throws(()=>rate('one'),{status:429});assert.throws(()=>rate('two'),{status:429});
    const work=s.concurrency(1);let release;const pending=work(()=>new Promise(r=>release=r));await assert.rejects(()=>work(async()=>1),{status:429});release();await pending;assert.equal(await work(async()=>2),2);
});
test('bounded read rejects oversize, symlink, hardlink and non-file',async t=>{
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sili-limits-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
    const original=path.join(temp,'source');await fs.writeFile(original,'123456789');await assert.rejects(()=>c.readText(original,5),{status:413});assert.equal(await c.readText(original,9),'123456789');
    await fs.symlink(original,path.join(temp,'sym'));await assert.rejects(()=>c.readText(path.join(temp,'sym')),{status:403});
    await fs.link(original,path.join(temp,'hard'));await assert.rejects(()=>c.readText(path.join(temp,'hard')),{status:403});await assert.rejects(()=>c.readText(temp),{status:403});
});
test('state directory and auth file symlinks are rejected',async t=>{
    const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sili-state-'));t.after(()=>fs.rm(temp,{recursive:true,force:true}));
    const user=path.join(temp,'user'),outside=path.join(temp,'outside');await fs.mkdir(user);await fs.mkdir(outside);await fs.symlink(outside,path.join(user,c.STATE));await assert.rejects(()=>c.authConfig(user),{status:403});
    await fs.unlink(path.join(user,c.STATE));await c.stateDir(user);const target=path.join(outside,'key');await fs.writeFile(target,'{}');await fs.symlink(target,path.join(user,c.STATE,'auth.json'));await assert.rejects(()=>c.authConfig(user),{status:403});
});
test('noncanonical IDs and giant JSONL lines are rejected',()=>{
    const id=c.encode(['group','a.jsonl']);assert.throws(()=>c.decode(id+'='),{status:400});assert.throws(()=>c.decode(id+'\n'),{status:400});
    assert.throws(()=>c.parseChat(JSON.stringify({mes:'x'.repeat(1024*1024)})),{status:413});
});
test('repository root loads the server plugin directly',()=>{
    const plugin=require('../..');assert.equal(plugin.info.id,'sili-library');assert.equal(typeof plugin.init,'function');
});
