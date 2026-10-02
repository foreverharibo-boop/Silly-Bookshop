'use strict';
// Optional integration suite: NODE_PATH pointing to express 4 + playwright, with Chromium installed.
const express=require('express'),{chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'sili-integration-'));
const dirs={root:temp,chats:path.join(temp,'chats'),groupChats:path.join(temp,'group chats'),groups:path.join(temp,'groups')};
let browser,server;
try{
for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
await fs.mkdir(path.join(dirs.chats,'테스트A'));await fs.mkdir(path.join(dirs.chats,'테스트B'));
const file=path.join(dirs.chats,'테스트A','첫 번째 대화.jsonl');
const messages=Array.from({length:230},(_,i)=>({name:i%2?'나':'테스트A',is_user:!!(i%2),mes:i===0?'*편의점 문이 열리자 빗소리가 한층 선명해졌다.*\n\n“뭐 해. 이쪽으로 와. 거기 서 있으면 어차피 다 젖어.”':i%2?'“그럼 천천히 가. 우유 식기 전까지만.”\n\n'+i:'*테스트A은 우산을 한 번 올려다보더니, 우유 하나를 건넸다.*\n\n“내 어깨가 젖지, 네 어깨가 젖냐.”\n\n'+i,send_date:'2026-10-03 01:20',extra:{display_text:'번역 '+i}}));
messages[5].mes='<img src="https://example.invalid/tracker" onerror="window.PWNED=1"><script>window.PWNED=1</script>';
messages[6].mes='*bounded-format* '.repeat(1000);
const raw=()=>JSON.stringify({chat_metadata:{}})+'\n'+messages.map(m=>JSON.stringify(m)).join('\n')+'\n';
await fs.writeFile(file,raw());await fs.writeFile(path.join(dirs.chats,'테스트B','두 번째 대화.jsonl'),JSON.stringify({mes:'또 다른 이야기',name:'테스트B'})+'\n');
const auth={salt:'integration',hash:await c.passwordHash('test-password','integration')};await c.atomicJson(path.join(await c.stateDir(temp),'auth.json'),auth);
const app=express();app.use(express.json());
app.use((req,res,next)=>{req.user={directories:dirs};next();});
app.get('/csrf-token',(req,res)=>res.json({token:'fixture-csrf'}));
app.use((req,res,next)=>req.method==='POST'&&req.get('x-csrf-token')!=='fixture-csrf'?res.sendStatus(403):next());
const router=express.Router();await plugin.init(router);app.use('/api/plugins/sili-library',router);
server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/sili-library';
assert.equal((await fetch(base+'/catalog')).status,401);
assert.equal((await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'fixture-csrf','X-Sili-Request':'1',Origin:'https://evil.invalid'},body:JSON.stringify({password:'test-password'})})).status,403);
const login=await fetch(base+'/login',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':'fixture-csrf','X-Sili-Request':'1',Origin:origin},body:JSON.stringify({password:'test-password'})});assert.equal(login.status,200);
const cookie=login.headers.get('set-cookie').split(';')[0];
const id=c.encode(['chat','테스트A','첫 번째 대화.jsonl']);
assert.equal((await fetch(base+'/chat?id='+c.encode(['chat','..','secret.jsonl']),{headers:{Cookie:cookie}})).status,400);
browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin))external.push(r.url());});
await page.goto(base+'/');await page.locator('#password').fill('wrong-pass');await page.locator('.primary').click();await page.getByText('비밀번호가 맞지 않습니다.').waitFor();
await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.locator('#library').waitFor({state:'visible'});
await page.locator('.character').filter({hasText:'테스트A'}).click();await page.locator('.thread').first().click();await page.locator('.message').first().waitFor();
assert.equal(await page.locator('.message').count(),150);assert.equal(await page.evaluate(()=>window.PWNED),undefined);assert.equal(external.length,0);
assert.equal(await page.locator('[data-index="6"] em').count(),128);
await page.screenshot({path:process.env.SILI_SCREENSHOT_DIR?path.join(process.env.SILI_SCREENSHOT_DIR,'desktop.png'):path.join(temp,'desktop.png'),fullPage:true});
await page.locator('#fold').click();assert.equal(await page.locator('#sidebar').isVisible(),false);await page.locator('#fold').click();
await page.waitForTimeout(150);
await page.locator('#transcript').evaluate(el=>{const m=el.querySelector('[data-index="30"]');el.scrollTop+=m.getBoundingClientRect().top-el.getBoundingClientRect().top+30;});
await page.waitForTimeout(1000);
const saved=await c.position(temp,id);assert.ok(saved&&saved.index>=29&&saved.index<=31,JSON.stringify({saved,status:await page.locator('#status').textContent(),errors}));
await page.reload();await page.locator('.message').first().waitFor();
const visibleIndex=await page.locator('#transcript').evaluate(el=>Array.from(el.querySelectorAll('.message')).find(m=>m.getBoundingClientRect().bottom>el.getBoundingClientRect().top+1).dataset.index);assert.equal(Number(visibleIndex),saved.index);
// Separate browser context simulates phone: server position must survive without localStorage.
const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});const mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));
await mobile.goto(base+'/');await mobile.locator('#password').fill('test-password');await mobile.locator('.primary').click();await mobile.locator('.character').filter({hasText:'테스트A'}).click();await mobile.locator('.thread').first().click();await mobile.locator('.message').first().waitFor();
const mobileIndex=await mobile.locator('#transcript').evaluate(el=>Array.from(el.querySelectorAll('.message')).find(m=>m.getBoundingClientRect().bottom>el.getBoundingClientRect().top+1).dataset.index);assert.equal(Number(mobileIndex),saved.index);
assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await mobile.screenshot({path:process.env.SILI_SCREENSHOT_DIR?path.join(process.env.SILI_SCREENSHOT_DIR,'mobile.png'):path.join(temp,'mobile.png'),fullPage:true});
// Save a main-model edit as SillyTavern does. Browser poll should show it.
messages[30].mes='수정된 답변 자동 연동 확인';await fs.writeFile(file,raw());
await mobile.getByText('수정된 답변 자동 연동 확인',{exact:true}).waitFor({timeout:12000});
await mobile.locator('#display-mode').click();await mobile.getByText('번역 30',{exact:true}).waitFor();
await mobile.locator('#latest').click();await mobile.getByText('번역 229',{exact:true}).waitFor();
await mobile.locator('#font-size').click();await mobile.locator('#theme').click();
await mobile.locator('#lock').click();await mobile.locator('#gate').waitFor({state:'visible'});await mobile.getByText('책방을 잠갔어요.',{exact:true}).waitFor();assert.equal(await mobile.locator('.message').count(),0);assert.equal(await mobile.locator('.character').count(),0);
assert.equal(await mobile.evaluate(async()=> (await fetch('/api/plugins/sili-library/catalog')).status),401);
assert.equal(await fs.readFile(file,'utf8'),raw());assert.deepEqual(errors,[]);
// Password reset revokes an existing session.
await c.atomicJson(path.join(await c.stateDir(temp),'auth.json'),{salt:'new',hash:await c.passwordHash('new-password','new')});assert.equal((await fetch(base+'/catalog',{headers:{Cookie:cookie}})).status,401);
console.log('PASS: auth, CSRF/origin guard, traversal, safe text, desktop/mobile, sidebar, cross-device resume, live edits, display text, pagination, logout, password reset, unchanged source.');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
