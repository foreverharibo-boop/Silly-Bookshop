'use strict';
const net=require('node:net');
const {fail}=require('./core.cjs');
function privateTransport(address) {
    if(typeof address!=='string')return false;
    let ip=address.toLowerCase().split('%')[0];
    if(ip.startsWith('::ffff:'))ip=ip.slice(7);
    if(ip==='::1')return true;
    if(net.isIP(ip)===6)return /^fd7a:115c:a1e0:/.test(ip);
    if(net.isIP(ip)!==4)return false;
    const p=ip.split('.').map(Number);
    return p[0]===127 || (p[0]===100&&p[1]>=64&&p[1]<=127);
}
function origin(req) {
    const proto=req.protocol==='https'?'https':'http';
    try {return new URL(proto+'://'+req.headers.host).origin;}catch{return '';}
}
function sameOrigin(req) {
    try {const parsed=new URL(req.headers.origin);return parsed.origin!=='null'&&parsed.origin===origin(req)&&!parsed.username&&!parsed.password;}catch{return false;}
}
function transportAllowed(req) {
    // Use the real socket address, never a caller-supplied X-Forwarded-For.
    // Reverse proxies terminating TLS must enforce HTTPS themselves.
    if(req.socket?.encrypted)return true;
    if(!privateTransport(req.socket?.remoteAddress))return false;
    const forwarded=req.headers['x-forwarded-proto'];
    return !forwarded || forwarded==='https';
}
function bucket(limit,windowMs,maxKeys=2048) {
    const values=new Map();
    return key=>{
        const now=Date.now();
        for(const [k,v] of values)if(v.until<=now)values.delete(k);
        let v=values.get(key);
        if(!v){if(values.size>=maxKeys)throw fail(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');v={count:0,until:now+windowMs};values.set(key,v);}
        if(++v.count>limit)throw fail(429,'요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    };
}
function concurrency(max) {
    let count=0;
    return async fn=>{if(count>=max)throw fail(429,'책방이 다른 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.');count++;try{return await fn();}finally{count--;}};
}
module.exports={privateTransport,origin,sameOrigin,transportAllowed,bucket,concurrency};
