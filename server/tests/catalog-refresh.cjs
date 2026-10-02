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
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'silly-roster-')),dirs={root,chats:path.join(root,'chats'),groupChats:path.join(root,'group chats'),characters:path.join(root,'characters')};let browser,server;
 try{
 for(const dir of Object.values(dirs))await fs.mkdir(dir,{recursive:true});
 for(const name of ['현재','빈 캐릭터','삭제된 캐릭터']){
   await fs.mkdir(path.join(dirs.chats,name));
   if(name!=='삭제된 캐릭터')await fs.writeFile(path.join(dirs.characters,name+'.png'),png());
   if(name!=='빈 캐릭터')await fs.writeFile(path.join(dirs.chats,name,'대화.jsonl'),JSON.stringify({name,mes:'saved'}));
 }
 await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt:'fixture',hash:await c.passwordHash('test-password','fixture')});
 const app=express();app.use(express.json());app.use((req,res,next)=>{req.user={directories:dirs};next();});app.get('/csrf-token',(req,res)=>res.json({token:'fixture'}));
 const router=express.Router();await plugin.init(router);app.use('/api/plugins/silly-bookshop',router);server=await new Promise(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/api/plugins/silly-bookshop/');await page.locator('#password').fill('test-password');await page.locator('.primary').click();
 const row=name=>page.locator('.character').filter({has:page.locator('.character-name',{hasText:name})});
 await row('현재').waitFor();assert.equal(await page.locator('.character').count(),2);assert.equal(await row('삭제된 캐릭터').count(),0);
 await row('빈 캐릭터').click();await page.getByText('아직 저장된 대화가 없어요.',{exact:true}).waitFor();
 await row('현재').click();await page.locator('.thread').click();await page.locator('.message').waitFor();
 const red=()=>row('현재').locator('img').evaluate(async img=>{await img.decode();const cv=document.createElement('canvas');cv.width=cv.height=1;const ctx=cv.getContext('2d');ctx.drawImage(img,0,0,1,1);return ctx.getImageData(0,0,1,1).data[0];});
 await row('현재').locator('img').waitFor();assert.equal(await red(),40);
 const refresh=async()=>{await page.locator('#refresh').click();await page.locator('#refresh:not([disabled])').waitFor();};
 await fs.writeFile(path.join(dirs.characters,'현재.png'),png(190));await refresh();await row('현재').locator('img').waitFor();assert.equal(await red(),190);assert.equal(await page.locator('.message').count(),1);
 await fs.unlink(path.join(dirs.chats,'현재','대화.jsonl'));await refresh();assert.equal(await page.locator('.message,.thread').count(),0);await page.getByText('이 대화나 캐릭터는 현재 실리 목록에서 없어졌어요. 다른 대화를 골라 주세요.',{exact:true}).waitFor();
 await fs.writeFile(path.join(dirs.chats,'현재','새 대화.jsonl'),JSON.stringify({name:'현재',mes:'new'}));await refresh();await page.locator('.thread').filter({hasText:'새 대화'}).click();await page.locator('.message').waitFor();
 await fs.unlink(path.join(dirs.characters,'현재.png'));await refresh();assert.equal(await row('현재').count(),0);assert.equal(await page.locator('.message,.thread').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('silly-bookshop:last')),'');
 assert.ok(await fs.stat(path.join(dirs.chats,'현재','새 대화.jsonl')));
 await fs.writeFile(path.join(dirs.characters,'새 친구.png'),png());await refresh();await row('새 친구').waitFor();assert.equal(await page.locator('.character').count(),2);assert.deepEqual(errors,[]);
 console.log('PASS: current cards only; empty characters; refresh adds/removes chats and cards; removed selection cleared; successful avatar cache replaced with changed pixels; orphan files untouched.');
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));await fs.rm(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
