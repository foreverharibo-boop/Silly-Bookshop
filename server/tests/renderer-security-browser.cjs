'use strict';
// Regression coverage for untrusted Markdown/HTML, including Showdown 2.1.0 advisories.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),page=await context.newPage(),requests=[],dialogs=[];
  await context.route('**/*',async route=>{
   requests.push(route.request().url());
   if(route.request().url()==='https://bookshop.invalid/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><main id="messages"></main></body></html>'});
   return route.abort();
  });
  page.on('dialog',d=>{dialogs.push(d.message());d.dismiss();});
  await page.goto('https://bookshop.invalid/');
  await page.addScriptTag({path:path.join(__dirname,'../public/rich.js')});
  const payloads=[
   '---\ntitle: </title><script>parent.BOOKSHOP_XSS=1</script>\n---\n# Hello',
   '| x" onmouseover="parent.BOOKSHOP_XSS=1" | y |\n| --- | --- |\n| a | b |',
   '<svg onload="parent.BOOKSHOP_XSS=1"></svg><img src="https://outside.invalid/track" onerror="parent.BOOKSHOP_XSS=1">',
   '<style>@import "https://outside.invalid/style"; p{background:url(https://outside.invalid/css)}</style><p style="background-image:url(https://outside.invalid/inline)">Safe text</p>',
   '<iframe src="https://outside.invalid/frame"></iframe><form action="https://outside.invalid/send"><input name="secret"></form><a href="javascript:parent.BOOKSHOP_XSS=1">link</a>',
  ];
  await page.evaluate(texts=>{for(const text of texts)window.BookshopRich.mount(document.getElementById('messages'),text);},payloads);
  await page.waitForFunction(()=>[...document.querySelectorAll('.rich-output')].length===5&&[...document.querySelectorAll('.rich-output')].every(f=>f.contentDocument?.readyState==='complete'));
  const results=await page.evaluate(()=>[...document.querySelectorAll('.rich-output')].map(f=>({
   sandbox:f.getAttribute('sandbox'),
   executable:f.contentDocument.querySelectorAll('script,iframe,form,input,object,embed').length,
   dangerousAttrs:[...f.contentDocument.querySelectorAll('*')].flatMap(e=>[...e.attributes]).filter(a=>/^on/i.test(a.name)||['href','srcset','action','xlink:href'].includes(a.name)).length,
   remoteImages:[...f.contentDocument.images].filter(i=>i.hasAttribute('src')&&!i.getAttribute('src').startsWith('data:')).length
  })));
  for(const result of results){assert.equal(result.sandbox,'allow-same-origin');assert.equal(result.executable,0);assert.equal(result.dangerousAttrs,0);assert.equal(result.remoteImages,0);}
  assert.equal(await page.evaluate(()=>window.BOOKSHOP_XSS),undefined);
  assert.deepEqual(dialogs,[]);assert.deepEqual(requests,['https://bookshop.invalid/']);
  const defaults=await page.evaluate(()=>{const c=new showdown.Converter({tables:true,strikethrough:true,simpleLineBreaks:true,ghCodeBlocks:true,backslashEscapesHTMLTags:true});return ['metadata','completeHTMLDocument','tablesHeaderId'].map(k=>c.getOption(k));});
  assert.ok(defaults.every(v=>v===false));
  console.log('PASS: Showdown advisory option gates; metadata/table/HTML/script/CSS payloads sanitized; script-disabled frames; zero external requests.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
