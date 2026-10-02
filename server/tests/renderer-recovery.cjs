'use strict';
const express=require('express'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bookshop-assets-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let browser,server,failRenderer=true;
 try{
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(dirs.chats,'A'));
 await fs.writeFile(path.join(dirs.characters,'A.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P6sAAAAASUVORK5CYII=','base64'));
 await fs.writeFile(path.join(dirs.chats,'A','Saved.jsonl'),JSON.stringify({name:'A',mes:'<think>SECRET</think>**바로 읽기**<div style="background:rgb(231,242,238)">HTML 표시</div>'}));
 await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture'}));
 app.use('/api/plugins/sili-library/rich.js',(req,res,next)=>failRenderer?res.sendStatus(404):next());
 // Separate vendor URLs are unavailable: the new renderer must be self-contained.
 app.use('/api/plugins/sili-library/vendor',(req,res)=>res.sendStatus(404));
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/sili-library',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const base='http://127.0.0.1:'+server.address().port+'/api/plugins/sili-library';
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'/');assert.equal(await page.evaluate(()=>!!window.BookshopRich),false);
 await page.locator('#password').fill('wrong-password');await page.locator('.primary').click();await page.getByText('비밀번호가 맞지 않습니다.',{exact:true}).waitFor();
 await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.locator('.character').waitFor();
 await page.locator('.character').click();await page.locator('.thread').click();await page.getByRole('button',{name:'다시 불러오기'}).waitFor();assert.match(await page.locator('#transcript').textContent(),/본문 표시 파일을 받지 못했어요/);assert.equal(await page.locator('iframe').count(),0);
 // Fix the asset on the server; recover without app reinstall or password reset.
 failRenderer=false;await page.getByRole('button',{name:'다시 불러오기'}).click();await page.frameLocator('.message iframe').locator('strong').getByText('바로 읽기',{exact:true}).waitFor();assert.equal(await page.frameLocator('.message iframe').getByText('HTML 표시',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(231, 242, 238)');assert.ok(!(await page.frameLocator('.message iframe').locator('body').textContent()).includes('SECRET'));
 assert.equal(requests.filter(url=>url.includes('/vendor/')).length,0);assert.equal(await page.evaluate(()=>window.BookshopRich.version),'0.4.1-test.1');
 await page.locator('#lock').click();await page.getByText('책방을 잠갔어요.',{exact:true}).waitFor();assert.equal(await page.locator('.message').count(),0);
 // A subsequent cold load also works with all vendor routes blocked.
 await page.reload();await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.frameLocator('.message iframe').locator('strong').getByText('바로 읽기',{exact:true}).waitFor();assert.deepEqual(errors,[]);
 console.log('PASS: missing renderer does not disable login or password errors; actionable content retry; recovery without reinstall; standalone bundle works with vendor routes blocked; HTML and hidden text policy retained; logout and cold reload.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
