'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const c=require('./core.cjs'),security=require('./security.cjs'),capture=require('./capture.cjs'),display=require('./display.cjs'),account=require('./account.cjs'),reading=require('./reading.cjs'),shelf=require('./shelf.cjs'),search=require('./search.cjs');
const BASE='/api/plugins/silly-bookshop',VERSION='1.0.3';
const localHttps=require('./local-https.cjs');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(e=>{
    if(res.headersSent)return next(e);
    if(e.status===429)res.set('Retry-After','60');
    res.status(e.status||(e.code==='ENOENT'?404:500)).json({error:e.status?e.message:e.code==='ENOENT'?'파일을 찾을 수 없습니다.':'읽기에 실패했습니다. 실리 서버 로그를 확인해 주세요.'});
    if(!e.status&&e.code!=='ENOENT')console.error('[silly-bookshop]',e.code||'internal-error');
});
function cookieName(req){
    // Cookies share a jar across ports. A Secure HTTPS cookie must never shadow
    // the HTTP login. The private HTTPS bridge preserves its own Host/port.
    // Ignore the legacy shared cookie; no website-data or offline-vault wipe.
    return 'silly_bookshop_'+crypto.createHash('sha256').update(security.origin(req)).digest('hex').slice(0,32);
}
function cookieKey(req){
    const match=String(req.headers.cookie||'').match(new RegExp('(?:^|;\\s*)'+cookieName(req)+'=([a-f0-9]{64})(?:;|$)'));
    return match?crypto.createHash('sha256').update(match[1]).digest('hex'):'';
}
function setCookie(req,res,token,maxAge){res.cookie(cookieName(req),token,{httpOnly:true,sameSite:'strict',secure:req.secure,path:BASE,maxAge});}
async function init(router){
    const sessions=new Map();
    const loginIp=security.bucket(10,15*60000),loginUser=security.bucket(30,15*60000);
    const accountIp=security.bucket(10,15*60000),accountUser=security.bucket(30,15*60000);
    const statusRate=security.bucket(120,60000),apiRate=security.bucket(240,60000),captureRate=security.bucket(30,60000);
    const hashes=security.concurrency(2),heavyRead=security.concurrency(2),avatarRead=security.concurrency(2);
    function authenticated(req,conf){
        const key=cookieKey(req),s=sessions.get(key),now=Date.now();
        if(!s)return null;
        if(s.expires<=now||s.absolute<=now||s.hash!==conf?.hash){sessions.delete(key);return null;}
        if(s.root!==req.user.directories.root||s.origin!==security.origin(req))return null;
        return s;
    }
    router.use(wrap(async(req,res,next)=>{
        res.set({'X-Silly-Bookshop-Version':VERSION,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"});
        for(const h of ['Access-Control-Allow-Origin','Access-Control-Allow-Credentials','Access-Control-Allow-Headers','Access-Control-Allow-Methods'])res.removeHeader(h);
        if(!req.user?.directories?.root||!req.user.directories.chats||!req.user.directories.groupChats)throw c.fail(403,'먼저 실리에 로그인해 주세요.');
        if(!security.transportAllowed(req))throw c.fail(403,'책방은 같은 폰의 localhost, 테일스케일 또는 HTTPS 연결에서 열어 주세요.');
        if(!['GET','HEAD','POST'].includes(req.method))throw c.fail(405,'지원하지 않는 요청입니다.');
        if(req.headers.origin&&!security.sameOrigin(req))throw c.fail(403,'같은 실리 주소에서 접속해 주세요.');
        if(req.method==='POST'){
            if(!security.sameOrigin(req)||req.get('x-silly-request')!=='1'||!req.is('application/json'))throw c.fail(403,'책방 화면에서 다시 시도해 주세요.');
            if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')throw c.fail(400,'잘못된 요청입니다.');
            if(Buffer.byteLength(JSON.stringify(req.body))>(req.path==='/capture'?1024*1024:req.path==='/cover'?750000:8192))throw c.fail(413,'요청이 너무 큽니다.');
        }
        next();
    }));
    router.get('/',(req,res)=>req.originalUrl.split('?')[0].endsWith('/')?res.sendFile(path.join(__dirname,'public/index.html')):res.redirect(BASE+'/'));
    for(const name of ['screen-update.js','app.js','pickers.js','rich.js','style.css','icon.svg','icon-192.png','icon-512.png','vendor/purify.min.js','vendor/showdown.min.js','web-vault.js','web-vault.css','vault.html','sw.js','web-reader.js','web-reader.css','manifest.json'])router.get('/'+name,(req,res)=>res.sendFile(path.join(__dirname,'public',name)));
    for(const family of ['NanumGothic','NanumMyeongjo','GowunBatang','Pretendard','IBMPlexSansKR'])for(const weight of ['Regular','Bold']){
        const name=family+'-'+weight+'.woff2';
        router.get('/fonts/'+name,(req,res)=>{res.set('Cache-Control','private, max-age=86400');res.sendFile(path.join(__dirname,'public/fonts',name));});
    }
    router.get('/web-reader.html',(req,res)=>{res.set('X-Frame-Options','SAMEORIGIN');res.set('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; font-src 'self'; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; object-src 'none'");res.sendFile(path.join(__dirname,'public/web-reader.html'));});
    for(const name of ['RIDIBatang-Regular.woff2','GowunDodum-Regular.woff2','Hahmlet-Variable.woff2'])router.get('/fonts/'+name,(req,res)=>{res.set('Cache-Control','private, max-age=86400');res.sendFile(path.join(__dirname,'public/fonts',name));});
    router.get('/status',wrap(async(req,res)=>{
        statusRate(req.socket.remoteAddress);
        const conf=await c.authConfig(req.user.directories.root);
        res.json({configured:!!conf,authenticated:!!authenticated(req,conf),version:VERSION,shellVersion:VERSION+'-screen-update',screenUpdate:1,protocol:2,minAppVersion:'0.9.5'});
    }));
    router.post('/login',wrap(async(req,res)=>{
        const root=req.user.directories.root,now=Date.now();
        loginIp(root+'|'+req.socket.remoteAddress);loginUser(root);
        if(typeof req.body.password!=='string'||req.body.password.length>256)throw c.fail(400,'비밀번호를 확인해 주세요.');
        const conf=await c.authConfig(root);
        if(!conf)throw c.fail(409,'터먹스에서 책방 비밀번호를 먼저 설정해 주세요.');
        if(!await hashes(()=>c.verifyPassword(req.body.password,conf)))throw c.fail(401,'비밀번호가 맞지 않습니다.');
        for(const [key,s]of sessions)if(s.expires<=now||s.absolute<=now)sessions.delete(key);
        const prior=sessions.get(cookieKey(req));if(prior?.root===root)sessions.delete(cookieKey(req));
        const own=[...sessions.entries()].filter(([,s])=>s.root===root);
        if(own.length>=16)sessions.delete(own[0][0]);
        if(sessions.size>=256)throw c.fail(429,'로그인 연결이 많습니다. 잠시 후 다시 시도해 주세요.');
        const token=crypto.randomBytes(32).toString('hex'),key=crypto.createHash('sha256').update(token).digest('hex'),age=86400000;
        sessions.set(key,{root,hash:conf.hash,origin:security.origin(req),expires:now+30*60000,absolute:now+age});
        setCookie(req,res,token,age);res.json({ok:true});
    }));
    function accountLimit(req){const root=req.user.directories.root;accountIp(root+'|'+req.socket.remoteAddress);accountUser(root);}
    function revoke(root){for(const [key,s] of sessions)if(s.root===root)sessions.delete(key);}
    router.post('/account/reset',wrap(async(req,res)=>{
        accountLimit(req);
        const root=req.user.directories.root;
        const result=await hashes(()=>account.update(root,{mode:'reset',code:req.body.code,newPassword:req.body.newPassword}));
        revoke(root);setCookie(req,res,'',0);res.json({ok:true,...result});
    }));
    // Write-only bridge. Requires the existing Silly login, strict Origin and CSRF
    // middleware above; it never grants access to the locked bookshop or its data.
    router.post('/capture',wrap(async(req,res)=>{
        captureRate(req.user.directories.root);
        if(!await c.authConfig(req.user.directories.root))throw c.fail(409,'책방 비밀번호를 먼저 설정해 주세요.');
        res.json(await heavyRead(()=>capture.write(req.user.directories,req.body.id,req.body.items,req.body.schema)));
    }));
    router.use(wrap(async(req,res,next)=>{
        const session=authenticated(req,await c.authConfig(req.user.directories.root));
        if(!session)throw c.fail(401,'책방 잠금을 풀어 주세요.');
        apiRate(cookieKey(req));session.expires=Math.min(Date.now()+30*60000,session.absolute);next();
    }));
    router.post('/logout',(req,res)=>{sessions.delete(cookieKey(req));setCookie(req,res,'',0);res.json({ok:true});});
    router.get('/https-setup',(req,res)=>res.json(localHttps.status()));
    router.get('/https-certificate',(req,res)=>{const conf=localHttps.getCurrent();if(!conf)return res.status(409).json({error:'서버에서 HTTPS 준비 명령을 먼저 실행해 주세요.'});res.set({'Content-Type':'application/x-apple-aspen-config','Content-Disposition':'attachment; filename="Silly-Bookshop.mobileconfig"'});res.send(localHttps.profile(conf));});
    router.get('/account',wrap(async(req,res)=>res.json({recoveryConfigured:!!(await c.authConfig(req.user.directories.root))?.recoveryHash})));
    for(const mode of ['password','recovery-code'])router.post('/account/'+mode,wrap(async(req,res)=>{
        accountLimit(req);
        const root=req.user.directories.root,session=sessions.get(cookieKey(req));
        const result=await hashes(()=>account.update(root,{mode,password:req.body.password,newPassword:req.body.newPassword,sessionHash:session?.hash}));
        if(mode==='password'){revoke(root);setCookie(req,res,'',0);}
        res.json({ok:true,...result});
    }));
    router.get('/catalog',wrap(async(req,res)=>res.json(await heavyRead(async()=>{const data=await shelf.decorate(req.user.directories,await c.catalog(req.user.directories,{withCharacters:true}));return {...data,recent:await reading.recent(req.user.directories,data.chats)};}))));
    router.post('/shelf',wrap(async(req,res)=>res.json(await heavyRead(()=>shelf.change(req.user.directories,req.body)))));
    router.get('/cover',wrap(async(req,res)=>res.type('png').send(await avatarRead(()=>shelf.cover(req.user.directories,req.query.key)))));
    router.post('/cover',wrap(async(req,res)=>{if(!Object.hasOwn(req.body,'image'))throw c.fail(400,'표지를 선택해 주세요.');res.json(await heavyRead(()=>shelf.cover(req.user.directories,req.body.key,req.body.image)));}));
    router.get('/search',wrap(async(req,res)=>res.json(await heavyRead(()=>search.search(req.user.directories,req.query.id,req.query.q,Number(req.query.cursor||0),()=>req.aborted||res.destroyed)))));
    router.post('/visit',wrap(async(req,res)=>res.json(await reading.visit(req.user.directories,req.body.id))));
    router.get('/bookmarks',wrap(async(req,res)=>res.json(await reading.bookmarks(req.user.directories,req.query.id))));
    router.post('/bookmarks',wrap(async(req,res)=>res.json(await heavyRead(()=>reading.bookmarks(req.user.directories,req.body.id,req.body)))));
    router.get('/offline',wrap(async(req,res)=>res.json(await heavyRead(()=>reading.snapshot(req.user.directories,req.query.id,()=>req.aborted||res.destroyed)))));
    router.get('/avatar',wrap(async(req,res)=>res.type('png').send(await avatarRead(()=>c.avatar(req.user.directories,req.query.name)))));
    router.get('/chat',wrap(async(req,res)=>{
        const result=await heavyRead(async()=>{
            const file=await c.chatFile(req.user.directories,req.query.id),stat=await fs.stat(file);
            if(stat.size>32*1024*1024)throw c.fail(413,'32MB를 넘는 대화는 현재 버전에서 열 수 없습니다.');
            const context=await display.load(req.user.directories,req.query.id);
            const revision=reading.revision(stat,context);
            if(req.query.revision===revision)return {unchanged:true,revision};
            const parsed=c.parseChat(await c.readText(file,32*1024*1024));
            const saved=await c.position(req.user.directories.root,req.query.id);
            const requested=req.query.start===undefined?(saved?.index||0):Number(req.query.start);
            if(!Number.isSafeInteger(requested)||requested<0)throw c.fail(400,'잘못된 페이지입니다.');
            const start=Math.min(requested,Math.max(0,parsed.messages.length-1));
            const messages=[];let size=0;
            for(const view of await display.render(parsed.messages.slice(start,start+30),context,parsed.metadata)){
                const bytes=Buffer.byteLength(JSON.stringify(view));
                if(messages.length&&size+bytes>2*1024*1024)break;
                messages.push(view);size+=bytes;
            }
            return {displayPolicy:'saved-display-v1',revision,start,total:parsed.messages.length,messages,nextStart:start+messages.length,skipped:parsed.skipped,saved};
        });
        res.json(result);
    }));
    router.post('/position',wrap(async(req,res)=>{
        if(!req.body.position||typeof req.body.position!=='object'||Array.isArray(req.body.position))throw c.fail(400,'읽던 위치가 올바르지 않습니다.');
        await c.chatFile(req.user.directories,req.body.id);
        res.json(await c.position(req.user.directories.root,req.body.id,req.body.position));
    }));
    console.log('[실리 책방 '+VERSION+'] '+BASE+'/');
    await localHttps.init();
}
module.exports={init,exit:localHttps.stop,info:{id:'silly-bookshop',name:'실리 책방',description:'나만의 읽기 전용 채팅 책방'}};
