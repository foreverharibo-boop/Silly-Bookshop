'use strict';
const express=require('express'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
function png(red=40){
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(16);hdr.writeUInt32BE(16,4);hdr[8]=8;hdr[9]=2;
 const scan=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=y*49+1+x*3;scan[i]=red;scan[i+1]=110;scan[i+2]=210;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',require('node:zlib').deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}

(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'silly-home-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let browser,server;
 try{
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
 const names=['신','Emris','김홍진','아주 긴 캐릭터 이름도 안전하게 표시해요','<img src=x onerror=alert(1)>',...Array.from({length:15},(_,i)=>'캐릭터 '+(i+1))];
 for(const [i,name] of names.entries()){
  await fs.writeFile(path.join(dirs.characters,name+'.png'),png((30+i*40)%256));await fs.mkdir(path.join(dirs.chats,name));
  for(let j=0;j<3;j++)await fs.writeFile(path.join(dirs.chats,name,'이야기 '+j+'.jsonl'),JSON.stringify({name,mes:'첫 번째 대화'}));
 }
 const state=await c.stateDir(root);await c.atomicJson(path.join(state,'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
 const chats=await c.catalog(dirs),visits={};chats.forEach((x,i)=>visits[x.id]=Date.now()-i*1000);await c.atomicJson(path.join(state,'visits.json'),visits);
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture'}));
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/silly-bookshop',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/api/plugins/silly-bookshop/');await page.locator('#password').fill('test-password');await page.locator('#login-form .primary').click();await page.locator('.character').first().waitFor();
 assert.equal(await page.locator('#characters').getAttribute('data-view'),'list');assert.equal(await page.locator('.character').count(),names.length);assert.equal(await page.locator('.recent-card').count(),6);
 const setting=async(id,value)=>{await page.locator('#tools').click();await page.locator('#'+id).selectOption(value);await page.locator('[data-close=tools-dialog]').click();};
 await page.locator('#recent-toggle').click();assert.equal(await page.locator('#recent').isVisible(),false);await page.reload();await page.locator('.character').first().waitFor();assert.equal(await page.locator('#recent').isVisible(),false);
 for(const limit of ['3','10','0','6']){await setting('recent-limit',limit);assert.equal(await page.locator('.recent-card').count(),Number(limit));assert.equal(await page.locator('#recent-section').isVisible(),limit!=='0');}
 for(const [view,columns] of [['cards',2],['covers',3]]){
  await setting('library-view',view);
  assert.equal(await page.locator('.shelf-row').first().locator('.character').count(),columns);
  for(const width of [320,390,768,1280,1920]){
   await page.setViewportSize({width,height:844});
   await page.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
   if(await page.locator('.character').nth(1).getAttribute('aria-expanded')!=='true')await page.locator('.character').nth(1).click();
   const buttons=await page.locator('.shelf-row').first().locator('.character').evaluateAll(items=>items.map(x=>x.getBoundingClientRect().toJSON()));
   if(width>640){assert.ok(buttons[0].width<=(view==='covers'?110:140)+1);const right=await page.locator('#characters').evaluate(e=>e.getBoundingClientRect().right);assert.ok(Math.abs(buttons.at(-1).right-right)<=1,'desktop row fills shelf width');}else assert.equal(buttons.length,columns);
   const threads=await page.locator('.threads').boundingBox();assert.ok(threads);assert.ok(threads.y>=Math.max(...buttons.map(b=>b.bottom))-1);assert.ok(threads.width>buttons[0].width*1.8);
   assert.ok(await page.locator('#sidebar').evaluate(el=>el.scrollWidth<=el.clientWidth));assert.equal(await page.locator('.threads .thread').count(),3);
   await page.locator('.character').nth(1).click();assert.equal(await page.locator('.threads').count(),0);
   if(width===1280)await page.screenshot({path:'/tmp/bookshop-0953-'+view+'.png'});
  }
  await page.setViewportSize({width:390,height:844});
  const img=page.locator('.character img').first();await img.waitFor();assert.ok(await img.evaluate(async x=>{await x.decode();return x.naturalWidth>0;}));
  await page.reload();await page.locator('.character').first().waitFor();assert.equal(await page.locator('#characters').getAttribute('data-view'),view);
  await page.locator('#search').fill('아주 긴');assert.equal(await page.locator('.character').count(),1);await page.locator('.character').click();assert.equal(await page.locator('.thread').count(),3);await page.locator('#search').fill('');
  if(process.env.SILLY_SCREENSHOT_DIR){await page.locator('.character').first().click();await page.screenshot({path:path.join(process.env.SILLY_SCREENSHOT_DIR,'home-'+view+'.png')});await page.locator('.character').first().click();}
 }
 await setting('library-view','list');assert.equal(await page.locator('.shelf-row').count(),0);assert.equal(await page.locator('.character-group').count(),names.length);
 await page.locator('#recent-toggle').click();assert.equal(await page.locator('#recent').isVisible(),true);await page.locator('.recent-card').first().click();await page.locator('.message').waitFor();
 await page.evaluate(()=>window.dispatchEvent(new Event('bookshop-home')));await page.locator('.character').first().waitFor();await setting('library-view','cards');await page.locator('.character').first().click();await page.locator('.thread').first().click();await page.locator('.message').waitFor();

 for(const device of [
  {name:'iphone',ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile',tablet:false},
  {name:'android-phone',ua:'Mozilla/5.0 (Linux; Android 14) Mobile SillyBookshop/0.9.5',tablet:false},
  {name:'ipad-browser',ua:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Mobile',tablet:true},
  {name:'ipad-installed',ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X)',tablet:true,installed:true},
  {name:'android-tablet',ua:'Mozilla/5.0 (Linux; Android 14) SillyBookshop/0.9.5',tablet:true}
 ]){
  const mobile=await browser.newPage({viewport:{width:768,height:1024},screen:device.tablet?{width:768,height:1024}:{width:390,height:844},userAgent:device.ua});
  await mobile.addInitScript(({width,height})=>{Object.defineProperty(screen,'width',{get:()=>width});Object.defineProperty(screen,'height',{get:()=>height});},device.tablet?{width:768,height:1024}:{width:390,height:844});
  if(device.installed)await mobile.addInitScript(()=>{Object.defineProperty(navigator,'standalone',{get:()=>true});Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});});
  await mobile.goto('http://127.0.0.1:'+server.address().port+'/api/plugins/silly-bookshop/');await mobile.locator('#password').fill('test-password');await mobile.locator('#login-form .primary').click();await mobile.locator('.character').first().waitFor();
  for(const [view,cols]of [['cards',2],['covers',3]]){
   await mobile.evaluate(()=>window.dispatchEvent(new Event('bookshop-open-tools')));await mobile.locator('#library-view').selectOption(view);await mobile.locator('[data-close=tools-dialog]').click();
   if(await mobile.locator('.character').first().getAttribute('aria-expanded')!=='true')await mobile.locator('.character').first().click();
   const counts=[];
   for(const width of [768,1024,500,768]){
    await mobile.setViewportSize({width,height:width===1024?768:1024});await mobile.evaluate(async()=>{for(let i=0;i<3;i++)await new Promise(requestAnimationFrame);});
    const dense=device.tablet&&width>640;assert.equal(await mobile.locator('#characters').getAttribute('data-dense'),String(dense));
    const buttons=await mobile.locator('.shelf-row').first().locator('.character').evaluateAll(items=>items.map(e=>e.getBoundingClientRect().toJSON()));counts.push(buttons.length);
    if(dense){assert.ok(buttons.length>cols);assert.ok(buttons[0].width<=(view==='covers'?110:140)+1);const r=await mobile.locator('#characters').boundingBox();assert.ok(Math.abs(buttons.at(-1).right-r.x-r.width)<=1);}else assert.equal(buttons.length,cols);
    assert.equal(await mobile.locator('.character').first().getAttribute('aria-expanded'),'true');const threads=await mobile.locator('.threads').boundingBox();assert.ok(threads.y>=Math.max(...buttons.map(b=>b.bottom))-1);assert.equal(await mobile.locator('.threads .thread').count(),3);
   }
   if(device.tablet){assert.ok(counts[1]>counts[0]);assert.equal(counts[0],counts[3]);}
  }
  console.log('PASS: '+device.name+' responsive shelf, rotation/split view and expanded selection');await mobile.close();
 }
 assert.equal(await page.locator('#transcript').evaluate(el=>el.scrollTop),0);assert.equal(await page.locator('#characters img[onerror]').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS: existing list preserved, cards/covers use real avatars, full-width expansion below selected row at 320/390/1280px, long/untrusted names and search, persisted view/collapse, recent 0/3/6/10 and navigation, first-message entry.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
