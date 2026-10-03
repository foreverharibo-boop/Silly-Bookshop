'use strict';
// Optional, private HTTPS entrance. No tunnel, telemetry or public listener.
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const http=require('node:http'),https=require('node:https'),net=require('node:net'),crypto=require('node:crypto');
const BASE='/api/plugins/silly-bookshop',HOME=path.join(os.homedir(),'.silly-bookshop-https');
function tailIP(ip){if(net.isIP(ip)!==4)return false;const p=ip.split('.').map(Number);return p[0]===100&&p[1]>=64&&p[1]<=127;}
function validate(c){if(!c||c.schema!==1||!tailIP(c.ip)||!Number.isInteger(c.port)||c.port<1024||c.port>65535||!Number.isInteger(c.upstreamPort)||c.upstreamPort<1024||c.upstreamPort>65535||c.port===c.upstreamPort||!/^[a-f0-9]{32}$/.test(c.id))throw Error('HTTPS 설정 파일이 올바르지 않아요.');return c;}
async function safeRead(file){const s=await fs.lstat(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>65536)throw Error('HTTPS 파일을 확인해 주세요.');return fs.readFile(file);}
async function load(dir=HOME){try{const c=validate(JSON.parse(await safeRead(path.join(dir,'config.json'))));const folder=path.join(dir,c.id);const [key,cert,root]=await Promise.all(['server.key','server.pem','root.pem'].map(n=>safeRead(path.join(folder,n))));const leaf=new crypto.X509Certificate(cert),ca=new crypto.X509Certificate(root);if(!leaf.checkIP(c.ip)||!leaf.verify(ca.publicKey)||!leaf.checkPrivateKey(crypto.createPrivateKey(key)))throw Error('HTTPS 인증서와 설정이 맞지 않아요.');return {...c,key,cert,root,expires:new Date(leaf.validTo).toISOString(),fingerprint:ca.fingerprint256};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
function publicInfo(c){return c?{configured:true,url:`https://${c.ip}:${c.port}${BASE}/`,fingerprint:c.fingerprint,expires:c.expires,certificateName:'Silly Bookshop '+c.id.slice(0,8)}:{configured:false};}
function profile(c){const name='Silly Bookshop '+c.id.slice(0,8),data=new crypto.X509Certificate(c.root).raw.toString('base64');return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>PayloadContent</key><array><dict><key>PayloadCertificateFileName</key><string>Silly-Bookshop.cer</string><key>PayloadContent</key><data>${data}</data><key>PayloadDescription</key><string>내 실리 책방의 HTTPS 연결 인증서. VPN이나 기기 관리 기능은 포함하지 않습니다.</string><key>PayloadDisplayName</key><string>${name}</string><key>PayloadIdentifier</key><string>app.silly.bookshop.cert.${c.id}</string><key>PayloadType</key><string>com.apple.security.root</string><key>PayloadUUID</key><string>${c.id.slice(0,8)}-${c.id.slice(8,12)}-${c.id.slice(12,16)}-${c.id.slice(16,20)}-${c.id.slice(20)}</string><key>PayloadVersion</key><integer>1</integer></dict></array><key>PayloadDisplayName</key><string>${name}</string><key>PayloadIdentifier</key><string>app.silly.bookshop.profile.${c.id}</string><key>PayloadType</key><string>Configuration</string><key>PayloadUUID</key><string>${crypto.randomUUID()}</string><key>PayloadVersion</key><integer>1</integer><key>PayloadRemovalDisallowed</key><false/></dict></plist>`;}
const HOP=['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade'];
function clean(headers){const out={...headers};for(const h of String(headers.connection||'').split(','))delete out[h.trim().toLowerCase()];for(const h of HOP)delete out[h];for(const h of Object.keys(out))if(h.startsWith('x-forwarded-')||h==='forwarded')delete out[h];return out;}
function routeAllowed(method,pathname){return (['GET','HEAD','POST'].includes(method)&&(pathname===BASE||pathname.startsWith(BASE+'/')))||(method==='GET'&&pathname==='/csrf-token')||(method==='POST'&&['/api/users/login','/api/users/list'].includes(pathname));}
function handler(c,request=http.request){const authority=c.ip+':'+c.port,external='https://'+authority,internal='http://'+authority;return (req,res)=>{
 const fail=(status,text)=>{res.writeHead(status,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(text);};
 const peer=String(req.socket.remoteAddress||'').replace(/^::ffff:/,'');
 if(!tailIP(peer)&&peer!=='127.0.0.1'&&peer!=='::1')return fail(403,'테일스케일로 연결해 주세요.');
 if(req.headers.host!==authority)return fail(421,'설정한 책방 주소로 연결해 주세요.');
 if(req.headers.origin&&req.headers.origin!==external)return fail(403,'같은 책방에서 다시 시도해 주세요.');
 if(req.headers['sec-fetch-site']==='cross-site')return fail(403,'책방 주소를 직접 열어 주세요.');
 if(!req.url.startsWith('/')||req.url.startsWith('//')||req.url.includes('\\'))return fail(400,'잘못된 주소예요.');
 const raw=req.url.split('?')[0];let pathname;try{pathname=new URL(req.url,external).pathname;}catch{return fail(400,'잘못된 주소예요.');}
 if(pathname!==raw||/%/i.test(pathname))return fail(400,'잘못된 주소예요.');
 if(req.method==='GET'&&['/','/login','/login.html','/bookshop-sign-in'].includes(pathname)){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});fs.readFile(path.join(__dirname,'public/secure-login.html')).then(b=>res.end(b),()=>res.destroy());return;
 }
 if(req.method==='GET'&&['/bookshop-login.js','/bookshop-login.css'].includes(pathname)){
  const js=pathname.endsWith('.js');res.writeHead(200,{'Content-Type':js?'application/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.readFile(path.join(__dirname,'public',js?'secure-login.js':'style.css')).then(b=>res.end(b),()=>res.destroy());return;
 }
 if(!routeAllowed(req.method,pathname))return fail(404,'이 주소는 실리 책방 읽기 전용이에요.');
 if(req.method==='POST'&&req.headers.origin!==external)return fail(403,'책방 화면에서 다시 시도해 주세요.');
 const headers=clean(req.headers);headers.host=authority;if(headers.origin)headers.origin=internal;
 // Only a validated exact origin is translated for the loopback HTTP hop.
 if(headers.referer){try{const r=new URL(headers.referer);if(r.origin===external){r.protocol='http:';headers.referer=r.href;}else delete headers.referer;}catch{delete headers.referer;}}
 const upstream=request({host:'127.0.0.1',port:c.upstreamPort,path:req.url,method:req.method,headers,timeout:30000},response=>{
  const h=clean(response.headers);h['cache-control']='no-store';
  if(h['set-cookie'])h['set-cookie']=h['set-cookie'].map(v=>/;\s*secure(?:;|$)/i.test(v)?v:v+'; Secure');
  if(h.location){try{const to=new URL(h.location,external);if(to.origin===internal)to.protocol='https:';if(to.origin!==external){response.resume();return fail(502,'실리의 로그인 이동 주소를 확인해 주세요.');}if(['/login','/login.html','/'].includes(to.pathname))h.location='/bookshop-sign-in';else h.location=to.href;}catch{response.resume();return fail(502,'로그인 주소를 확인해 주세요.');}}
  res.writeHead(response.statusCode,h);response.pipe(res);response.on('error',()=>res.destroy());
 });
 upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)fail(503,'실리 서버 연결이 끊겼어요. 저장한 대화는 오프라인 보관함에서 열어 주세요.');else res.destroy();});let received=0;req.on('data',chunk=>{received+=chunk.length;if(received>2*1024*1024){req.unpipe(upstream);if(!res.headersSent)fail(413,'요청이 너무 커요.');upstream.destroy();}});req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});req.pipe(upstream);
};}
let listener=null,current=null,lastError='';
async function start(){if(listener)return;current=await load();if(!current)return;const s=https.createServer({key:current.key,cert:current.cert,minVersion:'TLSv1.2',requestTimeout:60000,headersTimeout:15000},handler(current));s.maxConnections=64;await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(current.port,current.ip,()=>{s.removeListener('error',reject);resolve();});});s.on('error',()=>{lastError='HTTPS 연결을 다시 시작해 주세요.';});listener=s;s.unref();console.log('[실리 책방 HTTPS] '+publicInfo(current).url);}
async function init(){try{await start();}catch(e){lastError=e.code==='EADDRNOTAVAIL'?'테일스케일을 켠 뒤 실리를 재시작해 주세요.':e.code==='EADDRINUSE'?'HTTPS 포트가 사용 중이에요. 다른 포트로 설정해 주세요.':'HTTPS 설정을 확인해 주세요.';console.error('[실리 책방 HTTPS] '+lastError);}}
function status(){return {...publicInfo(current),running:!!listener,error:lastError};}
async function stop(){const s=listener;listener=null;if(s){s.closeAllConnections();await new Promise(r=>s.close(r));}}
module.exports={HOME,BASE,tailIP,validate,load,publicInfo,profile,handler,routeAllowed,init,status,stop,getCurrent:()=>current};
