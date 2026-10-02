'use strict';
// Optional integration suite, requires express 4 in NODE_PATH.
const express=require('express'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'silly-http-'));let server;
try{
const users={};for(const name of ['a','b','unconfigured']){
 const root=path.join(temp,name),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),groups:path.join(root,'groups')};
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});users[name]=dirs;
 await fs.writeFile(path.join(dirs.groupChats,'chat.jsonl'),JSON.stringify({mes:'private-'+name,name:'test'})+'\n');
 if(name!=='unconfigured')await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'http-test',hash:await c.passwordHash('test-password-123','http-test')});
}
const app=express();app.use(express.json({limit:'20kb'}));
// The selector exists ONLY in this fixture; production always uses SillyTavern req.user.
app.use((req,res,next)=>{if(req.get('x-fixture-user')!=='none')req.user={directories:users[req.get('x-fixture-user')||'a']};res.set('Access-Control-Allow-Origin','https://evil.invalid');next();});
const router=express.Router();await plugin.init(router);app.use('/api/plugins/silly-bookshop',router);
server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/silly-bookshop';
const post=(route,data,extra={})=>fetch(base+route,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Silly-Request':'1',...extra},body:JSON.stringify(data)});
assert.equal((await fetch(base+'/catalog')).status,401);
for(const route of ['/bookmarks?id=x','/offline?id=x'])assert.equal((await fetch(base+route)).status,401);
assert.equal((await post('/bookmarks',{id:'x',index:0,note:'',remove:false})).status,401);
assert.equal((await post('/visit',{id:'x'})).status,401);
assert.equal((await fetch(base+'/status',{headers:{'x-fixture-user':'none'}})).status,403);
assert.equal((await fetch(base+'/catalog',{headers:{'x-fixture-user':'unconfigured'}})).status,401);
assert.equal((await post('/login',{password:'test-password-123'},{'x-fixture-user':'unconfigured'})).status,409);
assert.equal((await post('/login',{password:'test-password-123'},{Origin:'https://127.0.0.1:'+server.address().port})).status,403);
assert.equal((await post('/login',{password:'test-password-123'},{'X-Silly-Request':''})).status,403);
assert.equal((await post('/login',{password:'x'.repeat(9000)})).status,413);
const login=await post('/login',{password:'test-password-123'});assert.equal(login.status,200);
const rawCookie=login.headers.get('set-cookie'),cookie=rawCookie.split(';')[0];assert.match(rawCookie,/HttpOnly/);assert.match(rawCookie,/SameSite=Strict/);assert.match(rawCookie,/Path=\/api\/plugins\/silly-bookshop/);
const catalog=await fetch(base+'/catalog',{headers:{Cookie:cookie}});assert.equal(catalog.status,200);assert.equal(catalog.headers.get('access-control-allow-origin'),null);assert.equal(catalog.headers.get('x-frame-options'),'DENY');assert.equal(catalog.headers.get('cache-control'),'no-store');
assert.equal((await fetch(base+'/catalog',{headers:{Cookie:cookie,'x-fixture-user':'b'}})).status,401);
for(const route of ['/bookmarks?id=x','/offline?id=x'])assert.equal((await fetch(base+route,{headers:{Cookie:cookie,'x-fixture-user':'b'}})).status,401);
assert.equal((await post('/bookmarks',{id:'x',index:0,note:'',remove:false},{Cookie:cookie,Origin:'https://evil.invalid'})).status,403);
const otherHostStatus=await new Promise((resolve,reject)=>{require('node:http').get(base+'/catalog',{headers:{Cookie:cookie,Host:'other.invalid'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(otherHostStatus,401);
assert.equal((await fetch(base+'/catalog',{headers:{Cookie:cookie,Origin:'https://evil.invalid'}})).status,403);
const id=c.encode(['group','chat.jsonl']);const read=await fetch(base+'/chat?id='+id,{headers:{Cookie:cookie}});const data=await read.json();assert.equal(data.messages[0].content,'private-a');assert.equal(data.messages[0].text,undefined);assert.equal(data.displayPolicy,'saved-display-v1');
assert.equal((await fetch(base+'/chat?id='+c.encode(['group','../auth.json']),{headers:{Cookie:cookie}})).status,400);
assert.equal((await fetch(base+'/chat?id='+id+'&start=-1',{headers:{Cookie:cookie}})).status,400);
const unchanged=await (await fetch(base+'/chat?id='+id+'&revision='+encodeURIComponent(data.revision),{headers:{Cookie:cookie}})).json();assert.equal(unchanged.unchanged,true);
assert.equal((await post('/position',{id,position:{index:-1,fraction:0}},{Cookie:cookie})).status,400);
assert.equal((await post('/position',{id,position:{index:0,fraction:0.4}},{Cookie:cookie})).status,200);
assert.equal(await c.position(users.b.root,id),null);
const large=path.join(users.a.groupChats,'large.jsonl');const fh=await fs.open(large,'w');await fh.truncate(32*1024*1024+1);await fh.close();assert.equal((await fetch(base+'/chat?id='+c.encode(['group','large.jsonl']),{headers:{Cookie:cookie}})).status,413);
const pages=Array.from({length:6},(_,i)=>JSON.stringify({name:'test',mes:String(i)+':'+('a'.repeat(500000))})).join('\n');await fs.writeFile(path.join(users.a.groupChats,'paged.jsonl'),pages);
const pagedId=c.encode(['group','paged.jsonl']);const capture=require('../capture.cjs');const parsed=c.parseChat(pages).messages;await capture.write(users.a,pagedId,parsed.map(m=>({index:m.index,sourceText:m.text,displayText:null,name:m.name,user:m.user,date:m.date,html:'<div>'+('a'.repeat(500000))+'</div>'})),2);const first=await (await fetch(base+'/chat?id='+pagedId,{headers:{Cookie:cookie}})).json();assert.ok(first.messages.length<6);assert.equal(first.nextStart,first.messages.length);
const second=await (await fetch(base+'/chat?id='+pagedId+'&start='+first.nextStart,{headers:{Cookie:cookie}})).json();assert.equal(second.messages[0].index,first.nextStart);assert.equal(second.nextStart,6);
// Normal logout invalidates the bearer even if a caller keeps the old cookie.
assert.equal((await post('/logout',{}, {Cookie:cookie})).status,200);assert.equal((await fetch(base+'/catalog',{headers:{Cookie:cookie}})).status,401);
// Spoofed X-Forwarded-For must not reset the socket-based login counter.
let blocked=false;for(let i=0;i<12;i++){const r=await post('/login',{password:'wrong-password'},{'x-fixture-user':'b','X-Forwarded-For':'10.0.0.'+i});if(r.status===429){blocked=true;break;}assert.equal(r.status,401);}assert.equal(blocked,true);
const again=await post('/login',{password:'test-password-123'});assert.equal(again.status,200);const idleCookie=again.headers.get('set-cookie').split(';')[0];const realNow=Date.now,future=realNow()+31*60000;
try{Date.now=()=>future;assert.equal((await fetch(base+'/catalog',{headers:{Cookie:idleCookie}})).status,401);}finally{Date.now=realNow;}
console.log('PASS: no-user/unconfigured gates, exact Origin, custom header, oversized body, cookie flags, CORS removal, user/Origin isolation, traversal, bounds, polling, position isolation, file limit, logout and spoof-resistant rate limit');
}finally{if(server)await new Promise(r=>server.close(r));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
