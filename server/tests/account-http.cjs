'use strict';
const express=require('express'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const c=require('../core.cjs'),account=require('../account.cjs'),plugin=require('../index.cjs');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'silly-account-'));let server;
try{
 const users={};for(const name of ['a','b']){
  const root=path.join(temp,name),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats')};
  for(const d of Object.values(dirs))await fs.mkdir(d,{recursive:true});users[name]=dirs;
  await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('old-password-123','fixture')});
 }
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:users[req.get('x-fixture-user')||'a']};next();});
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/silly-bookshop',router);
 server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/silly-bookshop';
 const post=(route,data,extra={})=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Silly-Request':'1',...extra},body:JSON.stringify(data)});
 const login=async password=>{const r=await post('/login',{password});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
 const check=async cookie=>(await fetch(base+'/catalog',{headers:{Cookie:cookie}})).status;
 assert.equal((await post('/account/password',{password:'old-password-123',newPassword:'new-password-123'})).status,401);
 const cookie=await login('old-password-123'),other=await login('old-password-123');
 assert.equal((await post('/account/recovery-code',{password:'old-password-123'},{Cookie:cookie,Origin:'https://evil.invalid'})).status,403);
 assert.equal((await post('/account/recovery-code',{password:'old-password-123'},{Cookie:cookie,'X-Silly-Request':''})).status,403);
 const codeResponse=await post('/account/recovery-code',{password:'old-password-123'},{Cookie:cookie});assert.equal(codeResponse.status,200);const firstCode=(await codeResponse.json()).recoveryCode;
 assert.equal(await check(cookie),200);
 const file=path.join(await c.stateDir(users.a.root),'auth.json');assert.ok(!(await fs.readFile(file,'utf8')).includes(firstCode));
 assert.equal((await post('/account/password',{password:'wrong',newPassword:'new-password-123'},{Cookie:cookie})).status,400);
 const before=await fs.readFile(file,'utf8');
 assert.equal((await post('/account/password',{password:'old-password-123',newPassword:'short'},{Cookie:cookie})).status,400);assert.equal(await fs.readFile(file,'utf8'),before);
 const changed=await post('/account/password',{password:'old-password-123',newPassword:'new-password-123'},{Cookie:cookie});assert.equal(changed.status,200);const secondCode=(await changed.json()).recoveryCode;
 assert.equal(await check(cookie),401);assert.equal(await check(other),401);
 assert.equal((await post('/login',{password:'old-password-123'})).status,401);
 const newCookie=await login('new-password-123');
 assert.equal((await post('/account/reset',{code:firstCode,newPassword:'reset-password-123'})).status,400);
 assert.equal((await post('/account/reset',{code:secondCode,newPassword:'reset-password-123'},{'x-fixture-user':'b'})).status,400);
 const chatId=c.encode(['group','keep.jsonl']);await c.position(users.a.root,chatId,{index:5,fraction:0.4});
 const simultaneous=await Promise.all([post('/account/reset',{code:secondCode,newPassword:'reset-password-123'}),post('/account/reset',{code:secondCode,newPassword:'reset-password-123'})]);
 assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,400]);
 const thirdCode=(await simultaneous.find(x=>x.status===200).json()).recoveryCode;
 assert.equal(await check(newCookie),401);assert.equal(await check(await login('reset-password-123')),200);
 assert.equal((await c.position(users.a.root,chatId)).index,5);
 assert.equal(account.matchesRecovery(secondCode,await c.authConfig(users.a.root)),false);
 assert.equal(account.matchesRecovery(thirdCode,await c.authConfig(users.a.root)),true);
 assert.equal((await post('/account/reset',{code:thirdCode,newPassword:'x'.repeat(9000)})).status,413);
 let limited=false;for(let i=0;i<12;i++){const r=await post('/account/reset',{code:'bad',newPassword:'reset-password-123'},{'x-fixture-user':'b','X-Forwarded-For':'10.0.0.'+i});if(r.status===429){limited=true;break;}assert.equal(r.status,400);}assert.ok(limited);
 console.log('PASS: current-password check; legacy auth upgrade; hash-only recovery; all sessions revoked; old credentials rejected; user isolation; single-use recovery under race; positions preserved; Origin/header gates; bounds and rate limits.');
}finally{if(server)await new Promise(r=>server.close(r));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
