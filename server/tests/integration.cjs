'use strict';
// Actual browser against a local fixture; no SillyTavern tab or capture bridge.
const express=require('express'),{chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const c=require('../core.cjs'),plugin=require('../index.cjs');
function png(){
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(16);hdr.writeUInt32BE(16,4);hdr[8]=8;hdr[9]=2;
 const scan=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=y*49+1+x*3;scan[i]=40;scan[i+1]=110;scan[i+2]=210;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',require('node:zlib').deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}

(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'silly-040-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let browser,server;
 try{
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
 await fs.mkdir(path.join(dirs.chats,'홍진'));await fs.writeFile(path.join(dirs.characters,'홍진.png'),png());
 const settings={name1:'나',extension_settings:{regex:[{scriptName:'숨김',findRegex:'/HIDE\\[[^\\]]*\\]/g',replaceString:'',trimStrings:[],placement:[1,2],markdownOnly:true}]}};
 await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(settings));
 const messages=Array.from({length:65},(_,i)=>({name:i%2?'나':'홍진',is_user:!!(i%2),mes:'<think>RAW_SECRET</think>Original '+i,send_date:'2026-10-03',extra:{display_text:'<think>THINK_SECRET</think>HIDE[REGEX_SECRET]\n\n**번역 '+i+'**\n\n'+('읽기 좋은 문장. '.repeat(12))}}));
 messages[0].extra.display_text+='<div style="background:rgb(231,242,238);padding:16px"><h3>상태창</h3><details><summary>펼치기</summary><p>'+('내용 '.repeat(100))+'</p></details></div><script>parent.PWNED=1</script><img src="https://example.invalid/tracker"><style>body{background-image:url(https://example.invalid/css)}</style>';
 messages[0].extra.translations={ko:'<think>OTHER_SECRET</think>HIDE[OTHER_REGEX_SECRET]추가 저장 번역'};
 const file=path.join(dirs.chats,'홍진','저장된 대화.jsonl'),raw=()=>messages.map(m=>JSON.stringify(m)).join('\n');await fs.writeFile(file,raw());const id=c.encode(['chat','홍진','저장된 대화.jsonl']);
 await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture'}));
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/silly-bookshop',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const origin='http://127.0.0.1:'+server.address().port,base=origin+'/api/plugins/silly-bookshop';
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith(origin))external.push(r.url());});
 await page.goto(base+'/');await page.locator('#password').fill('test-password');await page.locator('.primary').click();await page.locator('.character').click();await page.locator('.thread').click();
 const first=page.frameLocator('[data-index="0"] > .bubble > .message-content iframe');await first.locator('strong').getByText('번역 0',{exact:true}).waitFor();
 assert.equal(await page.locator('.message').count(),30);assert.equal(await page.getByText('실리 화면 연동 대기',{exact:true}).count(),0);assert.equal(await page.evaluate(()=>window.SillyTavern),undefined);
 let response=await page.evaluate(async id=>(await fetch('/api/plugins/silly-bookshop/chat?id='+id)).json(),id);assert.equal(response.displayPolicy,'saved-display-v1');assert.ok(!JSON.stringify(response).includes('SECRET'));assert.equal(response.messages[0].text,undefined);
 assert.equal(await first.locator('h3').evaluate(el=>getComputedStyle(el.parentElement).backgroundColor),'rgb(231, 242, 238)');const iframe=page.locator('[data-index="0"] > .bubble > .message-content iframe');const height=await iframe.evaluate(el=>el.offsetHeight);await first.locator('summary').click();await page.waitForTimeout(250);assert.ok(await iframe.evaluate(el=>el.offsetHeight)>height);
 assert.equal(await first.locator('script,img[src]').count(),0);assert.equal(await page.evaluate(()=>window.PWNED),undefined);assert.deepEqual(external,[]);
 await page.locator('[data-index="0"] .stored-translation > summary').click();await page.frameLocator('[data-index="0"] .stored-translation iframe').getByText('추가 저장 번역',{exact:true}).waitFor();
 // Change saved settings and raw files while no SillyTavern UI exists. Poll must update.
 settings.extension_settings.regex.push({scriptName:'표시 변경',findRegex:'/번역/g',replaceString:'갱신',trimStrings:[],placement:[1,2],markdownOnly:true});await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(settings));
 await first.locator('strong').getByText('갱신 0',{exact:true}).waitFor({timeout:10000});
 messages[0].extra.display_text='**새로 저장된 번역** <think>CHANGED_SECRET</think>';await fs.writeFile(file,raw());await first.locator('strong').getByText('새로 저장된 갱신',{exact:true}).waitFor({timeout:10000});
 await page.getByRole('button',{name:'다음 대화 읽기 ↓'}).click();await page.locator('[data-index="30"]').waitFor();await page.frameLocator('[data-index="30"] iframe').getByText('갱신 30',{exact:true}).waitFor();
 await page.waitForTimeout(500);await page.locator('#transcript').evaluate(el=>{const m=el.querySelector('[data-index="35"]');el.scrollTop+=m.getBoundingClientRect().top-el.getBoundingClientRect().top+20;});await page.waitForTimeout(1000);assert.equal((await c.position(root,id)).index,35);
 const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true}),mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(base+'/');await mobile.locator('#password').fill('test-password');await mobile.locator('.primary').click();await mobile.locator('.character').click();await mobile.locator('.thread').click();await mobile.locator('[data-index="35"]').waitFor();assert.equal(await mobile.locator('.message').first().getAttribute('data-index'),'35');assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await mobile.locator('#font-size').click();await mobile.locator('#theme').selectOption('cocoa');
 if(process.env.SILLY_SCREENSHOT_DIR)await mobile.screenshot({path:path.join(process.env.SILLY_SCREENSHOT_DIR,'mobile-040.png'),fullPage:true});
 // Bad display rules show an actionable error, not raw text, and recover after correction.
 settings.extension_settings.regex.push({scriptName:'깨진 규칙',findRegex:'/[invalid/',replaceString:'',trimStrings:[],placement:[1,2],markdownOnly:true});await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(settings));await mobile.locator('#refresh').click();await mobile.getByText('이 메시지의 표시 설정을 확인해 주세요.',{exact:true}).first().waitFor();assert.ok(!(await mobile.locator('#transcript').textContent()).includes('SECRET'));
 settings.extension_settings.regex.pop();await fs.writeFile(path.join(root,'settings.json'),JSON.stringify(settings));await mobile.locator('#refresh').click();await mobile.frameLocator('[data-index="35"] iframe').getByText('갱신 35',{exact:true}).waitFor();
 await mobile.locator('#lock').click();await mobile.getByText('책방을 잠갔어요.',{exact:true}).waitFor();assert.equal(await mobile.locator('.message,.character,.rich-output').count(),0);
 // Each previously unread conversation starts at its first message, independent of the other chat.
 await page.bringToFront();
 const secondId=c.encode(['chat','홍진','처음 여는 대화.jsonl']);
 await fs.writeFile(path.join(dirs.chats,'홍진','처음 여는 대화.jsonl'),Array.from({length:40},(_,i)=>JSON.stringify({name:i%2?'나':'홍진',is_user:!!(i%2),mes:'**처음 '+i+'**\n\n'+('새로운 대화를 천천히 읽어요. '.repeat(12))})).join('\n'));
 await page.locator('#refresh').click();await page.locator('#refresh:not([disabled])').waitFor();
 await page.locator('.thread').filter({hasText:'처음 여는 대화'}).click();await page.frameLocator('[data-index="0"] iframe').getByText('처음 0',{exact:true}).waitFor();await page.waitForTimeout(500);
 assert.equal(await page.locator('.message').first().getAttribute('data-index'),'0');assert.equal(await page.locator('#transcript').evaluate(el=>el.scrollTop),0);
 await page.locator('#transcript').evaluate(el=>{const m=el.querySelector('[data-index="8"]');el.scrollTop+=m.getBoundingClientRect().top-el.getBoundingClientRect().top+20;});await page.waitForTimeout(1000);assert.equal((await c.position(root,secondId)).index,8);
 await page.locator('.thread').filter({hasText:'저장된 대화'}).click();await page.locator('[data-index="35"]').waitFor();
 await page.locator('.thread').filter({hasText:'처음 여는 대화'}).click();await page.locator('[data-index="8"]').waitFor();assert.equal(await page.locator('.message').first().getAttribute('data-index'),'8');
 for(const theme of ['light','cream','rose','sage','cocoa','dark']){
   await page.locator('#theme').selectOption(theme);assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
   const ink=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--ink'));
   assert.equal(await page.frameLocator('[data-index="8"] iframe').locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--ink')),ink);
   if(process.env.SILLY_SCREENSHOT_DIR&&['cream','rose','sage','cocoa'].includes(theme))await page.screenshot({path:path.join(process.env.SILLY_SCREENSHOT_DIR,'theme-'+theme+'-050.png'),fullPage:true});
 }
 await page.reload();await page.locator('[data-index="8"]').waitFor();assert.equal(await page.locator('#theme').inputValue(),'dark');
 await page.locator('#first').click();await page.frameLocator('[data-index="0"] iframe').getByText('처음 0',{exact:true}).waitFor();await page.waitForTimeout(300);assert.equal((await c.position(root,secondId)).index,0);
 assert.equal(await fs.readFile(file,'utf8'),raw());assert.deepEqual(errors,[]);console.log('PASS: no chat-open/capture dependency; saved + extra translations; hidden reasoning and display-regex removal; Markdown + HTML + details; no script/network; automatic file/settings updates; old-message paging; mobile + saved position; regex-error recovery; lock + unchanged originals; per-chat first open and resume; all six themes and persistence; return to beginning.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
