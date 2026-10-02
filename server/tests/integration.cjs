'use strict';
// Optional real browser integration: express 4 + playwright, Chromium.
const express=require('express'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),capture=require('../capture.cjs'),plugin=require('../index.cjs');
function png(){
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(16);hdr.writeUInt32BE(16,4);hdr[8]=8;hdr[9]=2;
 const scan=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=y*49+1+x*3;scan[i]=40;scan[i+1]=110;scan[i+2]=210;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',require('node:zlib').deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'silly-031-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let browser,server;
 const originalAvatar=c.avatar;let avatarBusy=0,maxAvatarBusy=0,failPhoto=true,failChat=false,hangChat=false;
 try{
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
 for(let i=0;i<16;i++){const name=i===0?'홍진':'친구'+i;await fs.mkdir(path.join(dirs.chats,name));await fs.writeFile(path.join(dirs.characters,name+'.png'),png());if(i)await fs.writeFile(path.join(dirs.chats,name,'대화.jsonl'),JSON.stringify({mes:'test',name}));}
 const messages=Array.from({length:65},(_,i)=>({name:i%2?'나':'홍진',is_user:!!(i%2),mes:'<think>RAW_SECRET_'+i+'</think>original '+i,send_date:'2026-10-03',extra:{display_text:'번역 SECRET_'+i}}));
 const file=path.join(dirs.chats,'홍진','비 오는 저녁.jsonl'),raw=()=>messages.map(m=>JSON.stringify(m)).join('\n');await fs.writeFile(file,raw());
 const id=c.encode(['chat','홍진','비 오는 저녁.jsonl']);
 await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
 // A legacy capture can contain hidden text: reader must not use it after upgrade.
 const m0=c.parseChat(raw()).messages[0],folder=path.join(await c.stateDir(root),'rendered');await fs.mkdir(folder);
 const old=path.join(folder,require('node:crypto').createHash('sha256').update(id).digest('hex')+'.json');await fs.writeFile(old,JSON.stringify({0:{sourceHash:m0.sourceHash,html:'OLD_SECRET',capturedAt:1}}));
 c.avatar=async(...args)=>{avatarBusy++;maxAvatarBusy=Math.max(maxAvatarBusy,avatarBusy);try{await new Promise(r=>setTimeout(r,70));return await originalAvatar(...args);}finally{avatarBusy--;}};
 const app=express();app.use(express.json({limit:'2mb'}));app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture-csrf'}));app.use((req,res,next)=>req.method==='POST'&&req.get('x-csrf-token')!=='fixture-csrf'?res.sendStatus(403):next());
 app.use('/api/plugins/sili-library/chat',(req,res,next)=>{if(hangChat){hangChat=false;return;}if(failChat){failChat=false;return res.status(503).json({error:'테스트 서버 일시 오류'});}next();});
 app.use('/api/plugins/sili-library/avatar',(req,res,next)=>{if(failPhoto){failPhoto=false;return res.status(429).json({error:'temporary avatar busy'});}next();});
 app.get('/bridge.js',(req,res)=>res.sendFile(path.resolve(__dirname,'../../client/index.js')));app.get('/silly-fixture',(req,res)=>res.send('<!doctype html><style>.hide-thinking{display:none}</style><div id="extensions_settings"></div><div id="chat"></div>'));
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/sili-library',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/sili-library';
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))external.push(r.url());});
 await page.goto(base+'/');await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.locator('.character').filter({hasText:'홍진'}).click();await page.locator('.thread').click();await page.getByText('실리 화면 연동 대기',{exact:true}).first().waitFor();
 assert.equal(await page.locator('.message').count(),30);assert.ok(!(await page.locator('#transcript').textContent()).includes('SECRET'));assert.equal(await page.locator('#display-mode,.original-output,.source-output').count(),0);
 let response=await page.evaluate(async id=>(await fetch('/api/plugins/sili-library/chat?id='+encodeURIComponent(id))).json(),id);assert.equal(response.displayPolicy,'screen-only-v2');assert.ok(!JSON.stringify(response).includes('SECRET'));assert.equal(response.messages[0].synced,false);
 // Load all sidebar portraits, recover a temporary 429, and verify actual opaque pixels.
 for(const row of await page.locator('.character').all()){await row.scrollIntoViewIfNeeded();await row.locator('img').waitFor();}
 assert.equal(await page.locator('.character img').count(),16);assert.ok(maxAvatarBusy<=2);
 const pixels=await page.locator('.character img').first().evaluate(async img=>{await img.decode();const cv=document.createElement('canvas');cv.width=cv.height=1;cv.getContext('2d').drawImage(img,0,0,1,1);return [...cv.getContext('2d').getImageData(0,0,1,1).data];});assert.deepEqual(pixels,[40,110,210,255]);
 // Run the real bridge: final translation + CSS-hidden/visibility-hidden/aria-hidden reasoning.
 const bridge=await context.newPage();bridge.on('pageerror',e=>errors.push(e.message));await bridge.goto(origin+'/silly-fixture');
 await bridge.evaluate(messages=>{const ctx={chat:messages,characters:[{avatar:'홍진.png'}],characterId:0,groupId:null,getCurrentChatId:()=> '비 오는 저녁',getRequestHeaders:()=>({'X-CSRF-Token':'fixture-csrf'})};window.fixtureContext=ctx;window.SillyTavern={getContext:()=>ctx};
 for(let i=0;i<3;i++){const el=document.createElement('div');el.className='mes';el.setAttribute('mesid',i);el.innerHTML='<div class="mes_text" data-original="ATTR_SECRET"><!-- COMMENT_SECRET --><span class="hide-thinking">CSS_SECRET</span><span hidden>HIDDEN_SECRET</span><span style="visibility:hidden">VIS_SECRET</span><span aria-hidden="true">ARIA_SECRET</span><div style="background:rgb(231,242,238);padding:16px;color:#24334b"><h3>번역된 최종 화면 '+i+'</h3><details><summary>상태창 펼치기</summary><p>'+('둘은 책방에 머물렀다. '.repeat(20))+'</p></details></div></div>';document.getElementById('chat').append(el);}},messages);
 await bridge.addScriptTag({url:origin+'/bridge.js'});await bridge.getByText('화면 연동됨 · 3개 메시지',{exact:true}).waitFor({timeout:12000});
 await page.bringToFront();await page.locator('#refresh').click();await page.frameLocator('[data-index="0"] iframe').getByText('번역된 최종 화면 0',{exact:true}).waitFor();
 response=await page.evaluate(async id=>(await fetch('/api/plugins/sili-library/chat?id='+encodeURIComponent(id))).json(),id);assert.ok(!JSON.stringify(response).includes('SECRET'));assert.equal(response.messages[0].text,undefined);assert.equal(response.messages[0].displayText,undefined);
 const card=page.frameLocator('[data-index="0"] iframe');assert.equal(await card.locator('h3').evaluate(el=>getComputedStyle(el.parentElement).backgroundColor),'rgb(231, 242, 238)');const height=await page.locator('[data-index="0"] iframe').evaluate(el=>el.offsetHeight);await card.locator('summary').click();await page.waitForTimeout(250);assert.ok(await page.locator('[data-index="0"] iframe').evaluate(el=>el.offsetHeight)>height);
 // Loaded text stays inert: malicious HTML from a same-origin producer cannot escape frame.
 const parsed=c.parseChat(raw()).messages;
 const item=(i,html)=>({index:i,name:parsed[i].name,user:parsed[i].user,date:parsed[i].date,sourceText:parsed[i].text,displayText:parsed[i].displayText,html});
 await capture.write(dirs,id,[item(4,'<div onclick="parent.PWNED=1">안전한 HTML 표시</div><script>parent.PWNED=1</script><img src="https://example.invalid/tracker"><style>body{background:url(https://example.invalid/css)}</style>')],2);
 await page.locator('#refresh').click();await page.frameLocator('[data-index="4"] iframe').getByText('안전한 HTML 표시',{exact:true}).waitFor();assert.equal(await page.frameLocator('[data-index="4"] iframe').locator('script,[onclick],img[src]').count(),0);assert.equal(await page.evaluate(()=>window.PWNED),undefined);assert.deepEqual(external,[]);
 // Server failure and a request that never responds both leave an actionable retry.
 failChat=true;await page.locator('#refresh').click();await page.getByText('테스트 서버 일시 오류',{exact:true}).waitFor();await page.getByRole('button',{name:'다시 불러오기'}).click();await page.frameLocator('[data-index="0"] iframe').getByText('번역된 최종 화면 0',{exact:true}).waitFor();
 hangChat=true;await page.locator('#refresh').click();await page.getByText('서버 응답 시간이 초과됐어요. 서버 연결을 확인하고 다시 시도해 주세요.',{exact:true}).waitFor({timeout:25000});await page.getByRole('button',{name:'다시 불러오기'}).click();await page.frameLocator('[data-index="0"] iframe').getByText('번역된 최종 화면 0',{exact:true}).waitFor();
 // Mobile HTML, paging and per-device reading position.
 await page.waitForTimeout(500);await page.locator('#transcript').evaluate(el=>{const m=el.querySelector('[data-index="15"]');el.scrollTop+=m.getBoundingClientRect().top-el.getBoundingClientRect().top+20;});await page.waitForTimeout(1000);const saved=await c.position(root,id);assert.equal(saved.index,15);
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base+'/');await mobile.locator('#password').fill('test-password');await mobile.locator('.primary').click();await mobile.locator('.character').filter({hasText:'홍진'}).click();await mobile.locator('.thread').click();await mobile.locator('[data-index="15"]').waitFor();assert.equal(await mobile.locator('.message').first().getAttribute('data-index'),'15');
 await mobile.getByRole('button',{name:'이전 대화 읽기 ↑'}).click();await mobile.frameLocator('[data-index="0"] iframe').getByText('번역된 최종 화면 0',{exact:true}).waitFor();assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.locator('#font-size').click();await mobile.locator('#theme').click();
 if(process.env.SILI_SCREENSHOT_DIR)await mobile.screenshot({path:path.join(process.env.SILI_SCREENSHOT_DIR,'mobile-031.png'),fullPage:true});
 // Changed source invalidates its snapshot and never falls back to unfiltered text.
 messages[0].mes='<think>CHANGED_SECRET</think>changed';await fs.writeFile(file,raw());await mobile.locator('#refresh').click();await mobile.locator('[data-index="0"] .awaiting').waitFor();assert.ok(!(await mobile.locator('#transcript').textContent()).includes('SECRET'));
 await mobile.locator('#lock').click();await mobile.getByText('책방을 잠갔어요.',{exact:true}).waitFor();assert.equal(await mobile.locator('.message,.character,.rich-output').count(),0);
 assert.equal(await fs.readFile(file,'utf8'),raw());assert.deepEqual(errors,[]);console.log('PASS: 16 opaque portraits + 429 recovery + bounded concurrency; raw/hidden/legacy source exclusion; real final-screen bridge; HTML/CSS/details; network/script isolation; 503 + 20s timeout recovery; mobile + cross-device position; source edit invalidation; lock and original bytes.');
 }finally{c.avatar=originalAvatar;if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
