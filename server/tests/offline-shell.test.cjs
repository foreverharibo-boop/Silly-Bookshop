'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function fixture(){const handlers={},store=new Map();let fail=false;const base='https://100.64.0.10:8443/api/plugins/silly-bookshop/';const cache={put:async(k,v)=>store.set(k,v),match:async k=>store.get(k)};const sandbox={URL,Response,AbortController,setTimeout,clearTimeout,caches:{open:async()=>cache,keys:async()=>['silly-bookshop-shell-1.0.1-test.1'],delete:async()=>{store.clear();}},fetch:async url=>{if(fail)throw Error('server off');return {ok:true,redirected:false,url:typeof url==='string'?new URL(url,base).href:url.url,headers:new Headers({'content-type':String(url).endsWith('.js')?'application/javascript':'text/html'})};},self:{location:base,addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>{}}}};sandbox.self.location=new URL(base);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/sw.js'),'utf8'),sandbox);return {handlers,store,base,offline:()=>fail=true};}
test('worker verifies all offline assets and falls back after server is gone',async()=>{
 const f=fixture();let work;f.handlers.install({waitUntil:p=>work=p});await work;
 assert.ok(f.store.size>20);assert.ok([...f.store.keys()].every(k=>!/(catalog|csrf-token|\/offline\?)/.test(k)));
 let state;const check=async()=>{f.handlers.message({data:{type:'BOOKSHOP_SHELL_CHECK'},ports:[{postMessage:s=>state=s}],waitUntil:p=>work=p});await work;return state.ready;};assert.equal(await check(),true);
 const font=[...f.store.keys()].find(k=>k.endsWith('.woff2')),saved=f.store.get(font);f.store.delete(font);assert.equal(await check(),false);f.store.set(font,saved);
 f.offline();f.handlers.fetch({request:{method:'GET',url:f.base,mode:'navigate'},respondWith:p=>work=p});assert.equal(await work,f.store.get('/api/plugins/silly-bookshop/vault.html'));
 f.handlers.fetch({request:{method:'GET',url:f.base+'web-reader.js',mode:'same-origin'},respondWith:p=>work=p});assert.equal(await work,f.store.get('/api/plugins/silly-bookshop/web-reader.js'));
});
