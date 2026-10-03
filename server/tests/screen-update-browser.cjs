'use strict';
// Real service-worker upgrades on the same origin/profile. Optional actual previous source tree.
const express=require('express'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..'),c=require('../core.cjs'),plugin=require('../index.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-update-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let server,ctx;
 try{
  for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dirs.characters,'테스트.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDd0AAAAASUVORK5CYII=','base64'));
  await fs.mkdir(path.join(dirs.chats,'테스트'));
  await fs.writeFile(path.join(dirs.chats,'테스트','UPDATE_TEST.jsonl'),Array.from({length:36},(_,i)=>JSON.stringify({name:'테스트',mes:'PRIVATE_CONTENT '+i+'\n'+'긴 대화를 읽어요. '.repeat(30)})).join('\n'));
  await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
  const current=express.Router();await plugin.init(current);
  let active=current,version='1.0.3',unavailable=false,failAsset=false;
  if(process.env.SILLY_PREVIOUS_SOURCE){active=express.Router();await require(path.join(process.env.SILLY_PREVIOUS_SOURCE,'server/index.cjs')).init(active);version='1.0.2';}
  const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture'}));
  const base='/api/plugins/silly-bookshop/';
  app.use(async(req,res,next)=>{
   if(unavailable)return res.status(503).send('server offline');
   const rel=req.path.startsWith(base)?req.path.slice(base.length):'';
   if(failAsset&&rel==='web-reader.js')return res.status(503).send('asset unavailable');
   if(version==='1.0.4'&&req.method==='GET'){
    if(rel==='status'){const json=res.json.bind(res);res.json=data=>json({...data,version,shellVersion:version+'-screen-update'});}
    if(/^[a-z0-9-]+\.(?:js|css|html|json|svg|png)$/.test(rel)||rel.startsWith('fonts/')||req.path===base){
     const name=rel||'index.html';let body=await fs.readFile(path.join(project,'server/public',name));
     if(/\.(?:js|html)$/.test(name))body=Buffer.from(body.toString().replaceAll('1.0.3','1.0.4'));
     return res.set({'Cache-Control':'no-store','X-Silly-Bookshop-Version':version}).type(name).send(body);
    }
   }
   next();
  });
  app.use('/api/plugins/silly-bookshop',(req,res,next)=>active(req,res,next));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const url='http://127.0.0.1:'+server.address().port+base;
  ctx=await chromium.launchPersistentContext(path.join(root,'profile'),{headless:true,args:['--no-sandbox'],viewport:{width:390,height:844}});let page=await ctx.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const login=async()=>{if(await page.locator('#password').isVisible()){await page.locator('#password').fill('test-password');await page.locator('#login-form .primary').click();await page.locator('#library').waitFor({state:'visible'});}};
  const unlock=async()=>{await page.locator('#vault-password').fill('offline-password-123');await page.locator('#vault-unlock').click();await page.locator('.vault-story').waitFor();};
  const dump=()=>page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('silly-bookshop-web-vault-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});return new Promise(resolve=>{const q=db.transaction('items').objectStore('items').getAll();q.onsuccess=()=>resolve(JSON.stringify(q.result));});});
  await page.goto(url);await login();await page.locator('.character').first().click();await page.locator('.thread').first().click();await page.locator('.message').first().waitFor();
  await page.locator('#tools').click();await page.locator('#web-save').click();await page.getByText('보관함 잠금을 풀면 현재 대화를 저장해요.',{exact:true}).waitFor({timeout:70000});
  await page.locator('#vault-password').fill('offline-password-123');await page.locator('#vault-confirm').fill('offline-password-123');await page.locator('#vault-unlock').click();await page.locator('.vault-story').waitFor();
  await page.locator('.vault-story').click();let frame=page.frameLocator('#vault-reader iframe');await frame.locator('.message').first().waitFor();await frame.locator('#off-last').click();await frame.locator('[data-index="35"]').waitFor();await page.waitForTimeout(1200);await frame.locator('#off-home').click();const before=await dump();
  active=current;version='1.0.3';await page.close();page=await ctx.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(url);await page.locator('.web-screen-update').first().waitFor({state:'attached'});await login();
  if(await page.locator('#tools-dialog').isVisible())await page.locator('[data-close=tools-dialog]').click();
  await page.locator('.top-actions .web-screen-update').click();await page.getByText('화면 1.0.3 적용을 확인했어요.',{exact:false}).waitFor({timeout:90000});await page.locator('#screen-update-dialog button').click();await login();
  await page.locator('#tools').click();await page.locator('#tools-dialog .web-vault-open').click();await unlock();assert.equal(await dump(),before);assert.equal(await page.locator('#vault-confirm').isVisible(),false);
  // Server is off: no reload, no successful update message, no mutation to encrypted vault.
  unavailable=true;await page.locator('.vault-head .web-screen-update').click();await page.getByText('서버에 연결하지 못했어요.',{exact:false}).waitFor();assert.equal(await dump(),before);assert.ok(await page.locator('.vault-story').isVisible());await page.locator('#screen-update-dialog button').click();unavailable=false;
  // A newer server publishes all assets; update in the vault, verify version AFTER reload.
  version='1.0.4';failAsset=true;await page.locator('.vault-head .web-screen-update').click();await page.getByText('새 화면 파일을 모두 준비하지 못했어요.',{exact:false}).waitFor({timeout:90000});assert.equal(await dump(),before);await page.locator('#screen-update-dialog button').click();failAsset=false;
  await page.locator('.vault-head .web-screen-update').click();await page.getByText('화면 1.0.4 적용을 확인했어요.',{exact:false}).waitFor({timeout:90000});assert.equal(await dump(),before);await page.locator('#screen-update-dialog button').click();
  await login();await page.locator('#tools').click();await page.locator('#tools-dialog .web-vault-open').click();await unlock();await page.locator('.vault-story').click();frame=page.frameLocator('#vault-reader iframe');await frame.locator('[data-index="35"]').waitFor();await frame.locator('#off-home').click();
  // Network completely gone after update: cached vault still opens with old password and position.
  await new Promise(resolve=>server.close(resolve));server=null;await ctx.setOffline(true);await page.reload();await unlock();assert.equal(await page.locator('#vault-confirm').isVisible(),false);await page.locator('.vault-story').click();frame=page.frameLocator('#vault-reader iframe');await frame.locator('[data-index="35"]').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: actual previous vault retained through upgrade; server-off/partial-download updates fail without reload; next-version assets installed and verified after reload; encrypted records unchanged; old password and reading position survive fully offline reopening.');
 }finally{if(ctx){for(const page of ctx.pages()){await page.screenshot({path:path.join(root,'last-screen.png')}).catch(()=>{});}console.log('Evidence:',root);await ctx.close();}if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
