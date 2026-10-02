'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
    const root=path.resolve(__dirname,'../../..'),source=path.resolve(__dirname,'../client');
    await fs.access(path.join(root,'config.yaml'));
    const parent=await fs.realpath(path.join(root,'public/scripts/extensions/third-party'));
    if(!parent.startsWith((await fs.realpath(root))+path.sep))throw new Error('실리 확장 경로가 서버 밖을 가리킵니다.');
    const destination=path.join(parent,'silly-bookshop-bridge');
    await fs.mkdir(destination,{recursive:true});
    if((await fs.lstat(destination)).isSymbolicLink())throw new Error('대상 폴더가 심볼릭 링크입니다.');
    try{const manifest=JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8'));if(manifest.author!=='Silly Bookshop')throw new Error('다른 확장이 있는 폴더에는 설치하지 않습니다.');}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const name of ['manifest.json','index.js']){
        const target=path.join(destination,name);
        try{const stat=await fs.lstat(target);if(!stat.isFile()||stat.nlink!==1)throw new Error('대상 파일을 확인해 주세요.');}catch(e){if(e.code!=='ENOENT')throw e;}
        await fs.writeFile(target,await fs.readFile(path.join(source,name)),{mode:0o644});
    }
    console.log('이전 화면 연동을 자동 읽기 안내로 교체했어요. 실리 브라우저를 새로고침해 주세요.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
