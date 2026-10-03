'use strict';
// Optional integration test: NODE_PATH with express/playwright, Chromium installed.
// One browser profile and host, with three independent HTTP/HTTPS entrances.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),https=require('node:https'),express=require('express'),{chromium}=require('playwright');
const core=require('../core.cjs'),plugin=require('../index.cjs'),bridge=require('../local-https.cjs'),{configure}=require('../../scripts/setup-https.cjs');
(async()=>{
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-session-origins-')),servers=[];let browser;
 try{
  const dirs={root:path.join(temp,'user'),chats:path.join(temp,'user/chats'),groupChats:path.join(temp,'user/groups')};
  for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
  await core.atomicJson(path.join(await core.stateDir(dirs.root),'auth.json'),{salt:'fixture',hash:await core.passwordHash('fixture-password-123','fixture')});
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});
  const router=express.Router();await plugin.init(router);app.use(bridge.BASE,router);
  const listen=async server=>{servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return server.address().port;};
  const plainPort=await listen(http.createServer(app));
  await configure({ip:'100.64.0.10',dir:path.join(temp,'cert')});const cert=await bridge.load(path.join(temp,'cert'));
  const securePort=await listen(https.createServer({key:cert.key,cert:cert.cert},app));
  const otherPort=await listen(https.createServer({key:cert.key,cert:cert.cert},app));
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  const origins=[`http://127.0.0.1:${plainPort}`,`https://127.0.0.1:${securePort}`,`https://127.0.0.1:${otherPort}`];
  const pages=[];for(const origin of origins){const page=await context.newPage();await page.goto(origin+bridge.BASE+'/status');pages.push(page);}
  const request=(page,route,body)=>page.evaluate(async({route,body,base})=>{
   const r=await fetch(base+route,{credentials:'same-origin',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-Silly-Request':'1'},body:JSON.stringify(body)})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{throw Error('Unexpected response '+r.status+' '+text.slice(0,240));}return {status:r.status,data};
  },{route,body,base:bridge.BASE});
  const login=page=>request(page,'/login',{password:'fixture-password-123'});
  const status=async page=>(await request(page,'/status')).data.authenticated;
  assert.equal((await login(pages[0])).status,200);assert.equal(await status(pages[0]),true);
  assert.equal((await login(pages[1])).status,200);assert.equal(await status(pages[1]),true);
  assert.equal(await status(pages[0]),true,'HTTPS login must not destroy HTTP login');
  assert.equal((await login(pages[0])).status,200);assert.equal(await status(pages[0]),true,'HTTP login must work after HTTPS');
  assert.equal(await status(pages[1]),true,'HTTP re-login must preserve HTTPS session');
  assert.equal((await login(pages[2])).status,200);
  for(const page of pages)assert.equal(await status(page),true,'different ports must have independent sessions');
  // Upgrades must ignore stale cookies without requiring website-data deletion.
  await context.addCookies([{name:'silly_bookshop',value:'a'.repeat(64),domain:'127.0.0.1',path:bridge.BASE,secure:true,httpOnly:true,sameSite:'Strict'}]);
  for(const page of pages)assert.equal(await status(page),true,'legacy Secure cookie must not interfere');
  const cookies=(await context.cookies()).filter(c=>c.name.startsWith('silly_bookshop_'));
  assert.equal(cookies.length,3);assert.equal(new Set(cookies.map(c=>c.name)).size,3);
  assert.equal(cookies.filter(c=>c.secure).length,2);assert.ok(cookies.every(c=>c.httpOnly&&c.sameSite==='Strict'));
  // Even manually renaming a token for another origin must not bypass server binding.
  const plainCookie=(await context.cookies(origins[0]+bridge.BASE+'/')).find(c=>c.name.startsWith('silly_bookshop_'));
  const secureCookie=cookies.find(c=>c.secure);
  const wrongOrigin=await context.request.get(origins[0]+bridge.BASE+'/catalog',{headers:{Cookie:plainCookie.name+'='+secureCookie.value}});
  assert.equal(wrongOrigin.status(),401);
  assert.equal((await request(pages[1],'/logout',{})).status,200);
  assert.equal(await status(pages[1]),false);assert.equal(await status(pages[0]),true);assert.equal(await status(pages[2]),true);
  assert.equal((await login(pages[1])).status,200);assert.equal(await status(pages[1]),true);
  console.log('PASS: HTTP/HTTPS login in both orders, separate ports, stale Secure cookie, origin binding and independent logout');
 }finally{if(browser)await browser.close();for(const s of servers){s.closeAllConnections();await new Promise(r=>s.close(r));}await plugin.exit();await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
