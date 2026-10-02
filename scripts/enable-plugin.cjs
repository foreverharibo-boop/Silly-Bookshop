'use strict';
// Run explicitly from an installed repository. Never executed on plugin startup.
const fs=require('node:fs'),path=require('node:path');
const file=path.resolve(process.argv[2]||path.join(__dirname,'../../../config.yaml'));
const original=fs.readFileSync(file,'utf8'),re=/^enableServerPlugins:[ \t]*(true|false)[ \t]*(?:#.*)?\r?$/gm;
const matches=[...original.matchAll(re)];
if(matches.length!==1)throw new Error('config.yaml의 enableServerPlugins 항목을 직접 확인해 주세요.');
if(matches[0][1]==='true'){console.log('서버 플러그인이 이미 켜져 있습니다. 설정을 변경하지 않았습니다.');process.exit(0);}
const backup=file+'.sili-bookshop-'+Date.now()+'.bak';
fs.copyFileSync(file,backup,fs.constants.COPYFILE_EXCL);
fs.writeFileSync(file,original.replace(re,'enableServerPlugins: true'));
console.log('설정 백업: '+backup+'\n서버 플러그인을 켰습니다. plugins 폴더의 다른 서버 플러그인도 함께 로드됩니다.');
