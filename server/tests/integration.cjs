'use strict';
// Optional: NODE_PATH to express 4 + playwright; Chromium required.
const express=require('express'),{chromium}=require('playwright');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
(async()=>{
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'silly-rich-integration-'));
const dirs={root:temp,chats:path.join(temp,'chats'),groupChats:path.join(temp,'group chats'),groups:path.join(temp,'groups'),characters:path.join(temp,'characters')};
let browser,server;
try{
for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
await fs.mkdir(path.join(dirs.chats,'홍진'));await fs.mkdir(path.join(dirs.chats,'다나'));
const file=path.join(dirs.chats,'홍진','비 오는 저녁.jsonl');
const html='<style>.status-card{background:rgb(232,238,249);padding:20px;border-radius:12px;color:#24334b}.status-card h3{margin-top:0}</style><div class="status-card"><h3>오늘의 기록</h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><span>장소 · 작은 서점</span><span>시간 · 오후 8:20</span></div><details><summary>마음속 이야기</summary><p>'+'조금 더 같이 있고 싶었다. '.repeat(12)+'</p></details></div>';
const messages=Array.from({length:65},(_,i)=>({name:i%2?'나':'홍진',is_user:!!(i%2),mes:i%2?'“조금만 더 읽고 가자.”\n\n'+i:'*빗소리가 창문 너머로 들려왔다.*\n\n“급할 거 없지. 천천히 봐.”\n\n'+i,send_date:'2026-10-03 02:00'}));
messages[0].mes='The little bookshop was still open.';messages[0].extra={display_text:'작은 책방은 아직 열려 있었다.',translations:{ja:'小さな本屋はまだ開いていた。',ko:'작은 책방은 아직 열려 있었다.'}};
messages[2].mes=html;
messages[4].mes='<div onclick="parent.PWNED=1" style="padding:10px">보안 테스트</div><img src="https://example.invalid/tracker" onerror="parent.PWNED=1"><script>parent.PWNED=1</script><style>body{background-image:url(https://example.invalid/css)}</style><iframe src="https://example.invalid/frame"></iframe><a href="javascript:parent.PWNED=1">링크</a>';
messages[6].mes='```html\n<div style="background:#f5ebef;padding:12px">코드 블록 상태창</div>\n```';
const raw=()=>JSON.stringify({chat_metadata:{}})+'\n'+messages.map(m=>JSON.stringify(m)).join('\n')+'\n';
await fs.writeFile(file,raw());await fs.writeFile(path.join(dirs.chats,'다나','다른 이야기.jsonl'),JSON.stringify({mes:'다른 이야기',name:'다나'})+'\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6P6sAAAAASUVORK5CYII=','base64');await fs.writeFile(path.join(dirs.characters,'홍진.png'),png);
const auth={salt:'integration',hash:await c.passwordHash('test-password','integration')};await c.atomicJson(path.join(await c.stateDir(temp),'auth.json'),auth);
const app=express();app.use(express.json({limit:'2mb'}));app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture-csrf'}));app.use((req,res,next)=>req.method==='POST'&&req.get('x-csrf-token')!=='fixture-csrf'?res.sendStatus(403):next());
app.get('/bridge.js',(req,res)=>res.sendFile(path.resolve(__dirname,'../../client/index.js')));
app.get('/silly-fixture',(req,res)=>res.send('<!doctype html><div id="extensions_settings"></div><div id="chat"></div>'));
const router=express.Router();await plugin.init(router);app.use('/api/plugins/sili-library',router);
server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/sili-library',id=c.encode(['chat','홍진','비 오는 저녁.jsonl']);
const headers={'Content-Type':'application/json','X-CSRF-Token':'fixture-csrf','X-Sili-Request':'1',Origin:origin};
assert.equal((await fetch(base+'/avatar?name='+encodeURIComponent('홍진.png'))).status,401);
assert.equal((await fetch(base+'/capture',{method:'POST',headers:{...headers,Origin:'https://evil.invalid'},body:JSON.stringify({id,items:[]})})).status,403);
browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
await page.goto(base+'/');await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.locator('#library').waitFor({state:'visible'});
assert.equal(await page.locator('.thread').count(),0);
const char=page.locator('.character').filter({hasText:'홍진'});await char.click();assert.equal(await char.getAttribute('aria-expanded'),'true');assert.equal(await char.locator('..').locator('.thread').count(),1);
await char.click();assert.equal(await page.locator('.thread').count(),0);await char.click();await page.locator('.thread').first().click();await page.locator('.message').first().waitFor();
assert.equal(await page.locator('.message').count(),65);
await page.waitForFunction(()=>document.querySelector('.character img')?.naturalWidth>0);
assert.equal(await page.locator('.message-avatar img').count(),33);
assert.ok((await page.locator('[data-index="0"]').textContent()).includes('작은 책방은 아직 열려 있었다.'));assert.ok((await page.locator('[data-index="0"]').textContent()).includes('小さな本屋'));
await page.locator('[data-index="0"] .original-output summary').click();await page.getByText('The little bookshop was still open.',{exact:true}).waitFor();
const card=page.frameLocator('[data-index="2"] iframe');await card.getByText('오늘의 기록',{exact:true}).waitFor();assert.equal(await card.locator('.status-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 238, 249)');
const h1=await page.locator('[data-index="2"] iframe').evaluate(el=>el.offsetHeight);await card.locator('summary').click();await page.waitForTimeout(250);assert.ok(await page.locator('[data-index="2"] iframe').evaluate(el=>el.offsetHeight)>h1);
await page.frameLocator('[data-index="6"] iframe').getByText('코드 블록 상태창',{exact:true}).waitFor();
assert.equal(await page.frameLocator('[data-index="4"] iframe').locator('script,iframe,[onclick],img[src]').count(),0,await page.frameLocator('[data-index="4"] iframe').locator('body').innerHTML());assert.equal(await page.evaluate(()=>window.PWNED),undefined);assert.equal(external.length,0,JSON.stringify(external));
// Captured styles may never escape into the reader's parent UI.
assert.notEqual(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(232, 238, 249)');
await page.locator('#transcript').evaluate(el=>el.scrollTop=0);await page.waitForTimeout(150);
if(process.env.SILI_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SILI_SCREENSHOT_DIR,'desktop-v3.png'),fullPage:true});
// An actual run of the shipped observer, with a fixture for the documented ST context.
const bridge=await context.newPage();bridge.on('pageerror',e=>errors.push(e.message));await bridge.goto(origin+'/silly-fixture');
await bridge.evaluate(m=>{
 const context={chat:[m],characters:[{avatar:'홍진.png'}],characterId:0,groupId:null,getCurrentChatId:()=> '비 오는 저녁',getRequestHeaders:()=>({'X-CSRF-Token':'fixture-csrf'})};window.fixtureContext=context;window.SillyTavern={getContext:()=>context};
 const el=document.createElement('div');el.className='mes';el.setAttribute('mesid','0');el.innerHTML='<div class="mes_text"><div style="background:rgb(231,242,238);padding:15px"><strong>실리 확장이 만든 번역 상태창</strong><p>작은 책방은 아직 열려 있었다.</p></div></div>';document.getElementById('chat').append(el);
},messages[0]);await bridge.addScriptTag({url:origin+'/bridge.js'});
await bridge.getByText('화면 연동됨 · 1개 메시지',{exact:true}).waitFor({timeout:12000});
await page.reload();await page.frameLocator('[data-index="0"] iframe').getByText('실리 확장이 만든 번역 상태창',{exact:true}).waitFor();
assert.equal(await fs.readFile(file,'utf8'),raw());
// Save/restore with rich content above the anchor, on another device and at another width.
await page.waitForTimeout(400);await page.locator('#transcript').evaluate(el=>{const m=el.querySelector('[data-index="30"]');el.scrollTop+=m.getBoundingClientRect().top-el.getBoundingClientRect().top+25;});await page.waitForTimeout(1100);const saved=await c.position(temp,id);assert.equal(saved.index,30);
await page.reload();await page.locator('.message').first().waitFor();await page.waitForTimeout(400);
const visible=()=>page.locator('#transcript').evaluate(el=>Number([...el.querySelectorAll('.message')].find(m=>m.getBoundingClientRect().bottom>el.getBoundingClientRect().top+1)?.dataset.index));assert.equal(await visible(),30);
const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base+'/');await mobile.locator('#password').fill('test-password');await mobile.locator('.primary').click();await mobile.locator('.character').filter({hasText:'홍진'}).click();await mobile.locator('.thread').first().click();await mobile.locator('.message').first().waitFor();
assert.equal(await mobile.locator('.message').first().getAttribute('data-index'),'30');assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
messages[30].mes='수정된 답변 자동 연동';await fs.writeFile(file,raw());await mobile.getByText('수정된 답변 자동 연동',{exact:true}).waitFor({timeout:12000});
await mobile.locator('#font-size').click();await mobile.locator('#theme').click();
await mobile.locator('#display-mode').click();await mobile.locator('#display-mode').click();assert.equal(await mobile.locator('#display-mode').textContent(),'원문');
await mobile.locator('#fold').click();await mobile.locator('.thread').first().click();
await mobile.waitForTimeout(200);await mobile.getByRole('button',{name:'이전 대화 읽기 ↑'}).click();await mobile.frameLocator('[data-index="2"] iframe').getByText('오늘의 기록',{exact:true}).waitFor();assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.locator('[data-index="2"]').scrollIntoViewIfNeeded();
if(process.env.SILI_SCREENSHOT_DIR)await mobile.screenshot({path:path.join(process.env.SILI_SCREENSHOT_DIR,'mobile-v3.png'),fullPage:true});
// Snapshot must disappear on an edited/translated message until re-observed.
messages[0].extra.display_text='새 번역문';await fs.writeFile(file,raw());await page.goto(base+'/');await page.locator('.message').first().waitFor();
const data=await page.evaluate(async id=>(await fetch('/api/plugins/sili-library/chat?id='+encodeURIComponent(id)+'&start=0')).json(),id);assert.equal(data.messages[0].renderedHtml,undefined);assert.equal(data.messages[0].displayText,'새 번역문');
await mobile.locator('#lock').click();await mobile.getByText('책방을 잠갔어요.',{exact:true}).waitFor();assert.equal(await mobile.locator('.message,.character,.rich-output').count(),0);assert.equal(await mobile.evaluate(async()=> (await fetch('/api/plugins/sili-library/catalog')).status),401);
assert.equal(await fs.readFile(file,'utf8'),raw());assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
console.log('PASS: avatars, nested collapse, all stored translations, HTML/CSS/fences/details, sandbox/network isolation, real bridge observer, stale capture rejection, phone/desktop resume, edits, modes, lock and original-file integrity.');
}finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
