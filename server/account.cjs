'use strict';
const crypto=require('node:crypto'),path=require('node:path'),c=require('./core.cjs');
function validPassword(password){
    if(typeof password!=='string'||password.length<12||password.length>256)throw c.fail(400,'새 비밀번호는 12~256자로 설정해 주세요.');
}
function recoveryDigest(code){
    if(typeof code!=='string'||code.length>128)return '';
    const normalized=code.replace(/[\s-]/g,'').toLowerCase();
    return /^[a-f0-9]{64}$/.test(normalized)?crypto.createHash('sha256').update(normalized).digest('hex'):'';
}
function matchesRecovery(code,conf){
    const actual=recoveryDigest(code),expected=conf?.recoveryHash;
    return !!actual&&typeof expected==='string'&&/^[a-f0-9]{64}$/.test(expected)&&crypto.timingSafeEqual(Buffer.from(actual,'hex'),Buffer.from(expected,'hex'));
}
function newRecovery(){
    const code=crypto.randomBytes(32).toString('hex').match(/.{8}/g).join('-');
    return {code,hash:recoveryDigest(code)};
}
async function credentials(password){
    validPassword(password);
    const salt=crypto.randomBytes(32).toString('hex'),recovery=newRecovery();
    return {conf:{salt,hash:await c.passwordHash(password,salt),recoveryHash:recovery.hash},recoveryCode:recovery.code};
}
// Serialize the check and atomic replacement together: a recovery code succeeds once.
async function update(root,{mode,password,newPassword,code,sessionHash}){
    if(mode!=='recovery-code')validPassword(newPassword);
    const file=path.join(await c.stateDir(root),'auth.json');
    return c.serialized(file,async()=>{
        const conf=await c.authConfig(root);
        if(mode==='reset'){
            if(!matchesRecovery(code,conf))throw c.fail(400,'복구 코드가 맞지 않거나 이미 사용됐어요.');
        }else{
            if(!conf||conf.hash!==sessionHash)throw c.fail(401,'다시 책방 잠금을 풀어 주세요.');
            if(!await c.verifyPassword(password,conf))throw c.fail(400,'현재 비밀번호가 맞지 않습니다.');
        }
        if(mode==='recovery-code'){
            const recovery=newRecovery();
            await c.atomicJson(file,{...conf,recoveryHash:recovery.hash});
            return {recoveryCode:recovery.code};
        }
        const next=await credentials(newPassword);
        await c.atomicJson(file,next.conf);
        return {recoveryCode:next.recoveryCode};
    });
}
module.exports={update,credentials,validPassword,matchesRecovery};
