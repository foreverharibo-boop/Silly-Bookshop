'use strict';
const {chromium}=require('playwright'),fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
function png(red=40){
 const crc=b=>{let n=0xffffffff;for(const x of b){n^=x;for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 const chunk=(type,data)=>{const name=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([name,data])),out.length-4);return out;};
 const hdr=Buffer.alloc(13);hdr.writeUInt32BE(16);hdr.writeUInt32BE(16,4);hdr[8]=8;hdr[9]=2;
 const scan=Buffer.alloc(16*(1+16*3));for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=y*49+1+x*3;scan[i]=red;scan[i+1]=110;scan[i+2]=210;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',hdr),chunk('IDAT',require('node:zlib').deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}


(async()=>{let browser;try{
 const project=path.resolve(__dirname,'../..'),origin='https://offline.silly-bookshop.invalid',requests=[],errors=[];
 const snapshot={schema:1,vaultId:'a'.repeat(64),created:Date.now(),meta:{photo:'data:image/png;base64,'+png(220).toString('base64'),character:'오프라인 테스트',title:'<img src=x onerror=alert(1)>'},saved:{index:35,fraction:0},bookmarks:[{index:3,note:'좋아하는 장면'}],preferences:{theme:'cream',font:'ridi',line:'2.2',padding:'36',size:18,bold:true},messages:Array.from({length:65},(_,i)=>({index:i,name:'캐릭터',date:'날짜',user:!!(i%2),system:true,characterSpeech:!(i%2),content:'**메시지 '+i+'**\n\n'+'조용히 책장을 넘겼다. '.repeat(15)+'<script>parent.BAD=1</script><img src="https://outside.invalid/tracker">',translations:[{label:'추가 번역',content:'another '+i}]}))};
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:390,height:844}});
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());requests.push(u.origin);if(u.origin!==origin)return route.abort();const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"};
  if(u.pathname==='/snapshot')return route.fulfill({contentType:'application/json',headers,body:JSON.stringify(snapshot)});
  let file,type;
  if(u.pathname==='/'){file='android/offline/index.html';type='text/html';}
  else if(['/offline.js','/offline.css'].includes(u.pathname)){file='android/offline'+u.pathname;type=u.pathname.endsWith('.js')?'application/javascript':'text/css';}
  else if(['/rich.js','/style.css'].includes(u.pathname)){file='server/public'+u.pathname;type=u.pathname.endsWith('.js')?'application/javascript':'text/css';}
  else if(/^\/(?:api\/plugins\/silly-bookshop\/)?fonts\/[A-Za-z-]+\.woff2$/.test(u.pathname)){file='server/public/fonts/'+path.basename(u.pathname);type='font/woff2';}
  else return route.fulfill({status:403,body:''});await route.fulfill({body:await fs.readFile(path.join(project,file)),contentType:type,headers});
 });
 await ctx.setOffline(true);const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/');await page.frameLocator('[data-index="35"] iframe').first().getByText('메시지 35',{exact:true}).waitFor();
 assert.equal(await page.locator('#offline-title img').count(),0);await page.locator('.message-avatar img').first().evaluate(async img=>{await img.decode();});assert.ok(await page.locator('.message-avatar img').count()>0);assert.equal(await page.evaluate(()=>window.BAD),undefined);assert.equal(await page.locator('#off-font').inputValue(),'ridi');
 await page.locator('[data-index="35"] iframe').first().evaluate(e=>e._bookshopFontsReady);assert.ok(await page.frameLocator('[data-index="35"] iframe').first().locator('body').evaluate(async()=>{const f=await document.fonts.load('400 18px "Bookshop RIDI"','한국어');return f.length>0&&f.every(x=>x.status==='loaded');}));
 await page.locator('#offline-head summary').click();for(const [value,name] of [['pretendard','Pretendard'],['plex','Plex'],['dodum','Dodum'],['hahmlet','Hahmlet']]){await page.locator('#off-font').selectOption(value);await page.locator('.rich-output').first().evaluate(e=>e._bookshopFontsReady);for(const weight of [400,700]){const n=await page.frameLocator('.rich-output').first().locator('body').evaluate(async (el,{weight,name})=>(await el.ownerDocument.fonts.load(weight+' 16px "Bookshop '+name+'"','우리 이야기')).length,{weight,name});assert.ok(n>0);}}await page.locator('#off-photos').uncheck();assert.equal(await page.locator('.message-avatar').first().isVisible(),false);await page.locator('#off-photos').check();assert.equal(await page.locator('.message-avatar').first().isVisible(),true);await page.locator('#off-line').selectOption('1.5');await page.locator('#off-padding').selectOption('12');await page.locator('#off-marks').selectOption('3');await page.locator('[data-index="3"]').waitFor();
 await page.locator('#off-focus').click();assert.equal(await page.locator('#offline-head').isVisible(),false);assert.ok(await page.locator('#offline-transcript').evaluate(el=>el.clientHeight>750));await page.locator('#off-exit').click();
 await page.locator('#off-first').click();await page.locator('[data-index="0"]').waitFor();await page.waitForTimeout(400);await page.reload();await page.locator('[data-index="0"]').waitFor();assert.equal(await page.locator('#off-line').inputValue(),'1.5');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>localStorage[k].includes('메시지'))),false);assert.deepEqual([...new Set(requests)],[origin]);assert.deepEqual(errors,[]);
 if(process.env.SILLY_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.SILLY_SCREENSHOT_DIR,'offline-070.png')});
 console.log('PASS: custom photo loaded without network; offline renderer with network disabled; bundled RIDI font; all pages, saved position, bookmarks, spacing, focus; script/image blocked; no plaintext chat in web storage.');
 }finally{if(browser)await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
