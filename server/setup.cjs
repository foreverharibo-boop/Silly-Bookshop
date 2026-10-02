'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const crypto=require('node:crypto');
const readline=require('node:readline');
const c=require('./core.cjs');
async function hidden(prompt) {
    if(!process.stdin.isTTY)throw new Error('터먹스 터미널에서 직접 실행해 주세요.');
    process.stdout.write(prompt);
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);process.stdin.resume();
    return new Promise((resolve,reject)=>{
        let value='';
        const done=()=>{process.stdin.off('keypress',handler);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
        function handler(str,key={}) {
            if(key.ctrl&&key.name==='c'){done();reject(new Error('취소했습니다.'));}
            else if(key.name==='return'||key.name==='enter'){done();resolve(value);}
            else if(key.name==='backspace'){value=Array.from(value).slice(0,-1).join('');}
            else if(str&&!key.ctrl&&!/[\x00-\x1f]/.test(str))value+=str;
        }
        process.stdin.on('keypress',handler);
    });
}
(async()=>{
    const root=path.resolve(process.argv[2]||path.join(__dirname,'../../../data/default-user'));
    if(!(await fs.stat(path.join(root,'chats'))).isDirectory())throw new Error('실리 사용자 폴더를 찾지 못했습니다. setup.cjs 뒤에 사용자 폴더 경로를 넣어 주세요.');
    console.log('실리 책방 · 비밀번호 설정\n사용자 폴더: '+root+'\n입력하는 비밀번호는 화면에 표시되지 않습니다.');
    const password=await hidden('새 비밀번호 (12자 이상): ');
    if(password.length<12||password.length>256)throw new Error('12~256자로 설정해 주세요.');
    if(password!==await hidden('한 번 더 입력: '))throw new Error('두 비밀번호가 다릅니다.');
    const salt=crypto.randomBytes(32).toString('hex');
    await c.atomicJson(path.join(await c.stateDir(root),'auth.json'),{salt,hash:await c.passwordHash(password,salt)});
    console.log('설정 완료! 책방 주소: /api/plugins/silly-bookshop/');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
