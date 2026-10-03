'use strict';
// Creates credentials outside the repository. Never changes Silly's config/auth.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const execFile=require('node:util').promisify(require('node:child_process').execFile),{createInterface}=require('node:readline/promises');
const bridge=require('../server/local-https.cjs');
async function configure({ip,upstreamPort=8001,port=8443,dir=bridge.HOME}){
 const id=crypto.randomBytes(16).toString('hex'),config=bridge.validate({schema:1,id,ip,port,upstreamPort});
 await fs.mkdir(dir,{recursive:true,mode:0o700});const st=await fs.lstat(dir);if(st.isSymbolicLink()||!st.isDirectory())throw Error('HTTPS 저장 폴더를 확인해 주세요.');await fs.chmod(dir,0o700);
 const folder=path.join(dir,id);await fs.mkdir(folder,{mode:0o700});const caKey=path.join(folder,'ca.key');
 const run=args=>execFile('openssl',args,{cwd:folder,timeout:30000,maxBuffer:1024*1024});let committed=false;
 try{
  await fs.writeFile(path.join(folder,'openssl.cnf'),`[req]\ndistinguished_name=dn\nprompt=no\n[dn]\nCN=Silly Bookshop ${id.slice(0,8)}\n[ca]\nbasicConstraints=critical,CA:TRUE,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n[server]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:${ip}\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n`,{mode:0o600});
  await run(['req','-x509','-newkey','rsa:3072','-nodes','-sha256','-days','366','-keyout','ca.key','-out','root.pem','-config','openssl.cnf','-extensions','ca']);
  await run(['req','-new','-newkey','rsa:2048','-nodes','-sha256','-keyout','server.key','-out','server.csr','-config','openssl.cnf','-subj','/CN='+ip]);
  await run(['x509','-req','-in','server.csr','-CA','root.pem','-CAkey','ca.key','-set_serial','0x'+crypto.randomBytes(16).toString('hex'),'-days','365','-sha256','-extfile','openssl.cnf','-extensions','server','-out','server.pem']);
  for(const name of ['server.key','server.pem','root.pem'])await fs.chmod(path.join(folder,name),0o600);
  // Remove the signing key: this installation cannot issue any other certificate.
  await fs.rm(caKey,{force:true});await fs.rm(path.join(folder,'server.csr'));await fs.rm(path.join(folder,'openssl.cnf'));
  const temp=path.join(dir,'config-'+id+'.tmp');await fs.writeFile(temp,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});await fs.rename(temp,path.join(dir,'config.json'));committed=true;
  return bridge.publicInfo(await bridge.load(dir));
 }finally{await fs.rm(caKey,{force:true});if(!committed)await fs.rm(folder,{recursive:true,force:true});}
}
async function main(){process.umask(0o077);const args=process.argv.slice(2);if(args.includes('--disable')){await fs.rename(path.join(bridge.HOME,'config.json'),path.join(bridge.HOME,'config.disabled.json'));console.log('HTTPS 입구를 껐어요. 실리를 다시 시작하면 적용돼요. 저장한 대화는 지우지 않았어요.');return;}
 let ip=args[0],upstreamPort=Number(args[1]||8001),port=Number(args[2]||8443);
 if(!ip){const rl=createInterface({input:process.stdin,output:process.stdout});try{ip=(await rl.question('서버 폰의 Tailscale IP (100으로 시작): ')).trim();upstreamPort=Number((await rl.question('기존 실리 포트 [8001]: ')).trim()||8001);port=Number((await rl.question('새 HTTPS 포트 [8443]: ')).trim()||8443);}finally{rl.close();}}
 console.log('내 서버만을 위한 인증서를 만들어요. 기존 실리 주소·비밀번호·채팅은 변경하지 않아요.');
 const info=await configure({ip,upstreamPort,port});console.log('\n준비 완료! 테일스케일을 켠 상태로 실리를 다시 시작해 주세요.\n아이폰의 기존 책방 → 도구 → 아이폰 오프라인 준비에서 인증서를 받아 설치해 주세요.\n인증서 이름: '+info.certificateName+'\nSHA-256: '+info.fingerprint+'\n설치 후 새 책방 주소: '+info.url+'\n인증서 만료: '+info.expires.slice(0,10)+'\n만료 전에는 같은 명령으로 재발급 후 아이폰 인증서를 다시 설치해 주세요.');
}
if(require.main===module)main().catch(e=>{console.error(e.code==='ENOENT'?'OpenSSL이 필요해요. 터먹스에서 pkg install openssl-tool 을 실행해 주세요.':e.message);process.exitCode=1;});
module.exports={configure};
