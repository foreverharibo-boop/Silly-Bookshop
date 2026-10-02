'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const CURRENT='.silly-bookshop',LEGACY='.sili-library';
async function stat(file){try{return await fs.lstat(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function state(root){
 const old=path.join(root,LEGACY),next=path.join(root,CURRENT),[a,b]=await Promise.all([stat(old),stat(next)]);
 for(const s of [a,b])if(s&&(!s.isDirectory()||s.isSymbolicLink()))throw Object.assign(new Error('책방 데이터 폴더를 확인해 주세요.'),{status:403});
 if(a&&b)throw Object.assign(new Error('이전·새 책방 데이터 폴더가 모두 있어 자동으로 합치지 않았어요. 두 폴더를 보존하고 이전 상태를 확인해 주세요.'),{status:409});
 if(a)await fs.rename(old,next);
 return next;
}
async function removeBridge(root){
 const parent=path.join(root,'public/scripts/extensions/third-party'),folder=path.join(parent,'silly-bookshop-bridge'),s=await stat(folder);
 if(!s)return false;
 if(!s.isDirectory()||s.isSymbolicLink())throw new Error('화면 연동 확장 폴더가 일반 폴더가 아니에요.');
 const realRoot=await fs.realpath(root),realParent=await fs.realpath(parent);
 if(!realParent.startsWith(realRoot+path.sep))throw new Error('확장 경로가 실리 폴더 밖을 가리켜요.');
 const manifest=path.join(folder,'manifest.json'),m=await fs.lstat(manifest);
 if(!m.isFile()||m.nlink!==1)throw new Error('화면 연동 확장 정보를 확인해 주세요.');
 const data=JSON.parse(await fs.readFile(manifest,'utf8'));
 if(data.author!=='Silly Bookshop')throw new Error('다른 제작자의 확장은 옮기지 않아요.');
 const backups=path.join(root,'silly-bookshop-backups');await fs.mkdir(backups,{recursive:true,mode:0o700});
 if((await fs.lstat(backups)).isSymbolicLink())throw new Error('백업 폴더를 확인해 주세요.');
 await fs.rename(folder,path.join(backups,'bridge-'+Date.now()));return true;
}
async function install(plugin){
 plugin=await fs.realpath(plugin);const plugins=path.dirname(plugin),root=path.dirname(plugins),target=path.join(plugins,'silly-bookshop');
 if(path.basename(plugins)!=='plugins'||!['sili-library','silly-bookshop'].includes(path.basename(plugin)))throw new Error('실리 plugins 안의 책방 폴더에서 실행해 주세요.');
 await fs.access(path.join(root,'config.yaml'));
 if(JSON.parse(await fs.readFile(path.join(plugin,'package.json'),'utf8')).name!=='silly-bookshop')throw new Error('실리 책방 저장소가 아니에요.');
 if(plugin!==target&&await stat(target))throw new Error('plugins/silly-bookshop이 이미 있어 덮어쓰지 않았어요. 두 설치 폴더를 확인해 주세요.');
 const data=path.join(root,'data');let migrated=0;
 for(const entry of await fs.readdir(data,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})){
  if(!entry.isDirectory())continue;
  const profile=path.join(data,entry.name);if(await stat(path.join(profile,LEGACY))){await state(profile);migrated++;}
 }
 const bridge=await removeBridge(root);
 if(plugin!==target)await fs.rename(plugin,target);
 return {root,target,migrated,bridge};
}
module.exports={state,removeBridge,install,CURRENT};
